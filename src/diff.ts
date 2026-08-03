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

  // Check for rename by seeing if object is in both before and after
  // and that key is no longer used in after
  const isRename = (stable: string, search: string[]) => {
    const index = search.indexOf(stable);
    if (index < 0) return false;

    const before_key = before_keys[before_stable.indexOf(stable)];
    if (after_keys.includes(before_key)) return false;

    // The target has to be a key `before` did not already contain. Without this, removing a
    // key whose value happens to equal an untouched sibling's reads as a rename onto that
    // sibling: the removed node is renamed in place, the real target is left alone, and the
    // key is emitted twice — output that no longer parses. Recomputing both sides from
    // `stable` keeps this correct for either call site (one passes after_stable, the other
    // before_stable). See https://github.com/DecimalTurn/toml-patch/issues/262.
    const after_key = after_keys[after_stable.indexOf(stable)];
    return after_key !== undefined && !before_keys.includes(after_key);
  };

  // Tracks from -> to for keys renamed in step 2, so the order-emission step below (which
  // predicts the document's key order after Add/Remove/Rename) can follow a rename through
  // rather than treating the old name as simply gone.
  const renamed = new Map<string, string>();

  // 2. Check for changes, rename, and removed
  before_keys.forEach((key, index) => {
    const sub_path = path.concat(key);
    if (after_keys.includes(key)) {
      merge(changes, diff(before[key], after[key], sub_path, options));
    } else if (isRename(before_stable[index], after_stable)) {
      const to = after_keys[after_stable.indexOf(before_stable[index])];
      changes.push({
        type: ChangeType.Rename,
        path,
        from: key,
        to
      });
      renamed.set(key, to);
    } else {
      changes.push({
        type: ChangeType.Remove,
        path: sub_path
      });
    }
  });

  // 3. Check for additions
  after_keys.forEach((key, index) => {
    if (!before_keys.includes(key) && !isRename(after_stable[index], before_stable)) {
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
      if (after_keys.includes(key)) {
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

      return;
    }

    // Check if item is removed -> assume it's been edited and replace
    const removed = !after_stable.includes(before_stable[index]);
    if (!overflow && removed) {
      merge(changes, diff(before[index], after[index], path.concat(index), options));
      before_stable[index] = value;

      return;
    }

    // Add as new item and shift existing
    changes.push({
      type: ChangeType.Add,
      path: path.concat(index)
    });
    before_stable.splice(index, 0, value);
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
