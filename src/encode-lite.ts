import { isFloat as isFloatNode } from './cst';
import { PatchLiteError, formatPath, Path } from './diff-lite';

/**
 * Encodes a JavaScript leaf value as valid TOML, independent of the full
 * formatting pipeline. Only the value span is produced; the surrounding key,
 * equals sign, whitespace and comments are never regenerated.
 */
export function encodeValue(value: any, existingValue: any, path: Path): string {
  const type = typeof value;

  if (type === 'string') return encodeBasicString(value);
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'bigint') return value.toString();

  if (type === 'number') {
    if (!Number.isFinite(value)) return encodeNonFinite(value);
    if (Number.isInteger(value) && !isFloatNode(existingValue)) return encodeInteger(value);
    return encodeFloat(value);
  }

  if (value instanceof Date) {
    throw new PatchLiteError(
      'UnsupportedValue',
      path,
      `Date and time values are not supported by patch-lite (at ${formatPath(path)})`
    );
  }

  throw new PatchLiteError(
    'UnsupportedValue',
    path,
    `Unsupported value type ${Object.prototype.toString.call(value)} at ${formatPath(path)}`
  );
}

function encodeInteger(value: number): string {
  const raw = String(value);
  // Large integer-valued numbers stringify in scientific notation (e.g. 1e21),
  // which is not a valid TOML integer. Recover the exact decimal via BigInt.
  return /[eE]/.test(raw) ? BigInt(value).toString() : raw;
}

function encodeFloat(value: number): string {
  if (Object.is(value, -0)) return '-0.0';
  const raw = String(value);
  return /[.eE]/.test(raw) ? raw : `${raw}.0`;
}

function encodeNonFinite(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  return value > 0 ? 'inf' : '-inf';
}

function encodeBasicString(value: string): string {
  let out = '"';

  for (const ch of value) {
    const code = ch.codePointAt(0)!;

    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\r') out += '\\r';
    else if (code < 0x20 || code === 0x7f) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += ch;
  }

  out += '"';
  return out;
}
