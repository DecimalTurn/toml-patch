/**
 * Cross-parser oracle for the fuzz harnesses.
 *
 * The harnesses re-parse patch() output with toml-patch's own parser, so a
 * parser that is too lenient lets invalid output through unnoticed. This module
 * parses the same text with smol-toml, an independent implementation, and
 * reports any document one parser accepts and the other rejects, or any value
 * the two read differently.
 */
import { parse as smolParse } from 'smol-toml';

/**
 * Reduces a parsed value to a form both parsers can agree on.
 *
 * Dates are compared by TOML kind and value rather than by class, because each
 * library has its own Date subclasses. Fractional seconds are cut to
 * milliseconds, the precision smol-toml keeps. Offset datetimes are compared by
 * instant, so `Z` and `+00:00` are the same value.
 */
function canonicalDate(value: Date): string {
  const iso = value.toISOString();
  const toMillis = (text: string) =>
    text
      .replace(/\.(\d+)/, (_, digits: string) => '.' + (digits + '000').slice(0, 3))
      .replace(/(\d\d:\d\d:\d\d)(?!\.)/, '$1.000');

  if (/^\d{4}-\d\d-\d\d$/.test(iso)) return `local-date ${iso}`;
  if (/^\d\d:\d\d/.test(iso)) return `local-time ${toMillis(iso)}`;
  if (/(?:Z|[+-]\d\d:\d\d)$/i.test(iso)) return `offset-datetime ${value.getTime()}`;
  return `local-datetime ${toMillis(iso.replace(/[ t]/, 'T'))}`;
}

function describe(value: unknown): string {
  if (value instanceof Date) return canonicalDate(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && Object.is(value, -0)) return '-0';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'table';
  return String(value);
}

/**
 * Returns the first path where the two values differ, with both sides
 * described, or `undefined` when they match.
 */
function firstDifference(ours: unknown, theirs: unknown, path: string[] = []): string | undefined {
  const at = path.length > 0 ? path.join('.') : '<root>';
  const oursKind = describe(ours);
  const theirsKind = describe(theirs);

  if (Array.isArray(ours) && Array.isArray(theirs)) {
    if (ours.length !== theirs.length) {
      return `${at}: array length ${ours.length} vs ${theirs.length}`;
    }
    for (let index = 0; index < ours.length; index++) {
      const diff = firstDifference(ours[index], theirs[index], [...path, String(index)]);
      if (diff) return diff;
    }
    return undefined;
  }

  if (oursKind === 'table' && theirsKind === 'table') {
    const oursKeys = Object.keys(ours as object).sort();
    const theirsKeys = Object.keys(theirs as object).sort();
    const missing = oursKeys.filter(key => !Object.prototype.hasOwnProperty.call(theirs, key));
    const extra = theirsKeys.filter(key => !Object.prototype.hasOwnProperty.call(ours, key));
    if (missing.length > 0 || extra.length > 0) {
      return `${at}: keys only in toml-patch ${JSON.stringify(missing)}, only in smol-toml ${JSON.stringify(extra)}`;
    }
    for (const key of oursKeys) {
      const diff = firstDifference((ours as any)[key], (theirs as any)[key], [...path, key]);
      if (diff) return diff;
    }
    return undefined;
  }

  // NaN never equals itself, so compare the descriptions instead of the values.
  return oursKind === theirsKind ? undefined : `${at}: toml-patch ${oursKind} vs smol-toml ${theirsKind}`;
}

/**
 * Parses `toml` with smol-toml and compares the result with `ours`, the value
 * toml-patch's parser produced for the same text.
 *
 * @returns A description of the disagreement, or `undefined` when smol-toml
 *   accepts the document and reads the same value.
 */
export function crossParserMismatch(toml: string, ours: unknown): string | undefined {
  let theirs: unknown;
  try {
    // Match toml-patch's default: numbers when safe, bigint otherwise.
    theirs = smolParse(toml, { integersAsBigInt: 'asNeeded' });
  } catch (error: any) {
    return `smol-toml rejected a document toml-patch accepted: ${String(error?.message ?? error).split('\n')[0]}`;
  }
  const diff = firstDifference(ours, theirs);
  return diff ? `toml-patch and smol-toml disagree at ${diff}` : undefined;
}
