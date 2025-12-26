import { DateFormatHelper, LocalDate, LocalDateTime } from '../date-format';

describe('DateFormatHelper.createDateWithOriginalFormat millisecond precision', () => {
  
  test('should preserve millisecond precision for LocalTime', () => {
    // Test with 1 digit millisecond precision
    const time1 = new Date('1970-01-01T14:15:00.123Z');
    const result1 = DateFormatHelper.createDateWithOriginalFormat(time1, '10:30:00.5');
    expect(result1.toISOString()).toBe('14:15:00.1');
    
    // Test with 3 digit millisecond precision
    const time3 = new Date('1970-01-01T14:15:00.123Z');
    const result3 = DateFormatHelper.createDateWithOriginalFormat(time3, '10:30:00.500');
    expect(result3.toISOString()).toBe('14:15:00.123');
    
    // Test without milliseconds in original but with milliseconds in new value - should include them
    const timeWithMs = new Date('1970-01-01T14:15:00.123Z');
    const resultNoMs = DateFormatHelper.createDateWithOriginalFormat(timeWithMs, '10:30:00');
    expect(resultNoMs.toISOString()).toBe('14:15:00.123');
  });

  test('should preserve millisecond precision for LocalDateTime with T separator', () => {
    // Test with milliseconds
    const dateTime = new Date('2024-02-20T14:15:00.123Z');
    const result = DateFormatHelper.createDateWithOriginalFormat(dateTime, '2024-01-15T10:30:00.500');
    expect(result.toISOString()).toBe('2024-02-20T14:15:00.123');
    
    // Test without milliseconds in original but with milliseconds in new value - should include them
    const dateTimeWithMs = new Date('2024-02-20T14:15:00.123Z');
    const resultNoMs = DateFormatHelper.createDateWithOriginalFormat(dateTimeWithMs, '2024-01-15T10:30:00');
    expect(resultNoMs.toISOString()).toBe('2024-02-20T14:15:00.123');
  });

  test('should preserve millisecond precision for LocalDateTime with space separator', () => {
    // Test with milliseconds
    const dateTime = new Date('2024-02-20T14:15:00.123Z');
    const result = DateFormatHelper.createDateWithOriginalFormat(dateTime, '2024-01-15 10:30:00.500');
    expect(result.toISOString()).toBe('2024-02-20 14:15:00.123');
    
    // Test without milliseconds in original but with milliseconds in new value - should include them
    const dateTimeWithMs = new Date('2024-02-20T14:15:00.123Z');
    const resultNoMs = DateFormatHelper.createDateWithOriginalFormat(dateTimeWithMs, '2024-01-15 10:30:00');
    expect(resultNoMs.toISOString()).toBe('2024-02-20 14:15:00.123');
  });

  test('should preserve millisecond precision for OffsetDateTime', () => {
    // Test with milliseconds and Z offset
    const offset = new Date('2024-02-20T14:15:00.123Z');
    const result = DateFormatHelper.createDateWithOriginalFormat(offset, '2024-01-15T10:30:00.500Z');
    expect(result.toISOString()).toBe('2024-02-20T14:15:00.123Z');
    
    // Test without milliseconds in original but with milliseconds in new value - should include them
    const offsetWithMs = new Date('2024-02-20T14:15:00.123Z');
    const resultOffsetNoMs = DateFormatHelper.createDateWithOriginalFormat(offsetWithMs, '2024-01-15T10:30:00Z');
    expect(resultOffsetNoMs.toISOString()).toBe('2024-02-20T14:15:00.123Z');
  });

  test('should handle different millisecond digit counts', () => {
    // Test 1 digit
    const time1 = new Date('1970-01-01T14:15:00.789Z');
    const result1 = DateFormatHelper.createDateWithOriginalFormat(time1, '10:30:00.5');
    expect(result1.toISOString()).toBe('14:15:00.7');
    
    // Test 2 digits
    const time2 = new Date('1970-01-01T14:15:00.789Z');
    const result2 = DateFormatHelper.createDateWithOriginalFormat(time2, '10:30:00.50');
    expect(result2.toISOString()).toBe('14:15:00.78');
    
    // Test 3 digits
    const time3 = new Date('1970-01-01T14:15:00.789Z');
    const result3 = DateFormatHelper.createDateWithOriginalFormat(time3, '10:30:00.500');
    expect(result3.toISOString()).toBe('14:15:00.789');
  });

  test('should handle zero milliseconds correctly', () => {
    // When original has milliseconds but new date has zero milliseconds
    const timeNoMs = new Date('1970-01-01T14:15:00.000Z');
    const result = DateFormatHelper.createDateWithOriginalFormat(timeNoMs, '10:30:00.500');
    // Should preserve millisecond format even when zero
    expect(result.toISOString()).toBe('14:15:00.000');
    
    // When original has no milliseconds and new date has zero milliseconds
    const timeNoMs2 = new Date('1970-01-01T14:15:00.000Z');
    const resultNoMs = DateFormatHelper.createDateWithOriginalFormat(timeNoMs2, '10:30:00');
    expect(resultNoMs.toISOString()).toBe('14:15:00');
  });

  test('should upgrade LocalDate to LocalDateTime when Date has time components', () => {
    // Test that attempting to set a date-only field with time components upgrades to LocalDateTime
    const dateWithTime = new Date('2024-01-16T10:30:45.123Z'); // Has time components
    
    const result = DateFormatHelper.createDateWithOriginalFormat(dateWithTime, '2024-01-15');
    
    // Should be upgraded to LocalDateTime (with T separator)
    expect(result instanceof LocalDateTime).toBe(true);
    if (result instanceof LocalDateTime) {
      expect(result.useSpaceSeparator).toBe(false);
    }
    expect(result.toISOString()).toBe('2024-01-16T10:30:45.123');
  });

  test('should keep LocalDate when creating from Date with zero time components', () => {
    // Test that creating a LocalDate from a Date with all zero time components stays as LocalDate
    const dateNoTime = new Date('2024-01-16T00:00:00.000Z'); // No time components
    
    const result = DateFormatHelper.createDateWithOriginalFormat(dateNoTime, '2024-01-15');
    
    // Should remain a LocalDate
    expect(result instanceof LocalDate).toBe(true);
    expect(result.toISOString()).toBe('2024-01-16');
  });

  test('should keep time component when creating from Date with zero time components, but raw string has time component', () => {
    const dateNoTime = new Date('2024-01-16T00:00:00.000Z'); // No time components
    
    const result = DateFormatHelper.createDateWithOriginalFormat(dateNoTime, '2024-01-16T00:00:00.000Z');
    
    expect(result.toISOString()).toBe('2024-01-16T00:00:00.000Z');
  });

});