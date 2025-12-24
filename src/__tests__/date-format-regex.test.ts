import { DateFormatHelper } from '../date-format';

describe('DateFormatHelper regex patterns', () => {
  
  describe('IS_OFFSET_DATETIME_T', () => {
    test('should match valid offset datetime with T separator', () => {
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00Z')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00z')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00+05:00')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00-07:30')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00.123Z')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00.999+05:00')).toBe(true);
    });

    test('should not match invalid offset datetime with T separator', () => {
      // Missing offset
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00')).toBe(false);
      // Incomplete offset
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00+')).toBe(false);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00+05')).toBe(false);
      // Trailing characters
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00Zabc')).toBe(false);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15T10:30:00+05:00extra')).toBe(false);
      // Space separator instead of T
      expect(DateFormatHelper.IS_OFFSET_DATETIME_T.test('2024-01-15 10:30:00Z')).toBe(false);
    });
  });

  describe('IS_OFFSET_DATETIME_SPACE', () => {
    test('should match valid offset datetime with space separator', () => {
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00Z')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00z')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00+05:00')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00-07:30')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00.123Z')).toBe(true);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00.999+05:00')).toBe(true);
    });

    test('should not match invalid offset datetime with space separator', () => {
      // Missing offset
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00')).toBe(false);
      // Incomplete offset
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00+')).toBe(false);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00+05')).toBe(false);
      // Trailing characters
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00Zabc')).toBe(false);
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15 10:30:00+05:00extra')).toBe(false);
      // T separator instead of space
      expect(DateFormatHelper.IS_OFFSET_DATETIME_SPACE.test('2024-01-15T10:30:00Z')).toBe(false);
    });
  });

  describe('IS_LOCAL_DATETIME_T', () => {
    test('should match valid local datetime with T separator', () => {
      expect(DateFormatHelper.IS_LOCAL_DATETIME_T.test('2024-01-15T10:30:00')).toBe(true);
      expect(DateFormatHelper.IS_LOCAL_DATETIME_T.test('2024-01-15T10:30:00.123')).toBe(true);
    });

    test('should not match datetime with offset', () => {
      expect(DateFormatHelper.IS_LOCAL_DATETIME_T.test('2024-01-15T10:30:00Z')).toBe(false);
      expect(DateFormatHelper.IS_LOCAL_DATETIME_T.test('2024-01-15T10:30:00+05:00')).toBe(false);
    });
  });

  describe('IS_LOCAL_DATETIME_SPACE', () => {
    test('should match valid local datetime with space separator', () => {
      expect(DateFormatHelper.IS_LOCAL_DATETIME_SPACE.test('2024-01-15 10:30:00')).toBe(true);
      expect(DateFormatHelper.IS_LOCAL_DATETIME_SPACE.test('2024-01-15 10:30:00.123')).toBe(true);
    });

    test('should not match datetime with offset', () => {
      expect(DateFormatHelper.IS_LOCAL_DATETIME_SPACE.test('2024-01-15 10:30:00Z')).toBe(false);
      expect(DateFormatHelper.IS_LOCAL_DATETIME_SPACE.test('2024-01-15 10:30:00+05:00')).toBe(false);
    });
  });

  describe('IS_DATE_ONLY', () => {
    test('should match valid date-only format', () => {
      expect(DateFormatHelper.IS_DATE_ONLY.test('2024-01-15')).toBe(true);
    });

    test('should not match datetime formats', () => {
      expect(DateFormatHelper.IS_DATE_ONLY.test('2024-01-15T10:30:00')).toBe(false);
      expect(DateFormatHelper.IS_DATE_ONLY.test('2024-01-15 10:30:00')).toBe(false);
    });
  });

  describe('IS_TIME_ONLY', () => {
    test('should match valid time-only format', () => {
      expect(DateFormatHelper.IS_TIME_ONLY.test('10:30:00')).toBe(true);
      expect(DateFormatHelper.IS_TIME_ONLY.test('10:30:00.123')).toBe(true);
    });

    test('should not match datetime formats', () => {
      expect(DateFormatHelper.IS_TIME_ONLY.test('2024-01-15T10:30:00')).toBe(false);
    });
  });
});
