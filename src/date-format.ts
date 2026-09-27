/**
 * Central module for TOML date/time format handling and custom date classes.
 * This module provides all the patterns, classes, and utilities needed to work
 * with the different date/time formats supported by the TOML specification.
 */

// ---------------------------------------------------------------------------
// Shared formatting helpers (extracted to reduce duplication)
// ---------------------------------------------------------------------------

/** Extract UTC date/time parts as zero-padded strings. */
function fmtParts(d: Date) {
  return {
    year: String(d.getUTCFullYear()).padStart(4, '0'),
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
    hours: String(d.getUTCHours()).padStart(2, '0'),
    minutes: String(d.getUTCMinutes()).padStart(2, '0'),
    seconds: String(d.getUTCSeconds()).padStart(2, '0'),
    ms: d.getUTCMilliseconds(),
  };
}

/**
 * The fractional digits needed to write a millisecond count exactly, or "" for
 * a value on the whole second. `750` needs two digits and `500` needs one.
 */
function valueFractionDigits(ms: number): string {
  if (ms === 0) return '';
  return String(ms).padStart(3, '0').replace(/0+$/, '');
}

/** The fraction that ends the raw text, as in `07:32:00.123456`. */
const TRAILING_FRACTION = /\.(\d+)\s*$/;

/** The fraction that precedes a timezone offset, as in `07:32:00.123456Z`. */
const OFFSET_FRACTION = /\.(\d+)(?:[Zz]|[+-]\d{2}:\d{2})\s*$/;

/** The fraction the source wrote, or "" when its pattern does not match. */
function sourceFraction(originalRaw: string, msRe: RegExp): string {
  return originalRaw.match(msRe)?.[1] ?? '';
}

/**
 * Formats `digits` at the width the source declared.
 *
 * A source that wrote zeros past its own significant digits declared padding,
 * and that width is kept: `.500` stays three digits and `.500000` stays six. A
 * source whose extra digits were significant declared a precision the new value
 * does not have, so only the digits the value needs are written: `.123456`
 * edited to 750 ms becomes `.75`. This is the rule numbers already follow,
 * where `1.00` keeps its decimals and `1.50` collapses to what the value needs.
 */
function formatFraction(digits: string, originalRaw: string, msRe: RegExp): string {
  const source = sourceFraction(originalRaw, msRe);
  const declaredPadding = source.length > source.replace(/0+$/, '').length;
  const width = declaredPadding ? Math.max(source.length, digits.length) : digits.length;
  return width === 0 ? '' : '.' + digits.padEnd(width, '0');
}

/**
 * The fractional-second digits a value spells out, or "" when it has none.
 * The custom classes render their own fraction, so this is the caller's
 * spelling for them and the millisecond part for a plain `Date`.
 */
function renderedFraction(value: Date): string {
  const match = value.toISOString().match(/\.(\d+)/);
  return match ? match[1] : '';
}

/**
 * The fraction to write for `value` when the source wrote `originalRaw`.
 *
 * A `Date` holds milliseconds, so `.123999` and `.123456` are both 123 ms to
 * `getTime()`, but a value that spells out digits beyond the millisecond part
 * names a different instant and writes the digits it spells. Everything else
 * keeps the document's spelling.
 */
function fractionSuffix(value: Date, ms: number, originalRaw: string, msRe: RegExp = TRAILING_FRACTION): string {
  const spelled = renderedFraction(value).replace(/0+$/, '');
  if (spelled.length > valueFractionDigits(ms).length) {
    return formatFraction(spelled, originalRaw, msRe);
  }
  return fmtMs(ms, originalRaw, msRe);
}

/**
 * Format the fractional-second suffix, preserving the original precision.
 *
 * TOML allows any number of fractional digits, but a `Date` only holds
 * milliseconds. When the value's millisecond part still matches the leading
 * digits of the source fraction, the whole source fraction is emitted, so
 * sub-millisecond digits survive a parse → stringify round trip.
 *
 * Otherwise the digits the value needs are written, widened to the source's
 * width when the source declared zeros there: `.5` and 750 ms become `.75`,
 * because slicing to one digit would write `.7` and silently change the value
 * to 700 ms, while `.500` stays three digits as `.750` and `.123456` drops to
 * the `.75` the value needs. `TomlFormat.minimumTimeDecimals` raises the count
 * when a document wants a wider fraction.
 *
 * Returns "" when the source had no fraction and the value has none either.
 */
function fmtMs(ms: number, origFmt: string, msRe: RegExp = TRAILING_FRACTION): string {
  const digits = valueFractionDigits(ms);
  if (origFmt && origFmt.includes('.')) {
    const match = origFmt.match(msRe);
    if (match && match[1].startsWith(String(ms).padStart(3, '0'))) return '.' + match[1];
    return formatFraction(digits, origFmt, msRe);
  }
  return digits ? '.' + digits : '';
}

/** Parse a timezone offset string like "+09:00" or "Z" into minutes. */
function parseOffsetMinutes(offset: string): number {
  if (offset === 'Z') return 0;
  const sign = offset[0] === '+' ? 1 : -1;
  const [h, m] = offset.slice(1).split(':');
  return sign * (parseInt(h) * 60 + parseInt(m));
}

/**
 * Pads the fractional seconds of a rendered TOML date/time so at least
 * `minimumTimeDecimals` digits are written.
 *
 * This is the `TomlFormat.minimumTimeDecimals` floor. It is separate from
 * `minimumDecimals`, which applies to numbers. Padding only: digits already
 * written are kept, so the represented value never changes. A date-only value
 * carries no time and is returned unchanged, and a non-positive count is a
 * no-op.
 *
 * TOML 1.1 allows the seconds to be omitted, so a value written as `HH:MM`
 * gains `:00` before its fraction.
 */
export function padFractionalSeconds(raw: string, minimumTimeDecimals: number): string {
  if (minimumTimeDecimals <= 0) return raw;
  return raw.replace(
    /(\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d+))?/,
    (whole: string, hourMinute: string, seconds?: string, fraction?: string) => {
      const written = fraction ?? '';
      if (written.length >= minimumTimeDecimals) return whole;
      return `${hourMinute}:${seconds ?? '00'}.${written.padEnd(minimumTimeDecimals, '0')}`;
    }
  );
}

// ---------------------------------------------------------------------------

/**
 * Helper class containing all date format patterns and utilities for TOML date/time handling
 */
export class DateFormatHelper {
  // Patterns for different date/time formats
  static readonly IS_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  static readonly IS_TIME_ONLY = /^\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  static readonly IS_LOCAL_DATETIME_T = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  static readonly IS_LOCAL_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  static readonly IS_OFFSET_DATETIME_T = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
  static readonly IS_OFFSET_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
  
  // Legacy patterns from parse-toml.ts (for compatibility)
  // Made more permissive to catch malformed dates (e.g., 1987-7-05) for validation
  static readonly IS_FULL_DATE = /(\d{4})-(\d+)-(\d+)/;
  static readonly IS_FULL_TIME = /(\d+):(\d+)(?::(\d+))?/;

  /**
   * Creates a custom date/time object that preserves the original TOML date/time format.
   * 
   * This method detects the TOML date/time format from the raw string and returns an appropriate
   * custom date/time instance (e.g., LocalDate, LocalTime, LocalDateTime, OffsetDateTime) or a Date,
   * using the provided new JavaScript Date value.
   * 
   * @param {Date} newJSDate - The new JavaScript Date object representing the updated 
   * date/time value. This is used as the source for constructing the custom date/time object.
   * In some cases, this may be a custom date/time object (e.g., LocalTime) instead of a native Date.
   * @param {string} originalRaw - The original TOML date/time string as it appeared in the input.
   * Used to detect the specific TOML date/time format and to extract formatting details (e.g., separator, offset).
   * 
   * @returns {Date | LocalDate | LocalTime | LocalDateTime | OffsetDateTime}
   * Returns a custom date/time object that matches the original TOML format:
   * - LocalDate for date-only values (e.g., "2024-01-15")
   * - LocalTime for time-only values (e.g., "10:30:00")
   * - LocalDateTime for local datetimes (e.g., "2024-01-15T10:30:00" or "2024-01-15 10:30:00")
   * - OffsetDateTime for datetimes with offsets (e.g., "2024-01-15T10:30:00+02:00")
   * - Date (native JS Date) as a fallback if the format is unrecognized
   * 
   * Format-specific behavior:
   * - Date-only: Returns a LocalDate constructed from the date part of newJSDate.
   * - Time-only: Returns a LocalTime built from newJSDate's time part, with the original's fractional digits.
   * - Local datetime: Returns a LocalDateTime, preserving the separator (T or space).
   * - Offset datetime: Returns an OffsetDateTime, reconstructing the date/time with the original offset and separator.
   * - Fallback: Returns newJSDate as-is.
   */
  static createDateWithOriginalFormat(newJSDate: Date, originalRaw: string): Date {
    if (DateFormatHelper.IS_DATE_ONLY.test(originalRaw)) {
      // Local date (date-only) - format: 2024-01-15
      // Check if newJSDate has time components - if so, upgrade appropriately
      if (
        newJSDate.getUTCHours() !== 0 ||
        newJSDate.getUTCMinutes() !== 0 ||
        newJSDate.getUTCSeconds() !== 0 ||
        newJSDate.getUTCMilliseconds() !== 0
      ) {
        // Check if the new value is an OffsetDateTime (has offset information)
        if (newJSDate instanceof OffsetDateTime) {
          // Upgrade to OffsetDateTime - it already has the right format
          return newJSDate;
        }
        
        // Upgrade from date-only to local datetime with time components
        // Use T separator as it's the more common format
        let isoString = newJSDate.toISOString().replace('Z', '');
        // Strip .000 milliseconds if present (don't show unnecessary precision)
        isoString = isoString.replace(/\.000$/, '');
        return new LocalDateTime(isoString, false);
      }
      const dateStr = newJSDate.toISOString().split('T')[0];
      return new LocalDate(dateStr);
    } else if (DateFormatHelper.IS_TIME_ONLY.test(originalRaw)) {
      // Local time (time-only) - format: 10:30:00
      // Rebuilt from the source format like the other kinds: a value that is
      // already a LocalTime still takes its fractional-digit count from the
      // document, not from how the caller built the object.
      const p = fmtParts(newJSDate);
      const msSuffix = fractionSuffix(newJSDate, p.ms, originalRaw);
      // The rebuilt value carries the text it was written with, so an edit that
      // spends more digits than the document used does not collapse back to
      // the document's fraction on the next render.
      const time = `${p.hours}:${p.minutes}:${p.seconds}${msSuffix}`;
      return new LocalTime(time);
    } else if (DateFormatHelper.IS_LOCAL_DATETIME_T.test(originalRaw)) {
      // Local datetime with T separator - format: 2024-01-15T10:30:00
      const p = fmtParts(newJSDate);
      const msSuffix = fractionSuffix(newJSDate, p.ms, originalRaw);
      const dateTime = `${p.year}-${p.month}-${p.day}T${p.hours}:${p.minutes}:${p.seconds}${msSuffix}`;
      return new LocalDateTime(dateTime, false, dateTime);
    } else if (DateFormatHelper.IS_LOCAL_DATETIME_SPACE.test(originalRaw)) {
      // Local datetime with space separator - format: 2024-01-15 10:30:00
      const p = fmtParts(newJSDate);
      const msSuffix = fractionSuffix(newJSDate, p.ms, originalRaw);
      const dateTime = `${p.year}-${p.month}-${p.day} ${p.hours}:${p.minutes}:${p.seconds}${msSuffix}`;
      return new LocalDateTime(dateTime, true, dateTime);
    } else if (DateFormatHelper.IS_OFFSET_DATETIME_T.test(originalRaw) || DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw)) {
      // Offset datetime - preserve the original timezone offset and separator
      const offsetMatch = originalRaw.match(/([+-]\d{2}:\d{2}|[Zz])$/);
      const originalOffset = offsetMatch ? (offsetMatch[1] === 'z' ? 'Z' : offsetMatch[1]) : 'Z';
      const useSpaceSeparator = DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw);
      
      // Convert UTC time to local time in the original timezone
      const localTime = new Date(newJSDate.getTime() + parseOffsetMinutes(originalOffset) * 60000);
      const p = fmtParts(localTime);
      const sep = useSpaceSeparator ? ' ' : 'T';
      const msSuffix = fractionSuffix(newJSDate, p.ms, originalRaw, OFFSET_FRACTION);
      
      const newDateTimeString = `${p.year}-${p.month}-${p.day}${sep}${p.hours}:${p.minutes}:${p.seconds}${msSuffix}${originalOffset}`;
      return new OffsetDateTime(newDateTimeString, useSpaceSeparator);
    } else {
      // Fallback to regular Date
      return newJSDate;
    }
  }
}

/**
 * Custom Date class for local dates (date-only).
 * Format: 1979-05-27
 */
export class LocalDate extends Date {

  constructor(value: string) {
    super(value);
  }
  
  toISOString(): string {
    const p = fmtParts(this);
    return `${p.year}-${p.month}-${p.day}`;
  }
}

/**
 * Custom Date class for local times (time-only)
 * Format: 07:32:00 or 07:32:00.999
 */
export class LocalTime extends Date {
  originalFormat: string;
  
  constructor(value: string, originalFormat: string = value) {
    // Normalize time to include seconds if missing (TOML 1.1.0 allows optional seconds)
    let normalizedValue = value;
    if (!/:\d{2}:\d{2}/.test(value)) {
      // No seconds present, add :00
      normalizedValue = value + ':00';
    }
    // For local time, use year 0000 as the base (TOML spec compliance)
    // Add 'Z' to ensure it's parsed as UTC regardless of system timezone
    super(`0000-01-01T${normalizedValue}Z`);
    this.originalFormat = originalFormat;
  }
  
  toISOString(): string {
    const p = fmtParts(this);
    return `${p.hours}:${p.minutes}:${p.seconds}${fmtMs(p.ms, this.originalFormat)}`;
  }
}

/**
 * Custom Date class for local datetime (no timezone)
 * Format: 1979-05-27T07:32:00 or 1979-05-27 07:32:00
 */
export class LocalDateTime extends Date {
  useSpaceSeparator: boolean = false;
  originalFormat: string;
  
  constructor(value: string, useSpaceSeparator: boolean = false, originalFormat?: string) {
    // Normalize time part to include seconds if missing (TOML 1.1.0 allows optional seconds)
    let normalizedValue = value;
    if (!/\d{2}:\d{2}:\d{2}/.test(value)) {
      normalizedValue = value.replace(/(\d{2}:\d{2})([\s\-+TZ]|$)/, '$1:00$2');
    }
    // Convert space to T for Date parsing, but remember the original format
    super(normalizedValue.replace(' ', 'T') + 'Z');
    this.useSpaceSeparator = useSpaceSeparator;
    this.originalFormat = originalFormat || value;
  }
  
  toISOString(): string {
    const p = fmtParts(this);
    const sep = this.useSpaceSeparator ? ' ' : 'T';
    return `${p.year}-${p.month}-${p.day}${sep}${p.hours}:${p.minutes}:${p.seconds}${fmtMs(p.ms, this.originalFormat)}`;
  }
}

/**
 * Custom Date class for offset datetime that preserves space separator
 * Format: 1979-05-27T07:32:00Z or 1979-05-27 07:32:00-07:00
 */
export class OffsetDateTime extends Date {
  useSpaceSeparator: boolean = false;
  originalOffset?: string;
  originalFormat: string;
  
  constructor(value: string, useSpaceSeparator: boolean = false) {
    // Normalize time part to include seconds if missing (TOML 1.1.0 allows optional seconds)
    let normalizedValue = value;
    if (!/\d{2}:\d{2}:\d{2}/.test(value)) {
      normalizedValue = value.replace(/(\d{2}:\d{2})([\s\-+TZ]|$)/, '$1:00$2');
    }
    super(normalizedValue.replace(' ', 'T'));
    this.useSpaceSeparator = useSpaceSeparator;
    this.originalFormat = value;
    
    // Extract and preserve the original offset
    const offsetMatch = value.match(/([+-]\d{2}:\d{2}|[Zz])$/);
    if (offsetMatch) {
      this.originalOffset = offsetMatch[1] === 'z' ? 'Z' : offsetMatch[1];
    }
  }
  
  toISOString(): string {
    if (this.originalOffset) {
      const localTime = new Date(this.getTime() + parseOffsetMinutes(this.originalOffset) * 60000);
      const p = fmtParts(localTime);
      const sep = this.useSpaceSeparator ? ' ' : 'T';
      const msSuffix = fmtMs(p.ms, this.originalFormat, OFFSET_FRACTION);
      return `${p.year}-${p.month}-${p.day}${sep}${p.hours}:${p.minutes}:${p.seconds}${msSuffix}${this.originalOffset}`;
    }
    
    const isoString = super.toISOString();
    if (this.useSpaceSeparator) {
      return isoString.replace('T', ' ');
    }
    return isoString;
  }
}