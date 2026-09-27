import { DateFormatHelper, LocalDate, LocalDateTime, LocalTime } from '../date-format';

describe('DateFormatHelper.createDateWithOriginalFormat millisecond precision', () => {
  
  test('should preserve millisecond precision for LocalTime', () => {
    // The source's single digit is a floor, not a limit: 123 ms cannot be
    // written with one digit, so the fraction widens to keep the value.
    const time1 = new Date('1970-01-01T14:15:00.123Z');
    const result1 = DateFormatHelper.createDateWithOriginalFormat(time1, '10:30:00.5');
    expect(result1.toISOString()).toBe('14:15:00.123');
    
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
    // A longer fraction is kept as padding, and a shorter one is widened so
    // the value survives: 789 ms is not 700 ms and not 780 ms.
    const time1 = new Date('1970-01-01T14:15:00.789Z');
    const result1 = DateFormatHelper.createDateWithOriginalFormat(time1, '10:30:00.5');
    expect(result1.toISOString()).toBe('14:15:00.789');
    
    // Test 2 digits
    const time2 = new Date('1970-01-01T14:15:00.789Z');
    const result2 = DateFormatHelper.createDateWithOriginalFormat(time2, '10:30:00.50');
    expect(result2.toISOString()).toBe('14:15:00.789');
    
    // Test 3 digits
    const time3 = new Date('1970-01-01T14:15:00.789Z');
    const result3 = DateFormatHelper.createDateWithOriginalFormat(time3, '10:30:00.500');
    expect(result3.toISOString()).toBe('14:15:00.789');
  });

  test('should keep a wider source fraction as padding', () => {
    // 750 ms needs two digits, and the source's three are kept.
    const time = new Date('1970-01-01T14:15:00.750Z');

    expect(DateFormatHelper.createDateWithOriginalFormat(time, '10:30:00.500').toISOString())
      .toBe('14:15:00.750');
    expect(DateFormatHelper.createDateWithOriginalFormat(time, '10:30:00.5').toISOString())
      .toBe('14:15:00.75');
  });

  test('should write the digits the new value needs when the source had significant ones', () => {
    // 500 ms needs one digit, and the source's six were all significant, so the
    // fraction is not padded out to the old width.
    const time = new Date('1970-01-01T14:15:00.500Z');

    expect(DateFormatHelper.createDateWithOriginalFormat(time, '10:30:00.123456').toISOString())
      .toBe('14:15:00.5');
  });

  test('should keep a width the source declared with zeros', () => {
    // 500 ms fills one digit and the source's other five are zeros, so the
    // document asked for six and keeps them.
    const time = new Date('1970-01-01T14:15:00.750Z');

    expect(DateFormatHelper.createDateWithOriginalFormat(time, '10:30:00.500000').toISOString())
      .toBe('14:15:00.750000');
  });

  test('should take the fraction a replacement spells out itself', () => {
    // The replacement carries sub-millisecond digits, so it is a different
    // value from the source even though both are 123 ms to `getTime()`.
    const requested = new LocalTime('10:30:00.123999');

    expect(DateFormatHelper.createDateWithOriginalFormat(requested, '10:30:00.123456').toISOString())
      .toBe('10:30:00.123999');
    // A millisecond-precision replacement keeps the source's spelling instead.
    const milliseconds = new Date('1970-01-01T10:30:00.123Z');

    expect(DateFormatHelper.createDateWithOriginalFormat(milliseconds, '10:30:00.123456').toISOString())
      .toBe('10:30:00.123456');
  });

  test('should widen an offset datetime fraction without dropping the offset', () => {
    const time = new Date('1970-01-01T14:15:00.750Z');

    expect(
      DateFormatHelper.createDateWithOriginalFormat(time, '1970-01-01T10:30:00.5Z').toISOString()
    ).toBe('1970-01-01T14:15:00.75Z');
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