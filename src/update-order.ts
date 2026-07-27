import {
  Document,
  Table,
  TableArray,
  TreeNode,
  isDocument,
  isTable,
  isTableArray,
  isKeyValue,
  hasItem
} from './cst';
import { Move } from './diff';
import { Path, tryFindByPath } from './find-by-path';
import { resolveSlots, normalizeSectionComments, Slot } from './comment-ownership';
import { shiftNode, recalcContainerEnd } from './writer';

/**
 * A resolved, orderable unit within a container: either one member slot, or — when the same
 * key resolves to more than one CONSECUTIVE member slot (an [[array-of-tables]]'s entries, or
 * a [table] immediately followed by its own [table.sub]) — all of them coalesced into one
 * group that moves as a rigid block, preserving their own relative order. Pinned slots (no
 * key) are never coalesced and never reordered; see `movable` below.
 */
interface Unit {
  kind: 'member' | 'pinned';
  key?: string;
  isSection: boolean;
  /** False for pinned units, and for member units whose key maps to more than one
   *  NON-contiguous group (the dotted-key / non-contiguous-document-group hazard) — both
   *  are treated as fixed anchors: never reordered, always left exactly where they are. */
  movable: boolean;
  slots: Slot[];
  startLine: number;
  endLine: number;
  items: TreeNode[];
}

function buildUnits(slots: Slot[]): Unit[] {
  const units: Unit[] = [];

  for (const slot of slots) {
    if (slot.kind === 'pinned') {
      units.push({
        kind: 'pinned',
        isSection: false,
        movable: false,
        slots: [slot],
        startLine: slot.startLine,
        endLine: slot.endLine,
        items: slot.items
      });
      continue;
    }

    const isSection = isTable(slot.member!) || isTableArray(slot.member!);
    const previous = units[units.length - 1];
    if (previous && previous.kind === 'member' && previous.key === slot.key) {
      // Contiguous run sharing the same first key segment (AOT entries, or [a] then
      // [a.sub]) — coalesce into one unit that will move together.
      previous.slots.push(slot);
      previous.endLine = slot.endLine;
      previous.items = previous.items.concat(slot.items);
      continue;
    }

    units.push({
      kind: 'member',
      key: slot.key,
      isSection,
      movable: true, // corrected below once every unit for this container is known
      slots: [slot],
      startLine: slot.startLine,
      endLine: slot.endLine,
      items: [...slot.items]
    });
  }

  // A key that resolves to more than one, NON-contiguous unit (e.g. `hello.world` / `b` /
  // `hello.moon`) can't be safely reordered: resolveSlots has no way to represent "hello" as
  // a single relocatable thing when another key sits between its occurrences. Bail on moving
  // any of them — "did nothing" is the safe failure mode (docs/PLAN-Update-Order.md, Scope).
  const countByKey = new Map<string, number>();
  for (const unit of units) {
    if (unit.kind !== 'member' || unit.key === undefined) continue;
    countByKey.set(unit.key, (countByKey.get(unit.key) ?? 0) + 1);
  }
  for (const unit of units) {
    if (unit.kind === 'member' && unit.key !== undefined && countByKey.get(unit.key)! > 1) {
      unit.movable = false;
    }
  }

  return units;
}

/** Replays `moves` against `currentOrder` using the same simulate-and-splice approach
 *  compareObjects used to generate them, reconstructing the full requested key order. */
function computeTargetOrder(currentOrder: string[], moves: Move[]): string[] {
  const sim = [...currentOrder];
  for (const move of moves) {
    if (move.key === undefined) continue;
    const from = sim.indexOf(move.key);
    if (from === -1) continue; // not one of this container's movable keys
    const to = Math.max(0, Math.min(move.to, sim.length - 1));
    if (from === to) continue;
    sim.splice(from, 1);
    sim.splice(to, 0, move.key);
  }
  return sim;
}

/** Full dotted path to the entry a Move targets (its container path plus its own key), for
 *  warning messages -- clearer than the bare key alone once anything is nested more than one
 *  level deep (e.g. "t.hello.moon" rather than just "moon"). */
function describeMovePath(move: Move): string {
  return [...move.path, move.key].join('.');
}

/** Resolves a Move's `path` to the Document/Table/TableArray it targets, unwrapping a
 *  KeyValue/InlineItem wrapper if `tryFindByPath` returns one. Returns undefined for any
 *  shape this feature doesn't (yet) support — inline-table interiors, dotted-key implicit
 *  tables, AOT-entry sub-tables reached only via document-sibling scanning, etc. Never throws. */
function resolveContainer(document: Document, path: Path): Document | Table | TableArray | undefined {
  if (path.length === 0) return document;

  let node: TreeNode | undefined;
  try {
    node = tryFindByPath(document, path);
  } catch {
    return undefined;
  }
  if (!node) return undefined;

  if (isKeyValue(node)) node = node.value;
  if (node && hasItem(node)) node = node.item;

  if (node && (isDocument(node) || isTable(node) || isTableArray(node))) return node;
  return undefined;
}

function applyContainerMoves(document: Document, container: Document | Table | TableArray, moves: Move[], prePatchNodes: WeakSet<TreeNode>, warnings: string[]): void {
  const slots = resolveSlots(container, node => prePatchNodes.has(node));
  const units = buildUnits(slots);

  const movableUnitsByKey = new Map<string, Unit>();
  for (const unit of units) {
    if (unit.kind === 'member' && unit.movable && unit.key !== undefined) {
      movableUnitsByKey.set(unit.key, unit);
    }
  }

  // Warn about any requested move whose key genuinely exists here as a member but was marked
  // unmovable by buildUnits (a non-contiguous group) -- the caller asked for a specific
  // position and it was silently left exactly where it was.
  const memberKeys = new Set(
    units.filter(u => u.kind === 'member' && u.key !== undefined).map(u => u.key!)
  );
  for (const move of moves) {
    if (move.key !== undefined && memberKeys.has(move.key) && !movableUnitsByKey.has(move.key)) {
      warnings.push(
        `"${describeMovePath(move)}" -- its entries are not contiguous in the document (e.g. the ` +
        `TOML spec's own "valid but discouraged" out-of-order table pattern), so reordering was ` +
        `skipped for it`
      );
    }
  }

  if (movableUnitsByKey.size === 0) return; // nothing this container can safely reorder

  // Move.from/to are indices into the FULL member key sequence compareObjects saw (every
  // top-level key of this container's JS object, movable or not) -- replaying relevantMoves
  // against a sequence that already excluded fixed-anchor keys would silently misinterpret
  // those indices (a move meant to land after a fixed anchor could look like a no-op once
  // that anchor's slot is gone from the sequence). So the replay runs over the FULL sequence,
  // fixed anchors included as placeholder tokens (never themselves targeted, since no move's
  // key can match a non-contiguous-group's un-unique real key here anyway -- see buildUnits),
  // and only the RESULT is filtered down to movable keys afterward.
  // NUL-prefixed: TOML keys (bare or quoted) can never contain a control character, so this
  // placeholder can never collide with a real key name.
  let anchorCounter = 0;
  const fullCurrentOrder = units
    .filter(u => u.kind === 'member')
    .map(u => (u.movable ? u.key! : `\u0000anchor:${anchorCounter++}`));

  const relevantMoves = moves.filter(m => m.key !== undefined && movableUnitsByKey.has(m.key));
  if (relevantMoves.length === 0) return;

  const fullTargetOrder = computeTargetOrder(fullCurrentOrder, relevantMoves);
  const targetOrder = fullTargetOrder.filter(k => movableUnitsByKey.has(k));

  // Validity partition (docs/PLAN-Update-Order.md, Scope): a root key-value can never appear
  // after a section header. Root-KV positions and section positions are fixed by the
  // ORIGINAL structure (that's what made them root-KVs vs sections in the first place) —
  // only WHICH key fills each position-of-its-kind is being decided here.
  const rootKvTargetOrder = targetOrder.filter(k => !movableUnitsByKey.get(k)!.isSection);
  const sectionTargetOrder = targetOrder.filter(k => movableUnitsByKey.get(k)!.isSection);

  // Warn when the requested order itself asked for a root key-value to land after a section
  // header -- structurally impossible, so each partition falls back to keeping its own
  // requested relative order instead of the literal interleaving that was asked for.
  let sawSection = false;
  for (const key of targetOrder) {
    if (movableUnitsByKey.get(key)!.isSection) {
      sawSection = true;
    } else if (sawSection) {
      warnings.push(
        'the requested order asked for a root key-value to be positioned after a section header, ' +
        'which TOML cannot represent -- each group (root key-values, section blocks) was reordered ' +
        'to match its own requested relative order instead'
      );
      break;
    }
  }

  let rootKvCursor = 0;
  let sectionCursor = 0;
  const finalUnits: Unit[] = units.map(unit => {
    if (unit.kind !== 'member' || !unit.movable) return unit;
    const key = unit.isSection ? sectionTargetOrder[sectionCursor++] : rootKvTargetOrder[rootKvCursor++];
    return movableUnitsByKey.get(key)!;
  });

  // Nothing to do if the permutation is the identity.
  if (finalUnits.every((u, i) => u === units[i])) return;

  // Precompute each POSITION's own gap (number of blank lines before it), before permuting —
  // gaps belong to the position, not to whichever unit ends up there (docs/PLAN-Update-Order.md
  // §3.3 Step 6): this is what makes "0 within a run, 1 between sections" fall out for free
  // regardless of which specific key now occupies a given position.
  const containerFirstLine = isDocument(container) ? 1 : container.key.loc.end.line;
  const gapBefore: number[] = units.map((unit, i) => {
    if (i === 0) return unit.startLine - containerFirstLine;
    return unit.startLine - units[i - 1].endLine - 1;
  });

  let cursorEnd = containerFirstLine; // end line of whatever was placed immediately before
  for (let i = 0; i < finalUnits.length; i++) {
    const unit = finalUnits[i];
    const gap = gapBefore[i];
    const newStart = (i === 0 ? cursorEnd : cursorEnd + 1) + gap;
    const delta = newStart - unit.startLine;

    if (delta !== 0) {
      for (const item of unit.items) {
        shiftNode(item, { lines: delta, columns: 0 });
      }
    }

    cursorEnd = unit.endLine + delta;
  }

  const newItems = finalUnits.flatMap(u => u.items);
  const items = container.items as TreeNode[];
  items.splice(0, items.length, ...(newItems as any[]));

  recalcContainerEnd(container);
}

/**
 * Reorders `document`'s root key-values, [table]/[[array]] section blocks, and table-body
 * rows to match `moves` (object-key Moves collected from the isMove branch in patch.ts),
 * carrying each entry's owned comments with it. See docs/PLAN-Update-Order.md.
 *
 * Must run after every other structural change in this patch has already been applied to
 * `document` (Add/Remove/Rename/array-Move/structural-edit) — it does no insertion or
 * deletion of its own, only permutes and relays out what's already there.
 */
export function applyKeyOrderMoves(document: Document, moves: Move[], prePatchNodes: WeakSet<TreeNode>): void {
  if (moves.length === 0) return;

  // R5: a comment that visually introduces the next section but is physically parked as a
  // trailing item of the previous one must be re-parented before slots are resolved, or it
  // travels with the wrong block.
  normalizeSectionComments(document);

  // Collects every requested reposition this pass couldn't honor, across every container, so
  // a single consolidated console.warn can report them at the end (docs/PLAN-Update-Order.md
  // scope limitations: non-contiguous groups, the root-KV/section validity partition, and
  // shapes reordering doesn't reach yet at all -- inline-table/array-of-tables interiors,
  // dotted-key implicit tables, AOT-entry sub-tables). "Did nothing" for the affected entry is
  // the safe failure mode in every case; this only makes that silence visible to the caller.
  const warnings: string[] = [];

  const movesByContainer = new Map<Document | Table | TableArray, Move[]>();
  for (const move of moves) {
    if (move.key === undefined) continue;
    const container = resolveContainer(document, move.path);
    if (!container) {
      // Never throw — this is reached for shapes updateOrder doesn't support at all yet:
      // dotted-key implicit tables, inline-table/array-of-tables interiors, and AOT-entry
      // sub-tables only reachable via document-sibling scanning.
      warnings.push(
        `"${describeMovePath(move)}" -- unsupported location for reordering (e.g. a dotted-key ` +
        `implicit table, or an interior of an inline table/array-of-tables entry)`
      );
      continue;
    }
    const bucket = movesByContainer.get(container);
    if (bucket) bucket.push(move);
    else movesByContainer.set(container, [move]);
  }

  for (const [container, containerMoves] of movesByContainer) {
    applyContainerMoves(document, container, containerMoves, prePatchNodes, warnings);
  }

  if (warnings.length > 0) {
    const unique = [...new Set(warnings)];
    console.warn(
      `toml-patch: updateOrder could not honor the requested position for ` +
      `${unique.length === 1 ? '1 entry' : `${unique.length} entries`}, left unchanged:\n` +
      unique.map(w => `  - ${w}`).join('\n')
    );
  }

  recalcContainerEnd(document);
}
