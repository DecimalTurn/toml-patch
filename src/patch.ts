import parseTOML from './parse-toml';
import parseJS from './parse-js';
import toJS from './to-js';
import toTOML from './to-toml';
import { TomlFormat } from './toml-format';
import {
  isKeyValue,
  WithItems,
  KeyValue,
  isTable,
  TreeNode,
  Document,
  isDocument,
  Block,
  NodeType,
  isTableArray,
  isInlineArray,
  isInlineTable,
  isInlineItem,
  isString,
  isComment,
  isFloat,
  Float as FloatNode,
  hasItem,
  hasItems,
  InlineItem,
  InlineTable,
  InlineArray,
  CST,
  Table,
  TableArray,
  Value,
  isDateTime
} from './cst';
import diff, { Change, ChangeType, Move, isAdd, isEdit, isRemove, isMove, isRename } from './diff';
import findByPath, { tryFindByPath, findParent, Path } from './find-by-path';
import { last, isInteger, arraysEqual, isTemporal, temporalToTomlString, isObject, stableStringify } from './utils';
import { insert, replace, remove, applyWrites, applyBracketSpacing, hasInlineContainerNeedingTighten, deleteInlineContainerNeedingTighten, shiftNode, recalcContainerEnd, addExitOffset, markDirty, getPendingEnterOffsets, getExitOffsets, setRootIndentWidth } from './writer';
import { removeMember, moveInlineElement, findHostContainer, resolveSlots } from './comment-ownership';
import { applyKeyOrderMoves } from './update-order';
import { generateInlineItem, generateTable, generateTableArray, generateString, generateKey, generateKeyValue } from './generate';
import { IS_BARE_KEY, createNewlineScanState } from './tokenizer';
import { escapeStringContent } from './escape-preference';
import { resolveTomlFormat } from './toml-format';
import { arrayHadTrailingCommas, tableHadTrailingCommas, postInlineItemRemovalAdjustment, calculateTableDepth } from './formatter';
import { DateFormatHelper } from './date-format';
import {
  getInlineInsertColumnDelta,
  normalizeInlineCommentAlignmentInString,
  preserveAlignedInlineCommentColumn,
  preserveAlignedInlineCommentForDelta,
  recordInlineTableCommentDelta
} from './comment-alignment';
import { getSpan } from './location';
import { stripLeadingBom, UTF8_BOM } from './decode-utf8';
import traverse from './traverse';
import { prepareInsertedNestedInlineContainer } from './inline-layout';

/**
 * Applies modifications to a TOML document by comparing an existing TOML string with updated JavaScript data.
 * 
 * This function preserves formatting and comments from the existing TOML document while
 * applying changes from the updated data structure. It performs a diff between the existing
 * and updated data, then strategically applies only the necessary changes to maintain the
 * original document structure as much as possible.
 * 
 * @param existing - The original TOML document as a string
 * @param updated - The updated JavaScript object with desired changes
 * @param format - Optional formatting options to apply to new or modified sections
 * @returns A new TOML string with the changes applied
 */
export default function patch(existing: string, updated: any, format?: Partial<TomlFormat> | TomlFormat): string {
  // The tokenizer flags mixed line endings as it scans, so this requires no
  // separate pass over the input.
  const newlineState = createNewlineScanState();
  const existing_cst = Array.from(parseTOML(stripLeadingBom(existing), newlineState));

  // Auto-detect formatting preferences from the existing TOML string for fallback
  const autoDetectedFormat = TomlFormat.autoDetectFormatWithCst(existing, existing_cst);
  const fmt = resolveTomlFormat(format, autoDetectedFormat);

  if (newlineState.mixed) {
    const normalized = fmt.newLine === '\r\n' ? 'CRLF' : 'LF';
    console.warn(
      `toml-patch: Mixed line endings detected. ` +
      `Line endings in the output will be normalized to ${normalized}`
    );
  }

  const patchedToml = patchCst(existing_cst, updated, fmt).tomlString;
  return fmt.leadingBom ? `${UTF8_BOM}${patchedToml}` : patchedToml;
}

/**
 * Recursively checks if an object graph contains any Temporal values.
 * Used to auto-detect whether temporal mode should be enabled for patching.
 */
function hasTemporal(obj: any, seen: WeakSet<object> = new WeakSet()): boolean {
  if (obj == null || typeof obj !== 'object') return false;
  if (isTemporal(obj)) return true;
  if (seen.has(obj)) return false;
  seen.add(obj);
  for (const v of Object.values(obj)) {
    if (hasTemporal(v, seen)) return true;
  }
  return false;
}

/**
 * Length of the existing dotted key's prefix that the edit path matches.
 * Only the path's RELATIVE tail (past the key's container) is eligible:
 * the absolute path carries the container's own key segments (e.g. the
 * [mbe.""] header consumes ['mbe',''] before the row key), and matching
 * against those keeps extra key segments when the container's key echoes
 * the row's — editing `mbe[""][""]` once truncated the row
 * `"".""."mfn31vru"` to `"".""` instead of `""` (fuzz seed 13057).
 */
function truncationMatchLen(changePath: Path, existingKey: string[], containerAbsLen: number): number {
  const relPath = changePath.slice(containerAbsLen);
  let matchLen = 0;
  const max = Math.min(relPath.length, existingKey.length);
  for (let i = 1; i <= max; i++) {
    if (arraysEqual(relPath.slice(relPath.length - i), existingKey.slice(0, i))) {
      matchLen = i;
    }
  }
  return matchLen;
}

function inlineTableAddIndex(parent: InlineTable, child: KeyValue, beforeKey?: string): number | undefined {
  if (beforeKey === undefined) return undefined;

  const childKey = child.key.value;
  if (childKey.length < 2) return undefined;

  const prefix = childKey.slice(0, -1);
  for (let index = 0; index < parent.items.length; index++) {
    const item = parent.items[index];
    if (!isInlineItem(item) || !isKeyValue(item.item)) continue;
    const existingKey = item.item.key.value;
    if (existingKey.length === childKey.length &&
        arraysEqual(existingKey.slice(0, -1), prefix) &&
        existingKey[existingKey.length - 1] === beforeKey) {
      return index;
    }
  }

  return undefined;
}

/** Every node currently in `document`, seeding updateOrder's isEligibleForLeading guard. */
function collectPrePatchNodes(document: Document): WeakSet<TreeNode> {
  const nodes = new WeakSet<TreeNode>();
  const visit = (node: TreeNode) => { nodes.add(node); };
  traverse(document, {
    Document: visit,
    Table: visit,
    TableKey: visit,
    TableArray: visit,
    TableArrayKey: visit,
    KeyValue: visit,
    Key: visit,
    String: visit,
    Integer: visit,
    Float: visit,
    Boolean: visit,
    DateTime: visit,
    InlineArray: visit,
    InlineItem: visit,
    InlineTable: visit,
    Comment: visit
  });
  return nodes;
}

/**
 * updateOrder needs `updated_js`'s TOP-level key order to reflect exactly what the caller
 * requested — but parseJS -> formatTopLevel unconditionally hoists any inline-table/AOT-shaped
 * root key into its own [section]/[[array]] block via remove-then-APPEND (src/formatter.ts).
 * That's a genuine TOML requirement (root scalars must precede section headers) when the
 * value becomes an actual section, but formatTopLevel applies it to ANY nested object at the
 * default inlineTableStart, even when the existing document represents it as a plain inline
 * value with no such constraint — silently reordering it after every scalar key, regardless
 * of the caller's request or updateOrder.
 *
 * Fixes this by re-deriving the root key order from a throwaway, un-hoisted parse
 * (inlineTableStart: 0 disables the section conversion entirely) and re-keying `updated_js`'s
 * top level to match. Only the top-level key ORDER is affected — values, nested levels, and
 * the actual output format of newly-added content (still driven by `format`/`diffing_fmt`,
 * unrelated to this) are untouched. Only called when `format.updateOrder` is set, so it costs
 * nothing when the option is off.
 */
function applyRequestedRootKeyOrder(updated: any, updated_js: any, diffing_fmt: TomlFormat, useTemporal: boolean): any {
  if (!isObject(updated_js)) return updated_js;

  const unhoisted_fmt = resolveTomlFormat({ ...diffing_fmt, inlineTableStart: 0 }, diffing_fmt);
  const unhoisted_document = parseJS(updated, unhoisted_fmt);
  const unhoisted_js = toJS(unhoisted_document.items, '', { temporal: useTemporal });
  if (!isObject(unhoisted_js)) return updated_js;

  const reordered: any = {};
  for (const key of Object.keys(unhoisted_js)) {
    if (Object.prototype.hasOwnProperty.call(updated_js, key)) reordered[key] = updated_js[key];
  }
  // Defensive: any key present in updated_js but not in the un-hoisted probe (shouldn't
  // happen — both come from the same `updated`) is appended rather than silently dropped.
  for (const key of Object.keys(updated_js)) {
    if (!Object.prototype.hasOwnProperty.call(reordered, key)) reordered[key] = updated_js[key];
  }
  return reordered;
}

/**
 * The parser's table-body loop consumes comments between consecutive [[x]] entries
 * as trailing children of the first entry (it sees `# comment` before the next
 * `[[x]]` header). This function promotes those trailing comments to Document-level
 * siblings so that resolveSlots can assign them to the correct entry.
 */
function normalizeAotEntryComments(doc: Document): void {
  const items = doc.items as TreeNode[];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Handle both Table and TableArray: comments between a section header
    // and its next sibling AOT entry, or between consecutive AOT entries,
    // are parsed as trailing children of the first section. Promote them.
    if (!((isTable(item) || isTableArray(item)) && hasItems(item))) continue;

    const containerItems = item.items as TreeNode[];
    // Find trailing comments at the end of this entry
    let commentStart = containerItems.length;
    while (commentStart > 0 && isComment(containerItems[commentStart - 1])) {
      commentStart--;
    }

    if (commentStart < containerItems.length) {
      // Check if the next Document item is another TableArray with a
      // matching key prefix (for Tables: child AOT; for TableArrays: sibling AOT)
      const nextItem = items[i + 1];
      if (nextItem && isTableArray(nextItem)) {
        const thisKey = (item as Table | TableArray).key.item.value;
        const nextKey = (nextItem as TableArray).key.item.value;
        if (arraysEqual(thisKey, nextKey.slice(0, thisKey.length))) {
          // Promote trailing comments to Document level
          const comments = containerItems.splice(commentStart);
          const nextIdx = items.indexOf(nextItem);
          for (const comment of [...comments].reverse()) {
            items.splice(nextIdx, 0, comment);
          }
          // Fix up loc.end
          recalcContainerEnd(item);
        }
      }
    }
  }
}

export function patchCst(existing_cst: CST, updated: any, format: TomlFormat): { tomlString: string; document: Document } {
  const items = [...existing_cst];

  // Auto-detect Temporal in the updated JS object so that the internal
  // toJS() diff uses Temporal objects when the user provides them.
  const useTemporal = hasTemporal(updated);

  // Compute the Document's end position from its children so that
  // offset-based position updates in applyWrites start from the correct
  // baseline (instead of 0,0 which under-counts after expansion).
  let endLine = 1;
  let endColumn = 0;
  for (const item of items) {
    const e = item.loc.end;
    if (e.line > endLine || (e.line === endLine && e.column > endColumn)) {
      endLine = e.line;
      endColumn = e.column;
    }
  }

  const existing_js = toJS(items, '', { temporal: useTemporal });
  const existing_document: Document = {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: endLine, column: endColumn } },
    items
  };
  setRootIndentWidth(existing_document, format.indentWidth);

  // Certain formatting options should not be applied to the updated document during patching, because it would
  // override the existing formatting too aggressively. For example, preferNestedTablesMultiline would
  // convert all nested tables to multiline, which would not be desired during patching.
  // Therefore, we create a modified format for generating the updated document used for diffing.
  // When inlineTableStart > 1, formatNestedTablesMultiline would split nested inline tables in the
  // updated document into separate sections, causing the diff to see only the empty parent. Clamp to
  // 1 (the default) so only top-level tables are converted to sections — the same as when unset.
  // inlineTableStart of 0 or 1 (or undefined) already produce the correct AST shape for diffing.
  const diffing_inlineTableStart = (format.inlineTableStart != null && format.inlineTableStart > 1)
    ? 1
    : format.inlineTableStart;
  const diffing_fmt = resolveTomlFormat({...format, inlineTableStart: diffing_inlineTableStart}, format);
  const updated_document = parseJS(updated, diffing_fmt);

  // Diff against the JS representation rather than
  // the raw `updated` value, so that any undefined keys (which parseJS already
  // stripped) are consistently absent from both sides of the diff.
  const updated_js_raw = toJS(updated_document.items, '', { temporal: useTemporal });
  const updated_js = format.updateOrder
    ? applyRequestedRootKeyOrder(updated, updated_js_raw, diffing_fmt, useTemporal)
    : updated_js_raw;
  const changes = reorder(coalesceStructuralReplacements(
    existing_document,
    updated_js,
    diff(existing_js, updated_js, [], { updateOrder: format.updateOrder, orderSource: updated })
  ));

  if (changes.length === 0) {
    return {
      tomlString: toTOML(items, format),
      document: existing_document
    };
  }

  // Snapshot every node that exists BEFORE any change is applied. Passed through to
  // applyKeyOrderMoves, which feeds it to resolveSlots' isEligibleForLeading predicate so a
  // key that was just Added by this same patch can't adopt a preceding comment run via R2 —
  // node identity is stable across remove()/insert() (they splice the same objects), so this
  // has to be captured now, before applyChanges runs. applyChanges also adds to this set as it
  // runs: a structural edit (e.g. table→scalar) regenerates a fresh node in place of an existing
  // one, and that replacement is conceptually the same entry, not a new one — so it needs to
  // stay eligible for R2 too, even though its object identity postdates the snapshot.
  const commentEligibleNodes = collectPrePatchNodes(existing_document);

  const patched_document = applyChanges(existing_document, updated_document, changes, format, useTemporal, commentEligibleNodes, updated);
  const tomlString = normalizeInlineCommentAlignmentInString(
    patched_document,
    toTOML(patched_document.items, format),
    format
  );

  return {
    tomlString,
    document: patched_document
  };
}

function reorder(changes: Change[]): Change[] {
  //Reorder deletions among themselves to avoid index issues when removing
  // multiple array elements. Remove higher indices first so earlier indices
  // remain valid after each removal. Compare the last path element (the index)
  // and the prefix (everything before it) to group related removes.

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (isRemove(change)) {
      // The array this Remove targets, and the Remove's own index within it.
      const aIdx = last(change.path);
      const aPrefix = change.path.slice(0, -1);
      let j = i + 1;
      while (j < changes.length) {
        const next_change = changes[j];

        // A Remove emitted AFTER a same-array Add or Move is in post-shift
        // (sequential) coordinates: the Add changed the array's length and the
        // Move changed the element order, so hoisting the Remove back across
        // that barrier would apply its index to the wrong element (fuzz seed
        // 1137525: `Remove[1], Add[2], Add[3], Remove[6]` must keep Remove[6]
        // after the Adds, where index 6 is the surplus duplicate, not the
        // source index 6).  Same-array Edits are length-preserving, so they are
        // safe to cross (fuzz seed 50448), and Adds/Moves in a DIFFERENT array
        // context do not shift this one (fuzz seeds 84522/473477) — so only a
        // same-array Add or Move forms a barrier.
        if (isAdd(next_change)) {
          const bIdx = last(next_change.path);
          if (typeof bIdx === 'number' && arraysEqual(aPrefix, next_change.path.slice(0, -1))) {
            break;
          }
          j++;
          continue;
        }
        // Object-key Moves (`updateOrder`, key set) reorder object members, not
        // array elements, so they never shift this array's indices.
        if (isMove(next_change) && next_change.key === undefined) {
          if (arraysEqual(aPrefix, next_change.path)) {
            break;
          }
          j++;
          continue;
        }
        if (!isRemove(next_change)) { j++; continue; }

        const bIdx = last(next_change.path);
        const bPrefix = next_change.path.slice(0, -1);

        // Same array context AND higher index should come first.
        // Only reorder numeric array indices (skip string keys).
        if (typeof aIdx === 'number' && typeof bIdx === 'number' && arraysEqual(aPrefix, bPrefix) && bIdx > aIdx) {
          changes.splice(j, 1);
          changes.splice(i, 0, next_change);
          // We reset i to -1 so that after the for-loop's i++ the next iteration
          // starts at 0 and re-checks the newly promoted element.
          i = -1;
          break;
        }
        j++;
      }
    }
  }
  
  return changes;

}

/**
 * Merges sibling `Remove(prefix.oldKey)` + `Add(prefix.newKey)` changes that
 * share a common parent path into a single `Edit(prefix)` change.
 *
 * When a table/AOT is replaced by an incompatible type at a shallower path
 * (e.g. `[a.b]` → `a = { x = 1 }`), the object-diff sees the whole `a`
 * subtree disappear and a differently-shaped `a` appear, and reports it as
 * a `Remove` of the old child (`a.b`) plus one `Add` per key of the new
 * value (`a.x`) — never a single `Edit` on `a` itself, since `a` never
 * existed as its own JS-diff node (it was only implicit via the dotted
 * table key). Left alone, the generic Add handling resolves the missing
 * `a` container by walking up to the document root (`findParent`), silently
 * dropping the `a` nesting. Coalescing back into one `Edit(prefix)` routes
 * it through `handleStructuralEdit`, which already rebuilds the correct
 * nested structure from the full updated value at that path.
 *
 * Only applies when `prefix` has no literal node of its own in `original`
 * (it was purely implicit) — if `prefix` is an actual existing table, the
 * normal per-key Add/Remove handling already does the right thing.
 *
 * Also merges per-index Edit/Add/Remove changes under an existing
 * array-of-tables (AOT) whose updated value is still a JS array but no
 * longer made up entirely of plain objects (e.g. `[[i]]` → `i = [1, 2, 3]`
 * or `i = [9]`). An AOT entry is a Table living at the document level, not
 * an item inside an array node, so it can't be edited/appended/removed in
 * place the way the diff assumes — the whole array needs to be rebuilt via
 * `handleStructuralEdit`. When every element of the updated array is still
 * a plain object, the AOT stays an AOT and the normal per-entry handling is
 * left untouched.
 */
function coalesceStructuralReplacements(original: Document, updated_js: any, changes: Change[]): Change[] {
  const consumed = new Set<Change>();
  const coalescedEdits: Change[] = [];

  // Strategy 1: Remove(prefix.oldKey) + Add(prefix.newKey) sharing an
  // implicit parent with no literal node of its own.
  const groups = new Map<string, { path: Change['path']; removes: Change[]; adds: Change[] }>();
  for (const change of changes) {
    if (!isRemove(change) && !isAdd(change)) continue;

    const parentPath = change.path.slice(0, -1);
    if (parentPath.length === 0) continue; // never coalesce at the document root itself

    const key = JSON.stringify(parentPath);
    let group = groups.get(key);
    if (!group) {
      group = { path: parentPath, removes: [], adds: [] };
      groups.set(key, group);
    }
    (isRemove(change) ? group.removes : group.adds).push(change);
  }
  for (const group of groups.values()) {
    if (group.removes.length === 0 || group.adds.length === 0) continue;
    if (tryFindByPath(original, group.path)) continue; // parent still exists literally

    group.removes.forEach(change => consumed.add(change));
    group.adds.forEach(change => consumed.add(change));
    coalescedEdits.push({ type: ChangeType.Edit, path: group.path });
  }

  // Replacing every member of an inline-table object inside an inline array is safer as one
  // element replacement. Applying the individual Remove/Add changes can leave the emptied
  // multiline inline table's offsets attached to its new rows and corrupt the enclosing array.
  for (const change of changes) {
    if (consumed.has(change) || (!isRemove(change) && !isAdd(change))) continue;

    const elementPath = change.path.slice(0, -1);
    if (elementPath.length === 0 || typeof last(elementPath) !== 'number') continue;
    const element = tryFindByPath(original, elementPath);
    if (!element || !isInlineItem(element) || !isInlineTable(element.item)) continue;

    const siblings = changes.filter(candidate =>
      !consumed.has(candidate) &&
      (isRemove(candidate) || isAdd(candidate)) &&
      arraysEqual(candidate.path.slice(0, -1), elementPath)
    );
    if (siblings.length === 0 || siblings.some(candidate => candidate.path.length !== elementPath.length + 1)) continue;

    const existingKeys = new Set(
      (element.item.items as TreeNode[])
        .filter(isInlineItem)
        .map(item => {
          const keyValue = isKeyValue(item.item) ? item.item : undefined;
          return keyValue?.key.value.length === 1 ? keyValue.key.value[0] : undefined;
        })
        .filter((key): key is string => key !== undefined)
    );
    const removedKeys = new Set(
      siblings.filter(isRemove).map(candidate => last(candidate.path))
    );
    if (!siblings.some(isRemove) || !siblings.some(isAdd) ||
        existingKeys.size !== removedKeys.size ||
        [...existingKeys].some(key => !removedKeys.has(key))) continue;

    for (const sibling of siblings) consumed.add(sibling);
    coalescedEdits.push({ type: ChangeType.Edit, path: elementPath });
  }

  // Strategy 2: AOT being replaced by an array that no longer holds only
  // plain objects.
  const arrayPrefixes = new Map<string, Change['path']>();
  for (const change of changes) {
    if (consumed.has(change)) continue;
    if (!isEdit(change) && !isAdd(change) && !isRemove(change)) continue;

    const index = last(change.path);
    if (typeof index !== 'number') continue;

    const prefix = change.path.slice(0, -1);
    if (prefix.length === 0) continue;

    const firstEntry = tryFindByPath(original, prefix.concat(0));
    if (!firstEntry || !isTableArray(firstEntry)) continue;

    arrayPrefixes.set(JSON.stringify(prefix), prefix);
  }
  for (const prefix of arrayPrefixes.values()) {
    let value: any = updated_js;
    for (const key of prefix) value = value?.[key];
    if (!Array.isArray(value)) continue;

    // The array no longer holds only AOT-shaped entries once ANY element is a
    // scalar / array / date / Temporal — `isObject` already excludes those.
    // (A bare `typeof el === 'object'` check wrongly kept Dates as "objects",
    // so `[[x]]` → `[date1, date2]` was missed and the redundant per-element
    // Add double-added the tail — fuzz seed 86724.)
    const staysAllObjects = value.every(el => isObject(el));
    if (staysAllObjects) continue;

    // Only coalesce when the diff actually split the replacement across
    // multiple element-level changes (e.g. Edit[0] + Add[1]).  A single Edit
    // (e.g. `[[a.b.c]]` → `[date]`) is handled correctly by the
    // isTableArray(existing) branch, which re-renders the parent as a proper
    // `[section]` header — collapsing it here would instead route through
    // handleStructuralEdit and flatten it to an inline table (fuzz seed 3333).
    // Element-level changes include both entry adds/edits (path `prefix+[i]`)
    // and edits nested INSIDE an entry (path `prefix+[i, key]`): a mixed array
    // like `[{…}, -4619]` diffs as `Add[1]` plus per-key edits under entry 0,
    // and counting only the direct children (prefix.length + 1) missed the
    // nested edits, leaving the scalar entry to be re-materialised as an empty
    // AOT row (fuzz seed 136865).
    const elementChanges = changes.filter(c =>
      !consumed.has(c)
      && (isEdit(c) || isAdd(c) || isRemove(c))
      && c.path.length > prefix.length
      && arraysEqual(c.path.slice(0, prefix.length), prefix)
    );
    if (elementChanges.length < 2) continue;

    for (const change of elementChanges) {
      consumed.add(change);
    }
    coalescedEdits.push({ type: ChangeType.Edit, path: prefix });
  }

  if (consumed.size === 0) return changes;

  const result = changes.filter(change => !consumed.has(change));
  result.push(...coalescedEdits);
  return result;
}

function preserveEscapedKeyRaw(existingRaw: string, keyParts: string[]): string {
  return keyParts
    .map(part => (IS_BARE_KEY.test(part) ? part : `"${escapeStringContent(part, existingRaw, 'singleline-basic')}"`))
    .join('.');
}

/**
 * Preserves formatting from the existing node when applying it to the replacement node.
 * This includes multiline string formats, trailing commas, DateTime formats, etc.
 * 
 * @param existing - The existing node with formatting to preserve
 * @param replacement - The replacement node to apply formatting to
 */
function preserveFormatting(existing: Value, replacement: Value): void {
  
  // Preserve string format (handles basic, literal, multiline in all variants)
  if (isString(existing) && isString(replacement)) {
    const newString = generateString(replacement.value, existing.raw);
    replacement.raw = newString.raw;
    replacement.loc = newString.loc;
  }
  
  // Preserve DateTime format
  if (isDateTime(existing) && isDateTime(replacement)) {
    // Analyze the original raw format and create a properly formatted replacement
    const originalRaw = existing.raw;
    const newValue = replacement.value;

    if (isTemporal(newValue)) {
      // Temporal objects preserve their own type — no format conversion needed.
      let raw = temporalToTomlString(newValue);
      // Preserve the original separator style (T vs space) from the existing TOML.
      if (originalRaw.includes(' ') && raw.includes('T')) {
        raw = raw.replace('T', ' ');
      }
      // Preserve +00:00 / -00:00 vs Z offset format
      if (/(?:\+00:00|-00:00)/.test(originalRaw) && raw.endsWith('Z')) {
        const offset = originalRaw.match(/([+-]00:00)/)![1];
        raw = raw.replace(/Z$/, offset);
      }
      replacement.raw = raw;
      replacement.loc.end.column = replacement.loc.start.column + replacement.raw.length;
      // Keep the Temporal object as the value — it will serialize correctly.
    } else if (DateFormatHelper.IS_TIME_ONLY.test(originalRaw)
        && newValue instanceof Date && newValue.getUTCFullYear() > 1) {
      // The existing value is a bare local time, but the replacement carries
      // a real date component that a time-only format cannot represent.
      // Converting would silently drop the date (fuzz seed 2583: an implicit
      // table `dp6t.uhds = 18:06:01` truncated to `dp6t = 2036-10-16` came
      // back as `00:00:00`).  Keep the replacement's own formatting instead.
      // Time-only values are represented internally as Date objects with
      // year 0000, so year > 1 reliably separates real dates from bare times.
    } else {
      // Create a new date with the original format preserved
      const formattedDate = DateFormatHelper.createDateWithOriginalFormat(newValue, originalRaw);

      // Update the replacement with the properly formatted date
      replacement.value = formattedDate;
      replacement.raw = formattedDate.toISOString();
      replacement.loc.end.column = replacement.loc.start.column + replacement.raw.length;
    }
  }
  
  // Preserve float NaN sign format
  if (isFloat(existing) && isFloat(replacement)
      && Number.isNaN(existing.value) && Number.isNaN(replacement.value)) {
    const existingFloat = existing as FloatNode;
    const replacementFloat = replacement as FloatNode;
    if (existingFloat.nanSign) {
      // Existing had a sign (+ or -), replacement has none (canonical NaN).
      // Preserve the signed style: always use '+' for positive/unsigned.
      replacementFloat.nanSign = '+';
      replacementFloat.raw = '+nan';
    }
    // If existing had no sign and replacement has no sign, leave as-is (nan)
  }
  
  // Preserve array trailing comma format
  if (isInlineArray(existing) && isInlineArray(replacement)) {
    const originalHadTrailingCommas = arrayHadTrailingCommas(existing);
    if (replacement.items.length > 0) {
      const lastItem = replacement.items[replacement.items.length - 1];
      if (lastItem.comma !== originalHadTrailingCommas) {
        lastItem.comma = originalHadTrailingCommas;
        // Adding a trailing comma widens the array by one column, but the
        // regenerated/replacement value's `loc.end` was laid out for the
        // comma-less form.  Without extending it, the closing `]` (written at
        // `end.column - 1`) lands on the same column as the comma, colliding
        // into `...,,` (fuzz seed 30330).
        if (originalHadTrailingCommas) {
          replacement.loc.end.column += 1;
        }
      }
    }
  }
  
  // Preserve inline table trailing comma format
  if (isInlineTable(existing) && isInlineTable(replacement)) {
    const originalHadTrailingCommas = tableHadTrailingCommas(existing);
    if (replacement.items.length > 0) {
      const lastItem = replacement.items[replacement.items.length - 1];
      if (lastItem.comma !== originalHadTrailingCommas) {
        lastItem.comma = originalHadTrailingCommas;
        // Same as the array case above: make room for the added comma before
        // the closing `}`.
        if (originalHadTrailingCommas) {
          replacement.loc.end.column += 1;
        }
      }
    }
  }
}

/**
 * Applies a list of changes to the original TOML document CST while preserving formatting and structure.
 * 
 * This function processes different types of changes (Add, Edit, Remove, Move, Rename) and applies them
 * to the original document in a way that maintains the existing formatting preferences, comments, and
 * structural elements as much as possible. Special handling is provided for different node types like
 * inline tables, arrays, and table arrays to ensure proper formatting consistency.
 * 
 * @param original - The original TOML document CST to be modified
 * @param updated - The updated document CST containing new values for changes
 * @param changes - Array of change objects describing what modifications to apply
 * @param format - Formatting preferences to use for newly added elements
 * @returns The modified original document with all changes applied
 * 
 * @example
 * ```typescript
 * const changes = [
 *   { type: 'add', path: ['newKey'], value: 'newValue' },
 *   { type: 'edit', path: ['existingKey'], value: 'updatedValue' }
 * ];
 * const result = applyChanges(originalDoc, updatedDoc, changes, format);
 * ```
 */
function applyChanges(original: Document, updated: Document, changes: Change[], format: TomlFormat, temporal: boolean = false, commentEligibleNodes: WeakSet<TreeNode> = new WeakSet(), rawUpdated: any = undefined): Document {
  // Track AOT keys whose entries were all removed so we can insert empty arrays. Keyed by
  // the dotted name for de-duplication, but carrying the path segments — a nested key like
  // [[a.b]] has to be re-materialised as `a.b = []`, not as a root key named `a.b`.
  const emptiedAotKeys = new Map<string, string[]>();

  // Tables materialised in-place during this patch (R2 extension).  After
  // applyWrites, fix up their line position to remove spurious blank lines
  // between preceding comments and the materialised header.  Only tracked
  // when the preceding item in Document.items is an R2-adjacent Comment
  // (R3 gaps are intentional and left alone).
  const materialisedTables = new Set<Table>();

  function trackAdjacentComment(table: Table) {
    const items = original.items as TreeNode[];
    const idx = items.indexOf(table as TreeNode);
    if (idx > 0) {
      const prev = items[idx - 1];
      if (isComment(prev) && prev.loc.end.line + 1 === table.loc.start.line) {
        materialisedTables.add(table);
      }
    }
  }

  // Compute the absolute lookup path of a node by walking the document tree.
  // Used to tell whether findByPath matched a dotted KeyValue exactly or by
  // key-prefix (the key is longer than the consumed path segments).
  const absolutePathCache = new WeakMap<TreeNode, Path>();
  function absolutePathOf(target: TreeNode): Path | undefined {
    const cached = absolutePathCache.get(target);
    if (cached !== undefined) return cached;
    const indexes: Record<string, number> = {};
    function walk(node: TreeNode, path: Path): Path | undefined {
      if (node === target) return path;
      if (isKeyValue(node)) return walk(node.value, path);
      if (isInlineItem(node)) return walk(node.item, path);
      if (!hasItems(node)) return undefined;
      for (let i = 0; i < node.items.length; i++) {
        const item = node.items[i];
        let key: Path = [];
        if (isKeyValue(item)) {
          key = item.key.value;
        } else if (isTable(item) || isTableArray(item)) {
          key = item.key.item.value;
          if (isTableArray(item)) {
            const ks = stableStringify(key);
            indexes[ks] = (indexes[ks] ?? -1) + 1;
            key = key.concat(indexes[ks]);
          }
        } else if (isInlineItem(item)) {
          if (isKeyValue(item.item)) {
            key = item.item.key.value;
          } else {
            key = [i];
          }
        }
        const full = key.length ? path.concat(key) : path;
        const found = walk(item, full);
        if (found) return found;
      }
      return undefined;
    }
    const result = walk(original, []);
    if (result !== undefined) absolutePathCache.set(target, result);
    return result;
  }

  // findByPath returns a dotted KeyValue (or its InlineItem wrapper) when the
  // probe path is a PREFIX of the key (the key is longer than the path). Such
  // a match is not a real location: the node's value belongs to a different
  // subtree, so Adds must resolve past it to the shared ancestor container.
  function isPrefixMatchedNode(candidate: TreeNode, probe: Path): boolean {
    const kv = isKeyValue(candidate)
      ? candidate
      : isInlineItem(candidate) && isKeyValue(candidate.item)
        ? candidate.item
        : undefined;
    if (!kv) return false;
    const keyLen = kv.key.value.length;
    // The probe fully consumed the key's prefix and the key continues past
    // it (e.g. ['ak'] matching key ['ak','k99']).
    if (keyLen > probe.length) return true;
    // An exact match consumes the key's own segments as the probe's tail —
    // for nodes under an array-of-tables the absolute path carries the
    // entry's numeric index, which the probe doesn't, so comparing absolute
    // lengths misflags exact matches as prefix matches (fuzz seed 3632:
    // adding under `js-uda0fp0` skipped the KV and inserted at the entry
    // level, right after the closing `}` of the multiline inline table).
    return !arraysEqual(kv.key.value, probe.slice(probe.length - keyLen));
  }

  function aotEntryUsesDottedKey(styleEntry: TableArray, relativeKey: string[]): boolean {
    const entryKey = styleEntry.key.item.value;
    const fullKey = entryKey.concat(relativeKey);

    if ((styleEntry.items as TreeNode[]).some(item =>
      isKeyValue(item)
      && item.key.value.length > relativeKey.length
      && arraysEqual(item.key.value.slice(0, relativeKey.length), relativeKey)
    )) {
      return true;
    }

    return (original.items as TreeNode[]).some(item => {
      if (!isTable(item) && !isTableArray(item)) return false;
      const key = item.key.item.value;
      return key.length > fullKey.length
        && arraysEqual(key.slice(0, fullKey.length), fullKey);
    });
  }

  function preserveAotEntryDottedKeys(entry: TableArray, styleEntry: TableArray): TableArray {
    const rows: TreeNode[] = [];
    let changed = false;

    for (const item of entry.items as TreeNode[]) {
      if (!isKeyValue(item) || !isInlineTable(item.value)
          || !aotEntryUsesDottedKey(styleEntry, item.key.value)) {
        rows.push(item);
        continue;
      }

      const replacementRows: KeyValue[] = [];
      for (const nestedItem of item.value.items as TreeNode[]) {
        if (!isInlineItem(nestedItem) || !isKeyValue(nestedItem.item)) continue;
        const nestedObject = toJS([nestedItem.item], '', { temporal });
        let nestedValue: any = nestedObject;
        for (const key of nestedItem.item.key.value) nestedValue = nestedValue?.[key];
        const freshValue = regenerateValue(nestedValue, format);
        if (freshValue !== undefined) {
          replacementRows.push(generateKeyValue(
            item.key.value.concat(nestedItem.item.key.value),
            freshValue
          ));
        }
      }

      if (replacementRows.length > 0) {
        rows.push(...replacementRows);
        changed = true;
      } else {
        rows.push(item);
      }
    }

    if (!changed) return entry;

    const rebuilt = generateTableArray(entry.key.item.value);
    for (const row of rows) insert(rebuilt, rebuilt, row);
    applyWrites(rebuilt);
    return rebuilt;
  }

  // The immediate structural container holding `target` in its `.items`
  // array — any container type (Document/Table/TableArray/InlineTable/
  // InlineArray), descending through KeyValue values and InlineItem
  // wrappers.  Used when path-based parent resolution lands on a container
  // that doesn't physically contain the node (fuzz seed 50: a dotted KV
  // inside an inline table that is itself an inline-array element).
  function findStructuralParent(root: TreeNode, target: TreeNode): TreeNode | undefined {
    function walk(node: TreeNode): TreeNode | undefined {
      if (isKeyValue(node)) return walk(node.value);
      if (isInlineItem(node)) return walk(node.item);
      if (!hasItems(node)) return undefined;
      const items = node.items as TreeNode[];
      for (const item of items) {
        if (item === target) return node;
        if (isInlineItem(item) && item.item === target) return node;
      }
      for (const item of items) {
        const found = walk(isInlineItem(item) ? item.item : item);
        if (found) return found;
      }
      return undefined;
    }
    return walk(root);
  }

  // A table/AOT replaced by a scalar whose PARENT key is expressed implicitly
  // through dotted key-values (`"".nfh = …` defines the "" table without a
  // header).  Re-emitting a `[""]` header would conflict with the implicit
  // definition and fail the re-parse with "Implicit table already defined"
  // (fuzz seed 6803).  Extend the fresh KV's key with the parent prefix and
  // swap it in for the old section directly.
  function extendKeyWithParentAndReplace(
    freshKV: KeyValue,
    parentKey: string[],
    existing: TreeNode,
    tableParent: TreeNode
  ): void {
    const dottedKey = parentKey.concat(freshKV.key.value);
    const oldRaw = freshKV.key.raw;
    freshKV.key.value = dottedKey;
    freshKV.key.raw = dottedKey
      .map(part => IS_BARE_KEY.test(part) ? part : JSON.stringify(part).replace(/\x7f/g, '\\u007f'))
      .join('.');
    const delta = freshKV.key.raw.length - oldRaw.length;
    freshKV.key.loc.end.column = freshKV.key.loc.start.column + freshKV.key.raw.length;
    freshKV.equals += delta;
    shiftNode(freshKV.value, { lines: 0, columns: delta }, { first_line_only: true });
    if (freshKV.loc.end.line === freshKV.loc.start.line) {
      freshKV.loc.end.column += delta;
    }
    replace(original, tableParent, existing, freshKV);
    // The extended dotted KV belongs to the root table — once the old
    // section header is gone, leaving it in place would bind it to the
    // nearest surviving section above (fuzz seed 6803: it landed inside
    // `[l6n1z.f]`).  Hoist it above the first section header.
    hoistRootKeyValueAboveTables(original, freshKV);
  }

  // Extend a regenerated Table/TableArray section's key with a parent prefix
  // IN PLACE: a `[[c]]` whose key carries only the last segment becomes
  // `[[a.b.c]]` when `parentKey` is `['a','b']`.  A `[[c]]` child of a
  // generated `[a.b]` header would otherwise fragment into a stray top-level
  // section.  The section's items live on their own lines, so only the header
  // key (not the item columns) needs shifting.
  function extendSectionKeyInPlace(section: Table | TableArray, parentKey: string[]): void {
    const keyNode = section.key.item;
    const oldRaw = keyNode.raw;
    const dottedKey = parentKey.concat(keyNode.value);
    const newRaw = dottedKey
      .map(part => IS_BARE_KEY.test(part) ? part : JSON.stringify(part).replace(/\x7f/g, '\\u007f'))
      .join('.');
    const delta = newRaw.length - oldRaw.length;
    keyNode.value = dottedKey;
    keyNode.raw = newRaw;
    keyNode.loc.end.column = keyNode.loc.start.column + newRaw.length;
    if (section.key.loc.end.line === section.key.loc.start.line) {
      section.key.loc.end.column += delta;
    }
  }

  // Same as extendKeyWithParentAndReplace, but for a regenerated Table/TableArray
  // section: when a `[a.b.c]` section (or `[[a.b.c]]`) is replaced by a fresh
  // section whose key carries only the last segment (`[[c]]`), extend its key
  // with the parent prefix IN PLACE so it re-renders as `[[a.b.c]]` (fuzz seed
  // 41613).
  function extendSectionKeyWithParentAndReplace(
    section: Table | TableArray,
    parentKey: string[],
    existing: TreeNode,
    tableParent: TreeNode
  ): void {
    extendSectionKeyInPlace(section, parentKey);
    replace(original, tableParent, existing, section);
  }

  // When an Add's path traverses intermediate key segments that do not exist in the
  // original document (their KV was removed by an earlier change in this same patch),
  // findParent resolves to the nearest existing ancestor and the inserted child would
  // keep only its own key — silently dropping the missing prefix.  Replacing
  // `ak.b.c = 1` with `ak = { k99 = 1 }` would emit `k99 = 1` at the parent level
  // (fuzz seed 4).  Extend the child's key with the missing segments instead.
  // Returns a fresh KV to insert, or null when no extension is needed.
  function restoreMissingKeySegments(parent_path: Path, child: KeyValue, change_path: Path): KeyValue | null {
    const direct = tryFindByPath(original, parent_path);
    if (direct && !isPrefixMatchedNode(direct, parent_path)) return null;

    // Longest prefix of parent_path that resolves to a real location in the
    // original document.  Prefix-matched dotted KVs don't count — they are the
    // very situation we are restoring around.
    let prefixLen = parent_path.length;
    while (prefixLen > 0) {
      const node = tryFindByPath(original, parent_path.slice(0, prefixLen));
      if (node && !isPrefixMatchedNode(node, parent_path.slice(0, prefixLen))) break;
      prefixLen--;
    }
    const missing = parent_path.slice(prefixLen) as string[];
    if (missing.length === 0 || !missing.every(seg => typeof seg === 'string')) return null;

    // The child's value comes from the updated document, whose coordinates are
    // unrelated to the insertion target.  Regenerate it from the JS value with
    // clean locs first (same discipline as the key-truncation branch in the Edit
    // handler), then build a fresh KV with the extended dotted key.
    if (rawUpdated !== undefined) {
      let jsValue: any = rawUpdated;
      for (const k of change_path) jsValue = jsValue?.[k];
      if (jsValue !== undefined) {
        const freshValue = regenerateValue(jsValue, format);
        if (freshValue !== undefined) {
          return generateKeyValue([...missing, ...child.key.value], freshValue);
        }
      }
    }

    // Fallback: extend the key in place and shift the value's first line right by
    // the added width.  Later lines of a multiline value keep their absolute
    // columns — insert() translates the whole subtree rigidly afterwards.
    const oldKey = child.key;
    const newRaw = [...missing, ...oldKey.value]
      .map(part => IS_BARE_KEY.test(part) ? part : JSON.stringify(part).replace(/\x7f/g, '\\u007f'))
      .join('.');
    const colDelta = newRaw.length - oldKey.raw.length;
    oldKey.raw = newRaw;
    oldKey.value = [...missing, ...oldKey.value];
    oldKey.loc.end.column = oldKey.loc.start.column + newRaw.length;
    child.equals += colDelta;
    shiftNode(child.value, { lines: 0, columns: colDelta }, { first_line_only: true });
    if (child.loc.end.line === child.loc.start.line) {
      child.loc.end.column += colDelta;
    }
    return child;
  }

  // Containers that already received a KV whose key was extended by
  // restoreMissingKeySegments.  A second such insert into the same container
  // must resolve the first insert's pending offsets before measuring its target
  // position, or the two rows overlap (fuzz seed 4).
  const restoredInsertContainers = new Set<TreeNode>();

  // Multi-line inline containers already inserted into during this patch. The stale-position
  // problem only arises on the SECOND insertion into the same container, so this lets the
  // flush be paid just-in-time there rather than after every insertion — a patch touching
  // many containers once each (the common shape) then pays nothing.
  const insertedInlineContainers = new Set<TreeNode>();

  // Object-key Moves (updateOrder) are only collected here, not applied — they're relayed
  // out in one batch at the very end, after every other structural change in this patch has
  // already been applied (see docs/PLAN-Update-Order.md §3.1 on why: the reorder phase must
  // never call insert()/remove(), which would re-dirty offsets nothing downstream flushes).
  const objectMoves: Move[] = [];

  // Potential Changes:
  //
  // Add: Add key-value to object, add item to array
  // Edit: Change in value
  // Remove: Remove key-value from object, remove item from array
  // Move: Move item in array
  // Rename: Rename key in key-value
  //
  // Special consideration, inline comments need to move as-needed

  changes.forEach(change => {
    if (isAdd(change)) {

      let child = findByPath(updated, change.path);
      const parent_path = change.path.slice(0, -1);
      let index = last(change.path)! as number;

      let is_table_array = isTableArray(child);
      // Detect AOT append: the new entry is an integer index and the immediate
      // parent key is a string (covers both top-level and nested AOTs such as
      // [[fruit]] or [[fruit.variety]]).
      if (isInteger(index) && !is_table_array && !isInteger(last(parent_path))) {
        const sibling = tryFindByPath(original, parent_path.concat(0));
        if (sibling && isTableArray(sibling)) {
          is_table_array = true;
        }
      }
      // The converse of the guard below: parseJS renders an array of objects as [[key]]
      // sections at the default inlineTableStart, but the document may hold that array
      // inline (`key = [{ ... }]`). The document's shape has to win, or the new element
      // arrives as a section while `key = [...]` stays put — defining the key twice, and
      // re-parsing as the original array nested inside the new element.
      if (is_table_array && isInteger(index) && !isInteger(last(parent_path))) {
        const existingParent = tryFindByPath(original, parent_path);
        const existingArray = existingParent && isKeyValue(existingParent)
          ? existingParent.value
          : existingParent;

        if (existingArray && isInlineArray(existingArray)) {
          const updated_js = toJS(updated.items, '', { temporal });
          let jsValue: any = updated_js;
          for (const k of change.path) jsValue = jsValue?.[k];

          // Wrap in a throwaway key so parseJS yields a value node, then take that value.
          // inlineTableStart: 0 keeps it inline — the element belongs inside an inline array,
          // so it must be an inline table whatever the configured depth would have chosen for
          // a top-level key (at the default it would come back as a `[tmp]` section).
          const inlineFmt = resolveTomlFormat({ ...format, inlineTableStart: 0 }, format);
          const valueDoc = jsValue === undefined ? undefined : parseJS({ tmp: jsValue }, inlineFmt);
          const wrapper = valueDoc?.items[0];
          if (wrapper && isKeyValue(wrapper)) {
            child = generateInlineItem(wrapper.value);
            is_table_array = false;

            // Match sibling bracket spacing. parseJS may or may not have applied it
            // depending on the format path; fill in the gap when siblings have it.
            if (isInlineItem(child) && isInlineTable(child.item) && child.item.items.length > 0) {
              const table = child.item;
              const alreadySpaced = table.items[0].loc.start.column - table.loc.start.column > 1;
              if (!alreadySpaced) {
                const sibling = (existingArray.items as InlineItem[])
                  .map(item => item.item)
                  .find(item => isInlineTable(item) && item.items.length > 0) as InlineTable | undefined;
                const siblingSpaced = sibling
                  && sibling.items[0].loc.start.column - sibling.loc.start.column > 1;
                if (siblingSpaced) {
                  applyBracketSpacing(original, table, true);
                }
              }
            }
          }
        }
      }

      // When is_table_array is true but the child from the updated document is not
      // a TableArray block (e.g. parseJS inlined it because of inlineTableStart),
      // regenerate a fresh TableArray from the JS value.
      if (is_table_array && !isTableArray(child)) {
        const tableArrayKey = parent_path.filter(p => typeof p === 'string') as string[];
        const updated_js = toJS(updated.items, '', { temporal });
        let jsValue: any = updated_js;
        for (const k of change.path) jsValue = jsValue?.[k];
        if (jsValue !== undefined) {
          const freshTableArray = generateTableArray(tableArrayKey);
          const entryDoc = parseJS(jsValue, format);
          for (const item of entryDoc.items) {
            insert(freshTableArray, freshTableArray, item, undefined);
          }
          // The entry value was parsed standalone, so any [table]/[[array]]
          // sections inside it carry their LOCAL keys (e.g. `[k79]` for
          // `{ k79: { … } }`).  Inside the parent array-of-tables those
          // headers must carry the full key (`[d6r6.p.k79]`), or they
          // re-parse as root-level sections detached from the entry
          // (fuzz seed 6746).
          const prefixNestedSectionKeys = (node: TreeNode) => {
            if (!hasItems(node)) return;
            for (const item of node.items as TreeNode[]) {
              if (!isTable(item) && !isTableArray(item)) continue;
              const holder = item.key;
              const keyNode = holder.item;
              const fullKey = tableArrayKey.concat(keyNode.value);
              keyNode.value = fullKey;
              keyNode.raw = generateKey(fullKey).raw;
              keyNode.loc.start.column = holder.loc.start.column + 1;
              keyNode.loc.end.column = keyNode.loc.start.column + keyNode.raw.length;
              holder.loc.end.column = keyNode.loc.start.column + keyNode.raw.length + 1;
              prefixNestedSectionKeys(item);
            }
          };
          prefixNestedSectionKeys(freshTableArray);
          applyWrites(freshTableArray);
          child = freshTableArray;
        }
      }

      // Determine the parent node where the new child will be inserted
      let parent: TreeNode;
      if (isTable(child)) {
        parent = original;
      } else if (is_table_array) {
        parent = original;

        // The index needs to be updated to top-level items
        // to properly account for other items, comments, and nesting
        const document = original as Document;
        const before = tryFindByPath(document, parent_path.concat(index - 1)) as Block | undefined;
        const after = tryFindByPath(document, parent_path.concat(index)) as Block | undefined;
        if (after) {
          index = document.items.indexOf(after);
        } else if (before) {
          index = document.items.indexOf(before) + 1;
          // Appending a new entry must land after the PREVIOUS entry's full
          // scope.  Sub-tables of an AOT entry live as document-level items
          // after the entry header (both pre-existing `[a.b.sub]` sections
          // and sub-tables materialised in-place by an earlier Remove in the
          // same batch, e.g. a dotted key emptied to `{}`).  Skipping them
          // here keeps those sections in the previous entry — otherwise the
          // new [[entry]] header lands before them and the re-parse swallows
          // them into the new entry (fuzz seed 21525).
          if (isTableArray(before)) {
            const aotKey = (before as TableArray).key.item.value;
            // Sub-tables of an AOT entry are NOT necessarily contiguous:
            // an unrelated section (e.g. `[[c]]`) may sit between the entry
            // header and one of its sub-tables (`[y."!"..]`), and that
            // sub-table still belongs to the previous entry because it comes
            // before the next `[[y]]` header.  Find the LAST such sub-table
            // anywhere later in the document and place the new entry after
            // it — otherwise the new [[entry]] header splits the sub-table
            // off and the re-parse re-associates it with the new entry
            // (fuzz seed 742554, a non-contiguous variant of seed 21525).
            let lastSubTable = index - 1;
            for (let i = index; i < document.items.length; i++) {
              const item = document.items[i];
              const key = isTable(item) || isTableArray(item)
                ? (item as Table | TableArray).key.item.value
                : undefined;
              if (key && key.length > aotKey.length
                  && arraysEqual(key.slice(0, aotKey.length), aotKey)) {
                lastSubTable = i;
              }
            }
            index = lastSubTable + 1;
            if (isTableArray(child)) {
              child = preserveAotEntryDottedKeys(child, before as TableArray);
            }
          }
        } else {
          index = document.items.length;
        }
      } else {
        // Walk change.path prefixes from longest to shortest to find the
        // insertion container.  A dotted KeyValue matched by prefix (its key
        // is longer than the consumed path, e.g. `ak` matching `ak.k99`) is
        // NOT the parent: its value belongs to a different subtree, and
        // consecutive adds under the same dotted prefix must land in the
        // shared ancestor (fuzz seed 4).  restoreMissingKeySegments then
        // re-attaches the missing prefix to the child's key.
        parent = original;
        for (let pLen = change.path.length - 1; pLen >= 0; pLen--) {
          const candidate = tryFindByPath(original, change.path.slice(0, pLen));
          if (!candidate) continue;
          if (isPrefixMatchedNode(candidate, change.path.slice(0, pLen))) continue;
          parent = candidate;
          break;
        }
        if (isKeyValue(parent)) {
          parent = parent.value;
        } else if (isInlineItem(parent) && isKeyValue(parent.item)) {
          parent = parent.item.value;
        } else if (isInlineItem(parent) && isInlineTable(parent.item)) {
          parent = parent.item;
        } else if (isInlineItem(parent) && isInlineArray(parent.item)) {
          // Unwrap InlineArrayItem to the inner InlineArray so insert()
          // sees a container with items, e.g. adding to ["a","b"] inside
          // [18:45:20, false, ["a","b"]]
          parent = parent.item;
        }
      }

      if (isInlineArray(parent) || isInlineTable(parent)) {
        prepareInsertedNestedInlineContainer(parent, child, format.indentWidth);
      }

      if (isInlineArray(parent)) {
        const rowNode = tryFindByPath(original, parent_path);
        const rowContainer = tryFindByPath(original, parent_path.slice(0, -1));
        if (rowNode && isKeyValue(rowNode) && rowContainer) {
          const deltaColumns = getInlineInsertColumnDelta(parent, child, index);
          if (deltaColumns !== 0) {
            preserveAlignedInlineCommentForDelta(rowContainer, rowNode, deltaColumns);
          }
        }
      }

      // insert() positions a new element against its previous sibling's `.loc`, but that
      // position stays pre-offset until applyWrites resolves it. A second insertion into the
      // same multi-line container would therefore measure against a stale line and land on
      // top of the row before it (`2, 99,` on one line instead of two rows). Resolve the
      // earlier insertion first — but only on the second one, since applyWrites walks the
      // whole tree and a patch inserting into many containers once each needs none of this.
      const multilineInlineParent =
        (isInlineArray(parent) || isInlineTable(parent)) && parent.loc.end.line > parent.loc.start.line;
      if (multilineInlineParent && insertedInlineContainers.has(parent)) {
        applyWrites(original);
      }

      // The comments hoisted out of a multiline InlineArray/InlineTable live in the
      // nearest enclosing Document/Table/TableArray's own items, not necessarily
      // `original.items` — resolve it once so insert() can compensate the array the
      // hoisted comments actually live in, matching removeMember/moveInlineElement.
      const inlineHostItems = (isInlineArray(parent) || isInlineTable(parent))
        ? (findHostContainer(original, parent)?.items as TreeNode[] | undefined)
        : undefined;

      if (isTableArray(parent) || isInlineArray(parent) || isDocument(parent)) {
        // Special handling for InlineArray: preserve original trailing comma format
        if (isInlineArray(parent)) {
          const originalHadTrailingCommas = arrayHadTrailingCommas(parent);
          // If this is an InlineItem being added to an array, check its comma setting
          if (isInlineItem(child)) {
            // The child comes from the updated document with global format applied
            // Override with the original array's format
            child.comma = originalHadTrailingCommas;

            // `format.trailingComma` is a single flag, but it is read off whichever
            // separator the detector happened to see. An array written `[ { a = 1 }, ]`
            // sets it from the comma after the inline table, then that same flag decides
            // the comma *inside* the new table — emitting `{ z = 0, }` next to `{ a = 1 }`.
            // The two are independent, so take the inner one from a sibling table.
            //
            // Regenerated rather than patched in place: clearing the flag on a node already
            // laid out with a comma leaves the slot behind as `{ z = 0  }`.
            const addedItem = child;
            const addedTable = isInlineTable(addedItem.item) ? addedItem.item : undefined;
            const siblingTable = addedTable && addedTable.items.length > 0
              ? (parent.items as InlineItem[])
                  .map(item => item.item)
                  .find(item => item !== addedItem.item && isInlineTable(item))
              : undefined;

            if (addedTable && siblingTable) {
              const wanted = tableHadTrailingCommas(siblingTable);
              if (wanted !== tableHadTrailingCommas(addedTable)) {
                const updated_js = toJS(updated.items, '', { temporal });
                let jsValue: any = updated_js;
                for (const k of change.path) jsValue = jsValue?.[k];

                const matchedFmt = resolveTomlFormat(
                  { ...format, inlineTableStart: 0, trailingComma: wanted },
                  format
                );
                const rebuilt = jsValue === undefined
                  ? undefined
                  : parseJS({ tmp: jsValue }, matchedFmt).items[0];

                if (rebuilt && isKeyValue(rebuilt)) {
                  const replacementItem = generateInlineItem(rebuilt.value);
                  replacementItem.comma = addedItem.comma;
                  child = replacementItem;
                }
              }
            }
          }
        }
        
        // Check if we should convert nested inline tables to multiline tables
        if (format.inlineTableStart !== undefined && format.inlineTableStart > 0 && isDocument(parent) && isTable(child)) {
          const additionalTables = convertNestedInlineTablesToMultiline(child, original, format);
          
          // Insert the main table first
          insert(original, parent, child, index);
          
          // Then insert all the additional tables
          for (const table of additionalTables) {
            insert(original, original, table, undefined);
          }
        } else {
          // Root-level key-values belong to TOML's implicit root table, which
          // spans from the start of the document up to (but not including) the
          // first explicit section header ([table] or [[array]]). When the index
          // is a string key, insert() falls back to parent.items.length —
          // appending after all sections and silently nesting the new key under
          // the last one. Clamp to the end of the root table scope instead.
          // For non-KV children (e.g. table-array entries) the index was already
          // resolved to a correct integer above, so leave it as-is.
          //
          // Unwrap InlineItem first: a KV added under the document root arrives
          // wrapped in an InlineItem (it was resolved inside an inline table in
          // the updated CST), and the clamp below must see the inner KV to
          // recognise a root-level key-value (fuzz seed 297).
          let childToInsert = child;
          if (isInlineItem(child) && (isTableArray(parent) || isDocument(parent))) {
            childToInsert = child.item;
          }
          let resolvedIndex = index;
          if (isDocument(parent) && isKeyValue(childToInsert)) {
            const rootTableEnd = (parent as Document).items.findIndex(
              item => isTable(item) || isTableArray(item)
            );
            if (rootTableEnd !== -1) {
              resolvedIndex = rootTableEnd;
            }
          }
          // Restore intermediate key segments the path traverses that no longer
          // exist in the original document (fuzz seed 4).
          let restoredKeySegments = false;
          if ((isTableArray(parent) || isDocument(parent)) && isKeyValue(childToInsert)) {
            const restored = restoreMissingKeySegments(parent_path, childToInsert, change.path);
            if (restored) {
              if (restoredInsertContainers.has(parent)) {
                applyWrites(original);
              }
              childToInsert = restored;
              restoredKeySegments = true;
            }
          }
          // Adding the first item back into an inline array emptied by
          // earlier removals in this same patch has the same pending-offset
          // hazard as the inline-table case below (fuzz seed 92).
          if (isInlineArray(parent) && parent.items.length === 0) {
            applyWrites(original);
          }
          // Inserting at the FRONT of a non-empty single-line inline array
          // after leading elements were removed in this same patch: removing a
          // leading element with no previous sibling registers a pending ENTER
          // offset on the array itself (writer.remove() targets `parent`), and
          // insert() positions an index-0 child against parent.loc.start — a
          // stale, pre-offset column.  The re-inserted elements then land on
          // top of the enclosing dotted key's text and applyWrites clobbers it
          // (fuzz seed 86547).  Flush first, same discipline as the guards
          // above and below.
          if (resolvedIndex === 0 && isInlineArray(parent) &&
              getPendingEnterOffsets(original).has(parent)) {
            applyWrites(original);
          }
          // Inserting at index 0 of a Document/Table/TableArray that still
          // carries a pending ENTER offset from an earlier removal: the
          // offset would drag the new row above line 1 (fuzz seed 11557 —
          // deleting the first dotted KV then re-adding its key emitted the
          // new row at line -1).  Flush first, like every other insert that
          // follows removals in the same patch.
          if (resolvedIndex === 0 && (isDocument(parent) || isTable(parent) || isTableArray(parent)) &&
              getPendingEnterOffsets(original).has(parent)) {
            applyWrites(original);
          }
          insert(original, parent, childToInsert, resolvedIndex, undefined, inlineHostItems);
          if (restoredKeySegments) restoredInsertContainers.add(parent);
        }
      } else if (isInlineTable(parent)) {
        // Adding the first item back into an inline table emptied by
        // earlier removals in this same patch: the removal registered an
        // enter offset on the table itself, which applyWrites would also
        // apply to the new items — dragging them into the preceding key
        // area (fuzz seed 92).  Resolve it first so insert() positions
        // against final coordinates.
        if (parent.items.length === 0) {
          applyWrites(original);
          // This multiline inline table was emptied from its own bracket line
          // (the removal zeroed its offset, leaving a stale multiline end line).
          // Collapse it to a single line NOW so the insert below places the new
          // item on the bracket row instead of a phantom second line — the
          // latter leaves the stale lines dangling and pulls a trailing
          // sibling of an enclosing inline table inside this one (fuzz seed
          // 272851).
          if (hasInlineContainerNeedingTighten(parent) &&
              parent.loc.end.line > parent.loc.start.line) {
            parent.loc.end.line = parent.loc.start.line;
          }
        }
        // Special handling for adding KeyValue to InlineTable
        // Preserve original trailing comma format
        const originalHadTrailingCommas = tableHadTrailingCommas(parent);
        // InlineTable items must be wrapped in InlineItem
        if (isKeyValue(child)) {
          const inlineItem = generateInlineItem(child);
          // Override with the original table's format
          inlineItem.comma = originalHadTrailingCommas;
          const insertIndex = inlineTableAddIndex(parent, child, change.before);
          insert(original, parent, inlineItem, insertIndex, undefined, inlineHostItems);
        } else if (isInlineItem(child) && isKeyValue(child.item)) {
          // The child was resolved through an inline table in the updated
          // CST, so it arrives as an InlineItem-wrapped KV.  When the
          // insertion parent is a shallower ancestor than the change path
          // (the dotted KV holding the missing intermediate segments was
          // removed earlier in this same patch — fuzz seed 305: removing
          // `o247.bjbdmm11-.y773gunzy` then adding `o247.k2`), restore the
          // missing key segments on the inner KV so the new key lands under
          // the right dotted prefix instead of at the container's top level.
          let kv = child.item as KeyValue;
          const restored = restoreMissingKeySegments(parent_path, kv, change.path);
          if (restored) {
            if (restoredInsertContainers.has(parent)) {
              applyWrites(original);
            }
            kv = restored;
          }
          const inlineItem = generateInlineItem(kv);
          inlineItem.comma = originalHadTrailingCommas;
          const insertIndex = inlineTableAddIndex(parent, kv, change.before);
          insert(original, parent, inlineItem, insertIndex, undefined, inlineHostItems);
          if (restored) restoredInsertContainers.add(parent);
        } else {
          insert(original, parent, child, undefined, undefined, inlineHostItems);
        }
      } else {
        // Check if we should convert inline tables to multiline tables when adding to existing tables
        if (format.inlineTableStart !== undefined && format.inlineTableStart > 0 && isKeyValue(child) && isInlineTable(child.value) && isTable(parent)) {
          // Calculate the depth of the inline table that would be created
          const baseTableKey = parent.key.item.value;
          const nestedTableKey = [...baseTableKey, ...child.key.value];
          const depth = calculateTableDepth(nestedTableKey);
          
          // Convert to separate section only if depth is less than inlineTableStart
          if (depth < format.inlineTableStart) {
            convertInlineTableToSeparateSection(child, parent, original, format);
          } else {
            insert(original, parent, child);
          }
        } else if (format.inlineTableStart === 0 && isKeyValue(child) && isInlineTable(child.value) && isDocument(parent)) {
          insert(original, parent, child, undefined, true);
        } else {
          // Unwrap InlineItem if we're adding to a Table, TableArray, or
          // Document. InlineItems should only exist within InlineTables or
          // InlineArrays — block containers expect raw KV/Table nodes.
          let childToInsert = child;
          if (isInlineItem(child) && (isTable(parent) || isTableArray(parent) || isDocument(parent))) {
            childToInsert = child.item;
          }
          // Restore intermediate key segments the path traverses that no longer
          // exist in the original document (fuzz seed 4).
          let restoredKeySegments = false;
          if (isTable(parent) && isKeyValue(childToInsert)) {
            const restored = restoreMissingKeySegments(parent_path, childToInsert, change.path);
            if (restored) {
              if (restoredInsertContainers.has(parent)) {
                applyWrites(original);
              }
              childToInsert = restored;
              restoredKeySegments = true;
            }
          }
          const leadingLines = (isTable(parent) || isTableArray(parent))
            && parent.items.length > 0
            && parent.items.every(isComment)
            ? 2
            : undefined;
          insert(original, parent, childToInsert, undefined, undefined, undefined, leadingLines);
          if (restoredKeySegments) restoredInsertContainers.add(parent);
        }
      }

      if (multilineInlineParent) insertedInlineContainers.add(parent);

    } else if (isEdit(change)) {
      let existing = tryFindByPath(original, change.path);
      let replacement: TreeNode | undefined;
      try {
        replacement = findByPath(updated, change.path);
      } catch {
        replacement = undefined;
      }

      // When the existing node can't be found — or the replacement can't be
      // resolved in the updated CST (e.g. `one = { … }` became an array of
      // tables, whose entries live at path [one, 0] so the bare path [one]
      // resolves nowhere — fuzz seed 477) — this is a structural type change
      // (table→scalar, implicit-table→AOT, array→empty, …).
      // Handle by removing old nodes and inserting fresh KV.
      if (!existing || !replacement) {
        handleStructuralEdit(original, updated, change, format, temporal, commentEligibleNodes, materialisedTables);
        return; // skip generic edit handling
      }

      // A KV replaced by a Table section whose key already owns sibling
      // document nodes (e.g. `"" = {…}` becoming `["".y4ywkew]` while the
      // document also holds `"".9UI = …`) — the generic replace would leave
      // those siblings behind, and the section would collide with the
      // implicit table they define on re-parse ("Value already defined",
      // fuzz seed 3607).  Let the structural-edit path clear the prefix
      // and rebuild the key instead.
      if (isKeyValue(existing) && isTable(replacement)) {
        const tableKey = (replacement as Table).key.item.value;
        const prefixNodes = findDocumentItemsByKeyPrefix(original, tableKey);
        if (prefixNodes.some(n => n !== existing)) {
          handleStructuralEdit(original, updated, change, format, temporal, commentEligibleNodes, materialisedTables);
          return; // handled; skip generic edit handling
        }
      }

      // An inline-array element replaced by an object that parseJS rendered as
      // a Table/TableArray: an array-of-objects at the default inlineTableStart
      // becomes `[[key]]` sections, so findByPath resolves the replacement to an
      // AOT entry — but the document holds the array INLINE (`key = [...]`).
      // Splicing that section in place of the InlineItem emits `[[key]]` inside
      // the array (fuzz seed 121096).  Regenerate the element as an inline
      // table, exactly like the converse guard in the Add handler.
      if (isInlineItem(existing) && (isTable(replacement) || isTableArray(replacement))) {
        const parentArr = tryFindByPath(original, change.path.slice(0, -1));
        const parentArray = parentArr && isKeyValue(parentArr) ? parentArr.value : parentArr;
        if (parentArray && isInlineArray(parentArray)) {
          let jsValue: any = rawUpdated;
          for (const k of change.path) jsValue = jsValue?.[k];
          if (jsValue !== undefined) {
            const inlineFmt = resolveTomlFormat({ ...format, inlineTableStart: 0 }, format);
            const valueDoc = parseJS({ tmp: jsValue }, inlineFmt);
            const wrapper = valueDoc?.items[0];
            if (wrapper && isKeyValue(wrapper)) {
              replacement = generateInlineItem(wrapper.value);
            }
          }
        }
      }

      let parent;
      let containerParent = tryFindByPath(original, change.path.slice(0, -1));
      // The parent path can resolve to a dotted KV by PREFIX when the edited
      // key sits under an implicit table (e.g. editing `["", 0, "", ""]` while
      // the CST holds `""."".lh8butjh6i`): the probe is shorter than the key,
      // so tryFindByPath returns the KV, not its container.  The sibling
      // sweeps below must look in the REAL container (the AOT entry) or stale
      // children survive the collapse and re-parse fails with "Value already
      // defined" (fuzz seed 1674968).  Resolve it structurally.
      if (containerParent && isKeyValue(containerParent) &&
          isPrefixMatchedNode(containerParent, change.path.slice(0, -1))) {
        containerParent = findStructuralParent(original, containerParent);
      }
      const inlineTableRowContext = findEnclosingInlineTableRowContext(original, change.path);

      if (isKeyValue(existing) && isKeyValue(replacement)) {
        // Edit for key-value means value changes
        // Preserve formatting from existing value in replacement value
        
        // If findByPath matched via prefix (the path is shorter than the
        // existing dotted key), truncate the key. We detect this by finding
        // the longest suffix of change.path that matches a prefix of the
        // existing key — this handles cases where parseJS restructured keys
        // (e.g. it splits { '': { swr: x } } into Table [\"\"] + KV swr).
        let keyTruncated = false;
        if (existing.key.value.length > 1) {
          const absPath = absolutePathOf(existing);
          const matchLen = truncationMatchLen(
            change.path,
            existing.key.value,
            absPath ? absPath.length - existing.key.value.length : 0
          );
          if (matchLen > 0 && matchLen < existing.key.value.length) {
            existing.key.value = existing.key.value.slice(0, matchLen);
            existing.key.raw = generateKey(existing.key.value).raw;
            // The key is now shorter — shift key loc, equals, and the
            // existing value's loc so the writer moves the replacement
            // to the correct position.
            const oldEndCol = existing.key.loc.end.column;
            const newEndCol = existing.key.loc.start.column + existing.key.raw.length;
            const delta = newEndCol - oldEndCol;
            existing.key.loc.end.column = newEndCol;
            existing.equals += delta;
            existing.value.loc.start.column += delta;
            if (existing.value.loc.end.line === existing.value.loc.start.line) existing.value.loc.end.column += delta;
            if (existing.loc.end.line === existing.loc.start.line) existing.loc.end.column += delta;
            keyTruncated = true;

            // When a dotted key is truncated (e.g. v.jp → v), any
            // sibling KVs that were children of the old implicit table
            // (e.g. v.e4.c6) must be removed — v is no longer a table.
            const truncatedPrefix = existing.key.value;
            if (containerParent && (isTable(containerParent) || isDocument(containerParent) || isTableArray(containerParent))) {
              // Snapshot: removeMember below splices the live items array, so
              // iterating it directly would read `undefined` past the shrunk
              // end (fuzz seed 31662).
              const parentItems = [...(containerParent as Table | Document | TableArray).items] as Block[];
              for (let si = parentItems.length - 1; si >= 0; si--) {
                const sibling = parentItems[si];
                if (sibling === existing) continue;
                // >= (not just >): a sibling holding the exact same key
                // (`"" = {…}` next to `"".x = 1`) duplicates the truncated
                // key once it becomes a scalar and fails the re-parse with
                // "Value already defined" (fuzz seed 3607).  Section
                // siblings ([table]/[[array]] extending the prefix) conflict
                // the same way and are removed too.
                const siblingKey = isKeyValue(sibling)
                  ? sibling.key.value
                  : isTable(sibling) || isTableArray(sibling)
                    ? sibling.key.item.value
                    : undefined;
                if (siblingKey
                    && siblingKey.length >= truncatedPrefix.length
                    && arraysEqual(siblingKey.slice(0, truncatedPrefix.length), truncatedPrefix)) {
                  removeMember(original, containerParent, sibling);
                }
              }
            }
          }
        }

        // A single-segment key whose value becomes a non-block-table while a
        // sibling dotted-key or section still extends its prefix (e.g.
        // `"" = <date>` next to `"".x = 1` collapsing to `"" = "str"`) must
        // drop those siblings — neither a leaf, an array, nor an inline table
        // can hold them, and leaving them in place re-defines the key on
        // re-parse ("Value already defined" for scalars, fuzz seed 32801;
        // "Cannot add to static array" for arrays, fuzz seed 39363; "Cannot
        // extend inline table" for inline tables, fuzz seed 80004).  In this
        // branch `replacement` is always a KeyValue, so its value can never be
        // a block Table/TableArray — every value shape needs the sibling sweep.
        if (!keyTruncated && isKeyValue(replacement)) {
          if (containerParent && (isTable(containerParent) || isDocument(containerParent) || isTableArray(containerParent))) {
            removeSiblingsExtendingPrefix(original, containerParent as Table | Document | TableArray, existing.key.value, existing);
          }
        }
        
        preserveFormatting(existing.value, replacement.value);
        if (containerParent) {
          preserveAlignedInlineCommentColumn(containerParent, existing, existing.value, replacement.value);
        }
        
        parent = existing;
        existing = existing.value;
        replacement = replacement.value;

        // When the key was truncated, the replacement value from the updated CST
        // carries stale coordinate-system data that corrupts applyWrites' offset
        // resolution.  Regenerate a fresh value through a TOML round-trip for
        // clean loc values, and re-apply formatting preservation on the fresh node.
        if (keyTruncated && rawUpdated !== undefined) {
          let jsValue: any = rawUpdated;
          for (const k of change.path) jsValue = jsValue?.[k];
          if (jsValue !== undefined) {
            const freshValue = regenerateValue(jsValue, format);
            if (freshValue !== undefined) {
              replacement = freshValue;
              preserveFormatting(existing as Value, replacement as Value);
            }
          }
        }
      } else if (isKeyValue(existing) && isInlineItem(replacement) && isKeyValue(replacement.item)) {
        // Truncate the existing key if the path matched via prefix (same
        // logic as the isKeyValue && isKeyValue branch above).
        let keyTruncated = false;
        if (existing.key.value.length > 1) {
          const absPath = absolutePathOf(existing);
          const matchLen = truncationMatchLen(
            change.path,
            existing.key.value,
            absPath ? absPath.length - existing.key.value.length : 0
          );
          if (matchLen > 0 && matchLen < existing.key.value.length) {
            existing.key.value = existing.key.value.slice(0, matchLen);
            existing.key.raw = generateKey(existing.key.value).raw;
            // The key is now shorter — shift key loc, equals, and the
            // existing value's loc so the writer moves the replacement
            // to the correct position.
            const oldEndCol = existing.key.loc.end.column;
            const newEndCol = existing.key.loc.start.column + existing.key.raw.length;
            const delta = newEndCol - oldEndCol;
            existing.key.loc.end.column = newEndCol;
            existing.equals += delta;
            existing.value.loc.start.column += delta;
            if (existing.value.loc.end.line === existing.value.loc.start.line) existing.value.loc.end.column += delta;
            if (existing.loc.end.line === existing.loc.start.line) existing.loc.end.column += delta;
            keyTruncated = true;

            // Remove sibling KVs that were children of the old implicit table.
            const truncatedPrefix = existing.key.value;
            if (containerParent && (isTable(containerParent) || isDocument(containerParent) || isTableArray(containerParent))) {
              // Snapshot: removeMember below splices the live items array
              // (fuzz seed 31662).
              const parentItems = [...(containerParent as Table | Document | TableArray).items] as Block[];
              for (let si = parentItems.length - 1; si >= 0; si--) {
                const sibling = parentItems[si];
                if (sibling === existing) continue;
                // >= (not just >), and sections count too — see the
                // isKeyValue/isKeyValue branch above (fuzz seed 3607).
                const siblingKey = isKeyValue(sibling)
                  ? sibling.key.value
                  : isTable(sibling) || isTableArray(sibling)
                    ? sibling.key.item.value
                    : undefined;
                if (siblingKey
                    && siblingKey.length >= truncatedPrefix.length
                    && arraysEqual(siblingKey.slice(0, truncatedPrefix.length), truncatedPrefix)) {
                  removeMember(original, containerParent, sibling);
                }
              }
            }
          }
        }

        // Single-segment key collapsing to a non-block-table with siblings
        // extending its prefix (fuzz seeds 32801, 39363, 80004) — same as the
        // isKeyValue/isKeyValue branch; every value shape in this branch
        // (leaf, array, inline table) must drop prefix-extending siblings.
        if (!keyTruncated && isKeyValue(replacement.item)) {
          if (containerParent && (isTable(containerParent) || isDocument(containerParent) || isTableArray(containerParent))) {
            removeSiblingsExtendingPrefix(original, containerParent as Table | Document | TableArray, existing.key.value, existing);
          }
        }

        parent = existing;
        existing = existing.value;
        replacement = replacement.item.value;

        // When the key was truncated, regenerate the replacement value with clean
        // loc values through a TOML round-trip to avoid applyWrites corruption
        // from stale updated-CST coordinate-system data.
        if (keyTruncated && rawUpdated !== undefined) {
          let jsValue: any = rawUpdated;
          for (const k of change.path) jsValue = jsValue?.[k];
          if (jsValue !== undefined) {
            const freshValue = regenerateValue(jsValue, format);
            if (freshValue !== undefined) replacement = freshValue;
          }
        }
      } else if (isInlineItem(existing) && isKeyValue(existing.item) && isKeyValue(replacement)) {
        // Editing inline table item: existing is InlineItem, replacement is a block-style KeyValue.
        // Preserve the InlineItem's formatting (alignment, equals position) by only swapping the value,
        // not the whole KeyValue — otherwise alignment spaces for the key are lost (as well as the trailing comma).
        const existingKeyValue = existing.item;

        // If the path matched via prefix (shorter than the existing dotted
        // key), truncate the key — same logic as the branches above
        // (fuzz seed 137: `u3chwmmvk.g{…}.oe1zht` → `u3chwmmvk = []`).
        let keyTruncated = false;
        if (existingKeyValue.key.value.length > 1) {
          const absPath = absolutePathOf(existingKeyValue);
          const matchLen = truncationMatchLen(
            change.path,
            existingKeyValue.key.value,
            absPath ? absPath.length - existingKeyValue.key.value.length : 0
          );
          if (matchLen > 0 && matchLen < existingKeyValue.key.value.length) {
            existingKeyValue.key.value = existingKeyValue.key.value.slice(0, matchLen);
            existingKeyValue.key.raw = generateKey(existingKeyValue.key.value).raw;
            const oldEndCol = existingKeyValue.key.loc.end.column;
            const newEndCol = existingKeyValue.key.loc.start.column + existingKeyValue.key.raw.length;
            const delta = newEndCol - oldEndCol;
            existingKeyValue.key.loc.end.column = newEndCol;
            existingKeyValue.equals += delta;
            existingKeyValue.value.loc.start.column += delta;
            if (existingKeyValue.value.loc.end.line === existingKeyValue.value.loc.start.line) existingKeyValue.value.loc.end.column += delta;
            if (existingKeyValue.loc.end.line === existingKeyValue.loc.start.line) existingKeyValue.loc.end.column += delta;
            // Record an exit offset at the KV so applyWrites shifts
            // everything after it (sibling items, closing brace) by the
            // key-size delta — but only for a single-line KV: for a
            // multiline value the exit offset would land on the KV's END
            // line, whose content columns did not move (fuzz seed 139).
            if (existingKeyValue.loc.end.line === existingKeyValue.loc.start.line) {
              addExitOffset(original, existingKeyValue, { lines: 0, columns: delta });
            }
            keyTruncated = true;

            // A surviving sibling row extending the truncated prefix still
            // re-defines the (now collapsed) key on re-parse — e.g. `"" = "s"`
            // left next to `"".e-0cxz9.";" = …` inside an inline table
            // (fuzz seed 82825).  Remove those rows, mirroring the 3607/11799
            // discipline (InlineItem row keys included).
            const truncatedPrefix = existingKeyValue.key.value;
            let scanParent = containerParent;
            if (scanParent && isInlineItem(scanParent)) scanParent = scanParent.item;
            if (scanParent && isKeyValue(scanParent)) scanParent = scanParent.value;
            if (scanParent && hasItems(scanParent)) {
              const parentItems = [...(scanParent as { items: TreeNode[] }).items];
              for (let si = parentItems.length - 1; si >= 0; si--) {
                const sibling = parentItems[si];
                if (sibling === existing) continue;
                const siblingKey = isKeyValue(sibling)
                  ? sibling.key.value
                  : isInlineItem(sibling) && isKeyValue(sibling.item)
                    ? sibling.item.key.value
                    : isTable(sibling) || isTableArray(sibling)
                      ? sibling.key.item.value
                      : undefined;
                if (siblingKey
                    && siblingKey.length >= truncatedPrefix.length
                    && arraysEqual(siblingKey.slice(0, truncatedPrefix.length), truncatedPrefix)) {
                  removeMember(original, scanParent, sibling);
                }
              }
            }
          }
        }

        preserveFormatting(existingKeyValue.value, replacement.value);
        parent = existingKeyValue;
        existing = existingKeyValue.value;
        replacement = replacement.value;

        // Same regenerate discipline as the truncation paths above.
        if (keyTruncated && rawUpdated !== undefined) {
          let jsValue: any = rawUpdated;
          for (const k of change.path) jsValue = jsValue?.[k];
          if (jsValue !== undefined) {
            const freshValue = regenerateValue(jsValue, format);
            if (freshValue !== undefined) {
              replacement = freshValue;
              preserveFormatting(existing as Value, replacement as Value);
            }
          }
        }
      } else if (isInlineItem(existing) && isInlineItem(replacement) && isKeyValue(existing.item) && isKeyValue(replacement.item)) {
        // Both are InlineItems wrapping KeyValues (nested inline table edits).
        
        // If the path matched via prefix (shorter than the existing dotted key),
        // truncate the key.  Same logic as the isKeyValue branches above.
        let keyTruncated = false;
        const existingKV = existing.item;
        if (existingKV.key.value.length > 1) {
          const absPath = absolutePathOf(existingKV);
          const matchLen = truncationMatchLen(
            change.path,
            existingKV.key.value,
            absPath ? absPath.length - existingKV.key.value.length : 0
          );
          if (matchLen > 0 && matchLen < existingKV.key.value.length) {
            existingKV.key.value = existingKV.key.value.slice(0, matchLen);
            existingKV.key.raw = generateKey(existingKV.key.value).raw;
            const oldEndCol = existingKV.key.loc.end.column;
            const newEndCol = existingKV.key.loc.start.column + existingKV.key.raw.length;
            const delta = newEndCol - oldEndCol;
            existingKV.key.loc.end.column = newEndCol;
            existingKV.equals += delta;
            existingKV.value.loc.start.column += delta;
            if (existingKV.value.loc.end.line === existingKV.value.loc.start.line) existingKV.value.loc.end.column += delta;
            if (existingKV.loc.end.line === existingKV.loc.start.line) existingKV.loc.end.column += delta;
            // Record an exit offset at the KV so applyWrites shifts
            // everything after the KV (sibling items, closing brace) by
            // the key-size delta — single-line KVs only (see the
            // InlineItem-KV branch, fuzz seed 139).
            if (existingKV.loc.end.line === existingKV.loc.start.line) {
              addExitOffset(original, existingKV, { lines: 0, columns: delta });
            }
            keyTruncated = true;

            // Remove sibling rows extending the truncated prefix — a
            // surviving `"".2U]0!Rr([{` next to the new scalar `""`
            // duplicates the key on re-parse (fuzz seed 11799).  Same
            // discipline as the isKeyValue branches (fuzz seed 3607),
            // with InlineItem row keys included for inline-table
            // containers.
            const truncatedPrefix = existingKV.key.value;
            // The parent may be the InlineItem wrapper around the inline
            // table holding the rows (fuzz seeds 11627, 11799), or a
            // dotted-key KV whose value IS the inline table (fuzz seed
            // 11480) — unwrap either so the sibling scan sees the rows.
            let scanParent = containerParent;
            if (scanParent && isInlineItem(scanParent)) scanParent = scanParent.item;
            if (scanParent && isKeyValue(scanParent)) scanParent = scanParent.value;
            if (scanParent && hasItems(scanParent)) {
              // Snapshot: removeMember below splices the live items array
              // (fuzz seed 31662).
              const parentItems = [...(scanParent as { items: TreeNode[] }).items];
              for (let si = parentItems.length - 1; si >= 0; si--) {
                const sibling = parentItems[si];
                if (sibling === existing) continue;
                const siblingKey = isKeyValue(sibling)
                  ? sibling.key.value
                  : isInlineItem(sibling) && isKeyValue(sibling.item)
                    ? sibling.item.key.value
                    : isTable(sibling) || isTableArray(sibling)
                      ? sibling.key.item.value
                      : undefined;
                if (siblingKey
                    && siblingKey.length >= truncatedPrefix.length
                    && arraysEqual(siblingKey.slice(0, truncatedPrefix.length), truncatedPrefix)) {
                  removeMember(original, scanParent, sibling);
                }
              }
            }
          }
        }

        // Preserve formatting and edit the value within
        preserveFormatting(existingKV.value, replacement.item.value);
        parent = existingKV;
        existing = existingKV.value;
        replacement = replacement.item.value;

        // When the key was truncated, regenerate the replacement value with clean
        // loc values through a TOML round-trip to avoid applyWrites corruption
        // from stale updated-CST coordinate-system data, and re-apply formatting
        // preservation on the fresh node.
        if (keyTruncated && rawUpdated !== undefined) {
          let jsValue: any = rawUpdated;
          for (const k of change.path) jsValue = jsValue?.[k];
          if (jsValue !== undefined) {
            const freshValue = regenerateValue(jsValue, format);
            if (freshValue !== undefined) {
              replacement = freshValue;
              preserveFormatting(existing as Value, replacement as Value);
            }
          }
        }
      } else if (isTable(existing)) {
        // Type change: a block table section (e.g: [x.y.z.w]) is being replaced by a scalar value.
        // The diff produces an Edit at path e.g. ['x','y','z','w'], where `existing` is the Table
        // node and `replacement` (from the updated document) may be an InlineItem or KV that does
        // not carry the full scope. Simply splicing it into the Document would lose the scope.
        // Get the JS value at change.path and regenerate a fresh KV + parent table from scratch.
        const updated_js = toJS(updated.items, '', { temporal });
        let jsValue: any = updated_js;
        for (const key of change.path) {
          jsValue = jsValue?.[key];
        }

        if (jsValue !== undefined) {
          const existingTableKey = (existing as Table).key.item.value;
          const lastSegment = existingTableKey.slice(-1);
          const parentKey = existingTableKey.slice(0, -1);
          // Path-based parent resolution can land on an unrelated sibling: the
          // path prefix (e.g. ['']) prefix-matches an EARLIER dotted key-value
          // (e.g. `"".nfh`), and replacing through it would overwrite that KV's
          // value instead of swapping the table (fuzz seed 6803).  Prefer the
          // node's actual structural container.
          const tableParent = findStructuralParent(original, existing) ?? findParent(original, change.path);

          // The table's key can be a strict prefix of OTHER document sections
          // (e.g. `[""]` collapsing to a scalar while `["".hv8lx]` is also a
          // document-level section extending that prefix).  Those sections
          // re-define the key on re-parse and fail with "Value already defined"
          // (fuzz seed 22772).  Remove them before the table becomes a scalar.
          if (isDocument(tableParent)) {
            const sectionedSiblings = findDocumentItemsByKeyPrefix(original, existingTableKey)
              .filter(n => n !== existing && (isTable(n) || isTableArray(n)));
            for (const sibling of sectionedSiblings) {
              removeMember(original, tableParent, sibling);
            }
          }

          // Regenerate a fresh KV using parseJS on just the single key-value
          const freshDoc = parseJS({ [lastSegment[0]]: jsValue }, format);
          const freshKV = freshDoc.items[0] as KeyValue;

          if (parentKey.length > 0) {
            // The regenerated `freshKV` is a Table/TableArray (not a KeyValue)
            // when `jsValue` is an object or an array of objects.  Emitting it
            // with only the last key segment under a `[parentKey]` header
            // fragments the section into an empty `[parentKey]` + a stray
            // top-level section (fuzz seed 41613).  Extend the section's key
            // with the parent prefix and swap it in for the old node directly.
            if (isTable(freshKV) || isTableArray(freshKV)) {
              extendSectionKeyWithParentAndReplace(freshKV, parentKey, existing, tableParent);
              commentEligibleNodes.add(freshKV);
            } else {
              // The parent key may be purely implicit (dotted key-values) —
              // emitting a literal header would fail the re-parse (fuzz seed
              // 6803).  Extend the KV's key with the prefix instead.
              const hasImplicitParent = findDocumentItemsByKeyPrefix(original, parentKey).some(isKeyValue);
              if (hasImplicitParent) {
                extendKeyWithParentAndReplace(freshKV, parentKey, existing, tableParent);
                commentEligibleNodes.add(freshKV);
              } else {
                // The parent key may already be an EXPLICIT section (a
                // `[parentKey]` header that survives unrelated to this edit,
                // e.g. `[""].i3asc2k3y` collapsing while a separate `[""]`
                // table lives on — fuzz seed 78079).  Generating a fresh
                // `[parentKey]` header would duplicate it and fail the
                // re-parse with "Table already defined".  Merge the fresh KV
                // into the surviving section instead.
                const survivingParent = (original.items as TreeNode[]).find(n =>
                  n !== existing
                  && (isTable(n) || isTableArray(n))
                  && arraysEqual((n as Table | TableArray).key.item.value, parentKey));
                if (survivingParent) {
                  const parentSection = (survivingParent as Table | TableArray);
                  // freshKV's key is the single last segment; inside `[parentKey]`
                  // it lands as a plain child row.
                  insert(original, parentSection, freshKV, undefined);
                  removeMember(original, tableParent, existing);
                  commentEligibleNodes.add(freshKV);
                } else {
                  const newTable = generateTable(parentKey);
                  materialisedTables.add(newTable);
                  insert(original, newTable, freshKV, 0);
                  replace(original, tableParent, existing, newTable);
                  // newTable stands in for the pre-existing `existing` table, so it should stay
                  // eligible for the leading comment run `existing` would have owned via R2.
                  commentEligibleNodes.add(newTable);
                }
              }
            }
          } else {
            // Single-segment table [w] — KV belongs directly in the Document.
            // Replace the table with the KV, then reposition the KV to before
            // the first table header so it lands in the implicit root table
            // rather than inside a preceding section.
            replace(original, tableParent, existing, freshKV);
            // Same reasoning as newTable above: freshKV replaces `existing`, not a new entry.
            commentEligibleNodes.add(freshKV);

            hoistRootKeyValueAboveTables(original, freshKV);
          }

          // A table replaced by an array of objects becomes an array-of-tables:
          // parseJS renders each array element as its own `[[key]]` section, so
          // `freshDoc.items` holds more than one entry.  The block above only
          // placed `freshKV` (entry 0); the remaining `[[key]]` sections must be
          // inserted right after it or they are silently dropped (fuzz seed
          // 460447 — the appended entry vanished).
          if (freshDoc.items.length > 1) {
            for (let i = 1; i < freshDoc.items.length; i++) {
              const extraEntry = freshDoc.items[i] as Table | TableArray;
              if (parentKey.length > 0) {
                extendSectionKeyInPlace(extraEntry, parentKey);
              }
              // Insert after the entry just placed (freshKV for the first, the
              // previous extra entry for the rest).
              const prev = (i === 1 ? freshKV : freshDoc.items[i - 1]) as TreeNode;
              const prevIndex = (tableParent as Document).items.indexOf(prev as Block);
              insert(original, tableParent, extraEntry, prevIndex + 1);
              commentEligibleNodes.add(extraEntry);
            }
          }
          return; // handled; skip the generic replace() below
        }

        // Could not resolve the JS value — fall back to generic handling
        parent = findParent(original, change.path);
      } else if (isTableArray(existing)) {
        // Same situation as the isTable branch above, but for an array-of-tables:
        // the diff edits the entry (path [..., 0]), and the replacement — an
        // InlineItem from the updated doc — carries no key.  Splicing it in for
        // the [[a]] node emits a bare value with no key at all (fuzz seed 3333).
        // Regenerate the array as a fresh KV instead.
        const updated_js = toJS(updated.items, '', { temporal });
        const existingAotKey = (existing as TableArray).key.item.value;
        let jsValue: any = updated_js;
        // Navigate to the array's JS value.  When the edit targets an AOT
        // entry the path ends in that entry's numeric index ([..., 0]), which
        // is not part of the array's key; drop it.  A whole-array edit's path
        // ends in the key itself (fuzz seed 136865: `ng.tll = [obj, -4619]`),
        // and has no trailing index — navigate the path as-is.  Using a fixed
        // `existingAotKey.length` misaligns when the AOT is itself nested
        // inside another AOT entry, because the path then interleaves numeric
        // entry indices with string key segments (fuzz seed 129645).
        const navPath = typeof change.path[change.path.length - 1] === 'number'
          ? change.path.slice(0, -1)
          : change.path;
        for (const key of navPath) {
          jsValue = jsValue?.[key];
        }

        if (jsValue !== undefined) {
          const lastSegment = existingAotKey.slice(-1);
          const parentKey = existingAotKey.slice(0, -1);
          // Same structural-parent discipline as the isTable branch above
          // (fuzz seed 6803): the path prefix can prefix-match an unrelated
          // earlier dotted key-value.
          const tableParent = findStructuralParent(original, existing) ?? findParent(original, change.path);

          // Regenerate a fresh KV using parseJS on just the single key-value
          const freshDoc = parseJS({ [lastSegment[0]]: jsValue }, format);
          const freshKV = freshDoc.items[0] as KeyValue;

          // When the whole AOT collapsed to an array that no longer holds
          // only plain objects (`[[hc8v]]` with `hc8v[0] = -1937`), `freshKV`
          // carries the ENTIRE array value.  Replacing only `existing` (entry
          // 0) leaves the remaining sibling `[[key]]` entries behind, which
          // then collide with the rebuilt KV and fail the re-parse (fuzz seed
          // 299772).  Drop every other entry with the same key first.
          if (Array.isArray(jsValue) && !jsValue.every(v => isObject(v))) {
            // The AOT's key can be a strict prefix of OTHER document sections
            // (e.g. `[[""]]` collapsing to a static array while
            // `["".c47eko_.bog8_vy3w]` is a non-contiguous sub-table extending
            // that prefix).  Those prefix-extended sub-tables/sub-AOTs would
            // re-define the key on re-parse and fail with "Cannot add to
            // static array" (fuzz seed 1285105).  Match them by key prefix,
            // not just exact key equality.
            const siblingEntries = findDocumentItemsByKeyPrefix(original, existingAotKey)
              .filter(n => n !== existing && (isTable(n) || isTableArray(n)));
            for (const sibling of siblingEntries) {
              removeMember(original, original, sibling);
            }
          }

          if (parentKey.length > 0) {
            // The regenerated `freshKV` is a Table/TableArray (not a KeyValue)
            // when `jsValue` is an object or an array of objects.  Emitting it
            // with only the last key segment under a `[parentKey]` header
            // fragments the section: a `[[qbvzp4p]]` child of `[e.j9a8-tra]`
            // re-renders as a TOP-LEVEL AOT, splitting `[[e.j9a8-tra.qbvzp4p]]`
            // into an empty `[e.j9a8-tra]` + a stray `[[qbvzp4p]]` (fuzz seed
            // 41613).  Extend the section's key with the parent prefix and swap
            // it in for the old node directly instead.
            if (isTable(freshKV) || isTableArray(freshKV)) {
              extendSectionKeyWithParentAndReplace(freshKV, parentKey, existing, tableParent);
              commentEligibleNodes.add(freshKV);
            } else {
              // If an explicit parent table already exists (`[""]` plus
              // `[["".u60ke_j3]]`), reuse it and insert the rebuilt key
              // there. Creating a new `[parentKey]` duplicates the table
              // header and re-parse fails with "Table already defined"
              // (fuzz seed 1947810).
              const existingParentTable = isDocument(tableParent)
                ? (tableParent.items as TreeNode[]).find(item =>
                  isTable(item) && arraysEqual((item as Table).key.item.value, parentKey)
                ) as Table | undefined
                : undefined;
              if (existingParentTable) {
                const existingRow = (existingParentTable.items as TreeNode[]).find(row =>
                  isKeyValue(row) && arraysEqual((row as KeyValue).key.value, freshKV.key.value)
                ) as KeyValue | undefined;
                if (existingRow) {
                  replace(original, existingParentTable, existingRow, freshKV);
                } else {
                  insert(original, existingParentTable, freshKV, undefined);
                }
                removeMember(original, tableParent as Document, existing);
                commentEligibleNodes.add(existingParentTable);
                return; // handled; skip generic replace below
              }

              // Same implicit-parent handling as the isTable branch above
              // (fuzz seed 6803).
              const hasImplicitParent = findDocumentItemsByKeyPrefix(original, parentKey).some(isKeyValue);
              if (hasImplicitParent) {
                extendKeyWithParentAndReplace(freshKV, parentKey, existing, tableParent);
                commentEligibleNodes.add(freshKV);
              } else {
                const newTable = generateTable(parentKey);
                materialisedTables.add(newTable);
                insert(original, newTable, freshKV, 0);
                replace(original, tableParent, existing, newTable);
                // newTable stands in for the pre-existing `existing` AOT, so it should stay
                // eligible for the leading comment run `existing` would have owned via R2.
                commentEligibleNodes.add(newTable);
              }
            }
          } else {
            // Single-segment [[w]] — KV belongs directly in the Document.
            replace(original, tableParent, existing, freshKV);
            // Same reasoning as newTable above: freshKV replaces `existing`, not a new entry.
            commentEligibleNodes.add(freshKV);

            hoistRootKeyValueAboveTables(original, freshKV);
          }
          return; // handled; skip the generic replace() below
        }

        // Could not resolve the JS value — fall back to generic handling
        parent = findParent(original, change.path);
      } else {
        parent = findParent(original, change.path);
        // Unwrap InlineItem parents to the actual container
        // (mirrors the Add handler unwrapping at L690-698).
        // For nested arrays, findParent returns the InlineArrayItem
        // wrapper; we need the inner InlineArray so replace() splices
        // into .items instead of overwriting .item.
        if (isKeyValue(parent)) {
          const parentPath = change.path.slice(0, -1);
          const arrayNode = findByPath(original, parentPath);
          if (isKeyValue(arrayNode) && isInlineArray(arrayNode.value)) {
            parent = arrayNode.value;
          }
        } else if (isInlineItem(parent) && isKeyValue(parent.item)) {
          parent = parent.item.value;
        } else if (isInlineItem(parent) && isInlineTable(parent.item)) {
          parent = parent.item;
        } else if (isInlineItem(parent) && isInlineArray(parent.item)) {
          parent = parent.item;
        }
      }

      // When replacing an InlineItem that wraps a scalar (e.g. editing a
      // string inside a nested array), preserve the existing item's comma
      // flag so the replacement doesn't introduce an unwanted trailing comma.
      if (isInlineItem(existing) && isInlineItem(replacement)) {
        if (isString(existing.item) && isString(replacement.item)) {
          preserveFormatting(existing.item, replacement.item);
          replacement.loc = {
            start: { ...replacement.item.loc.start },
            end: { ...replacement.item.loc.end }
          };
        }
        replacement.comma = existing.comma;
      }

      if (inlineTableRowContext) {
        const existingSpan = getSpan(existing.loc);
        const replacementSpan = getSpan(replacement.loc);
        const deltaColumns = replacementSpan.columns - existingSpan.columns;
        if (deltaColumns !== 0) {
          recordInlineTableCommentDelta(inlineTableRowContext.container, inlineTableRowContext.row, deltaColumns);
        }
      }

      replace(original, parent, existing, replacement);

      // A section header captures every key-value that follows it, so an
      // edit that turns a root-level KV into a Table must not leave root
      // KVs after the new header (fuzz seed 590: `g86 = "str"` → `[g86]`
      // while `fofc`/`y3n`/`"<w"` followed it — they were swallowed into
      // the new table).  Sink the new section below the root-table scope.
      if (isDocument(parent) && isKeyValue(existing) &&
          (isTable(replacement) || isTableArray(replacement))) {
        sinkTableBelowRootKeyValues(original, replacement);
      }
    } else if (isRemove(change)) {
      const node = tryFindByPath(original, change.path);

      if (!node) {
        // The path likely refers to all entries of a TableArray sequence
        // (e.g. path ['tasks'] when the CST stores entries at ['tasks',0], ['tasks',1]…),
        // or is a strict prefix of a longer AOT key (e.g. path ['a','b'] when
        // the entry key is ['a','b','c'] — fuzz seed 176).
        // Remove all entries by repeatedly pulling the next matching one.
        const nextAotEntry = (): TreeNode | undefined => {
          const direct = tryFindByPath(original, change.path.concat(0));
          if (direct) return direct;
          const prefixed = findDocumentItemsByKeyPrefix(original, change.path)
            .filter(isTableArray) as TableArray[];
          return prefixed[0];
        };
        const first = nextAotEntry();
        if (first) {
          const firstIndex = (original.items as TreeNode[]).indexOf(first);

          // R2 extension: when the AOT entries are the sole children of an
          // implicit parent, convert the first entry in place to a Table so
          // comments preceding it in Document.items are preserved.
          let materialiseAotInPlace = false;
          if (change.path.length > 1 && rawUpdated !== undefined) {
            const parentPath = change.path.slice(0, -1);
            const allSiblings = findDocumentItemsByKeyPrefix(original, parentPath);
            const otherSiblings = allSiblings.filter(s =>
              !(isTableArray(s) && arraysEqual((s as TableArray).key.item.value, change.path))
            );
            if (otherSiblings.length === 0) {
              let value: any = rawUpdated;
              for (const k of parentPath) value = value?.[k];
              if (isObject(value) && Object.keys(value).length === 0) {
                // Convert first entry: clear items, rename key, change type.
                const aotNode = first as TableArray;
                const aotKeyHolder = aotNode.key;
                while (aotNode.items.length > 0) {
                  removeMember(original, aotNode, last(aotNode.items as TreeNode[])!);
                }
                // The item removals above left pending line offsets on the
                // entry's key.  Shrinking loc.end against pre-offset
                // positions — and leaving the offsets to bleed through the
                // entry into later sections — corrupts everything below
                // (fuzz seed 7379).  Resolve first.
                applyWrites(original);
                (aotNode as any).type = NodeType.Table;
                // Also change the key type so toTOML renders [a] not [[a]].
                (aotKeyHolder as any).type = NodeType.TableKey;
                // Rename the key in place (preserving original loc.start).
                const aotKey = hasItem(aotKeyHolder) ? aotKeyHolder.item : aotKeyHolder;
                aotKey.value = parentPath as string[];
                aotKey.raw = preserveEscapedKeyRaw(aotKey.raw, aotKey.value);
                aotKey.loc.end.column = aotKey.loc.start.column + aotKey.raw.length;
                aotKeyHolder.loc.end.column = aotKeyHolder.loc.start.column + aotKey.raw.length + 2;
                // Shrink loc.end to the header-only span.
                (aotNode as any).loc.end.line = aotKeyHolder.loc.end.line;
                (aotNode as any).loc.end.column = aotKeyHolder.loc.end.column;
                // Track for blank-line fixup if preceded by an R2-adjacent comment.
                trackAdjacentComment(aotNode as any as Table);
                materialiseAotInPlace = true;
              }
            }
          }

          // Remove remaining AOT entries.  If the first was converted in place
          // it no longer matches change.path, so the loop naturally skips it.
          let entry: TreeNode | undefined;
          while ((entry = nextAotEntry())) {
            removeMember(original, original, entry);
          }
          // [table] sections extending the same prefix belong to the removed
          // key too — deleting `""` must remove `["". "aV^16c`G"]` as well,
          // or the re-parse revives the key (fuzz seed 3463).
          for (const tableNode of findDocumentItemsByKeyPrefix(original, change.path).filter(isTable)) {
            removeMember(original, original, tableNode);
          }
          // After removing all AOT entries, insert an empty inline array key-value so the
          // key isn't lost (e.g. b = []), but only when the caller still wants the key.
          // "Emptied to []" and "deleted outright" both arrive here as a Remove of every
          // entry; re-materialising unconditionally put back a key the caller had deleted.
          if (tryFindByPath(updated, change.path)) {
            const aotPath = change.path as string[];
            emptiedAotKeys.set(aotPath.join('.'), aotPath);
          }

          // When the AOT entries were the sole children of an implicit parent
          // (e.g. [[a.b]] -> { a: {} }), the parent disappears.  Materialise it
          // as an empty table if the caller still wants the parent key.
          // Skip if already materialised in place above.
          if (!materialiseAotInPlace &&
              change.path.length > 1 && rawUpdated !== undefined) {
            const parentPath = change.path.slice(0, -1);
            const remainingSiblings = findDocumentItemsByKeyPrefix(original, parentPath);
            if (remainingSiblings.length === 0) {
              let value: any = rawUpdated;
              for (const k of parentPath) value = value?.[k];
              if (isObject(value) && Object.keys(value).length === 0) {
                const emptyTable = generateTable(parentPath as string[]);
                materialisedTables.add(emptyTable);
                // The removals above already spliced the document items, so a
                // stale index (e.g. the removed entry was the last item) must
                // be clamped — inserting past the end leaves the generated
                // header at its (1,0) origin, corrupting line 1 (fuzz seed
                // 11605).
                const insertIdx = firstIndex >= 0
                  ? Math.min(firstIndex, original.items.length)
                  : original.items.length;
                // Same pending-offset hazard as the implicit-key branch
                // below: insert after the removals are resolved so the new
                // header can't absorb the document's enter offset (fuzz
                // seed 1172).
                applyWrites(original);
                insert(original, original, emptyTable, insertIdx);
              }
            }
          }
        } else {
          // The path might be an implicit intermediate key — a key that is a
          // prefix of a dotted table key but has no CST node of its own.
          // For example, [references.VBIDE] creates a Table with key
          // ["references", "VBIDE"], so a Remove at path ["references"] has
          // no exact node match. Find all document-level items whose key
          // starts with the change path and remove them.  The path is in
          // JS-object coordinates, so strip numeric AOT entry indices first —
          // `delete obj[""][0]["-vX`"]` has path `["", 0, "-vX`"]` but the
          // CST sub-table is keyed `["", "-vX`"]` (fuzz seed 1428499).
          const cstPath = stripAotEntryIndices(original, change.path);
          const prefixNodes = findDocumentItemsByKeyPrefix(original, cstPath);
          if (prefixNodes.length > 0) {
            const firstPrefixIndex = (original.items as TreeNode[]).indexOf(prefixNodes[0]);
            for (const prefixNode of prefixNodes) {
              removeMember(original, original, prefixNode);
            }
            // When the removed prefix items were the sole children of an
            // implicit parent (e.g. [mhv6z.hpd_iu9zs5."2<w"] removed at
            // path [mhv6z, hpd_iu9zs5] -> { mhv6z: {} }), materialise the
            // parent as an empty table so the key isn't dropped (seed 176).
            if (cstPath.length > 1 && rawUpdated !== undefined) {
              const cstParentPath = cstPath.slice(0, -1);
              const remainingSiblings = findDocumentItemsByKeyPrefix(original, cstParentPath);
              if (remainingSiblings.length === 0) {
                // `rawUpdated` is the JS object, so walk the ORIGINAL
                // (indexed) path — not the index-stripped CST path.
                let value: any = rawUpdated;
                for (const k of change.path.slice(0, -1)) value = value?.[k];
                if (isObject(value) && Object.keys(value).length === 0) {
                  const emptyTable = generateTable(cstParentPath as string[]);
                  materialisedTables.add(emptyTable);
                  // Clamp to the post-removal items length — a stale last-item
                  // index inserts past the end and strands the generated
                  // header at its (1,0) origin, corrupting line 1 (fuzz seed
                  // 11605).
                  const insertIdx = firstPrefixIndex >= 0
                    ? Math.min(firstPrefixIndex, original.items.length)
                    : original.items.length;
                  // The removals above left pending offsets on the document
                  // (or a preceding item).  Inserting before resolving them
                  // lets the new header absorb the document's pending enter
                  // offset and land above line 1 (fuzz seed 1172).
                  applyWrites(original);
                  insert(original, original, emptyTable, insertIdx);
                }
              }
            }
          } else {
            // Not a table array or implicit key — let findByPath throw the descriptive error.
            findByPath(original, change.path);
          }
        }
      } else {
        let parent = findParent(original, change.path);
        // When findParent returns the node itself via dotted-key prefix
        // matching (e.g. path ['t','a','b'] matching key ['a','b']),
        // re-resolve from one segment higher so we get the actual
        // container (the Table/Document) rather than the KV's value.
        if (parent === node) {
          parent = findParent(original, change.path.slice(0, -1));
        }
        // Every prefix of the path can itself match a dotted key (e.g.
        // removing the last segment of `z0ncoh.y.eam` inside an AOT entry),
        // in which case both resolutions above return the node itself.
        // Fall back to the node's structural container instead.
        if (parent === node) {
          const host = findHostContainer(original, node);
          if (host) parent = host;
        }
        if (isKeyValue(parent)) {
          parent = parent.value;
        }
        // When the parent is an InlineItem wrapping a KeyValue (nested inline table), unwrap to the
        // inner InlineTable so `remove` receives a node type that `hasItems` accepts.
        if (isInlineItem(parent) && isKeyValue((parent as InlineItem).item)) {
          parent = ((parent as InlineItem).item as KeyValue).value;
        }
        // When the parent is an InlineItem wrapping an InlineTable (an object inside an inline
        // array, e.g. `items = [{ name = "x", color = "y" }]`), unwrap to the InlineTable so
        // `remove` receives a node type that `hasItems` accepts.
        if (isInlineItem(parent) && isInlineTable((parent as InlineItem).item)) {
          parent = (parent as InlineItem).item;
        }
        // When the parent is an InlineItem wrapping an InlineArray (a nested array inside an
        // inline array, e.g. `a = [ [ 1, 2, 3 ] ]`), unwrap to the inner InlineArray so
        // `remove` receives a node type that `hasItems` accepts.
        if (isInlineItem(parent) && isInlineArray((parent as InlineItem).item)) {
          parent = (parent as InlineItem).item;
        }
        // The logical (JS-object) parent may differ from the CST parent.
        // For example, [server.tls] lives in document.items, not [server].items.
        // Fall back to the node's structural container when the parent doesn't
        // contain it (keeps document-sibling behaviour, and handles inline
        // containers nested inside values).  This also covers resolution
        // landing on an unrelated sibling: removing `"".tvbin` resolves its
        // prefix [""] to the FIRST key starting with "" (e.g. `"".vf = true`),
        // whose unwrapped value is a Boolean — not a container at all
        // (fuzz seed 185).
        if (!hasItems(parent) || !(parent.items as TreeNode[]).includes(node)) {
          const structural = findStructuralParent(original, node);
          parent = structural ?? (hasItems(parent) ? original : findHostContainer(original, node) ?? original);
        }

        // R2 extension: when the last child of an implicit parent is removed,
        // materialise the parent in place (rename key, clear items) so that
        // comments preceding the child in Document.items are preserved.
        let materialisedInPlace = false;
        if (change.path.length > 1 && isTable(node) && rawUpdated !== undefined) {
          const parentPath = change.path.slice(0, -1);
          // `change.path` is in JS-object coordinates (numeric AOT index after
          // the AOT key, e.g. `["", 0, "fv"]` for CST `["", "fv"]`).  The
          // sibling scan and in-place key rename must use the CST key, else
          // the index leaks into the header `["".0.fv]` (fuzz seed 1020868).
          const cstParentPath = (node as Table).key.item.value.slice(0, -1);
          const remainingSiblings = findDocumentItemsByKeyPrefix(original, cstParentPath)
            .filter(s => s !== node);
          if (remainingSiblings.length === 0) {
            let value: any = rawUpdated;
            for (const k of parentPath) value = value?.[k];
            if (isObject(value) && Object.keys(value).length === 0) {
              const table = node as Table;
              while (table.items.length > 0) {
                remove(original, table, last(table.items as TreeNode[])!);
              }
              // Same pending-offset discipline as materialiseAotInPlace
              // above (fuzz seed 7379).
              applyWrites(original);
              const keyHolder = table.key;
              const key = hasItem(keyHolder) ? keyHolder.item : keyHolder;
              key.value = cstParentPath as string[];
              key.raw = preserveEscapedKeyRaw(key.raw, key.value);
              key.loc.end.column = key.loc.start.column + key.raw.length;
              keyHolder.loc.end.column = keyHolder.loc.start.column + key.raw.length + 2;
              // The body is gone — shrink table.loc to the header only.
              table.loc.end.line = keyHolder.loc.end.line;
              table.loc.end.column = keyHolder.loc.end.column;
              // Only track for blank-line fixup if the preceding comment
              // is R2-adjacent.  A blank line (R3) severs ownership and
              // the gap is intentional.
              trackAdjacentComment(table);
              materialisedInPlace = true;
            }
          }
        }

        // Capture the node's index before removal so the materialised table
        // can be inserted at the original position (preserving blank-line
        // spacing with preceding comments).
        const nodeIndex = isDocument(parent) && hasItems(parent)
          ? (parent.items as TreeNode[]).indexOf(node)
          : -1;
        const containerItemIndex = hasItems(parent) && !isDocument(parent)
          ? (parent.items as TreeNode[]).indexOf(node)
          : -1;
        const removedInlineComma = isInlineItem(node) ? (node as InlineItem).comma : undefined;
        // The bracket gap of a multiline inline container, captured BEFORE the
        // removal: removeMember flushes pending offsets for multiline inline
        // containers, so the post-removal fixup below can no longer measure
        // the original end-to-bracket gap from the container's own loc (fuzz
        // seed 10469).
        const bracketGapBefore =
          isInlineItem(node) && (isInlineArray(parent) || isInlineTable(parent)) &&
          node.loc.end.line === parent.loc.end.line
            ? parent.loc.end.column - node.loc.end.column
            : undefined;
        // Absolute lookup path of the node (or its inner KV for InlineItems),
        // captured while it is still in the tree — the materialisation block
        // below runs AFTER the removal and needs it to derive the emptied
        // parent's prefix relative to an inline-table container (seed 128).
        const nodeAbsolutePath = absolutePathOf(
          isInlineItem(node) && isKeyValue(node.item) ? node.item : node
        );

        // When the probe path matched a dotted key by PREFIX (the key is
        // longer than the path), removing only that KV leaves the key's
        // other segments behind.  E.g. deleting `l` when the CST holds
        // `l.l` and `l.utc.xme7` must remove both, or the re-parse revives
        // `l` from the surviving sibling (fuzz seed 2926).
        const removePrefixKv = isKeyValue(node)
          ? node as KeyValue
          : isInlineItem(node) && isKeyValue(node.item)
            ? node.item as KeyValue
            : undefined;
        if (removePrefixKv && nodeAbsolutePath && hasItems(parent)) {
          const containerAbsLen = nodeAbsolutePath.length - removePrefixKv.key.value.length;
          const relativePrefix = change.path.slice(containerAbsLen) as Path;
          if (relativePrefix.length > 0 && relativePrefix.length < removePrefixKv.key.value.length) {
            const siblings = (parent as { items: TreeNode[] }).items;
            // Collect matches first, then remove by identity: removeMember
            // splices the live array (member + its leading comments), so
            // mutating it inside the scan loop corrupts the indices.
            // Table/TableArray sections extending the same prefix count too —
            // a root `""` holds both `"".x = 1` and `[["".y]]` (fuzz seed 3392).
            const toRemove: TreeNode[] = [];
            for (const sibling of siblings) {
              if (sibling === node) continue;
              const siblingKey = isKeyValue(sibling)
                ? sibling.key.value
                : isInlineItem(sibling) && isKeyValue(sibling.item)
                  ? sibling.item.key.value
                  : isTable(sibling) || isTableArray(sibling)
                    ? sibling.key.item.value
                    : undefined;
              if (siblingKey
                  && siblingKey.length > relativePrefix.length
                  && arraysEqual(siblingKey.slice(0, relativePrefix.length), relativePrefix)) {
                toRemove.push(sibling);
              }
            }
            for (const sibling of toRemove) {
              removeMember(original, parent, sibling);
            }
          }
        }

        // When a key at this path is removed outright (the path exactly
        // matches the node's key), any sibling whose key EXTENDS this prefix
        // (a longer dotted key or a [table]/[[array]] section) re-defines
        // the key on re-parse.  E.g. `q = <date>` alongside `q."X".y = true`
        // and `[q."Z"]` (a leniently-accepted collision) leaves those
        // extensions behind when only `q = <date>` is removed, and the
        // re-parse revives `q` as a table (fuzz seed 79938).  Drop them too.
        if (removePrefixKv && nodeAbsolutePath && hasItems(parent)) {
          const key = removePrefixKv.key.value;
          const siblings = (parent as { items: TreeNode[] }).items;
          const extending: TreeNode[] = [];
          for (const sibling of siblings) {
            if (sibling === node) continue;
            const siblingKey = isKeyValue(sibling)
              ? sibling.key.value
              : isInlineItem(sibling) && isKeyValue(sibling.item)
                ? sibling.item.key.value
                : isTable(sibling) || isTableArray(sibling)
                  ? sibling.key.item.value
                  : undefined;
            if (siblingKey
                && siblingKey.length > key.length
                && arraysEqual(siblingKey.slice(0, key.length), key)) {
              extending.push(sibling);
            }
          }
          for (const sibling of extending) {
            removeMember(original, parent, sibling);
          }
        }

        // Same repair for a removed SECTION header ([table]/[[array]]).  When
        // `[x]` is deleted while a sibling `[[x.y]]` (or `x.z = …`) still
        // extends the `x` prefix, removing only the header leaves the section
        // behind and the re-parse revives `x` from it (fuzz seed 136292).
        if ((isTable(node) || isTableArray(node)) && hasItems(parent)) {
          const key = (node as Table | TableArray).key.item.value;
          const siblings = (parent as { items: TreeNode[] }).items;
          const extending: TreeNode[] = [];
          for (const sibling of siblings) {
            if (sibling === node) continue;
            const siblingKey = isKeyValue(sibling)
              ? sibling.key.value
              : isTable(sibling) || isTableArray(sibling)
                ? sibling.key.item.value
                : undefined;
            if (siblingKey
                && siblingKey.length > key.length
                && arraysEqual(siblingKey.slice(0, key.length), key)) {
              extending.push(sibling);
            }
          }
          for (const sibling of extending) {
            removeMember(original, parent, sibling);
          }
        }

        if (!materialisedInPlace) {
          removeMember(original, parent, node);
        }

        // Removing the LAST item of a single-line inline container while an
        // earlier edit left a pending exit offset on the new last item makes
        // the writer's column arithmetic go stale: the container's end (and
        // thus the closing bracket) ends up inside the surviving item's span
        // (fuzz seed 3780: `[[], true, -3125, 755_394]` edited and truncated
        // emitted `-312,` with `]` eating the last digit).  Flush the pending
        // offsets, then fix the end from the surviving item, preserving the
        // original gap to the bracket.
        // The same hazard applies to a MULTILINE container when the removed
        // item ends on the bracket row: the bracket slides before the
        // surviving tail (fuzz seed 10469).
        if (isInlineItem(node) && (isInlineArray(parent) || isInlineTable(parent)) &&
            node.loc.end.line === parent.loc.end.line) {
          const remaining = (parent as InlineArray | InlineTable).items as TreeNode[];
          const isSingleLineContainer = parent.loc.end.line === parent.loc.start.line;
          // Only for the LAST item.  For a single-line container the whole
          // remaining content must be single-line: a multiline child (e.g. a
          // multiline string) keeps its own lines below the container's
          // line, and the column fixup would corrupt that layout (fuzz seed
          // 1841).  For a multiline container only the bracket-row tail
          // matters — earlier items sit on their own lines above.
          const tailOnBracketRow = isSingleLineContainer
            ? remaining.every(item => item.loc.end.line === parent.loc.start.line)
            : remaining.length > 0 && last(remaining)!.loc.end.line === parent.loc.end.line;
          if (remaining.length > 0 && containerItemIndex === remaining.length &&
              tailOnBracketRow) {
            // For a multiline container the pending offsets were already
            // flushed by removeMember, so the container's end is stale and
            // the gap must come from the pre-removal capture (fuzz seed
            // 10469); the single-line path still measures live.
            const gap = bracketGapBefore ?? (parent.loc.end.column - node.loc.end.column);
            applyWrites(original);
            const targetEnd = last(remaining)!.loc.end.column + gap;
            if (parent.loc.end.column !== targetEnd) {
              parent.loc.end.column = targetEnd;
            }
            // The owning KV's end mirrors the value's end; without it the
            // KV's own row comma (inside an enclosing inline table) is
            // written at the stale column, overwriting the value's tail.
            let owner: KeyValue | undefined;
            const findOwner = (n: TreeNode): KeyValue | undefined => {
              if (isKeyValue(n)) {
                if (n.value === parent) return n;
                return findOwner(n.value);
              }
              if (isInlineItem(n)) return findOwner(n.item);
              if (!hasItems(n)) return undefined;
              for (const item of n.items as TreeNode[]) {
                const found = findOwner(isInlineItem(item) ? item.item : item);
                if (found) return found;
              }
              return undefined;
            };
            owner = findOwner(original);
            if (owner && owner.loc.end.line === parent.loc.end.line) {
              owner.loc.end.column = parent.loc.end.column;
              // The InlineItem row wrapping the KV carries the row's comma;
              // its end must track the KV's end too.
              const findWrapper = (n: TreeNode): InlineItem | undefined => {
                if (isKeyValue(n)) return findWrapper(n.value);
                if (isInlineItem(n)) {
                  if (n.item === owner) return n;
                  return findWrapper(n.item);
                }
                if (!hasItems(n)) return undefined;
                for (const item of n.items as TreeNode[]) {
                  const found = findWrapper(item);
                  if (found) return found;
                }
                return undefined;
              };
              const wrapper = findWrapper(original);
              if (wrapper) {
                // Register the row's growth as an exit offset so the next
                // row of the enclosing table shifts past the comma+space,
                // and resolve it immediately — the earlier flush cleared
                // the dirty flag, so the final applyWrites would skip it.
                const delta = parent.loc.end.column - wrapper.loc.end.column;
                wrapper.loc.end.column = parent.loc.end.column;
                if (delta !== 0) {
                  addExitOffset(original, wrapper, { lines: 0, columns: delta });
                  markDirty(original);
                  applyWrites(original);
                }
              }
            }
          }
        }

        // When removing a node whose key has an implicit parent, check whether
        // the parent should survive as an empty table header.  Table nodes are
        // handled in-place above; only TableArray falls through to generate+insert.
        if (!materialisedInPlace &&
            change.path.length > 1 && (isTable(node) || isTableArray(node)) && rawUpdated !== undefined) {
          const parentPath = change.path.slice(0, -1);
          // `change.path` is in JS-object coordinates, which interleave a
          // numeric AOT entry index after the AOT key (e.g. `["", 0, "fv"]`
          // for the CST key `["", "fv"]`).  The sibling scan and generated
          // header must use the CST key (no index), else the index leaks into
          // the header as `["".0.fv]` and the re-parse nests `fv` under a key
          // literally named "0" (fuzz seed 1020868).  The value walk below
          // keeps the JS coordinates.
          const cstParentKey = (node as Table | TableArray).key.item.value.slice(0, -1);
          const remainingSiblings = findDocumentItemsByKeyPrefix(original, cstParentKey);
          if (remainingSiblings.length === 0) {
            let value: any = rawUpdated;
            for (const k of parentPath) value = value?.[k];
            if (isObject(value) && Object.keys(value).length === 0) {
              const emptyTable = generateTable(cstParentKey as string[]);
              materialisedTables.add(emptyTable);
              // Insert at the original position so preceding comments
              // stay adjacent without a spurious blank line.  Clamp to the
              // post-removal length — a stale last-item index strands the
              // generated header at its (1,0) origin (fuzz seed 11605).
              const insertIdx = nodeIndex >= 0
                ? Math.min(nodeIndex, original.items.length)
                : original.items.length;
              // Resolve the removal's pending offsets first — an insert at
              // index 0 otherwise absorbs the document's enter offset and
              // lands above line 1 (fuzz seed 1172).
              applyWrites(original);
              insert(original, original, emptyTable, insertIdx);
            }
          }
        }

        // Dotted-key KeyValues follow the same implicit-parent materialisation
        // rule: when removing the last segment of a dotted key (e.g. y.ic83
        // → y), and no other items share the parent prefix, materialise the
        // parent as an empty table header (or empty inline table, for dotted
        // keys inside an inline table) so the key isn't silently dropped.
        if (!materialisedInPlace && change.path.length > 1 && rawUpdated !== undefined) {
          const kv = isKeyValue(node)
            ? node as KeyValue
            : isInlineItem(node) && isKeyValue(node.item)
              ? node.item as KeyValue
              : undefined;
          // Only for dotted keys with 2+ segments.
          if (kv && kv.key.value.length > 1) {
            const parentPath = change.path.slice(0, -1);
            // Search the node's own container (Table / Document / AOT entry /
            // InlineTable) for remaining siblings whose key starts with the
            // parent prefix.
            const container = isDocument(parent) || isTable(parent) || isTableArray(parent) || isInlineTable(parent)
              ? parent
              : original;
            if (hasItems(container)) {
              // The prefix relative to the container: strip the container's own
              // key from the path.  For an AOT entry the numeric entry index is
              // also stripped.  Deriving it from parentPath (not kv.key.value)
              // matters when a middle segment of the dotted key was removed
              // (e.g. deleting `booay` from `6U.booay.o563zkr` must leave the
              // prefix `6U`, not `6U.booay` — fuzz seed 128).
              let relativePrefix: string[];
              if (isTable(container) || isTableArray(container)) {
                // Strip the container's own key from parentPath, skipping
                // any numeric AOT entry indexes that appear between its
                // segments — the absolute path of a table nested inside an
                // array-of-tables entry interleaves them (e.g. [y, 0, sl4,
                // m{sHnZ, vk] against the container key [y, sl4, m{sHnZ]),
                // and slicing by the key length alone leaves the extra
                // segment behind (fuzz seed 10533).
                const containerKey = (container as Table | TableArray).key.item.value;
                let offset = 0;
                let matched = 0;
                for (let k = 0; k < containerKey.length && offset < parentPath.length; k++) {
                  while (offset < parentPath.length && typeof parentPath[offset] === 'number') offset++;
                  if (offset >= parentPath.length || parentPath[offset] !== containerKey[k]) break;
                  matched++;
                  offset++;
                }
                while (offset < parentPath.length && typeof parentPath[offset] === 'number') offset++;
                if (matched === containerKey.length) {
                  relativePrefix = parentPath.slice(offset) as string[];
                } else {
                  // Fall back to the historical key-length slice.
                  relativePrefix = parentPath.slice(
                    containerKey.length + (isTableArray(container) ? 1 : 0)
                  ) as string[];
                }
              } else if (isInlineTable(container)) {
                // InlineTable items are relative to the table itself; the
                // table's own key path is the node's absolute path minus its
                // key segments (captured before the removal).  But the change
                // coordinates (`parentPath`) can interleave a numeric AOT
                // entry index that the CST path lacks — the JS object sees
                // `[""]` as an array-of-tables (so `obj[""].o96` -> path
                // `["", 0, "o96", …]`) while the CST stores `o96` as a
                // sibling `[""."o96"]` table (absolute path `["", "o96", …]`).
                // Slicing parentPath by the CST length then over-includes the
                // enclosing segment and re-emits `GD64qOzFQn.x = {}` instead
                // of `x = {}` (fuzz seed 224081).  Align by skipping numeric
                // indices while matching the container's string segments.
                if (nodeAbsolutePath) {
                  const containerSegs = nodeAbsolutePath.slice(0, nodeAbsolutePath.length - kv.key.value.length);
                  let offset = 0;
                  let matched = 0;
                  while (matched < containerSegs.length && offset < parentPath.length) {
                    while (offset < parentPath.length && typeof parentPath[offset] === 'number') offset++;
                    if (offset >= parentPath.length || parentPath[offset] !== containerSegs[matched]) break;
                    matched++;
                    offset++;
                  }
                  while (offset < parentPath.length && typeof parentPath[offset] === 'number') offset++;
                  if (matched === containerSegs.length) {
                    relativePrefix = parentPath.slice(offset) as string[];
                  } else {
                    relativePrefix = parentPath.slice(containerSegs.length) as string[];
                  }
                } else {
                  relativePrefix = parentPath.slice(parentPath.length - (kv.key.value.length - 1)) as string[];
                }
              } else {
                relativePrefix = parentPath as string[];
              }
              // `relativePrefix` is a TOML key path. `parentPath` comes from
              // JS-object coordinates and can include array indices (numbers),
              // which must never be emitted as key segments.
              relativePrefix = relativePrefix.filter((seg): seg is string => typeof seg === 'string');
              const remaining = (container.items as TreeNode[]).filter(item => {
                const key = isKeyValue(item)
                  ? (item as KeyValue).key.value
                  : isInlineItem(item) && isKeyValue(item.item)
                    ? item.item.key.value
                    : undefined;
                if (!key) return false;
                return arraysEqual(key.slice(0, relativePrefix.length), relativePrefix);
              });
              // An AOT entry can also own sub-tables stored as document-level
              // siblings whose keys extend the entry's own key.
              const isAotEntry = isTableArray(container);
              let docSiblings: TreeNode[] = [];
              if (isAotEntry && remaining.length === 0) {
                docSiblings = findDocumentItemsByKeyPrefix(
                  original,
                  (container as TableArray).key.item.value.concat(relativePrefix)
                );
              }
              // When the removed dotted key sits directly inside an explicit
              // [table] (or [[entry]]) header, that header already IS the
              // materialised parent — generating another one duplicates it
              // and the re-parse fails with "Table already defined" (fuzz
              // seed 1098).  Nothing to do; the emptied header stays.
              // Same for an inline table: when the parent prefix equals the
              // inline table's own key, the (now empty) inline table already
              // renders the emptied object — re-emitting an empty key would
              // parse `${''} = {}` and crash (fuzz seed 2726).
              const containerAlreadyIsParent =
                relativePrefix.length === 0 &&
                (isTable(container) || isTableArray(container) || isInlineTable(container));
              if (remaining.length === 0 && docSiblings.length === 0 && !containerAlreadyIsParent) {
                let value: any = rawUpdated;
                for (const k of parentPath) value = value?.[k];
                if (isObject(value) && Object.keys(value).length === 0) {
                  if (isInlineTable(container)) {
                    // Emptied dotted prefix inside an inline table: re-emit it
                    // as `prefix = {}` at the removed item's position, keeping
                    // the comma setting the removed item carried (fuzz seed 22).
                    // parseJS strips empty objects, so regenerateValue() can't
                    // build the value — parse a literal instead, which yields
                    // proper single-line locs for the empty inline table.
                    const freshKey = relativePrefix
                      .map(part => IS_BARE_KEY.test(part) ? part : JSON.stringify(part).replace(/\x7f/g, '\\u007f'))
                      .join('.');
                    const freshKv = Array.from(parseTOML(`${freshKey} = {}`))[0];
                    if (isKeyValue(freshKv)) {
                      const inlineItem = generateInlineItem(freshKv);
                      inlineItem.comma = removedInlineComma ?? false;
                      // The removal above left a pending enter offset on the
                      // inline table (first-item removals register there),
                      // which applyWrites would apply to the new item too.
                      // Resolve it first so the insert positions the item
                      // against final coordinates (fuzz seed 22).
                      applyWrites(original);
                      // The container was a MULTILINE inline table whose only
                      // item (a multiline dotted key) was just removed: the
                      // removal zeroed its line offset but left a stale
                      // multiline end line, so insert() would place the new
                      // `prefix = {}` on a phantom second line and the
                      // enclosing table's trailing siblings would be pulled
                      // inside this one (fuzz seed 863085).  Collapse the end
                      // to the bracket row first, mirroring the Add handler
                      // (fuzz seed 272851).
                      if (hasInlineContainerNeedingTighten(container) &&
                          container.loc.end.line > container.loc.start.line) {
                        container.loc.end.line = container.loc.start.line;
                      }
                      insert(original, container, inlineItem, containerItemIndex >= 0 ? containerItemIndex : undefined);
                      // insert() reserves one column for the opening-brace
                      // space; with bracket spacing enabled that column is
                      // already the space after `{`, so align the item with
                      // the original bracket style.
                      if (format.bracketSpacing) {
                        shiftNode(inlineItem, { lines: 0, columns: 1 });
                      }
                      // An earlier materialisation in the same batch can
                      // occupy the removed row's original slot, so the new
                      // row starts LATER than the removed one and insert()'s
                      // exit offset (span + separator, folded against the
                      // previous row's pending offsets) no longer puts the
                      // tail rows exactly after it.  Re-derive the exact
                      // displacement to just past the new row's comma.
                      const tailRow = (container as InlineTable).items[containerItemIndex + 1] as TreeNode | undefined;
                      const pendingInsertOffset = getExitOffsets(original).get(inlineItem);
                      if (tailRow && pendingInsertOffset && tailRow.loc.start.line === inlineItem.loc.end.line) {
                        pendingInsertOffset.columns = inlineItem.loc.end.column + 2 - tailRow.loc.start.column;
                      }
                    }
                    return;
                  }
                  // Table key: container key + relative prefix.  For a root
                  // KV that's just the relative prefix; for an AOT entry the
                  // numeric index is NOT part of the key.
                  const tableKey = isAotEntry
                    ? (container as TableArray).key.item.value.concat(relativePrefix)
                    : isTable(container)
                      ? (container as Table).key.item.value.concat(relativePrefix)
                      : relativePrefix;
                  const emptyTable = generateTable(tableKey as string[]);
                  materialisedTables.add(emptyTable);
                  let insertIdx = nodeIndex >= 0 ? nodeIndex : original.items.length;
                  if (isAotEntry) {
                    // Insert right after the entry so the sub-table stays in
                    // the entry's scope.
                    const entryIdx = (original.items as TreeNode[]).indexOf(container);
                    insertIdx = entryIdx >= 0 ? entryIdx + 1 : original.items.length;
                  } else if (isTable(container)) {
                    // Same hazard for a [table] container: a sub-table header
                    // appended at the document end can be pulled up into the
                    // parent's rows by a later removal's exit offset, and the
                    // header then captures those rows (fuzz seed 4402).
                    // Insert directly after the parent so the header stays
                    // below the parent's own rows.
                    const parentIdx = (original.items as TreeNode[]).indexOf(container);
                    insertIdx = parentIdx >= 0 ? parentIdx + 1 : original.items.length;
                  } else if (isDocument(container)) {
                    // Root-scope materialisation: a [table] header claims every
                    // key-value below it, so it must land after all root KVs —
                    // before the first existing section, or at the very end —
                    // never at the removed KV's index (fuzz seed 11).
                    const headerIdx = firstSectionHeaderIndex(original);
                    insertIdx = headerIdx >= 0 ? headerIdx : original.items.length;
                  }
                  // The removal above registered its line/column offset on
                  // the parent (or a preceding item).  insert() measures
                  // against sibling locs, not pending offsets, so an insert
                  // at index 0 would absorb the document's pending enter
                  // offset and land above line 1 (fuzz seed 1028).  Resolve
                  // first, like every other just-in-time flush in this file.
                  applyWrites(original);
                  insert(original, original, emptyTable, insertIdx);
                }
              }
            }
          }
        }

        // Track AOT keys whose entries may have been fully removed — again only when the
        // caller still wants the key, so deleting it outright doesn't bring it back as `[]`.
        if (isTableArray(node)) {
          const aotKey = (node as TableArray).key.item.value;
          const aotPath = change.path.slice(0, -1);
          const stillExists = tryFindByPath(original, aotPath.concat(0));
          if (!stillExists && tryFindByPath(updated, aotPath)) {
            emptiedAotKeys.set(aotKey.join('.'), aotKey);
          }
        }
      }
    } else if (isMove(change)) {
      // A document-level object Move has path === [] — tryFindByPath resolves an empty path
      // to `original` itself, which has items, so this check MUST come first or every
      // document-level key reorder would fall into the array-Move handling below instead.
      if (change.key !== undefined) {
        objectMoves.push(change);
        return;
      }

      let parent = tryFindByPath(original, change.path);
      if (parent) {
        if (hasItem(parent)) parent = parent.item;
        if (isKeyValue(parent)) parent = parent.value;

        // A Move's from/to are simulation coordinates from the diff walk;
        // when an in-place Remove earlier in the same array was reordered
        // ahead of it, the source index can be past the array's end.  The
        // remaining elements are already in place then — the move is a
        // simulation artifact and must be skipped (fuzz seed 8138).
        if (change.from >= (parent as WithItems).items.length) return;

        const node = (parent as WithItems).items[change.from];

        moveInlineElement(original, parent, node, change.to);
      } else {
        // TableArray sequence: the path refers to a collection of [[name]] entries
        // spread across Document.items (each at an indexed sub-path).
        //
        // First, normalize: the parser's table-body loop consumes comments
        // between consecutive [[x]] entries as trailing children of the first
        // entry. Promote those to Document-level siblings and fix up loc.end
        // so resolveSlots assigns them to the correct entry.
        normalizeAotEntryComments(original);

        // Find source entry.
        const fromNode = findByPath(original, change.path.concat(change.from));

        // Move the entire slot (entry + its comments) as a single unit.
        const docSlots = resolveSlots(original);
        const fromSlot = docSlots.find(s => s.member === fromNode);
        const slotItems = fromSlot ? [...fromSlot.items] : [fromNode];

        // Save original positions before removal so we can restore spacing.
        const slotOriginalPos = slotItems.map(item => ({
          startLine: item.loc.start.line,
          endLine: item.loc.end.line
        }));

        // Record original position of the document item just after the slot,
        // for exit-offset compensation after insertion.
        const slotFirstIdx = original.items.indexOf((fromSlot ? fromSlot.items[0] : fromNode) as any);

        // Also compute the original gap between the last slot item and
        // whatever comes after it in line order, for exit-offset compensation.
        const lastSlotEnd = slotOriginalPos[slotOriginalPos.length - 1].endLine;
        let originalAfterGap: number | undefined;
        for (let k = 0; k < original.items.length; k++) {
          const item = original.items[k];
          if (item.loc.start.line > lastSlotEnd) {
            originalAfterGap = item.loc.start.line - lastSlotEnd;
            break;
          }
        }
        // If no item follows in line order (slot was at document end),
        // use the gap from the item just before the slot to the first
        // slot item — this is the spacing between the two entries that
        // should be preserved between the moved entry and what follows.
        if (originalAfterGap === undefined && slotFirstIdx > 0) {
          const beforeSlot = original.items[slotFirstIdx - 1];
          originalAfterGap = slotOriginalPos[0].startLine - beforeSlot.loc.end.line;
        }

        // Remove each slot item from the Document (same discipline as removeMember).
        const memberIdx = fromSlot ? fromSlot.items.indexOf(fromNode) : 0;
        for (let i = 0; i <= memberIdx; i++) {
          if (!(original.items as TreeNode[]).includes(slotItems[i])) continue;
          remove(original, original, slotItems[i]);
        }
        for (let i = memberIdx + 1; i < slotItems.length; i++) {
          const idx = (original.items as TreeNode[]).indexOf(slotItems[i]);
          if (idx >= 0) (original.items as TreeNode[]).splice(idx, 1);
        }

        // Find insertion point. Use tryFindByPath to locate the target member.
        // If BOTH source and target slots have leading comments, insert before
        // the target slot's first item so the comments stay with their members
        // after the swap. Otherwise use the member's own index.
        const toEntry = tryFindByPath(original, change.path.concat(change.to));
        let toIndex: number;
        let targetHasLeadingComment = false;
        const sourceHadLeadingComment = fromSlot && fromSlot.items[0] !== fromNode && isComment(fromSlot.items[0]);
        if (toEntry) {
          const postSlots = resolveSlots(original);
          const targetSlot = postSlots.find(s => s.member === toEntry);
          targetHasLeadingComment = !!(targetSlot && targetSlot.items[0] !== toEntry && isComment(targetSlot.items[0]));
          if (targetHasLeadingComment && sourceHadLeadingComment) {
            toIndex = original.items.indexOf(targetSlot!.items[0] as any);
          } else {
            toIndex = original.items.indexOf(toEntry as any);
          }
        } else {
          toIndex = original.items.length;
        }

        // Capture the original gap at the target position so we can
        // reproduce it for the first slot item.
        const targetPrevEnd = toIndex > 0
          ? original.items[toIndex - 1].loc.end.line
          : 0;
        const targetFirstLine = toIndex < original.items.length
          ? original.items[toIndex].loc.start.line
          : undefined;

        // Insert slot items in forward order at incrementing indices.
        // Compute leadingLines from the original spacing so blank lines
        // are preserved exactly as they were in the source document.
        // Only override when both slots have leading comments (a true swap
        // of commented entries); otherwise let insertOnNewLine decide.
        const isCommentedSwap = targetHasLeadingComment && sourceHadLeadingComment;
        let insertIdx = toIndex;
        for (let i = 0; i < slotItems.length; i++) {
          const item = slotItems[i];

          let itemLeadingLines: number | undefined;
          // Override leadingLines when the original spacing differs from
          // insert()'s defaults. This applies when:
          // a) Both slots have leading comments (a commented swap), or
          // b) The source has comments and a pinned comment sits right
          //    before the insertion point (mixed blank lines case).
          const shouldOverride = isCommentedSwap || (sourceHadLeadingComment && toIndex > 0 && toIndex < original.items.length);
          if (shouldOverride && insertIdx > 0) {
            const prevEnd = i === 0 ? targetPrevEnd : slotOriginalPos[i - 1].endLine;
            const origLeading = (i === 0 && targetFirstLine !== undefined)
              ? targetFirstLine - targetPrevEnd
              : slotOriginalPos[i].startLine - prevEnd;
            const isSquare = isTable(item) || isTableArray(item);
            const defaultLeading = isSquare ? 2 : 1;
            if (origLeading !== defaultLeading) {
              itemLeadingLines = origLeading;
            }
          }

          insert(original, original, item, insertIdx, undefined, undefined, itemLeadingLines);
          insertIdx++;
        }

        // Restore the original gap between the last slot item and the
        // next document item, since overriding leadingLines changes the
        // exit offset and may misposition subsequent items.
        if (originalAfterGap !== undefined) {
          applyWrites(original);
          const lastItem = slotItems[slotItems.length - 1];
          const afterStart = original.items.indexOf(lastItem as any) + 1;
          if (afterStart < original.items.length) {
            const nextItem = original.items[afterStart];
            const newGap = nextItem.loc.start.line - lastItem.loc.end.line;
            const delta = originalAfterGap - newGap;
            if (delta !== 0) {
              for (let j = afterStart; j < original.items.length; j++) {
                shiftNode(original.items[j], { lines: delta, columns: 0 });
              }
            }
          }
        }
      }
    } else if (isRename(change)) {
      const sourcePath = change.path.concat(change.from);
      let parent = tryFindByPath(original, sourcePath) as
        | KeyValue
        | Table
        | TableArray
        | InlineItem<KeyValue>
        | undefined;

      // When renaming a prefix segment of a dotted table key (e.g. the "a" in
      // [a.b] → [x.b]), the source path ["a"] does not match the table's full key
      // ["a","b"].  Fall back to a key-prefix search so rename can update just the
      // matching segment in place.
      if (!parent) {
        const prefixNodes = findDocumentItemsByKeyPrefix(original, sourcePath);
        if (prefixNodes.length === 1 && (isTable(prefixNodes[0]) || isTableArray(prefixNodes[0]))) {
          const node = prefixNodes[0] as Table | TableArray;
          const keyHolder = node.key;
          const key = hasItem(keyHolder) ? keyHolder.item : keyHolder;
          const segmentIndex = sourcePath.length - 1;
          key.value[segmentIndex] = change.to;
          key.raw = preserveEscapedKeyRaw(key.raw, key.value);
          key.loc.end.column = key.loc.start.column + key.raw.length;
          return; // skip the rest of rename logic for this change
        }
      }

      if (!parent) parent = findByPath(original, sourcePath) as KeyValue | Table | TableArray | InlineItem<KeyValue>;
      let replacement = findByPath(updated, change.path.concat(change.to)) as
        | KeyValue
        | Table
        | TableArray
        | InlineItem<KeyValue>;

      if (hasItem(parent)) parent = parent.item;
      if (hasItem(replacement)) replacement = replacement.item;

      // A KeyValue holds its Key directly, while a [table]/[[array]] wraps it in a
      // TableKey/TableArrayKey. Reach the inner Key either way — reading `.key.value` off a
      // section gives undefined, which used to make preserveEscapedKeyRaw throw on `.map`.
      const parentHolder = parent.key;
      const replacementHolder = replacement.key;
      const parentKey = hasItem(parentHolder) ? parentHolder.item : parentHolder;
      const replacementKey = hasItem(replacementHolder) ? replacementHolder.item : replacementHolder;

      // Both sides must describe the same shape of key. parseJS can render the replacement
      // as a plain nested key — `z` inside `[a]` — where the document holds a dotted section
      // header `[a.b]`, and swapping one node for the other would silently drop the `a.`
      // prefix, emitting `[z]`. Refuse instead: these shapes threw before this branch
      // understood sections at all, and a clear failure beats a corrupted document.
      if (parentKey.value.length !== replacementKey.value.length) {
        const fullSourcePath = change.path.concat(change.from);
        // When the existing node is a Table/TableArray whose key shares a prefix with
        // change.path + change.from, and the replacement is a plain KeyValue, we're
        // renaming one segment of a dotted section header rather than replacing the
        // whole key (e.g. [a.b] -> [a.y]).  Rename just the matching segment in place.
        if ((isTable(parent) || isTableArray(parent)) &&
            isKeyValue(replacement) &&
            arraysEqual(parentKey.value.slice(0, fullSourcePath.length), fullSourcePath)) {
          const segmentIndex = fullSourcePath.length - 1;
          parentKey.value[segmentIndex] = change.to;
          parentKey.raw = preserveEscapedKeyRaw(parentKey.raw, parentKey.value);
          parentKey.loc.end.column = parentKey.loc.start.column + parentKey.raw.length;
          return;
        }

        // Same situation for a dotted KeyValue: renaming the last segment of
        // `y3.mklbjj.kb16my_18h` to `k30` renames just that segment — the KV
        // keeps the `y3.mklbjj` prefix (fuzz seed 3214).
        if (isKeyValue(parent) && isKeyValue(replacement) &&
            parentKey.value.length <= fullSourcePath.length &&
            arraysEqual(parentKey.value, fullSourcePath.slice(fullSourcePath.length - parentKey.value.length))) {
          const oldKeyRaw = parentKey.raw;
          parentKey.value[parentKey.value.length - 1] = change.to;
          parentKey.raw = preserveEscapedKeyRaw(parentKey.raw, parentKey.value);
          parentKey.loc.end.column = parentKey.loc.start.column + parentKey.raw.length;
          // The `=` position lives on the KeyValue, not the Key, and the value
          // keeps its own columns.  A rename that GROWS the last segment widens
          // the key past `equals`, so both `equals` and the value must shift
          // right, or the value overwrites the `=` and emits `aca9djz.k75 true`
          // with no separator (fuzz seed 46522).  A rename that SHRINKS the key
          // leaves `equals` where it was — the gap fills with the alignment
          // spaces the document already had (fuzz seed 3214 expects this).
          const keyWidthDelta = parentKey.raw.length - oldKeyRaw.length;
          if (keyWidthDelta > 0) {
            parent.equals += keyWidthDelta;
            shiftNode(parent.value, { lines: 0, columns: keyWidthDelta }, { first_line_only: true });
            // The width change also pushes the enclosing inline container's
            // end (and the closing bracket) right, plus anything a later
            // same-patch change inserts next to it.  shiftNode only moves the
            // value node itself; register an exit offset so applyWrites shifts
            // the container end and a subsequent Add measures the settled
            // position — otherwise the tail lands on the value's last
            // character (`false` -> `fals`, fuzz seed 186384).
            addExitOffset(original, parent.value, { lines: 0, columns: keyWidthDelta });
          }
          return;
        }

        throw new Error(
          `Cannot rename "${parentKey.raw}" to "${replacementKey.raw}": the replacement key has ` +
          `${replacementKey.value.length} segment(s) where the existing key has ` +
          `${parentKey.value.length}, so one cannot be substituted for the other.`
        );
      }

      // Preserve key escape style from the original key raw when renaming.
      // Example: if the original key used "\\u263A", keep that escape form
      // instead of normalizing to the raw character (☺).
      replacementKey.raw = preserveEscapedKeyRaw(parentKey.raw, replacementKey.value);
      replacementKey.loc.end.column = replacementKey.loc.start.column + replacementKey.raw.length;

      // Hand replace() whichever node actually owns the Key. For a section that is the
      // TableKey wrapper: a Table's own `.items` are its rows, so passing the Table would
      // send replace() looking for the key in the wrong array.
      const keyOwner = hasItem(parentHolder) ? parentHolder : parent;
      replace(original, keyOwner, parentKey, replacementKey);
    }
  });

  applyWrites(original);

  // Fix up blank lines between comments and materialised tables.  During
  // implicit-parent materialisation the table is renamed in place; after
  // applyWrites a spurious blank line can appear between a preceding comment
  // and the table header.  Only fix tables tracked during this patch.
  for (let i = 1; i < (original.items as TreeNode[]).length; i++) {
    const prev = original.items[i - 1];
    const curr = original.items[i];
    if (isComment(prev) && isTable(curr) && materialisedTables.has(curr)) {
      const gap = curr.loc.start.line - prev.loc.end.line - 1;
      if (gap > 0) {
        shiftNode(curr, { lines: -gap, columns: 0 });
      }
    }
  }

  // Fix up blank lines after empty tables.  Removing items from a table can
  // leave the offset chain short by one line (the last removal's contribution
  // is zeroed).  Close the extra gap to the next section so only one blank line
  // separates them.
  const rootItems = original.items as TreeNode[];
  for (let i = 0; i < rootItems.length - 1; i++) {
    const curr = rootItems[i];
    const next = rootItems[i + 1];
    if ((isTable(curr) || isTableArray(curr)) && curr.items.length === 0
        && (isTable(next) || isTableArray(next))) {
      const gap = next.loc.start.line - curr.loc.end.line - 1;
      if (gap > 1) {
        const delta = 1 - gap;
        for (let j = i + 1; j < rootItems.length; j++) {
          shiftNode(rootItems[j], { lines: delta, columns: 0 });
        }
      }
    }
  }

  // Fix up InlineTables and InlineArrays that lost their only item to
  // remove(). The exit offset that carried the closing-bracket space was
  // on the removed item and is now lost. Tighten the end column and
  // reapply bracket spacing.
  //
  // Resolve pending offsets BEFORE measuring: an earlier edit may have left
  // an exit offset on the surviving last item, so the item's pre-offset
  // position isn't where it will actually render.  Tightening against the
  // stale position leaves the container end inside the item's span, and the
  // closing bracket overwrites the item's content (fuzz seed 3780: an edit
  // plus a remove on the same inline array emitted `-312,` with `]` eating
  // the value's last digit).
  let needsTighten = false;
  traverse(original, {
    InlineTable: (node) => {
      if (hasInlineContainerNeedingTighten(node)) needsTighten = true;
    },
    InlineArray: (node) => {
      if (hasInlineContainerNeedingTighten(node)) needsTighten = true;
    }
  });
  if (needsTighten) applyWrites(original);

  let hasTightened = false;
  const tightenedInlineContainers: (InlineTable | InlineArray)[] = [];
  traverse(original, {
    InlineTable: (node) => {
      if (hasInlineContainerNeedingTighten(node)) {
        tightenedInlineContainers.push(node);
        tightenInlineContainerEnd(node);
        deleteInlineContainerNeedingTighten(node);
        applyBracketSpacing(original, node, format.bracketSpacing);
        hasTightened = true;
      }
    },
    InlineArray: (node) => {
      if (hasInlineContainerNeedingTighten(node)) {
        tightenInlineContainerEnd(node);
        deleteInlineContainerNeedingTighten(node);
        applyBracketSpacing(original, node, format.bracketSpacing);
        hasTightened = true;
      }
    }
  });
  if (hasTightened) {
    applyWrites(original);
    for (const container of tightenedInlineContainers) {
      compactInlineContainerAncestors(original, container);
    }
    // Nested inline container tightening doesn't propagate through the
    // offset system (the removed item's offset was zeroed), so parent
    // container end positions must be recalculated explicitly.
    recalcInlineContainerEnds(original);
  }

  // Clean up extracted comments that were orphaned when an inline array or
  // inline table was emptied. Comments inside multiline inline containers are
  // extracted to the Document level by the parser, but when the container is
  // emptied, those comments are no longer meaningful and must be removed.
  cleanupOrphanedComments(original);

  // Replace emptied TableArrays (array-of-tables) with inline empty arrays
  // so keys aren't silently lost (e.g. b = [] instead of disappearing).
  replaceEmptiedTableArrays(original, emptiedAotKeys, format);

  // updateOrder: reorder root key-values, section blocks, and table-body rows to match the
  // patched object's key order. Must run last — see the comment on objectMoves above.
  applyKeyOrderMoves(original, objectMoves, commentEligibleNodes);

  return original;
}

/**
 * Position of the first `[table]`/`[[array]]` header in `doc`, or -1 if there is none.
 *
 * A key-value that physically follows a section header belongs to that section, not to the
 * root table. So any path that regenerates a root-level key has to land it above the first
 * header — appending at the end of the document silently reparents it, and the value comes
 * back under the wrong key on the next parse. See
 * docs/bug-notes/comment-eligibility-on-structural-replace.md.
 */
function firstSectionHeaderIndex(doc: Document): number {
  return doc.items.findIndex(item => isTable(item) || isTableArray(item));
}

/** Index to insert a regenerated root key-value at so it stays in the root table. */
function rootKeyValueInsertIndex(doc: Document): number | undefined {
  const firstTableIndex = firstSectionHeaderIndex(doc);
  return firstTableIndex === -1 ? undefined : firstTableIndex;
}

/**
 * Moves an already-inserted root-level key-value back above the first section header, for the
 * paths that place it via `replace()` (which pins it to the replaced node's position) rather
 * than choosing an index. Also tends to reunite the key with a leading comment left behind at
 * its original position.
 */
function hoistRootKeyValueAboveTables(doc: Document, kv: KeyValue): void {
  const kvIndex = doc.items.indexOf(kv);
  if (kvIndex < 0) return;

  const firstTableIndex = firstSectionHeaderIndex(doc);
  if (firstTableIndex === -1 || firstTableIndex > kvIndex) return;

  remove(doc, doc, kv);

  // The remove() above registers a pending offset on the document, and an
  // earlier removal in the same patch (e.g. deleting the FIRST table, which
  // registers an enter offset on the document) may still be unresolved too.
  // insert() positions against the neighbouring items' loc values, which
  // carry those offsets until flushed — a stale `firstTableIndex` item then
  // drags the re-inserted KV onto a negative/phantom line and the writer
  // crashes reading `undefined.length` (fuzz seeds 358055, 362151). Resolve
  // before measuring, like every other insert that follows a removal.
  applyWrites(doc);

  insert(doc, doc, kv, firstTableIndex);
}

/**
 * The converse of hoistRootKeyValueAboveTables: an edit that turned a
 * root-level KeyValue into a Table section inserts a section header where
 * the KV was — and a section header captures every key-value that follows it
 * in the document.  If any root KV comes after the new header (and before the
 * next section), move the table below the root-table scope (fuzz seed 590:
 * `g86 = "str"` became `[g86]` while `fofc`/`y3n`/`"<w"` followed it).
 */
function sinkTableBelowRootKeyValues(doc: Document, table: Table | TableArray): void {
  const tableIndex = doc.items.indexOf(table);
  if (tableIndex < 0) return;

  const nextSectionIndex = doc.items.findIndex(
    (item, i) => i > tableIndex && (isTable(item) || isTableArray(item))
  );
  const hasFollowingRootKV = doc.items.some(
    (item, i) =>
      i > tableIndex &&
      isKeyValue(item) &&
      (nextSectionIndex === -1 || i < nextSectionIndex)
  );
  if (!hasFollowingRootKV) return;

  const target = nextSectionIndex === -1 ? doc.items.length : nextSectionIndex;
  // Flush pending offsets so the table's loc reflects its true position before
  // the remove-then-reinsert cycle; otherwise insert() measures against a stale
  // (pre-remove) anchor and can drag the table to line 0 (fuzz seed 43159).
  applyWrites(doc);
  remove(doc, doc, table);
  insert(doc, doc, table, target - 1);
}

/**
 * Handles structural edits where findByPath can't resolve the existing CST node
 * because the structure type has changed (e.g. table→scalar, AOT→scalar, array→empty).
 * Swaps the fresh key-value in for the old structural nodes.
 */
function handleStructuralEdit(
  original: Document,
  updated: Document,
  change: Change,
  format: TomlFormat,
  temporal: boolean,
  commentEligibleNodes: WeakSet<TreeNode>,
  materialisedTables: Set<Table>
): void {
  const updated_js = toJS(updated.items, '', { temporal });
  let jsValue: any = updated_js;
  for (const key of change.path) {
    jsValue = jsValue?.[key];
  }

  if (jsValue === undefined) return;

  // An object→scalar (or object→array) edit under an array-of-tables entry:
  // the path carries the entry's numeric index (e.g. ['', 0, ':h9q=2`aO']),
  // which document-level keys never do.  The generic prefix scan below can't
  // find the old sub-table/[[sub-array]] entries (their keys lack the index),
  // so they survive and collide with the rebuilt value — and rebuilding from
  // the root would emit a `[""]` table next to the surviving [[[""]]] array,
  // failing the re-parse with "Cannot add Array of Tables to table"
  // (fuzz seed 6409).  Handle it inside the entry instead: drop the old
  // sub-entries and insert a fresh key-value for the changed segment.
  {
    const aotIndexPos = change.path.findIndex(seg => typeof seg === 'number');
    if (aotIndexPos > 0 && change.path.slice(aotIndexPos + 1).every(seg => typeof seg === 'string')) {
      const entry = tryFindByPath(original, change.path.slice(0, aotIndexPos + 1));
      if (entry && isTableArray(entry)) {
        const entryKey = (entry as TableArray).key.item.value;
        const changedKey = change.path.slice(aotIndexPos + 1) as string[];

        // Remove old sub-tables/[[sub-arrays]] extending entryKey + changedKey
        // (the previous object value's children), and any dotted-key rows
        // inside the entry that start with the changed segment.
        const toRemove = findDocumentItemsByKeyPrefix(original, entryKey.concat(changedKey));
        for (const prefixNode of toRemove) {
          removeMember(original, original, prefixNode);
        }
        const entryItems = (entry as TableArray).items as TreeNode[];
        const inlineToRemove = entryItems.filter(item => {
          const key = isKeyValue(item) ? item.key.value : undefined;
          return key
            && key.length > changedKey.length
            && arraysEqual(key.slice(0, changedKey.length), changedKey);
        });
        for (const item of inlineToRemove) {
          removeMember(original, entry, item);
        }

        // Rebuild the tail of the path as a fresh KV (or KVs) and insert
        // into the entry.
        let tail: any = jsValue;
        for (let k = change.path.length - 1; k > aotIndexPos; k--) {
          tail = { [change.path[k]]: tail };
        }
        const tailDoc = parseJS(tail, format);
        const tailToml = toTOML(tailDoc.items, format);
        const tailCst = Array.from(parseTOML(tailToml));

        const upsertEntryKeyValue = (kv: KeyValue): void => {
          const existingRow = (entry as TableArray).items.find(row =>
            isKeyValue(row) && arraysEqual(row.key.value, kv.key.value)
          );
          if (existingRow) {
            replace(original, entry as TableArray, existingRow, kv);
          } else {
            insert(original, entry, kv, undefined);
          }
        };

        for (const item of tailCst) {
          if (isKeyValue(item)) {
            upsertEntryKeyValue(item);
            continue;
          }

          // parseJS may materialize the replacement tail as a Table section
          // (`[rw109]\nkjzi = ...`) under inlineTableStart defaults. For an
          // edit scoped to a specific AOT entry, flatten section rows back to
          // dotted KVs relative to that entry (fuzz seed 1657445).
          if (isTable(item)) {
            const tableKey = (item as Table).key.item.value;
            for (const row of (item as Table).items as TreeNode[]) {
              if (!isKeyValue(row)) continue;

              const oldRaw = row.key.raw;
              const dotted = tableKey.concat(row.key.value);
              row.key.value = dotted;
              row.key.raw = generateKey(dotted).raw;
              const delta = row.key.raw.length - oldRaw.length;
              row.key.loc.end.column = row.key.loc.start.column + row.key.raw.length;
              row.equals += delta;
              shiftNode(row.value, { lines: 0, columns: delta }, { first_line_only: true });
              if (row.loc.end.line === row.loc.start.line) {
                row.loc.end.column += delta;
              }

              upsertEntryKeyValue(row);
            }
          }
        }
        return;
      }
    }
  }

  // Build a nested object matching the change path.
  let nested: any = jsValue;
  for (let i = change.path.length - 1; i >= 0; i--) {
    nested = { [change.path[i]]: nested };
  }

  // Remove old nodes matching the key prefix.
  const prefixNodes = findDocumentItemsByKeyPrefix(original, change.path);
  for (const prefixNode of prefixNodes) {
    remove(original, original, prefixNode);
  }

  // Generate the replacement as CST, round-trip through TOML string to get
  // properly positioned nodes, then parse back. This avoids issues with
  // parseJS's formatting pipeline (formatEmptyLines, etc.) interacting poorly
  // with insert().
  const freshDoc = parseJS(nested, format);
  const replacementToml = toTOML(freshDoc.items, format);
  const replacementCst = Array.from(parseTOML(replacementToml));

  // Insert above the first remaining section header: a key-value placed after one would
  // bind to that section instead of the root table.
  const insertIndex = rootKeyValueInsertIndex(original);

  // Only when a header actually survives the removals. In that case the replacement is
  // prepended above it rather than appended to an emptied document, and insert() positions
  // it against its neighbours' loc values — which still carry the removals' pending offsets
  // until flushed, leaving the emitted node pointing past the end of the output buffer.
  if (insertIndex !== undefined) applyWrites(original);

  // parseJS can render the nested value as MORE than one root item — e.g. a
  // [section] followed by the key-values that belong to it when the depth
  // exceeds inlineTableStart (fuzz seed 724: { n: { h9nvi6w: { gfjsfiy } } }
  // came back as `[n]` + `h9nvi6w = { … }`).  Insert ALL of them, in order;
  // dropping everything after the first lost the value entirely.
  let firstInserted: TreeNode | undefined;
  for (let i = 0; i < replacementCst.length; i++) {
    const item = replacementCst[i];
    // The replacement can re-render a table header whose key is ALREADY
    // present in the document: the prefix cleanup above removed a sibling
    // structure (e.g. an [[array]] header) for the same logical parent, but
    // an explicit [table] with that key survives.  Inserting the rendered
    // header would duplicate it and fail the re-parse with "Table already
    // defined" (fuzz seed 1219).  Merge the rendered rows into the
    // surviving table instead.
    const existingTable = isTable(item)
      ? (original.items as TreeNode[]).find(t =>
        isTable(t) && arraysEqual((t as Table).key.item.value, (item as Table).key.item.value))
      : undefined;
    if (existingTable) {
      for (const row of (item as Table).items as TreeNode[]) {
        insert(original, existingTable, row, undefined);
      }
      if (!firstInserted) firstInserted = existingTable;
      continue;
    }

    // A regenerated inline-table key-value (`n = { "{&>*b0M" = -3566 }`)
    // can collide with a surviving explicit `[n]` section that still owns
    // unrelated keys.  Re-emitting the inline table defines `n` twice, and
    // the `[n]` header then tries to extend the inline table, failing the
    // re-parse with "Cannot extend inline table" (fuzz seed 37465).  Merge
    // the inline table's rows into the surviving section instead.
    if (isKeyValue(item) && isInlineTable(item.value)) {
      const kvKey = item.key.value;
      const survivingTable = (original.items as TreeNode[]).find(t =>
        isTable(t) && arraysEqual((t as Table).key.item.value, kvKey));
      if (survivingTable) {
        for (const row of ((item.value as InlineTable).items as TreeNode[])) {
          // Inline-table rows arrive as InlineItem wrappers; unwrap them so
          // they land as plain KeyValues inside the block table.
          const rowNode = isInlineItem(row) ? row.item : row;
          insert(original, survivingTable, rowNode, undefined);
        }
        if (!firstInserted) firstInserted = survivingTable;
        continue;
      }

      // The inline table's key can also be a prefix of a surviving IMPLICIT
      // table expressed through dotted key-values (`a = { l1 = -4489 }`
      // colliding with `a.p37xq = …`): re-emitting the inline table defines
      // `a` twice and fails the re-parse with "Table already defined"
      // (fuzz seed 43199).  Convert each inline-table row to a dotted KV
      // under that prefix and insert those at the root scope instead.
      // The implicit table can equally be expressed through a section header
      // (`"" = { b = 5 }` colliding with `["".a]`, fuzz seed 68244), so any
      // sibling whose key extends `kvKey` counts — not just dotted key-values.
      const implicitSiblings = findDocumentItemsByKeyPrefix(original, kvKey)
        .filter(t => isKeyValue(t) || isTable(t) || isTableArray(t));
      if (implicitSiblings.length > 0) {
        for (const row of ((item.value as InlineTable).items as TreeNode[])) {
          const rowNode = isInlineItem(row) ? row.item : row;
          if (isKeyValue(rowNode)) {
            const oldRaw = rowNode.key.raw;
            const dotted = kvKey.concat(rowNode.key.value);
            rowNode.key.value = dotted;
            rowNode.key.raw = dotted
              .map(part => IS_BARE_KEY.test(part) ? part : JSON.stringify(part).replace(/\x7f/g, '\\u007f'))
              .join('.');
            const delta = rowNode.key.raw.length - oldRaw.length;
            rowNode.key.loc.end.column = rowNode.key.loc.start.column + rowNode.key.raw.length;
            rowNode.equals += delta;
            shiftNode(rowNode.value, { lines: 0, columns: delta }, { first_line_only: true });
            if (rowNode.loc.end.line === rowNode.loc.start.line) {
              rowNode.loc.end.column += delta;
            }
          }
          insert(original, original, rowNode, i === 0 ? insertIndex : undefined);
          if (!firstInserted) firstInserted = rowNode;
        }
        continue;
      }
    }

    // The rendered section may instead collide with an IMPLICIT table: the
    // document expresses that key through dotted key-values (`"".a = 1`
    // defines the "" table without a header).  Re-emitting the header
    // would conflict with the implicit definition and fail the re-parse
    // with "Implicit table already defined" (fuzz seed 1898).  Convert
    // each rendered row to a dotted KV under the same prefix and insert
    // those at the root scope instead.
    if (isTable(item)) {
      const tableKey = (item as Table).key.item.value;
      const implicitChildren = findDocumentItemsByKeyPrefix(original, tableKey)
        .filter(t => isKeyValue(t));
      if (implicitChildren.length > 0) {
        for (const row of (item as Table).items as TreeNode[]) {
          if (isKeyValue(row)) {
            const oldRaw = row.key.raw;
            const dotted = tableKey.concat(row.key.value);
            row.key.value = dotted;
            row.key.raw = dotted
              .map(part => IS_BARE_KEY.test(part) ? part : JSON.stringify(part).replace(/\x7f/g, '\\u007f'))
              .join('.');
            const delta = row.key.raw.length - oldRaw.length;
            row.key.loc.end.column = row.key.loc.start.column + row.key.raw.length;
            row.equals += delta;
            // Shifting only the value's own start/end leaves its inner rows
            // (absolute columns) behind — an inline table's first row then
            // overwrites the opening brace (fuzz seed 7443).  Shift the
            // whole first line of the value subtree.
            shiftNode(row.value, { lines: 0, columns: delta }, { first_line_only: true });
            if (row.loc.end.line === row.loc.start.line) {
              row.loc.end.column += delta;
            }
          }
          insert(original, original, row, i === 0 ? insertIndex : undefined);
          if (!firstInserted) firstInserted = row;
        }
        continue;
      }
    }

    // Subsequent key-value rows belong INSIDE the freshly inserted section
    // header, not after it at document level: appending at the end leaves
    // them past unrelated later sections, which capture them on re-parse
    // (fuzz seed 7379: `aw3axx = {…}` landed inside [[y-g]]).
    if (i > 0 && firstInserted && isTable(firstInserted) && isKeyValue(item)) {
      insert(original, firstInserted, item, undefined);
    } else {
      insert(original, original, item, i === 0 ? insertIndex : undefined);
    }
    if (!firstInserted) firstInserted = item;
  }

  const replacementKV = firstInserted as KeyValue;

  // Track for blank-line fixup after applyWrites.
  if (isTable(replacementKV)) {
    materialisedTables.add(replacementKV);
  }

  // replacementKV stands in for a pre-existing entry, so it keeps that entry's R2
  // eligibility for adopting an adjacent leading comment during an updateOrder reorder.
  commentEligibleNodes.add(replacementKV);
}

/**
 * Tighten the end column of a single-line InlineTable or InlineArray whose
 * only item was removed by remove(). When items remain, the end is tightened
 * to just after the last item; when empty, to start + 2 so brackets touch
 * (e.g. `[]` or `{}`). loc.end is exclusive.
 */
function tightenInlineContainerEnd(node: InlineTable | InlineArray): void {
  if (node.items.length > 0) {
    const lastItem = node.items[node.items.length - 1];
    node.loc.end.column = lastItem.loc.end.column + 1;
  } else {
    // The end must land on the container's own line: a multiline container
    // that was emptied by zeroing the removal offset still carries its old
    // end line (fuzz seed 5522), and tightening only the column would leave
    // the bracket floating below the `[]`.
    node.loc.end.line = node.loc.start.line;
    node.loc.end.column = node.loc.start.column + 2;
  }
}

function compactInlineContainerAncestors(
  root: TreeNode,
  target: InlineTable | InlineArray
): void {
  const path: TreeNode[] = [];
  const locate = (node: TreeNode): boolean => {
    path.push(node);
    if (node === target) return true;
    if (isKeyValue(node)) {
      if (locate(node.value)) return true;
    } else if (isInlineItem(node)) {
      if (locate(node.item)) return true;
    } else if (hasItems(node)) {
      for (const item of node.items as TreeNode[]) {
        if (locate(item)) return true;
      }
    }
    path.pop();
    return false;
  };

  if (!locate(root)) return;
  const enclosingRow = path.findLast(isInlineItem);
  if (!enclosingRow) return;
  const lineDelta = target.loc.end.line - enclosingRow.loc.end.line;
  if (lineDelta === 0) return;

  const inlineContainerIndex = path.findLastIndex(
    (node, index) => index < path.length - 1 && (isInlineTable(node) || isInlineArray(node))
  );
  if (inlineContainerIndex < 0) return;
  const inlineContainer = path[inlineContainerIndex] as InlineTable | InlineArray;
  const child = path[inlineContainerIndex + 1];
  const childIndex = inlineContainer.items.indexOf(child as never);
  const next = childIndex >= 0 ? inlineContainer.items[childIndex + 1] as TreeNode | undefined : undefined;
  if (childIndex < 0 || !next) return;

  const gap = next.loc.start.column - child.loc.end.column;
  const columnDelta = resolveInnerEndCol(child) + gap - next.loc.start.column;
  for (let i = childIndex + 1; i < inlineContainer.items.length; i++) {
    shiftNode(inlineContainer.items[i], { lines: lineDelta, columns: columnDelta });
  }
  inlineContainer.loc.end.column += columnDelta;
  for (const node of path) {
    if (node !== target && node.loc.end.line > target.loc.end.line) {
      node.loc.end.line += lineDelta;
    }
  }

  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i];
    if (isKeyValue(node)) {
      node.loc.end = { ...node.value.loc.end };
      if (node.value !== target && isInlineTable(node.value)) {
        node.loc.end.column += columnDelta;
      }
    } else if (isInlineItem(node)) {
      node.loc.end = { ...node.item.loc.end };
    }
  }
}

/**
 * After tightening a nested single-line InlineTable (whose only item was
 * removed), recalculate the end positions of any parent single-line InlineTable
 * or InlineArray containers. The remove() call zeroed the offset for the
 * removed item (single-line, no siblings), so applyWrites can't propagate the
 * shrink to ancestor containers.
 */
function recalcInlineContainerEnds(root: TreeNode): void {
  traverse(root, {
    InlineTable: {
      exit: (node) => {
        if (node.items.length === 0) return;
        if (node.loc.end.line !== node.loc.start.line) return;
        const lastItem = node.items[node.items.length - 1];
        const innerEndCol = resolveInnerEndCol(lastItem);
        const originalEndCol = node.loc.end.column;
        // Preserve the original gap (bracket spacing etc.) between the
        // last item's InlineItem end and the closing brace.
        const originalGap = originalEndCol - lastItem.loc.end.column;
        const newEndCol = innerEndCol + originalGap;
        if (newEndCol !== originalEndCol) {
          node.loc.end.column = newEndCol;
        }
      }
    },
    InlineArray: {
      exit: (node) => {
        if (node.items.length === 0) return;
        if (node.loc.end.line !== node.loc.start.line) return;
        const lastItem = node.items[node.items.length - 1];
        const innerEndCol = resolveInnerEndCol(lastItem);
        const originalEndCol = node.loc.end.column;
        const originalGap = originalEndCol - lastItem.loc.end.column;
        const newEndCol = innerEndCol + originalGap;
        if (newEndCol !== originalEndCol) {
          node.loc.end.column = newEndCol;
        }
      }
    }
  });
}

/**
 * Resolve the effective end column of an InlineItem's inner value,
 * looking through KeyValue wrappers and into tightened InlineTable or
 * InlineArray containers. Returns lastItem.loc.end.column for items
 * that don't need or support look-through.
 */
function resolveInnerEndCol(lastItem: TreeNode): number {
  if (!isInlineItem(lastItem)) return lastItem.loc.end.column;

  // InlineTable items: InlineItem<KeyValue> — look through to the value
  if (isKeyValue(lastItem.item)) {
    const v = lastItem.item.value;
    if (isInlineTable(v) || isInlineArray(v)) {
      return v.loc.end.column;
    }
  }

  // InlineArray items: InlineItem<InlineTable|InlineArray> — direct look-through
  if (isInlineTable(lastItem.item) || isInlineArray(lastItem.item)) {
    return lastItem.item.loc.end.column;
  }

  return lastItem.loc.end.column;
}

/**
 * Removes Comment nodes that were extracted from inside an InlineArray
 * when that array has been emptied.
 * 
 * When a multiline inline array has interior comments (e.g. `arr = [\n  1, # one\n  2, # two\n]`),
 * the parser extracts the comments to the parent Document level as siblings of the KeyValue.
 * If the array is later emptied, these comments become orphaned and must be removed
 * to produce valid TOML output.
 * 
 * This does NOT apply to InlineTables, where interior comments are meaningful
 * section-level comments that should be preserved even when the table is empty.
 */
function cleanupOrphanedComments(doc: Document): void {
  traverse(doc, {
    KeyValue: (kv) => {
      const value = kv.value;
      // Only clean up inline arrays, not inline tables
      if (!isInlineArray(value)) return;
      if (value.items.length > 0) return;

      // Find the parent container (Document or Table) that holds this KeyValue
      const parentContainer = findParent(doc, [kv.key.value[0]]);
      if (!parentContainer || !hasItems(parentContainer)) return;

      const kvStartLine = kv.loc.start.line;
      const kvEndLine = kv.loc.end.line;

      // Remove any Comment nodes in the parent that fall within the KeyValue's range
      const items = (parentContainer as WithItems).items as TreeNode[];
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (!isComment(item)) continue;
        const commentLine = item.loc.start.line;
        if (commentLine >= kvStartLine && commentLine <= kvEndLine) {
          items.splice(i, 1);
        }
      }
    }
  });
}

/**
 * Replaces emptied TableArrays with inline empty array key-values so that
 * keys aren't silently lost when all AOT entries are removed (e.g. b = []).
 */
function replaceEmptiedTableArrays(doc: Document, emptiedKeys: Map<string, string[]>, format: TomlFormat): void {
  if (emptiedKeys.size === 0) return;

  for (const path of emptiedKeys.values()) {
    // A nested AOT (e.g. `[["".Lpfz,]]` emptied inside `[[""]]`) must be
    // re-materialised as a row INSIDE its parent AOT entry (`Lpfz, = []`),
    // not as a root dotted key `"".Lpfz, = []` — that dotted key defines `""`
    // as an implicit table and collides with the surviving `[[""]]` header on
    // re-parse ("Implicit table already defined", fuzz seed 62163).
    if (path.length > 1) {
      const parentEntry = tryFindByPath(doc, (path.slice(0, -1) as Path).concat([0]));
      if (parentEntry && isTableArray(parentEntry)) {
        const lastSegment = path[path.length - 1];
        const emptyArrayDoc = parseJS({ [lastSegment]: [] }, format);
        const emptyKV = generateKeyValue([lastSegment], (emptyArrayDoc.items[0] as KeyValue).value);
        // The removal that emptied the array left pending line offsets on the
        // preceding siblings — flush first (same discipline as the root case,
        // fuzz seed 7379).
        applyWrites(doc);
        insert(doc, parentEntry, emptyKV);
        continue;
      }

      // An AOT declared inside an explicit [table] (e.g. `[["".b.c]]` under
      // `[""]`) must be re-materialised inside that table with a RELATIVE
      // key (`b.c = []`).  Materialising it as a root dotted key `"".b.c = []`
      // defines `""` as an implicit table and collides with the surviving
      // `[""]` header on re-parse ("Implicit table already defined", fuzz
      // seed 67221).
      let hostTable: Table | undefined;
      for (let len = path.length - 1; len >= 1; len--) {
        const ancestor = tryFindByPath(doc, path.slice(0, len));
        if (ancestor && isTable(ancestor)) {
          hostTable = ancestor;
          break;
        }
      }
      if (hostTable) {
        const relativeKey = path.slice(hostTable.key.item.value.length);
        const emptyArrayDoc = parseJS({ [relativeKey[relativeKey.length - 1]]: [] }, format);
        const emptyKV = generateKeyValue(relativeKey, (emptyArrayDoc.items[0] as KeyValue).value);
        applyWrites(doc);
        insert(doc, hostTable, emptyKV);
        continue;
      }
    }

    // Build the key from its segments rather than a joined string: `parseJS({ 'a.b': [] })`
    // reads the dot as part of a single JS key and emits the quoted `"a.b" = []`, which is a
    // root key literally named `a.b` instead of `b` nested under `a`.
    const emptyArrayDoc = parseJS({ [path[path.length - 1]]: [] }, format);
    const emptyKV = generateKeyValue(path, (emptyArrayDoc.items[0] as KeyValue).value);
    // The removal that emptied the array left pending line offsets on the
    // preceding siblings.  Inserting against their pre-offset locs and only
    // then resolving drags the new KV up past line 1 — a negative render
    // position (fuzz seed 7379).  Flush first, like every other insert that
    // follows removals in the same patch.
    applyWrites(doc);
    insert(doc, doc, emptyKV, rootKeyValueInsertIndex(doc));
  }
  applyWrites(doc);
}

/**
 * Converts nested inline tables to separate table sections based on the inlineTableStart depth setting.
 * This function recursively processes a table and extracts any inline tables within it,
 * creating separate table sections with properly nested keys.
 * 
 * @param table - The table to process for nested inline tables
 * @param original - The original document for inserting new items
 * @param format - The formatting options
 * @returns Array of additional tables that should be added to the document
 */
function convertNestedInlineTablesToMultiline(table: Table, original: Document, format: TomlFormat): Table[] {
  const additionalTables: Table[] = [];
  
  const processTableForNestedInlines = (currentTable: Table, tablesToAdd: Table[]) => {
    for (let i = currentTable.items.length - 1; i >= 0; i--) {
      const item = currentTable.items[i];
      if (isKeyValue(item) && isInlineTable(item.value)) {
        // Calculate the depth of this nested table
        const nestedTableKey = [...currentTable.key.item.value, ...item.key.value];
        const depth = calculateTableDepth(nestedTableKey);
        
        // Only convert to separate table if depth is less than inlineTableStart
        if (depth < (format.inlineTableStart ?? 1) && format.inlineTableStart !== 0) {
          // Convert this inline table to a separate table section
          const separateTable = generateTable(nestedTableKey);
          
          // Move all items from the inline table to the separate table
          for (const inlineItem of item.value.items) {
            if (isInlineItem(inlineItem) && isKeyValue(inlineItem.item)) {
              insert(original, separateTable, inlineItem.item, undefined);
            }
          }
          
          // Remove this item from the original table
          currentTable.items.splice(i, 1);
          
          // Update the parent table's end position after removal
          postInlineItemRemovalAdjustment(currentTable);
          
          // Queue this table to be added to the document
          tablesToAdd.push(separateTable);
          
          // Recursively process the new table for further nested inlines
          processTableForNestedInlines(separateTable, tablesToAdd);
        }
      }
    }
  };
  
  processTableForNestedInlines(table, additionalTables);
  return additionalTables;
}

/**
 * Converts an inline table to a separate table section when adding to an existing table.
 * This function creates a new table section with the combined key path and moves all
 * properties from the inline table to the separate table section.
 * 
 * @param child - The KeyValue node with an InlineTable as its value
 * @param parent - The parent table where the KeyValue would be added
 * @param original - The original document for inserting new items
 * @param format - The formatting options
 */
function convertInlineTableToSeparateSection(child: KeyValue, parent: Table, original: Document, format: TomlFormat): void {
  // Convert the inline table to a separate table section
  const baseTableKey = parent.key.item.value; // Get the parent table's key path
  const nestedTableKey = [...baseTableKey, ...child.key.value]; // Combine with the new key
  const separateTable = generateTable(nestedTableKey);
  
  // We know child.value is an InlineTable from the calling context
  if (isInlineTable(child.value)) {
    // Move all items from the inline table to the separate table
    for (const inlineItem of child.value.items) {
      if (isInlineItem(inlineItem) && isKeyValue(inlineItem.item)) {
        insert(original, separateTable, inlineItem.item, undefined);
      }
    }
  }
  
  // Add the separate table to the document
  insert(original, original, separateTable, undefined);
  
  // Update the parent table's end position since we're not adding the inline table to it
  postInlineItemRemovalAdjustment(parent);
  
  // Also handle any nested inline tables within the new table
  const additionalTables = convertNestedInlineTablesToMultiline(separateTable, original, format);
  for (const table of additionalTables) {
    insert(original, original, table, undefined);
  }
}

/**
 * Regenerate a replacement Value node with clean loc values through a
 * TOML round-trip.  Handles both KeyValue and Table output from parseJS
 * (formatTopLevel may convert a root-level key to a [section] when
 * inlineTableStart is 0).  Returns undefined when the value cannot be
 * safely regenerated.
 */
function regenerateValue(jsValue: any, format: TomlFormat): Value | undefined {
  // Always render inline: with the caller's inlineTableStart, parseJS may
  // flatten a nested object into dotted keys (`__tmp__.k28 = …`), and taking
  // the first item's value then returns the scalar instead of the object
  // (fuzz seed 735: a restored nested value collapsed to its first leaf).
  const inlineFmt = resolveTomlFormat({ ...format, inlineTableStart: 0 }, format);
  const freshDoc = parseJS({ __tmp__: jsValue }, inlineFmt);
  const replacementToml = toTOML(freshDoc.items, inlineFmt);
  const replacementCst = Array.from(parseTOML(replacementToml));
  const freshItem = replacementCst[0];
  if (isKeyValue(freshItem)) return freshItem.value;
  if (isTable(freshItem)
      && freshItem.items.length > 0
      && isKeyValue(freshItem.items[0])) return freshItem.items[0].value;
  return undefined;
}

function findEnclosingInlineTableRowContext(
  document: Document,
  path: Array<string | number>
): { container: TreeNode; row: KeyValue } | undefined {
  for (let i = path.length - 1; i > 0; i--) {
    const candidate = tryFindByPath(document, path.slice(0, i));
    if (!candidate || !isKeyValue(candidate) || !isInlineTable(candidate.value)) continue;

    const container = tryFindByPath(document, path.slice(0, i - 1));
    if (container && hasItems(container)) {
      return { container, row: candidate };
    }
  }
}

/**
 * Finds all Document-level items whose key path starts with the given prefix.
 * This handles implicit intermediate keys — keys that are a prefix of a dotted
 * table key but have no CST node of their own (e.g. path ["references"] when
 * only ["references", "VBIDE"] exists in the document).
 */
function findDocumentItemsByKeyPrefix(
  document: Document,
  pathPrefix: Array<string | number>
): Block[] {
  const matchingNodes: Block[] = [];
  for (const item of document.items) {
    let key: string[] | undefined;
    if (isKeyValue(item)) {
      key = item.key.value;
    } else if (isTable(item)) {
      key = item.key.item.value;
    } else if (isTableArray(item)) {
      key = item.key.item.value;
    }

    if (key && arraysEqual(key.slice(0, pathPrefix.length), pathPrefix)) {
      matchingNodes.push(item);
    }
  }
  return matchingNodes;
}

/**
 * Converts a JS-object change path into CST key coordinates by dropping the
 * numeric array-of-tables entry indices.  The diff walks the JS object, so a
 * path into an AOT entry interleaves the entry's numeric index (e.g. `["", 0,
 * "fv"]`), but CST keys carry no such index — `[[""]]` entries live at the
 * document level and their sub-tables are keyed `["", "fv"]`.  A numeric
 * segment is an AOT entry index when the accumulated path is a document-level
 * TableArray key; inline-array indices (which ARE part of the CST path) never
 * resolve to a document-level TableArray.
 */
function stripAotEntryIndices(original: Document, jsPath: Path): Path {
  const cstPath: Path = [];
  for (const seg of jsPath) {
    if (typeof seg === 'number') {
      const isAotIndex = findDocumentItemsByKeyPrefix(original, cstPath).some(isTableArray);
      if (isAotIndex) continue;
    }
    cstPath.push(seg);
  }
  return cstPath;
}

/**
 * Removes sibling key-values and table/table-array sections whose key extends
 * `prefix` (i.e. `prefix` is a strict prefix of the sibling's key) from
 * `container`'s items, leaving `keep` untouched.  Used when a key collapses to
 * a scalar: any dotted-key or section that still nests under it would re-define
 * the key on re-parse ("Value already defined").
 *
 * Iterates a snapshot of the items because `removeMember` splices the live
 * array (fuzz seed 31662).
 */
function removeSiblingsExtendingPrefix(
  original: Document,
  container: Table | Document | TableArray,
  prefix: Array<string | number>,
  keep: TreeNode
): void {
  const parentItems = [...container.items] as Block[];
  for (let si = parentItems.length - 1; si >= 0; si--) {
    const sibling = parentItems[si];
    if (sibling === keep) continue;
    const siblingKey = isKeyValue(sibling)
      ? sibling.key.value
      : isTable(sibling) || isTableArray(sibling)
        ? sibling.key.item.value
        : undefined;
    if (siblingKey
        && siblingKey.length > prefix.length
        && arraysEqual(siblingKey.slice(0, prefix.length), prefix)) {
      removeMember(original, container, sibling);
    }
  }
}
