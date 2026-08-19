/**
 * @file Utility functions for the TOML patch library.
 * @module utils
 */

/**
 * General utility functions
 */

export function last<TValue>(values: TValue[]): TValue | undefined {
  return values[values.length - 1];
}

export type BlankObject = { [key: string]: any };

export function blank(): BlankObject {
  return Object.create(null);
}

export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isInteger(value: any): value is number {
  return typeof value === 'number'
    && value % 1 === 0
    && isFinite(value)
    && !Object.is(value, -0)
    && value >= Number.MIN_SAFE_INTEGER
    && value <= Number.MAX_SAFE_INTEGER;
}

export function isBigInt(value: any): value is bigint {
  return typeof value === 'bigint';
}

export function isFloat(value: any): value is number {
  return typeof value === 'number' && (!isInteger(value) || !isFinite(value) || Object.is(value, -0));
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

export function isDate(value: any): value is Date {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/**
 * Duck-type check for Temporal API objects.
 *
 * Works with both the native Temporal (constructor names like
 * "Temporal.PlainDate") and the @js-temporal/polyfill (constructor
 * names like "PlainDate"). Avoids instanceof issues across realms.
 *
 * Only the four TOML-relevant types are checked:
 * PlainDate, PlainTime, PlainDateTime, ZonedDateTime.
 */
const TEMPORAL_TYPE_NAMES = new Set([
  'Temporal.PlainDate', 'Temporal.PlainTime', 'Temporal.PlainDateTime', 'Temporal.ZonedDateTime',
  'PlainDate', 'PlainTime', 'PlainDateTime', 'ZonedDateTime'
]);

export function isTemporal(value: any): boolean {
  return value != null
    && typeof value === 'object'
    && TEMPORAL_TYPE_NAMES.has(value.constructor?.name)
    && typeof (value as any).equals === 'function';
}

/**
 * Converts a Temporal object to its TOML-compatible string representation.
 *
 * For ZonedDateTime, this strips the IANA timezone annotation (e.g. [Asia/Kolkata])
 * and normalizes +00:00 to Z, since TOML only supports offset-based timezones.
 * For other Temporal types, this is equivalent to toString().
 */
export function temporalToTomlString(value: any): string {
  const name: string = value.constructor?.name ?? '';

  if (name === 'Temporal.ZonedDateTime' || name === 'ZonedDateTime') {
    // Reject IANA timezone annotations — TOML only supports offsets.
    const full = value.toString();
    const bracketMatch = full.match(/\[(.+)\]$/);
    if (bracketMatch && !/^[+-]\d{2}:\d{2}$/.test(bracketMatch[1])) {
      throw new Error(
        `ZonedDateTime with IANA timezone "${full}" cannot be represented in TOML. ` +
        'TOML only supports offset-based timezones (+05:30, Z).'
      );
    }
    // Strip bracket annotation, then normalize +00:00 offset suffix to Z
    return full.replace(/\[.*\]$/, '').replace(/(\+00:00)$/, 'Z');
  }

  const raw = value.toString();
  // Reject bracket annotations on non-ZonedDateTime types too
  // (non-ISO calendars like [u-ca=...] are not valid TOML).
  if (/\[.*\]/.test(raw)) {
    throw new Error(
      `Temporal value contains unsupported annotation: "${raw}". ` +
      'TOML only supports ISO 8601 calendar.'
    );
  }
  return raw;
}

export function isObject(value: any): boolean {
  return value && typeof value === 'object' && !isDate(value) && !isTemporal(value) && !Array.isArray(value);
}

export function isIterable<T>(value: any): value is Iterable<T> {
  return value != null && typeof value[Symbol.iterator] === 'function';
}

/**
 * String type detection functions
 *
 * These functions identify the type of TOML string representation from the raw string.
 * The library preserves the preference for escape sequences by maintaining the original
 * string type (basic vs literal, single-line vs multiline) when possible during patching.
 */

export function isBasicString(raw: string): boolean {
  return raw.startsWith('"') && !raw.startsWith('"""');
}

export function isMultilineBasicString(raw: string): boolean {
  return raw.startsWith('"""');
}

export function isLiteralString(raw: string): boolean {
  return raw.startsWith("'") && !raw.startsWith("'''");
}

export function isMultilineLiteralString(raw: string): boolean {
  return raw.startsWith("'''");
}

/**
 * Object and array utilities
 */

export function has(object: any, key: string): boolean {
  // All objects come from blank() (Object.create(null)) so there is no
  // prototype chain — `key in object` is safe and avoids the slow
  // Object.prototype.hasOwnProperty.call indirection.
  return key in object;
}

export function arraysEqual<TItem>(a: TItem[], b: TItem[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

export function datesEqual(a: any, b: any): boolean {
  // Temporal objects: compare via toString(). Two ZonedDateTime values
  // with different IANA zones are NOT the same even if their offsets match.
  if (isTemporal(a) && isTemporal(b)) {
    return a.toString() === b.toString();
  }
  // Custom Date subclasses: compare via toISOString()
  if (isDate(a) && isDate(b)) {
    return a.toISOString() === b.toISOString();
  }
  return false;
}

export function stableStringify(object: any): string {
  if (isObject(object)) {
    const key_values = Object.keys(object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`);

    return `{${key_values.join(',')}}`;
  } else if (Array.isArray(object)) {
    return `[${object.map(stableStringify).join(',')}]`;
  } else if (isTemporal(object)) {
    // Temporal objects use toString() for a stable ISO representation
    return JSON.stringify(object.toString());
  } else if (isDate(object)) {
    // Custom Date subclasses use toISOString()
    return JSON.stringify(object.toISOString());
  } else if (typeof object === 'bigint') {
    return object.toString() + 'n';
  } else if (typeof object === 'number' && !Number.isFinite(object)) {
    // NaN, Infinity and -Infinity all round-trip through JSON.stringify as
    // "null", so they collapse into one another (and into a literal `null`
    // value) in the diff's stable form — an array like `[1, inf, 2, nan]`
    // then diffs `inf` and `nan` as the same element and removes the wrong
    // one (fuzz seed 22629).  Tag them by their IEEE 754 sign bit so every
    // distinct non-finite number (including -NaN vs +NaN) stays unique.
    const buf = new Float64Array([object]);
    const view = new DataView(buf.buffer);
    const sign = view.getUint32(4, true) & 0x80000000 ? '-' : '+';
    return `${sign}${String(object)}`;
  } else {
    return JSON.stringify(object);
  }
}

export function merge<TValue>(target: TValue[], values: TValue[]) {
  // __mutating__: merge values into target
  // Reference: https://dev.to/uilicious/javascript-array-push-is-945x-faster-than-array-concat-1oki
  const original_length = target.length;
  const added_length = values.length;
  target.length = original_length + added_length;

  for (let i = 0; i < added_length; i++) {
    target[original_length + i] = values[i];
  }
}

/**
 * `String.prototype.isWellFormed`, when the runtime has it (Node 20+; this package supports
 * Node 16, so it has to be optional). Returns false exactly when a string contains an unpaired
 * surrogate — the same predicate as `findLoneSurrogate`, but far cheaper.
 * 
 * It only yields a boolean, so locating the offending unit for the error message still needs
 * `findLoneSurrogate` — but that only runs on the failing path.
 */
const nativeIsWellFormed: ((this: string) => boolean) | undefined =
  typeof String.prototype.isWellFormed === 'function' ? String.prototype.isWellFormed : undefined;

/**
 * Finds the first unpaired surrogate code unit in `value`, if any.
 *
 * JS strings are UTF-16, so an astral character is legitimately stored as a high/low surrogate
 * *pair* — those are fine. An unpaired one is not a Unicode scalar value, so it has no valid
 * UTF-8 encoding and cannot be represented in TOML.
 */
function findLoneSurrogate(value: string): { index: number; code: number } | undefined {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0xd800 || code > 0xdfff) continue;

    // A high surrogate is valid only when immediately followed by a low one.
    if (code <= 0xdbff) {
      const next = value.charCodeAt(i + 1); // NaN past the end — fails the range test below
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++; // consume the pair
        continue;
      }
    }

    // Either an unpaired high surrogate, or a low surrogate with no high before it (a paired
    // low is always consumed by the branch above).
    return { index: i, code };
  }

  return undefined;
}

/**
 * Throws if `value` contains an unpaired surrogate. `describe` names what is being encoded
 * (e.g. `'String value'`, `'Key "a"'`) so the message points at the offending input.
 */
export function assertNoLoneSurrogate(value: string, describe: string): void {
  // Fast path for the overwhelmingly common case of a clean string. When the native check is
  // missing we fall through and scan, which is the same work as before.
  if (nativeIsWellFormed !== undefined && nativeIsWellFormed.call(value)) return;

  const found = findLoneSurrogate(value);
  if (!found) return;

  const hex = found.code.toString(16).toUpperCase().padStart(4, '0');
  throw new Error(
    `${describe} contains a lone surrogate (U+${hex}) at index ${found.index}. ` +
    `Unpaired surrogates are not Unicode scalar values and cannot be encoded as TOML.`
  );
}


