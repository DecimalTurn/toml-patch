import parseTOML from './parse-toml';
import toJS from './to-js';
import { stripLeadingBom } from './decode-utf8';
import { isTemporal, stableStringify } from './utils';
import type { IntegersAsBigInt } from './parse-options';

/**
 * How the produced TOML should be read back when verifying a patch.
 *
 * Both fields must describe the SAME representation the caller's object uses,
 * otherwise the comparison reports a mismatch for a correct patch and forces a
 * needless retry. `temporal` therefore follows the updated object (see
 * {@link hasTemporal}) rather than any parse-time setting, and
 * `integersAsBigInt` must match whatever produced the object being compared.
 */
export interface PatchComparison {
  /** Read date/time values back as Temporal objects rather than Date subclasses. */
  temporal: boolean;
  /** Read integers back the way the caller's object represents them. Default: 'asNeeded'. */
  integersAsBigInt?: IntegersAsBigInt;
}

/**
 * Whether verifying a patch of this source could change its outcome.
 *
 * The retry only differs from the first attempt when the transactional planner
 * finds a multiline inline container holding a multiline string. A source with no
 * multiline string delimiter cannot contain one, so the retry reproduces the first
 * attempt byte for byte and the fine-grained result is returned either way.
 * Skipping the check there is therefore not a trade: the output is identical, and
 * a re-parse plus a full structural comparison is avoided on every such call.
 */
export function patchNeedsVerification(existing: string): boolean {
  return existing.indexOf('"""') !== -1 || existing.indexOf("'''") !== -1;
}

/**
 * Recursively checks if an object graph contains any Temporal values.
 * Used to auto-detect whether temporal mode should be enabled for patching,
 * and to decide how date/time values are read back when verifying a result.
 * Cycle-safe.
 */
export function hasTemporal(obj: any, seen: WeakSet<object> = new WeakSet()): boolean {
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
 * Re-parses TOML that a patch produced and reports whether it round-trips back
 * to `updated`. A false result means the written TOML disagrees with the object
 * it was supposed to represent, or is not parseable at all.
 */
export function patchResultMatches(updated: any, toml: string, comparison: PatchComparison): boolean {
  try {
    const parsed = Array.from(parseTOML(stripLeadingBom(toml)));
    const actual = toJS(parsed, '', {
      temporal: comparison.temporal,
      integersAsBigInt: comparison.integersAsBigInt ?? 'asNeeded'
    });
    // normalizePatchComparison is idempotent, so `updated` is normalized once
    // here rather than twice as it was when `expected` was a separate local.
    return stableStringify(normalizePatchComparison(actual)) === stableStringify(normalizePatchComparison(updated));
  } catch {
    return false;
  }
}

function normalizePatchComparison(value: any): any {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n');
  if (Array.isArray(value)) return value.map(normalizePatchComparison);
  // TOML has a single integer type, so `2` and `2n` denote the same value and
  // must compare equal: a document read with integersAsBigInt yields bigints,
  // and assigning a plain number back into it is legitimate. Canonicalising
  // both to a decimal string keeps that working while still catching genuine
  // precision loss, where the two decimal strings differ.
  if (typeof value === 'bigint') return `Int:${value.toString()}`;
  if (typeof value === 'number' && Number.isInteger(value)) return `Int:${BigInt(value).toString()}`;
  if (value instanceof Date) {
    if (value.getUTCFullYear() <= 0) {
      const hours = String(value.getUTCHours()).padStart(2, '0');
      const minutes = String(value.getUTCMinutes()).padStart(2, '0');
      const seconds = String(value.getUTCSeconds()).padStart(2, '0');
      const milliseconds = String(value.getUTCMilliseconds()).padStart(3, '0');
      return `Time:${hours}:${minutes}:${seconds}.${milliseconds}`;
    }
    return `Date:${value.getTime()}`;
  }
  if (isTemporal(value)) return value.toString();
  if (value && typeof value.toJSON === 'function') {
    return normalizePatchComparison(value.toJSON());
  }
  if (value && typeof value === 'object') {
    const normalized: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      const normalizedValue = normalizePatchComparison(value[key]);
      if (normalizedValue !== undefined) normalized[key] = normalizedValue;
    }
    return normalized;
  }
  return value;
}
