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
import { insert, replace, remove, applyWrites, applyBracketSpacing, hasInlineContainerNeedingTighten, deleteInlineContainerNeedingTighten, shiftNode, recalcContainerEnd, addExitOffset } from './writer';
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

  // Certain formatting options should not be applied to the updated document during patching, because it would
  // override the existing formatting too aggressively. For example, preferNestedTablesMultiline would
  // convert all nested tables to multiline, which is not be desired during patching.
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
    diff(existing_js, updated_js, [], { updateOrder: format.updateOrder })
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
      let j = i + 1;
      while (j < changes.length) {
        const next_change = changes[j];
        if (!isRemove(next_change)) { j++; continue; }

        const aIdx = last(change.path);
        const bIdx = last(next_change.path);
        const aPrefix = change.path.slice(0, -1);
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

    const staysAllObjects = value.every(el => el !== null && typeof el === 'object' && !Array.isArray(el));
    if (staysAllObjects) continue;

    for (const change of changes) {
      if (consumed.has(change)) continue;
      if (!isEdit(change) && !isAdd(change) && !isRemove(change)) continue;
      if (change.path.length !== prefix.length + 1) continue;
      if (!arraysEqual(change.path.slice(0, -1), prefix)) continue;
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
      lastItem.comma = originalHadTrailingCommas;
    }
  }
  
  // Preserve inline table trailing comma format
  if (isInlineTable(existing) && isInlineTable(replacement)) {
    const originalHadTrailingCommas = tableHadTrailingCommas(existing);
    if (replacement.items.length > 0) {
      const lastItem = replacement.items[replacement.items.length - 1];
      lastItem.comma = originalHadTrailingCommas;
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
    if (cached) return cached;
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
    if (result) absolutePathCache.set(target, result);
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
    const abs = absolutePathOf(kv);
    return abs !== undefined && abs.length > probe.length;
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
    child.value.loc.start.column += colDelta;
    if (child.value.loc.end.line === child.value.loc.start.line) {
      child.value.loc.end.column += colDelta;
    }
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
        }
        // Special handling for adding KeyValue to InlineTable
        // Preserve original trailing comma format
        const originalHadTrailingCommas = tableHadTrailingCommas(parent);
        // InlineTable items must be wrapped in InlineItem
        if (isKeyValue(child)) {
          const inlineItem = generateInlineItem(child);
          // Override with the original table's format
          inlineItem.comma = originalHadTrailingCommas;
          insert(original, parent, inlineItem, undefined, undefined, inlineHostItems);
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
          insert(original, parent, inlineItem, undefined, undefined, inlineHostItems);
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
          insert(original, parent, childToInsert);
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

      let parent;
      const containerParent = tryFindByPath(original, change.path.slice(0, -1));
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
          let matchLen = 0;
          const max = Math.min(change.path.length, existing.key.value.length);
          for (let i = 1; i <= max; i++) {
            if (arraysEqual(
              change.path.slice(change.path.length - i) as string[],
              existing.key.value.slice(0, i)
            )) {
              matchLen = i;
            }
          }
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
              const parentItems = (containerParent as Table | Document | TableArray).items as Block[];
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
          let matchLen = 0;
          const max = Math.min(change.path.length, existing.key.value.length);
          for (let i = 1; i <= max; i++) {
            if (arraysEqual(
              change.path.slice(change.path.length - i) as string[],
              existing.key.value.slice(0, i)
            )) {
              matchLen = i;
            }
          }
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
              const parentItems = (containerParent as Table | Document | TableArray).items as Block[];
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
          let matchLen = 0;
          const max = Math.min(change.path.length, existingKeyValue.key.value.length);
          for (let i = 1; i <= max; i++) {
            if (arraysEqual(
              change.path.slice(change.path.length - i) as string[],
              existingKeyValue.key.value.slice(0, i)
            )) {
              matchLen = i;
            }
          }
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
          let matchLen = 0;
          const max = Math.min(change.path.length, existingKV.key.value.length);
          for (let i = 1; i <= max; i++) {
            if (arraysEqual(
              change.path.slice(change.path.length - i) as string[],
              existingKV.key.value.slice(0, i)
            )) {
              matchLen = i;
            }
          }
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
          const tableParent = findParent(original, change.path);

          // Regenerate a fresh KV using parseJS on just the single key-value
          const freshDoc = parseJS({ [lastSegment[0]]: jsValue }, format);
          const freshKV = freshDoc.items[0] as KeyValue;

          if (parentKey.length > 0) {
            const newTable = generateTable(parentKey);
            materialisedTables.add(newTable);
            insert(original, newTable, freshKV, 0);
            replace(original, tableParent, existing, newTable);
            // newTable stands in for the pre-existing `existing` table, so it should stay
            // eligible for the leading comment run `existing` would have owned via R2.
            commentEligibleNodes.add(newTable);
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
        for (const key of change.path.slice(0, existingAotKey.length)) {
          jsValue = jsValue?.[key];
        }

        if (jsValue !== undefined) {
          const lastSegment = existingAotKey.slice(-1);
          const parentKey = existingAotKey.slice(0, -1);
          const tableParent = findParent(original, change.path);

          // Regenerate a fresh KV using parseJS on just the single key-value
          const freshDoc = parseJS({ [lastSegment[0]]: jsValue }, format);
          const freshKV = freshDoc.items[0] as KeyValue;

          if (parentKey.length > 0) {
            const newTable = generateTable(parentKey);
            materialisedTables.add(newTable);
            insert(original, newTable, freshKV, 0);
            replace(original, tableParent, existing, newTable);
            // newTable stands in for the pre-existing `existing` AOT, so it should stay
            // eligible for the leading comment run `existing` would have owned via R2.
            commentEligibleNodes.add(newTable);
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
                const insertIdx = firstIndex >= 0 ? firstIndex : original.items.length;
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
          // starts with the change path and remove them.
          const prefixNodes = findDocumentItemsByKeyPrefix(original, change.path);
          if (prefixNodes.length > 0) {
            const firstPrefixIndex = (original.items as TreeNode[]).indexOf(prefixNodes[0]);
            for (const prefixNode of prefixNodes) {
              removeMember(original, original, prefixNode);
            }
            // When the removed prefix items were the sole children of an
            // implicit parent (e.g. [mhv6z.hpd_iu9zs5."2<w"] removed at
            // path [mhv6z, hpd_iu9zs5] -> { mhv6z: {} }), materialise the
            // parent as an empty table so the key isn't dropped (seed 176).
            if (change.path.length > 1 && rawUpdated !== undefined) {
              const parentPath = change.path.slice(0, -1);
              const remainingSiblings = findDocumentItemsByKeyPrefix(original, parentPath);
              if (remainingSiblings.length === 0) {
                let value: any = rawUpdated;
                for (const k of parentPath) value = value?.[k];
                if (isObject(value) && Object.keys(value).length === 0) {
                  const emptyTable = generateTable(parentPath as string[]);
                  materialisedTables.add(emptyTable);
                  const insertIdx = firstPrefixIndex >= 0 ? firstPrefixIndex : original.items.length;
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
          const remainingSiblings = findDocumentItemsByKeyPrefix(original, parentPath)
            .filter(s => s !== node);
          if (remainingSiblings.length === 0) {
            let value: any = rawUpdated;
            for (const k of parentPath) value = value?.[k];
            if (isObject(value) && Object.keys(value).length === 0) {
              const table = node as Table;
              while (table.items.length > 0) {
                remove(original, table, last(table.items as TreeNode[])!);
              }
              const keyHolder = table.key;
              const key = hasItem(keyHolder) ? keyHolder.item : keyHolder;
              key.value = parentPath as string[];
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

        if (!materialisedInPlace) {
          removeMember(original, parent, node);
        }

        // When removing a node whose key has an implicit parent, check whether
        // the parent should survive as an empty table header.  Table nodes are
        // handled in-place above; only TableArray falls through to generate+insert.
        if (!materialisedInPlace &&
            change.path.length > 1 && (isTable(node) || isTableArray(node)) && rawUpdated !== undefined) {
          const parentPath = change.path.slice(0, -1);
          const remainingSiblings = findDocumentItemsByKeyPrefix(original, parentPath);
          if (remainingSiblings.length === 0) {
            let value: any = rawUpdated;
            for (const k of parentPath) value = value?.[k];
            if (isObject(value) && Object.keys(value).length === 0) {
              const emptyTable = generateTable(parentPath as string[]);
              materialisedTables.add(emptyTable);
              // Insert at the original position so preceding comments
              // stay adjacent without a spurious blank line.
              const insertIdx = nodeIndex >= 0 ? nodeIndex : original.items.length;
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
              if (isTable(container)) {
                relativePrefix = parentPath.slice((container as Table).key.item.value.length) as string[];
              } else if (isTableArray(container)) {
                relativePrefix = parentPath.slice((container as TableArray).key.item.value.length + 1) as string[];
              } else if (isInlineTable(container)) {
                // InlineTable items are relative to the table itself; the
                // table's own key path is the node's absolute path minus its
                // key segments (captured before the removal).
                const containerKeyLen = nodeAbsolutePath
                  ? nodeAbsolutePath.length - kv.key.value.length
                  : parentPath.length - (kv.key.value.length - 1);
                relativePrefix = parentPath.slice(containerKeyLen) as string[];
              } else {
                relativePrefix = parentPath as string[];
              }
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
                      insert(original, container, inlineItem, containerItemIndex >= 0 ? containerItemIndex : undefined);
                      // insert() reserves one column for the opening-brace
                      // space; with bracket spacing enabled that column is
                      // already the space after `{`, so align the item with
                      // the original bracket style.
                      if (format.bracketSpacing) {
                        shiftNode(inlineItem, { lines: 0, columns: 1 });
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
          parentKey.value[parentKey.value.length - 1] = change.to;
          parentKey.raw = preserveEscapedKeyRaw(parentKey.raw, parentKey.value);
          parentKey.loc.end.column = parentKey.loc.start.column + parentKey.raw.length;
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
  let hasTightened = false;
  traverse(original, {
    InlineTable: (node) => {
      if (hasInlineContainerNeedingTighten(node)) {
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
            row.value.loc.start.column += delta;
            if (row.value.loc.end.line === row.value.loc.start.line) {
              row.value.loc.end.column += delta;
            }
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

    insert(original, original, item, i === 0 ? insertIndex : undefined);
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
    node.loc.end.column = node.loc.start.column + 2;
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
    // Build the key from its segments rather than a joined string: `parseJS({ 'a.b': [] })`
    // reads the dot as part of a single JS key and emits the quoted `"a.b" = []`, which is a
    // root key literally named `a.b` instead of `b` nested under `a`.
    const emptyArrayDoc = parseJS({ [path[path.length - 1]]: [] }, format);
    const emptyKV = generateKeyValue(path, (emptyArrayDoc.items[0] as KeyValue).value);
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
