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
  static readonly IS_TIME_ONLY = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  static readonly IS_LOCAL_DATETIME_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  static readonly IS_LOCAL_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  static readonly IS_OFFSET_DATETIME_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[Zz+-]/;
  static readonly IS_OFFSET_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?[Zz+-]/;
  
  // Legacy patterns from parse-toml.ts (for compatibility)
  static readonly IS_FULL_DATE = /(\d{4})-(\d{2})-(\d{2})/;
  static readonly IS_FULL_TIME = /(\d{2}):(\d{2}):(\d{2})/;

  /**
   * Detects the TOML date/time format from the raw string and creates an appropriate
   * custom date instance with the new JavaScript Date value.
   */
  static createDateWithOriginalFormat(originalDate: Date, newJSDate: Date, originalRaw: string): Date {
    if (DateFormatHelper.IS_DATE_ONLY.test(originalRaw)) {
      // Local date (date-only) - format: 2024-01-15
      const dateStr = newJSDate.toISOString().split('T')[0];
      return new LocalDate(dateStr);
    } else if (DateFormatHelper.IS_TIME_ONLY.test(originalRaw)) {
      // Local time (time-only) - format: 10:30:00
      // For time-only values, we need to handle this more carefully
      // The newJSDate might be a LocalTime object itself
      if ((newJSDate as any).isTime) {
        // If the new date is already a LocalTime, use its toISOString
        return newJSDate;
      } else {
        // Extract time from a regular Date object
        const isoString = newJSDate.toISOString();
        if (isoString && isoString.includes('T')) {
          const newTime = isoString.split('T')[1].split('Z')[0];
          return new LocalTime(newTime, newTime);
        } else {
          // Fallback: construct time from the Date object directly
          const hours = String(newJSDate.getUTCHours()).padStart(2, '0');
          const minutes = String(newJSDate.getUTCMinutes()).padStart(2, '0');
          const seconds = String(newJSDate.getUTCSeconds()).padStart(2, '0');
          const timeStr = `${hours}:${minutes}:${seconds}`;
          return new LocalTime(timeStr, timeStr);
        }
      }
    } else if (DateFormatHelper.IS_LOCAL_DATETIME_T.test(originalRaw)) {
      // Local datetime with T separator - format: 2024-01-15T10:30:00
      const isoString = newJSDate.toISOString().replace('Z', '');
      return new LocalDateTime(isoString, false);
    } else if (DateFormatHelper.IS_LOCAL_DATETIME_SPACE.test(originalRaw)) {
      // Local datetime with space separator - format: 2024-01-15 10:30:00
      const isoString = newJSDate.toISOString().replace('Z', '').replace('T', ' ');
      return new LocalDateTime(isoString, true);
    } else if (DateFormatHelper.IS_OFFSET_DATETIME_T.test(originalRaw) || DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw)) {
      // Offset datetime - we need to preserve the local time in the original timezone
      const offsetMatch = originalRaw.match(/([+-]\d{2}:\d{2}|[Zz])$/);
      const originalOffset = offsetMatch ? (offsetMatch[1] === 'z' ? 'Z' : offsetMatch[1]) : 'Z';
      const useSpaceSeparator = DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw);
      
      // Calculate the time difference and determine how many days were added
      const timeDiffMs = newJSDate.getTime() - originalDate.getTime();
      const daysDiff = Math.round(timeDiffMs / (24 * 60 * 60 * 1000));
      
      // Work with the original string representation and manipulate the date part
      const separator = useSpaceSeparator ? ' ' : 'T';
      const datePart = originalRaw.split(separator)[0];
      const timePart = originalRaw.split(separator)[1].replace(originalOffset, '');
      
      // Parse the date part and add the calculated days
      const [year, month, day] = datePart.split('-').map(Number);
      const newDate = new Date(year, month - 1, day + daysDiff);
      const newDateStr = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;
      
      const newDateTimeString = `${newDateStr}${separator}${timePart}${originalOffset}`;
      return new OffsetDateTime(newDateTimeString, useSpaceSeparator);
    } else {
      // Fallback to regular Date
      return newJSDate;
    }
  }
}

/**
 * Custom Date class for local dates (date-only)
 * Format: 1979-05-27
 */
export class LocalDate extends Date {
  isDate: boolean = true;
  
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
  isTime: boolean = true;
  originalFormat: string;
  
  constructor(value: string, originalFormat: string) {
    // For local time, use a fixed date (1970-01-01) and the provided time
    super(`1970-01-01T${value}`);
    this.originalFormat = originalFormat;
  }
  
  toISOString(): string {
    const hours = String(this.getUTCHours()).padStart(2, '0');
    const minutes = String(this.getUTCMinutes()).padStart(2, '0');
    const seconds = String(this.getUTCSeconds()).padStart(2, '0');
    const milliseconds = this.getUTCMilliseconds();
    
    if (milliseconds > 0) {
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
  isFloating: boolean = true;
  useSpaceSeparator: boolean = false;
  
  constructor(value: string, useSpaceSeparator: boolean = false) {
    // Convert space to T for Date parsing, but remember the original format
    super(value.replace(' ', 'T') + 'Z');
    this.useSpaceSeparator = useSpaceSeparator;
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
    
    if (milliseconds > 0) {
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
  
  constructor(value: string, useSpaceSeparator: boolean = false) {
    super(value.replace(' ', 'T'));
    this.useSpaceSeparator = useSpaceSeparator;
    
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
      
      if (milliseconds > 0) {
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