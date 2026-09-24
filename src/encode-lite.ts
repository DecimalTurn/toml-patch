import { isFloat as isFloatNode } from './cst';
import { DateFormatHelper, LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './date-format';
import { PatchLiteError, formatPath, Path } from './diff-lite';

/**
 * Encodes a JavaScript leaf value as valid TOML, independent of the full
 * formatting pipeline. Only the value span is produced; the surrounding key,
 * equals sign, whitespace and comments are never regenerated.
 */
export function encodeValue(value: any, existingValue: any, path: Path): string {
  const type = typeof value;

  if (type === 'string') return encodeString(value, existingValue?.raw);
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'bigint') return value.toString();

  if (type === 'number') {
    if (!Number.isFinite(value)) return encodeNonFinite(value);
    if (Number.isSafeInteger(value) && !Object.is(value, -0) && !isFloatNode(existingValue)) {
      return encodeInteger(value, existingValue?.raw);
    }
    return encodeFloat(value, isFloatNode(existingValue) ? existingValue.raw : undefined);
  }

  if (value instanceof Date) {
    return encodeDate(value, existingValue);
  }

  throw new PatchLiteError(
    'UnsupportedValue',
    path,
    `Unsupported value type ${Object.prototype.toString.call(value)} at ${formatPath(path)}`
  );
}

/**
 * Encodes a Date as TOML while keeping the source value's formatting: date vs
 * time vs datetime kind, fractional-digit count, space separator and offset
 * style are all taken from the existing value's raw text, exactly as the full
 * patch() does.
 */
function encodeDate(value: Date, existingValue: any): string {
  const raw = existingValue?.raw;
  const native = toTomlPatchDate(value);
  if (typeof raw !== 'string') return native.toISOString();
  return DateFormatHelper.createDateWithOriginalFormat(native, raw).toISOString();
}

/**
 * Converts a smol-toml `TomlDate` to the matching toml-patch class. Duck-typed
 * (the two packages have distinct class objects) and kept local so the lite
 * bundle does not import the vendored smol-toml date module. The `.000` suffix
 * smol-toml always writes for a zero fraction is dropped, so it does not leak
 * into the output and the result matches the full patch() byte for byte.
 */
function toTomlPatchDate(value: Date): Date {
  const v = value as any;
  const isSmolTomlDate = typeof v.isDate === 'function' && typeof v.isTime === 'function';
  if (!isSmolTomlDate) return value;

  const canonical = value.toISOString().replace(/\.000(?=([Zz]|[+-]\d{2}:\d{2})$|$)/, '');
  if (v.isDate()) return new LocalDate(canonical);
  if (v.isTime()) return new LocalTime(canonical, canonical);
  if (v.isLocal()) return new LocalDateTime(canonical, false);
  return new OffsetDateTime(canonical, false);
}

/** Detects the radix and prefix of a prefixed integer literal (`0x`/`0o`/`0b`). */
function integerRadixOf(raw: string): { radix: number; prefix: string } | undefined {
  if (raw.startsWith('0x')) return { radix: 16, prefix: '0x' };
  if (raw.startsWith('0o')) return { radix: 8, prefix: '0o' };
  if (raw.startsWith('0b')) return { radix: 2, prefix: '0b' };
  return undefined;
}

function encodeInteger(value: number, existingRaw?: string): string {
  if (existingRaw) {
    const radixInfo = integerRadixOf(existingRaw);
    // TOML prefixed integers cannot carry a sign, so negative values fall
    // back to plain decimal.
    if (radixInfo && value >= 0) {
      const uppercaseHex = radixInfo.radix === 16 && /[A-F]/.test(existingRaw);
      let digits = value.toString(radixInfo.radix);
      if (uppercaseHex) digits = digits.toUpperCase();
      return radixInfo.prefix + digits;
    }
  }
  return String(value);
}

function encodeFloat(value: number, existingRaw?: string): string {
  if (Object.is(value, -0)) return '-0.0';

  // Preserve exponent notation when the source used it (e.g. `1.0e10` ->
  // `1.0e11`) rather than expanding into a long plain float.
  if (existingRaw && /[eE]/.test(existingRaw)) {
    return encodeExponentFloat(value, existingRaw);
  }

  const raw = String(value);
  return /[.eE]/.test(raw) ? raw : `${raw}.0`;
}

/**
 * Renders a value in exponent notation, matching an existing float's style:
 * a TOML exponent (no leading `+`) and the mantissa's decimal-place count, but
 * dropping a non-zero fraction once the new value becomes a whole number.
 */
function encodeExponentFloat(value: number, existingRaw: string): string {
  const mantissaRaw = existingRaw.slice(0, existingRaw.search(/[eE]/));
  const dotIndex = mantissaRaw.indexOf('.');
  const fraction = dotIndex === -1 ? '' : mantissaRaw.slice(dotIndex + 1);
  const isRound = !/[1-9]/.test(fraction);
  const valueIsIntegral = Number.isInteger(value) && !Object.is(value, -0);

  // Keep the original's decimal count only for an explicit "round" float; a
  // non-zero fraction is insignificant once the new value becomes a whole number.
  const minDecimals = valueIsIntegral ? (isRound ? fraction.length : 0) : 0;

  const [mantissa, exponent] = value.toExponential().split(/[eE]/);
  const mantissaDecimals = mantissa.includes('.') ? mantissa.length - mantissa.indexOf('.') - 1 : 0;
  const decimals = Math.max(minDecimals, mantissaDecimals);
  const renderedMantissa = decimals > 0
    ? Number(mantissa).toFixed(decimals)
    : String(Number(mantissa));
  const uppercaseExponent = existingRaw.includes('E');
  return `${renderedMantissa}${uppercaseExponent ? 'E' : 'e'}${exponent.replace(/^\+/, '')}`;
}

function encodeNonFinite(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  return value > 0 ? 'inf' : '-inf';
}

/**
 * Encodes a string while preserving a multiline literal (`'''`) format when the
 * source value used one. The leading newline style is kept and backslashes are
 * left untouched (literal strings do not escape), matching the full patch().
 * Values that cannot be represented verbatim in a literal string fall back to
 * a basic string.
 */
function encodeString(value: string, existingRaw?: string): string {
  if (existingRaw && existingRaw.startsWith("'''") && canUseMultilineLiteral(value)) {
    const leadingNewLine = existingRaw.startsWith("'''\r\n")
      ? '\r\n'
      : existingRaw.startsWith("'''\n")
        ? '\n'
        : '';
    return "'''" + leadingNewLine + value + "'''";
  }
  if (existingRaw && existingRaw.startsWith('"""')) {
    return encodeMultilineBasicString(value, existingRaw);
  }
  return encodeBasicString(value);
}

/**
 * Encodes a value as a multiline basic string (`"""`), preserving the leading
 * newline style of the source and escaping backslashes, control characters and
 * embedded triple quotes, matching the full patch().
 */
function encodeMultilineBasicString(value: string, existingRaw: string): string {
  const leadingNewLine = existingRaw.startsWith('"""\r\n')
    ? '\r\n'
    : existingRaw.startsWith('"""\n')
      ? '\n'
      : '';
  return '"""' + leadingNewLine + escapeMultilineBasicContent(value) + '"""';
}

/**
 * Escapes the content of a multiline basic string: backslashes are doubled,
 * control characters are escaped, newlines stay literal (CR only as part of
 * CRLF), and embedded `"""` is protected as `""\"`.
 */
function escapeMultilineBasicContent(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const code = value.charCodeAt(i);
    if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\n';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\r') {
      // A carriage return is only valid when part of CRLF; escape it otherwise.
      out += value.charCodeAt(i + 1) === 0x0a ? '\r' : '\\r';
    } else if (
      (code >= 0x00 && code <= 0x07) ||
      code === 0x0b ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      out += '\\u' + code.toString(16).padStart(4, '0').toUpperCase();
    } else {
      out += ch;
    }
  }
  return out.replace(/"""/g, '""\\"');
}

/**
 * True when `value` can be written verbatim inside a multiline literal string:
 * no `'''`, no control characters other than tab, and no standalone carriage
 * return (newlines must be LF or CRLF).
 */
function canUseMultilineLiteral(value: string): boolean {
  if (value.includes("'''")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x0d) {
      if (value.charCodeAt(i + 1) !== 0x0a) return false;
    } else if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f) {
      return false;
    }
  }
  return true;
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
    else if (code < 0x20 || code === 0x7f) out += '\\u' + code.toString(16).padStart(4, '0').toUpperCase();
    else out += ch;
  }

  out += '"';
  return out;
}
