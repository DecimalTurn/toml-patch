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

  if (type === 'string') return encodeBasicString(value);
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'bigint') return value.toString();

  if (type === 'number') {
    if (!Number.isFinite(value)) return encodeNonFinite(value);
    if (Number.isSafeInteger(value) && !Object.is(value, -0) && !isFloatNode(existingValue)) {
      return encodeInteger(value);
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

function encodeInteger(value: number): string {
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
  return `${renderedMantissa}e${exponent.replace(/^\+/, '')}`;
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
