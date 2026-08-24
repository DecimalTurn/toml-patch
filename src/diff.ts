import { isObject, datesEqual, stableStringify, merge } from './utils';
import { Path } from './find-by-path';

export enum ChangeType {
  Add = 'Add',
  Edit = 'Edit',
  Remove = 'Remove',
  Move = 'Move',
  Rename = 'Rename'
}

export interface Add {
  type: ChangeType.Add;
  path: Path;
  /** Existing sibling key that the new member must be inserted before. */
  before?: string;
}
export function isAdd(change: Change): change is Add {
  return change.type === ChangeType.Add;
}

export interface Edit {
  type: ChangeType.Edit;
  path: Path;
}
export function isEdit(change: Change): change is Edit {
  return change.type === ChangeType.Edit;
}

export interface Remove {
  type: ChangeType.Remove;
  path: Path;
  /** Internal marker for array removes whose index refers to the original array. */
  coordinate?: 'source';
}
export function isRemove(change: Change): change is Remove {
  return change.type === ChangeType.Remove;
}

export interface Move {
  type: ChangeType.Move;
  path: Path;
  from: number;
  to: number;
  /** Present only for object-key moves (updateOrder); identifies the child to place. */
  key?: string;
}
export function isMove(change: Change): change is Move {
  return change.type === ChangeType.Move;
}

export interface Rename {
  type: ChangeType.Rename;
  path: Path;
  from: string;
  to: string;
}
export function isRename(change: Change): change is Rename {
  return change.type === ChangeType.Rename;
}

export type Change = Add | Edit | Remove | Move | Rename;

export interface DiffOptions {
  /**
   * When true, `compareObjects` additionally emits Moves so that object keys end up in the
   * same order as `after`'s. Off by default: a no-options `diff()` call emits zero Moves for
   * a pure key-order permutation, which is the compatibility guarantee callers rely on. See
   * docs/PLAN-Update-Order.md.
   */
  updateOrder?: boolean;
  /** Object graph whose key order represents the caller's requested order. */
  orderSource?: any;
}

export default function diff(before: any, after: any, path: Path = [], options: DiffOptions = {}): Change[] {
  if (before === after || datesEqual(before, after)) {
    return [];
  }

  // Both NaN — treat as equal only if they have the same sign bit.
  // -NaN and NaN are distinguishable via IEEE 754, so a sign change
  // from negative NaN to canonical NaN should trigger an edit.
  if (typeof before === 'number' && typeof after === 'number'
      && Number.isNaN(before) && Number.isNaN(after)) {
    const bufBefore = new Float64Array([before]);
    const bufAfter = new Float64Array([after]);
    const viewBefore = new DataView(bufBefore.buffer);
    const viewAfter = new DataView(bufAfter.buffer);
    const signBefore = viewBefore.getUint32(4, true) & 0x80000000;
    const signAfter = viewAfter.getUint32(4, true) & 0x80000000;
    if (signBefore === signAfter) return [];
    // Sign differs — fall through to produce an Edit
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    return compareArrays(before, after, path, options);
  } else if (isObject(before) && isObject(after)) {
    return compareObjects(before, after, path, options);
  } else {
    return [
      {
        type: ChangeType.Edit,
        path
      }
    ];
  }
}

function compareObjects(before: any, after: any, path: Path = [], options: DiffOptions = {}): Change[] {
  let changes: Change[] = [];

  // 1. Get keys and stable values
  const before_keys = Object.keys(before);
  const before_stable = before_keys.map(key => stableStringify(before[key]));
  const after_keys = Object.keys(after);
  const after_stable = after_keys.map(key => stableStringify(after[key]));

  // Membership is tested once per key in each pass below, so these are Sets rather than the
  // key arrays: `includes` inside those loops makes the whole function quadratic in the
  // number of keys, which is felt on wide tables — a 2000-key object spent ~28ms there.
  const before_key_set = new Set(before_keys);
  const after_key_set = new Set(after_keys);

  // A key that disappeared is inferred to have been renamed when a key appears holding the
  // same value, since a rename is never declared — value equality is the only signal.
  //
  // Several keys can share a value, so the candidates are grouped by value and paired off in
  // order, as many as both sides can supply. Preserving comments is the point of this
  // library, so a plausible pairing is worth more than declining to guess: a renamed node is
  // edited in place and keeps its comments and formatting, whereas a remove-plus-add loses
  // them. Where the pairing is genuinely ambiguous the choice is arbitrary but harmless in
  // kind — a comment lands on one interchangeable key rather than another. Patching in
  // smaller steps removes the ambiguity for callers who care which.
  //
  // Pairing by position is what keeps it one-to-one. Matching with `indexOf` always resolved
  // to the first candidate, so every equal-valued source claimed the same target:
  // `{a:1,b:1} -> {z:1}` emitted two renames onto `z`, and the second blanked its node's
  // key, giving `  = 1` — output that does not parse. Leftovers on either side fall through
  // to Remove or Add.
  //
  // Keys present on both sides are excluded from both groups: they were not renamed and are
  // not available as targets. That is what keeps a removal whose value happens to match an
  // untouched sibling from being read as a rename onto it (issue #262).
  //
  // Tracked as from -> to because step 4 (order emission) has to follow a rename through
  // rather than treating the old name as simply gone.
  const groupByValue = (keys: string[], stables: string[], exclude: Set<string>) => {
    const groups = new Map<string, string[]>();
    keys.forEach((key, index) => {
      if (exclude.has(key)) return;
      const group = groups.get(stables[index]);
      if (group) group.push(key);
      else groups.set(stables[index], [key]);
    });
    return groups;
  };

  const disappeared = groupByValue(before_keys, before_stable, after_key_set);
  const appeared = groupByValue(after_keys, after_stable, before_key_set);

  const renamed = new Map<string, string>();
  const renameTargets = new Set<string>();
  const renameSourcesByTarget = new Map<string, string>();

  for (const [value, sources] of disappeared) {
    const targets = appeared.get(value);
    if (!targets) continue;

    const pairs = Math.min(sources.length, targets.length);
    for (let i = 0; i < pairs; i++) {
      renamed.set(sources[i], targets[i]);
      renameTargets.add(targets[i]);
      renameSourcesByTarget.set(targets[i], sources[i]);
    }
  }

  // 2. Check for changes, rename, and removed
  before_keys.forEach(key => {
    const sub_path = path.concat(key);
    if (after_key_set.has(key)) {
      merge(changes, diff(before[key], after[key], sub_path, options));
    } else if (renamed.has(key)) {
      changes.push({
        type: ChangeType.Rename,
        path,
        from: key,
        to: renamed.get(key)!
      });
    } else {
      changes.push({
        type: ChangeType.Remove,
        path: sub_path
      });
    }
  });

  // 3. Check for additions
  after_keys.forEach(key => {
    if (!before_key_set.has(key) && !renameTargets.has(key)) {
      const add: Add = {
        type: ChangeType.Add,
        path: path.concat(key)
      };

      // Adds normally append. If the caller supplied the original object whose order
      // should be honoured, anchor this add before the next member that already has a
      // slot. A rename uses its old key as the anchor because the rename runs in place.
      if (options.orderSource !== undefined) {
        let orderObject = options.orderSource;
        for (const segment of path) orderObject = orderObject?.[segment as any];
        if (isObject(orderObject)) {
          const requestedKeys = Object.keys(orderObject);
          const addedIndex = requestedKeys.indexOf(key);
          for (let i = addedIndex + 1; i < requestedKeys.length; i++) {
            const target = requestedKeys[i];
            const source = renameSourcesByTarget.get(target)
              ?? (before_key_set.has(target) ? target : undefined);
            if (source !== undefined) {
              add.before = source;
              break;
            }
          }
        }
      }

      changes.push(add);
    }
  });

  let requestedKeys = after_keys;
  if (options.orderSource !== undefined) {
    let orderObject = options.orderSource;
    for (const segment of path) orderObject = orderObject?.[segment as any];
    if (isObject(orderObject)) {
      const afterKeySet = new Set(after_keys);
      requestedKeys = Object.keys(orderObject).filter(key => afterKeySet.has(key));
    }
  }

  // A renamed member keeps its existing CST slot, while an added member is appended
  // by the patcher. Emit direct Adds and Renames in the updated object order so an
  // added dotted member can land before a renamed sibling without patch.ts inspecting
  // the CST or the complete change list.
  const directChanges = changes.filter(change =>
    (isAdd(change) && change.path.length === path.length + 1) ||
    (isRename(change) && change.path.length === path.length)
  );
  if (options.orderSource !== undefined && directChanges.length > 1) {
    const orderedDirectChanges = [...directChanges].sort((a, b) => {
      const aKey = isAdd(a) ? a.path[a.path.length - 1] : isRename(a) ? a.to : '';
      const bKey = isAdd(b) ? b.path[b.path.length - 1] : isRename(b) ? b.to : '';
      return requestedKeys.indexOf(aKey as string) - requestedKeys.indexOf(bKey as string);
    });
    let directIndex = 0;
    changes = changes.map(change =>
      directChanges.includes(change) ? orderedDirectChanges[directIndex++] : change
    );
  }

  // 4. Order emission (updateOrder only). Predict the key order the document will have
  // once Add/Remove/Rename above are applied, then walk the target order emitting a Move
  // wherever the prediction and the target disagree, splicing the prediction to match as we
  // go — the same simulate-and-splice approach compareArrays already uses for Move.
  if (options.updateOrder) {
    const sim: string[] = [];
    for (const key of before_keys) {
      if (after_key_set.has(key)) {
        if (!sim.includes(key)) sim.push(key);
      } else if (renamed.has(key)) {
        // Guard against the pre-existing spurious-rename case ({a:1,b:1} -> {b:1,x:1} emits
        // Rename a->b even though b is unchanged) pushing a duplicate into sim.
        const to = renamed.get(key)!;
        if (!sim.includes(to)) sim.push(to);
      }
      // removed -> drop
    }
    for (const key of after_keys) {
      if (!sim.includes(key)) sim.push(key); // adds append
    }

    after_keys.forEach((key, targetIndex) => {
      if (sim[targetIndex] === key) return;

      const from = sim.indexOf(key);
      changes.push({
        type: ChangeType.Move,
        path,
        from,
        to: targetIndex,
        key
      });

      sim.splice(from, 1);
      sim.splice(targetIndex, 0, key);
    });
  }

  return changes;
}

function compareArrays(before: any[], after: any[], path: Path = [], options: DiffOptions = {}): Change[] {
  let changes: Change[] = [];

  // 1. Convert arrays to stable objects
  const before_stable = before.map(stableStringify);
  const after_stable = after.map(stableStringify);

  // The writer corrupts multiline inline content when elements are relocated
  // (moves of elements holding multiline strings drop content lines — fuzz
  // seed 4765).  Only for such arrays, prefer resolving a true deletion in
  // place over drifting the element right through a chain of Moves.
  // Multiline DELIMITED strings whose content is single-line aren't visible
  // here (the diff sees only values), but nested arrays/objects are a strong
  // proxy: those are what carry such formatting, and moving them corrupts
  // their interior the same way (fuzz seed 8512).  A nested array or object
  // is itself evidence of multiline formatting even when its ELEMENTS are all
  // plain scalars — the formatter freely wraps such a container across lines,
  // and the diff cannot tell from values alone (fuzz seed 40181: removing a
  // scalar above a multiline `[218561, "…"]` chain-moved the array and dropped
  // columns out of its tail).
  const hasMultilineValue = (v: any): boolean => {
    if (typeof v === 'string') return v.includes('\n');
    if (Array.isArray(v)) return v.length > 0;
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      const vals = Object.values(v);
      return vals.some(x => x !== null && typeof x === 'object') || vals.some(hasMultilineValue);
    }
    return false;
  };
  const multilineArray = before.some(hasMultilineValue) || after.some(hasMultilineValue);
  const hasInlineObject = (value: any) =>
    value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
  const hasMixedStringAndObject = (values: any[]) =>
    values.length > 4 && values.some(value => typeof value === 'string') && values.some(hasInlineObject);
  const layoutSensitiveArray = multilineArray || hasMixedStringAndObject(before) || hasMixedStringAndObject(after);

  // Simulation of the actual VALUES, mutated in lockstep with before_stable.
  // The "removed -> edited in place" branch below must diff the element the
  // move simulation left at this index, not the untouched original: after a
  // Move, `before[index]` can hold a DIFFERENT element than the one whose
  // stable form sits at `before_stable[index]`, and diffing the wrong one
  // silently drops the edit (fuzz seed 340: `['4', …, true, …]` →
  // `[true, …]` moved `true` from 4 to 0, then diffed the original
  // `before[4]` — which was `true` — against `true`, emitting nothing for
  // the leftover string).
  const before_sim = before.slice();

  // Elements spliced out of `before` while walking the loop (the deletion
  // branch below).  Remove paths are source coordinates — indices in the
  // ORIGINAL array — because the patcher applies same-array removals in
  // descending index order (see reorder() in patch.ts), so each emitted
  // index must stay valid against the un-shifted array.
  let removedBefore = 0;
  let sameArrayAddEmitted = false;

  const removeChange = (index: number): Remove => {
    const change: Remove = { type: ChangeType.Remove, path: path.concat(index) };
    if (!sameArrayAddEmitted || removedBefore > 0) {
      Object.defineProperty(change, 'coordinate', { value: 'source' });
    }
    return change;
  };

  // 2. Step through after array making changes to before array as-needed
  for (let index = 0; index < after_stable.length; index++) {
    const value = after_stable[index];
    const overflow = index >= before_stable.length;

    // Check if items are the same
    if (!overflow && before_stable[index] === value) {
      continue;
    }

    // Check if item has been moved -> shift into place
    const from = overflow ? -1 : before_stable.indexOf(value, index + 1);
    if (from > -1) {
      // Is `before_stable[index]` (the mismatched element at this slot) a
      // surplus duplicate — more copies surviving in `before`'s unmatched
      // suffix than `after` demands?  When so, the extra copy is genuinely
      // gone from this position and a removal in place is the honest edit.
      const valueAt = before_stable[index];
      let beforeCount = 0;
      for (let i = index; i < before_stable.length; i++) {
        if (before_stable[i] === valueAt) beforeCount++;
      }
      let afterCount = 0;
      for (let i = index; i < after_stable.length; i++) {
        if (after_stable[i] === valueAt) afterCount++;
      }
      const surplusDuplicate = beforeCount > afterCount;

      // A true deletion in move shape: the element at this position is
      // absent from `after` entirely (or is a surplus duplicate of a value
      // that later slots still hold), while the after-value sits later in
      // `before`.  Without this the element only gets resolved at the end,
      // after a chain of Moves that relocates multiline elements — and the
      // writer corrupts their content (fuzz seed 4765: removing one scalar
      // from a multiline inline array dropped a line of a multiline string;
      // fuzz seed 35943: removing one of several duplicate scalars above a
      // nested multiline array chain-moved the array and corrupted its tail).
      if (layoutSensitiveArray && (after_stable.indexOf(before_stable[index]) === -1 || surplusDuplicate)) {
        changes.push(removeChange(index + removedBefore));
        before_stable.splice(index, 1);
        before_sim.splice(index, 1);
        removedBefore++;
        index--;
        continue;
      }

      // A Move emitted after an in-place deletion splice: its from/to are
      // simulation coordinates, but the patcher applies ALL removes first
      // (in descending index order) — when a trailing remove follows, the
      // move's source can be pushed out of bounds (fuzz seed 8138).  When
      // the displaced element is a surplus duplicate, resolve it as a
      // removal in place instead of a Move: the remaining occurrences stay
      // where they are, so nothing needs to move.
      //
      // (Redundant with the surplus-duplicate removal above when
      // `multilineArray` is set, but kept for the non-multiline case where a
      // prior splice already shifted indices and the surplus is unambiguous.)
      if (removedBefore > 0 && surplusDuplicate) {
        changes.push(removeChange(index + removedBefore));
        before_stable.splice(index, 1);
        before_sim.splice(index, 1);
        removedBefore++;
        index--;
        continue;
      }

      // After an in-place removal this array is one element short at this
      // slot, so the after-value found later in `before` is NOT being
      // relocated — a fresh copy is needed here.  Relocating it via a Move
      // drags multiline elements through a chain that later ADDs a new copy
      // anyway, and the writer corrupts their content (fuzz seed 62263: a
      // nested array above a multiline inline table replaced by a duplicate
      // scalar emitted Remove + Move + Add and mangled the table).
      if (layoutSensitiveArray && removedBefore > 0) {
        changes.push({
          type: ChangeType.Add,
          path: path.concat(index)
        });
        sameArrayAddEmitted = true;
        before_stable.splice(index, 0, value);
        before_sim.splice(index, 0, after[index]);
        // The fresh copy is spliced in BEFORE the original (at `from`), so it
        // shifts every later sim element — including the original we just
        // declined to move — one slot right.  `removedBefore` models the
        // LEFT-shift of a prior remove, so a later Remove's source index
        // (`index + removedBefore`) is off by one and removes the wrong
        // element (fuzz seed 179377: `[false, '''…''', …]` edited and trimmed
        // removed its neighbour instead of the surplus scalar).  Cancelling
        // one unit of the remove shift keeps the sim↔source mapping aligned.
        removedBefore--;
        continue;
      }

      changes.push({
        type: ChangeType.Move,
        path,
        from,
        to: index
      });

      const move = before_stable.splice(from, 1);
      before_stable.splice(index, 0, ...move);
      const moveValues = before_sim.splice(from, 1);
      before_sim.splice(index, 0, ...moveValues);

      continue;
    }

    // Check if item is removed -> assume it's been edited and replace.
    //
    // `after.includes(value)` alone is not enough: when the value also
    // occurs later in the array, the element is read as "kept", so the
    // mismatch becomes an Add plus a chain of Moves that re-finds the
    // duplicate — a pathological diff for a plain in-place edit (fuzz seed
    // 1406: `true` → `'4'` with another `true` later emitted Add(1) + six
    // Moves + Remove(10), and the writer corrupted a multiline string).
    // A duplicate further along in `before` can serve the later `after`
    // slot, so this occurrence is surplus whenever `before`'s unmatched
    // suffix holds more copies of the value than `after`'s does — then the
    // element is genuinely gone from its position and edited in place.
    let surplus = false;
    if (!overflow) {
      const value = before_stable[index];
      let beforeCount = 0;
      for (let i = index; i < before_stable.length; i++) {
        if (before_stable[i] === value) beforeCount++;
      }
      let afterCount = 0;
      for (let i = index; i < after_stable.length; i++) {
        if (after_stable[i] === value) afterCount++;
      }
      surplus = beforeCount > afterCount;
    }
    const removed = !overflow && surplus;
    if (removed) {
      merge(changes, diff(before_sim[index], after[index], path.concat(index), options));
      before_stable[index] = value;
      before_sim[index] = after[index];

      continue;
    }

    // Add as new item and shift existing
    changes.push({
      type: ChangeType.Add,
      path: path.concat(index)
    });
    sameArrayAddEmitted = true;
    before_stable.splice(index, 0, value);
    before_sim.splice(index, 0, after[index]);
    // Same source-index bookkeeping as the refused-move Add above: splicing a
    // new element in front of the surviving suffix shifts later sim indices
    // right by one, so a later Remove's source index (`index + removedBefore`)
    // is one too far right and targets the wrong element when a prior remove
    // is still pending.  Cancel one unit of the remove shift (fuzz seed
    // 208822: editing a duplicate scalar and trimming a multiline array
    // removed the multiline string instead of the plain scalar).
    if (removedBefore > 0) removedBefore--;
  }

  // 3. Remove any remaining overflow items
  for (let i = after_stable.length; i < before_stable.length; i++) {
    changes.push(removeChange(i + removedBefore));
  }

  return changes;
}
