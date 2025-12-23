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
            let [s, ms = ''] = sMs.split('.');
            ms = String(newJSDate.getUTCMilliseconds()).padStart(3, '0').slice(0, msDigits);
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
        let [h, m, sMs] = timePart.split(':');
        let [s, ms = ''] = sMs.split('.');
        ms = String(newJSDate.getUTCMilliseconds()).padStart(3, '0').slice(0, msDigits);
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
        let [h, m, sMs] = timePart.split(':');
        let [s, ms = ''] = sMs.split('.');
        ms = String(newJSDate.getUTCMilliseconds()).padStart(3, '0').slice(0, msDigits);
        isoString = `${datePart} ${h}:${m}:${s}.${ms}`;
      }
      // If original had no milliseconds, keep isoString as-is (with milliseconds if present)
      return new LocalDateTime(isoString, true, originalRaw);
    } else if (DateFormatHelper.IS_OFFSET_DATETIME_T.test(originalRaw) || DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw)) {
      // Offset datetime - we need to preserve the local time in the original timezone
      const offsetMatch = originalRaw.match(/([+-]\d{2}:\d{2}|[Zz])$/);
      const originalOffset = offsetMatch ? (offsetMatch[1] === 'z' ? 'Z' : offsetMatch[1]) : 'Z';
      const useSpaceSeparator = DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(originalRaw);
      
      // Check if original had milliseconds and preserve precision
      const msMatch = originalRaw.match(/\.(\d+)(?:[Zz]|[+-]\d{2}:\d{2})\s*$/);
      
      // Calculate the time difference and determine how many days were added
      const timeDiffMs = newJSDate.getTime() - originalDate.getTime();
      const daysDiff = Math.round(timeDiffMs / (24 * 60 * 60 * 1000));
      
      // Work with the original string representation and manipulate the date part
      const separator = useSpaceSeparator ? ' ' : 'T';
      const datePart = originalRaw.split(separator)[0];
      let timePart = originalRaw.split(separator)[1].replace(originalOffset, '');
      
      // If the time portion needs updating and we need to preserve millisecond precision
      if (Math.abs(timeDiffMs % (24 * 60 * 60 * 1000)) > 0) {
        // Reconstruct time part from newJSDate but preserve millisecond precision format
        const tempDate = new Date(newJSDate.getTime());
        const hours = String(tempDate.getUTCHours()).padStart(2, '0');
        const minutes = String(tempDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(tempDate.getUTCSeconds()).padStart(2, '0');
        const milliseconds = tempDate.getUTCMilliseconds();
        
        if (msMatch) {
          const msDigits = msMatch[1].length;
          const ms = String(milliseconds).padStart(3, '0').slice(0, msDigits);
          timePart = `${hours}:${minutes}:${seconds}.${ms}`;
        } else if (milliseconds > 0) {
          // No original milliseconds, but new value has them - include them
          const ms = String(milliseconds).padStart(3, '0').replace(/0+$/, '');
          timePart = `${hours}:${minutes}:${seconds}.${ms}`;
        } else {
          timePart = `${hours}:${minutes}:${seconds}`;
        }
      } else if (msMatch) {
        // Time didn't change but ensure millisecond format is preserved
        const msDigits = msMatch[1].length;
        if (!timePart.includes('.')) {
          // Add milliseconds if original had them but current doesn't
          const ms = '0'.repeat(msDigits);
          timePart = `${timePart}.${ms}`;
        } else {
          // Adjust millisecond precision to match original
          const [baseTime, currentMs] = timePart.split('.');
          const adjustedMs = (currentMs || '0').padEnd(msDigits, '0').slice(0, msDigits);
          timePart = `${baseTime}.${adjustedMs}`;
        }
      }
      // If original had no milliseconds, keep timePart as-is (with milliseconds if present)
      
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
  isFloating: boolean = true;
  useSpaceSeparator: boolean = false;
  originalFormat: string;
  
  constructor(value: string, useSpaceSeparator: boolean = false, originalFormat?: string) {
    // Convert space to T for Date parsing, but remember the original format
    super(value.replace(' ', 'T') + 'Z');
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
    super(value.replace(' ', 'T'));
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