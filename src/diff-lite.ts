import { isObject, datesEqual, stableStringify, sameValue, isNegativeNan } from './utils';

/**
 * A path into a JavaScript object, mixing object keys and array indices.
 */
export type Path = Array<string | number>;

/**
 * The only change patch-lite can apply: replacing an existing value in place.
 */
export interface Edit {
  type: 'Edit';
  path: Path;
}

/**
 * The unsupported operations patch-lite rejects. The code is part of the
 * public error contract so callers can branch on it without parsing messages.
 */
export type PatchLiteErrorCode =
  | 'AddedKey'
  | 'RemovedKey'
  | 'ArrayLengthChange'
  | 'ArrayReorder'
  | 'TypeChange'
  | 'UnsupportedValue'
  | 'UnsupportedOption';

export class PatchLiteError extends Error {
  readonly code: PatchLiteErrorCode;
  readonly path: Path;

  constructor(code: PatchLiteErrorCode, path: Path, message: string) {
    super(message);
    this.name = 'PatchLiteError';
    this.code = code;
    this.path = path;
  }
}

/**
 * Formats a path as `a.b[0].c` for error messages.
 */
export function formatPath(path: Path): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out ? `.${segment}` : segment;
  }
  return out || '(root)';
}

function isSupportedLeaf(value: any): boolean {
  const type = typeof value;
  return type === 'string' || type === 'boolean' || type === 'number' || type === 'bigint';
}

function describe(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  const type = typeof value;
  return type === 'object' ? 'table' : type;
}

function sameNanSign(a: number, b: number): boolean {
  return isNegativeNan(a) === isNegativeNan(b);
}

/**
 * Compares the existing and updated JavaScript values and returns the list of
 * in-place edits. Any structural difference throws a `PatchLiteError` before
 * the source is mutated.
 */
export default function diffLite(before: any, after: any, path: Path = []): Edit[] {
  if (datesEqual(before, after)) return [];

  if (sameValue(before, after)) return [];

  if (
    typeof before === 'number' &&
    typeof after === 'number' &&
    Number.isNaN(before) &&
    Number.isNaN(after) &&
    sameNanSign(before, after)
  ) {
    return [];
  }

  const beforeIsArray = Array.isArray(before);
  const afterIsArray = Array.isArray(after);

  if (beforeIsArray && afterIsArray) {
    return compareArrays(before, after, path);
  }

  if (beforeIsArray || afterIsArray) {
    throw new PatchLiteError(
      'TypeChange',
      path,
      `Cannot change a ${beforeIsArray ? 'array' : describe(before)} to a ${
        afterIsArray ? 'array' : describe(after)
      } at ${formatPath(path)}`
    );
  }

  const beforeIsObject = isObject(before);
  const afterIsObject = isObject(after);

  if (beforeIsObject && afterIsObject) {
    return compareObjects(before, after, path);
  }

  if (beforeIsObject || afterIsObject) {
    throw new PatchLiteError(
      'TypeChange',
      path,
      `Cannot change a ${beforeIsObject ? 'table' : describe(before)} to a ${
        afterIsObject ? 'table' : describe(after)
      } at ${formatPath(path)}`
    );
  }

  if (before instanceof Date && after instanceof Date) {
    return [{ type: 'Edit', path }];
  }

  if (before instanceof Date || after instanceof Date) {
    throw new PatchLiteError(
      'TypeChange',
      path,
      `Cannot change a ${describe(before)} to a ${describe(after)} at ${formatPath(path)}`
    );
  }

  if (!isSupportedLeaf(before) || !isSupportedLeaf(after)) {
    throw new PatchLiteError(
      'UnsupportedValue',
      path,
      `Unsupported value type ${describe(after)} at ${formatPath(path)}`
    );
  }

  return [{ type: 'Edit', path }];
}

function compareObjects(before: any, after: any, path: Path): Edit[] {
  // Only key membership matters, not key order: patch-lite edits values by
  // path and never reorders keys, so the key order of `after` does not affect
  // the output and is intentionally ignored.
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);

  const afterKeySet = new Set(afterKeys);
  for (const key of beforeKeys) {
    if (!afterKeySet.has(key)) {
      throw new PatchLiteError(
        'RemovedKey',
        path.concat(key),
        `Cannot remove key ${formatPath(path.concat(key))}`
      );
    }
  }

  const beforeKeySet = new Set(beforeKeys);
  for (const key of afterKeys) {
    if (!beforeKeySet.has(key)) {
      throw new PatchLiteError(
        'AddedKey',
        path.concat(key),
        `Cannot add key ${formatPath(path.concat(key))}`
      );
    }
  }

  const changes: Edit[] = [];
  for (const key of beforeKeys) {
    const sub = diffLite(before[key], after[key], path.concat(key));
    for (const change of sub) changes.push(change);
  }
  return changes;
}

function compareArrays(before: any[], after: any[], path: Path): Edit[] {
  if (before.length !== after.length) {
    throw new PatchLiteError(
      'ArrayLengthChange',
      path,
      `Cannot change the length of array at ${formatPath(path)} (${before.length} to ${after.length})`
    );
  }

  // A reorder keeps the same multiset of elements but changes their order.
  // Detect it via stable deep forms so genuine element edits still pass.
  const beforeStable = before.map(stableStringify);
  const afterStable = after.map(stableStringify);

  const positionsDiffer = !beforeStable.every((value, index) => value === afterStable[index]);
  if (positionsDiffer) {
    const beforeBag = beforeStable.slice().sort();
    const afterBag = afterStable.slice().sort();
    const sameElements =
      beforeBag.length === afterBag.length &&
      beforeBag.every((value, index) => value === afterBag[index]);

    if (sameElements) {
      throw new PatchLiteError(
        'ArrayReorder',
        path,
        `Cannot reorder array elements at ${formatPath(path)}`
      );
    }
  }

  const changes: Edit[] = [];
  for (let index = 0; index < before.length; index++) {
    const sub = diffLite(before[index], after[index], path.concat(index));
    for (const change of sub) changes.push(change);
  }
  return changes;
}
