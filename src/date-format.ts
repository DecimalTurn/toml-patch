/**
 * Central module for TOML date/time format handling and custom date classes.
 * This module provides all the patterns, classes, and utilities needed to work
 * with the different date/time formats supported by the TOML specification.
 */

/**
 * Helper class containing all date format patterns and utilities for TOML date/time handling
 */
export class DateFormatHelper {
  // Patterns for different date/time formats
  static readonly IS_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  static readonly IS_TIME_ONLY = /^\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  static readonly IS_LOCAL_DATETIME_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  static readonly IS_LOCAL_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  static readonly IS_OFFSET_DATETIME_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
  static readonly IS_OFFSET_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
  
  // Legacy patterns from parse-toml.ts (for compatibility)
  static readonly IS_FULL_DATE = /(\d{4})-(\d{2})-(\d{2})/;
  static readonly IS_FULL_TIME = /(\d{2}):(\d{2})(?::(\d{2}))?/;

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
   * - Time-only: Returns a LocalTime, either from newJSDate (if already LocalTime) or constructed from its time part.
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
      // For time-only values, we need to handle this more carefully
      // The newJSDate might be a LocalTime object itself
      if (newJSDate instanceof LocalTime) {
        // If the new date is already a LocalTime, use its toISOString
        return newJSDate;
      } else {
        // Determine if originalRaw had milliseconds and how many digits
        const msMatch = originalRaw.match(/\.(\d+)\s*$/);
        
        // Extract time from a regular Date object
        const isoString = newJSDate.toISOString();
        if (isoString && isoString.includes('T')) {
          let newTime = isoString.split('T')[1].split('Z')[0];
          if (msMatch) {
            // Original had milliseconds, preserve the number of digits
            const msDigits = msMatch[1].length;
            const [h, m, sMs] = newTime.split(':');
            const [s] = sMs.split('.');
            const ms = String(newJSDate.getUTCMilliseconds()).padStart(3, '0').slice(0, msDigits);
            newTime = `${h}:${m}:${s}.${ms}`;
          }
          // If original had no milliseconds, keep newTime as-is (with milliseconds if present)
          return new LocalTime(newTime, originalRaw);
        } else {
          // Fallback: construct time from the Date object directly
          const hours = String(newJSDate.getUTCHours()).padStart(2, '0');
          const minutes = String(newJSDate.getUTCMinutes()).padStart(2, '0');
          const seconds = String(newJSDate.getUTCSeconds()).padStart(2, '0');
          const milliseconds = newJSDate.getUTCMilliseconds();
          let timeStr: string;
          if (msMatch) {
            const msDigits = msMatch[1].length;
            let ms = String(milliseconds).padStart(3, '0').slice(0, msDigits);
            timeStr = `${hours}:${minutes}:${seconds}.${ms}`;
          } else if (milliseconds > 0) {
            // No original milliseconds, but new value has them - include them
            // Note: milliseconds > 0 ensures we don't format ".0" for zero milliseconds
            const ms = String(milliseconds).padStart(3, '0').replace(/0+$/, '');
            timeStr = `${hours}:${minutes}:${seconds}.${ms}`;
          } else {
            timeStr = `${hours}:${minutes}:${seconds}`;
          }
          return new LocalTime(timeStr, originalRaw);
        }
      }
    } else if (DateFormatHelper.IS_LOCAL_DATETIME_T.test(originalRaw)) {
      // Local datetime with T separator - format: 2024-01-15T10:30:00
      // Determine if originalRaw had milliseconds and how many digits
      const msMatch = originalRaw.match(/\.(\d+)\s*$/);
      let isoString = newJSDate.toISOString().replace('Z', '');
      if (msMatch) {
        // Original had milliseconds, preserve the number of digits
        const msDigits = msMatch[1].length;
        // isoString is like "2024-01-15T10:30:00.123"
        const [datePart, timePart] = isoString.split('T');
        const [h, m, sMs] = timePart.split(':');
        const [s] = sMs.split('.');
        const ms = String(newJSDate.getUTCMilliseconds()).padStart(3, '0').slice(0, msDigits);
        isoString = `${datePart}T${h}:${m}:${s}.${ms}`;
      }
      // If original had no milliseconds, keep isoString as-is (with milliseconds if present)
      return new LocalDateTime(isoString, false, originalRaw);
    } else if (DateFormatHelper.IS_LOCAL_DATETIME_SPACE.test(originalRaw)) {
      // Local datetime with space separator - format: 2024-01-15 10:30:00
      const msMatch = originalRaw.match(/\.(\d+)\s*$/);
      let isoString = newJSDate.toISOString().replace('Z', '').replace('T', ' ');
      if (msMatch) {
        const msDigits = msMatch[1].length;
        // isoString is like "2024-01-15 10:30:00.123"
        const [datePart, timePart] = isoString.split(' ');
        const [h, m, sMs] = timePart.split(':');
        const [s] = sMs.split('.');
        const ms = String(newJSDate.getUTCMilliseconds()).padStart(3, '0').slice(0, msDigits);
        isoString = `${datePart} ${h}:${m}:${s}.${ms}`;
      }
      // If original had no milliseconds, keep isoString as-is (with milliseconds if present)
      return new LocalDateTime(isoString, true, originalRaw);
    } else if (DateFormatHelper.IS_OFFSET_DATETIME_T.test(originalRaw) || DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw)) {
      // Offset datetime - preserve the original timezone offset and separator
      const offsetMatch = originalRaw.match(/([+-]\d{2}:\d{2}|[Zz])$/);
      const originalOffset = offsetMatch ? (offsetMatch[1] === 'z' ? 'Z' : offsetMatch[1]) : 'Z';
      const useSpaceSeparator = DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw);
      
      // Check if original had milliseconds and preserve precision
      const msMatch = originalRaw.match(/\.(\d+)(?:[Zz]|[+-]\d{2}:\d{2})\s*$/);
      
      // Convert UTC time to local time in the original timezone
      const utcTime = newJSDate.getTime();
      let offsetMinutes = 0;
      
      if (originalOffset !== 'Z') {
        const sign = originalOffset[0] === '+' ? 1 : -1;
        const [hours, minutes] = originalOffset.slice(1).split(':');
        offsetMinutes = sign * (parseInt(hours) * 60 + parseInt(minutes));
      }
      
      // Create local time by applying the offset to UTC
      const localTime = new Date(utcTime + offsetMinutes * 60000);
      
      // Format the local time components
      const year = localTime.getUTCFullYear();
      const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(localTime.getUTCDate()).padStart(2, '0');
      const hours = String(localTime.getUTCHours()).padStart(2, '0');
      const minutes = String(localTime.getUTCMinutes()).padStart(2, '0');
      const seconds = String(localTime.getUTCSeconds()).padStart(2, '0');
      const milliseconds = localTime.getUTCMilliseconds();
      
      const separator = useSpaceSeparator ? ' ' : 'T';
      let timePart = `${hours}:${minutes}:${seconds}`;
      
      // Handle millisecond precision
      if (msMatch) {
        const msDigits = msMatch[1].length;
        const ms = String(milliseconds).padStart(3, '0').slice(0, msDigits);
        timePart += `.${ms}`;
      } else if (milliseconds > 0) {
        // Original had no milliseconds, but new value has them
        const ms = String(milliseconds).padStart(3, '0').replace(/0+$/, '');
        timePart += `.${ms}`;
      }
      
      const newDateTimeString = `${year}-${month}-${day}${separator}${timePart}${originalOffset}`;
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
    const year = this.getUTCFullYear();
    const month = String(this.getUTCMonth() + 1).padStart(2, '0');
    const day = String(this.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Custom Date class for local times (time-only)
 * Format: 07:32:00 or 07:32:00.999
 */
export class LocalTime extends Date {
  originalFormat: string;
  
  constructor(value: string, originalFormat: string) {
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
    const hours = String(this.getUTCHours()).padStart(2, '0');
    const minutes = String(this.getUTCMinutes()).padStart(2, '0');
    const seconds = String(this.getUTCSeconds()).padStart(2, '0');
    const milliseconds = this.getUTCMilliseconds();
    
    // Check if the original format had milliseconds
    const originalHadMs = this.originalFormat && this.originalFormat.includes('.');
    
    if (originalHadMs) {
      // Determine the number of millisecond digits from the original format
      const msMatch = this.originalFormat.match(/\.(\d+)\s*$/);
      const msDigits = msMatch ? msMatch[1].length : 3;
      
      const ms = String(milliseconds).padStart(3, '0').slice(0, msDigits);
      return `${hours}:${minutes}:${seconds}.${ms}`;
    } else if (milliseconds > 0) {
      // Original had no milliseconds, but current has non-zero milliseconds
      // Show them with trailing zeros removed
      const ms = String(milliseconds).padStart(3, '0').replace(/0+$/, '');
      return `${hours}:${minutes}:${seconds}.${ms}`;
    }
    
    return `${hours}:${minutes}:${seconds}`;
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
    const year = this.getUTCFullYear();
    const month = String(this.getUTCMonth() + 1).padStart(2, '0');
    const day = String(this.getUTCDate()).padStart(2, '0');
    const hours = String(this.getUTCHours()).padStart(2, '0');
    const minutes = String(this.getUTCMinutes()).padStart(2, '0');
    const seconds = String(this.getUTCSeconds()).padStart(2, '0');
    const milliseconds = this.getUTCMilliseconds();
    
    const datePart = `${year}-${month}-${day}`;
    const separator = this.useSpaceSeparator ? ' ' : 'T';
    
    // Check if the original format had milliseconds
    const originalHadMs = this.originalFormat && this.originalFormat.includes('.');
    
    if (originalHadMs) {
      // Determine the number of millisecond digits from the original format
      const msMatch = this.originalFormat.match(/\.(\d+)\s*$/);
      const msDigits = msMatch ? msMatch[1].length : 3;
      
      const ms = String(milliseconds).padStart(3, '0').slice(0, msDigits);
      return `${datePart}${separator}${hours}:${minutes}:${seconds}.${ms}`;
    } else if (milliseconds > 0) {
      // Original had no milliseconds, but current has non-zero milliseconds
      // Show them with trailing zeros removed
      const ms = String(milliseconds).padStart(3, '0').replace(/0+$/, '');
      return `${datePart}${separator}${hours}:${minutes}:${seconds}.${ms}`;
    }
    
    return `${datePart}${separator}${hours}:${minutes}:${seconds}`;
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
      // Calculate the local time in the original timezone
      const utcTime = this.getTime();
      let offsetMinutes = 0;
      
      if (this.originalOffset !== 'Z') {
        const sign = this.originalOffset[0] === '+' ? 1 : -1;
        const [hours, minutes] = this.originalOffset.slice(1).split(':');
        offsetMinutes = sign * (parseInt(hours) * 60 + parseInt(minutes));
      }
      
      const localTime = new Date(utcTime + offsetMinutes * 60000);
      const year = localTime.getUTCFullYear();
      const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(localTime.getUTCDate()).padStart(2, '0');
      const hours = String(localTime.getUTCHours()).padStart(2, '0');
      const minutes = String(localTime.getUTCMinutes()).padStart(2, '0');
      const seconds = String(localTime.getUTCSeconds()).padStart(2, '0');
      const milliseconds = localTime.getUTCMilliseconds();
      
      const datePart = `${year}-${month}-${day}`;
      const separator = this.useSpaceSeparator ? ' ' : 'T';
      
      // Check if the original format had milliseconds
      const originalHadMs = this.originalFormat && this.originalFormat.includes('.');
      
      if (originalHadMs) {
        // Determine the number of millisecond digits from the original format
        const msMatch = this.originalFormat.match(/\.(\d+)(?:[Zz]|[+-]\d{2}:\d{2})\s*$/);
        const msDigits = msMatch ? msMatch[1].length : 3;
        
        const ms = String(milliseconds).padStart(3, '0').slice(0, msDigits);
        return `${datePart}${separator}${hours}:${minutes}:${seconds}.${ms}${this.originalOffset}`;
      } else if (milliseconds > 0) {
        // Original had no milliseconds, but current has non-zero milliseconds
        // Show them with trailing zeros removed
        const ms = String(milliseconds).padStart(3, '0').replace(/0+$/, '');
        return `${datePart}${separator}${hours}:${minutes}:${seconds}.${ms}${this.originalOffset}`;
      }
      
      return `${datePart}${separator}${hours}:${minutes}:${seconds}${this.originalOffset}`;
    }
    
    const isoString = super.toISOString();
    if (this.useSpaceSeparator) {
      return isoString.replace('T', ' ');
    }
    return isoString;
  }
}