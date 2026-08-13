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

  for (const [value, sources] of disappeared) {
    const targets = appeared.get(value);
    if (!targets) continue;

    const pairs = Math.min(sources.length, targets.length);
    for (let i = 0; i < pairs; i++) {
      renamed.set(sources[i], targets[i]);
      renameTargets.add(targets[i]);
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
      changes.push({
        type: ChangeType.Add,
        path: path.concat(key)
      });
    }
  });

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

  // 2. Step through after array making changes to before array as-needed
  after_stable.forEach((value, index) => {
    const overflow = index >= before_stable.length;

    // Check if items are the same
    if (!overflow && before_stable[index] === value) {
      return;
    }

    // Check if item has been moved -> shift into place
    const from = before_stable.indexOf(value, index + 1);
    if (!overflow && from > -1) {
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

      return;
    }

    // Check if item is removed -> assume it's been edited and replace
    const removed = !after_stable.includes(before_stable[index]);
    if (!overflow && removed) {
      merge(changes, diff(before_sim[index], after[index], path.concat(index), options));
      before_stable[index] = value;
      before_sim[index] = after[index];

      return;
    }

    // Add as new item and shift existing
    changes.push({
      type: ChangeType.Add,
      path: path.concat(index)
    });
    before_stable.splice(index, 0, value);
    before_sim.splice(index, 0, after[index]);
  });

  // 3. Remove any remaining overflow items
  for (let i = after_stable.length; i < before_stable.length; i++) {
    changes.push({
      type: ChangeType.Remove,
      path: path.concat(i)
    });
  }

  return changes;
}
