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
  return typeof value === 'number' && value % 1 === 0 && isFinite(value) && !Object.is(value, -0);
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


