/**
 * Tests for LocalTime handling of midnight boundary crossings
 * 
 * The LocalTime class uses a fixed date (1970-01-01) for time-only values.
 * This test suite verifies behavior when time arithmetic causes the underlying
 * Date to roll over to a different day (e.g., adding hours to 23:00:00).
 */

import { LocalTime } from '../date-format';

describe('LocalTime midnight boundary handling', () => {
  describe('time arithmetic crossing midnight', () => {
    it('should handle adding hours that cross midnight forward', () => {
      const time = new LocalTime('23:00:00', '23:00:00');
      
      // Add 2 hours: 23:00:00 + 2 hours = 01:00:00 (next day)
      const newTime = new Date(time.getTime() + 2 * 60 * 60 * 1000);
      
      // The underlying date is now 1970-01-02T01:00:00
      // but toISOString should return just the time portion
      const result = new LocalTime(
        newTime.toISOString().split('T')[1].split('Z')[0],
        '23:00:00'
      );
      
      // Should show 01:00:00, not 25:00:00 or something else
      expect(result.toISOString()).toBe('01:00:00');
    });

    it('should handle subtracting hours that cross midnight backward', () => {
      const time = new LocalTime('01:00:00', '01:00:00');
      
      // Subtract 2 hours: 01:00:00 - 2 hours = 23:00:00 (previous day)
      const newTime = new Date(time.getTime() - 2 * 60 * 60 * 1000);
      
      // The underlying date is now 1969-12-31T23:00:00
      // but toISOString should return just the time portion
      const result = new LocalTime(
        newTime.toISOString().split('T')[1].split('Z')[0],
        '01:00:00'
      );
      
      // Should show 23:00:00
      expect(result.toISOString()).toBe('23:00:00');
    });

    it('should handle adding minutes that cross midnight', () => {
      const time = new LocalTime('23:45:00', '23:45:00');
      
      // Add 30 minutes: 23:45:00 + 30 min = 00:15:00 (next day)
      const newTime = new Date(time.getTime() + 30 * 60 * 1000);
      
      const result = new LocalTime(
        newTime.toISOString().split('T')[1].split('Z')[0],
        '23:45:00'
      );
      
      expect(result.toISOString()).toBe('00:15:00');
    });

    it('should handle time arithmetic with milliseconds crossing midnight', () => {
      const time = new LocalTime('23:59:59.999', '23:59:59.999');
      
      // Add 2 milliseconds: crosses to next day
      const newTime = new Date(time.getTime() + 2);
      
      const result = new LocalTime(
        newTime.toISOString().split('T')[1].split('Z')[0],
        '23:59:59.999'
      );
      
      // Should show 00:00:00.001
      expect(result.toISOString()).toBe('00:00:00.001');
    });
  });

  describe('direct manipulation of LocalTime causing day rollover', () => {
    it('should correctly handle getUTCHours when date has rolled to next day', () => {
      const time = new LocalTime('23:00:00', '23:00:00');
      
      // Manually add 2 hours to cause rollover
      const rolledTime = new Date(time.getTime() + 2 * 60 * 60 * 1000);
      
      // Create new LocalTime from the rolled time
      // The underlying date is 1970-01-02, hours should be 01
      const newLocalTime = Object.create(LocalTime.prototype);
      newLocalTime.originalFormat = '23:00:00';
      Object.setPrototypeOf(rolledTime, LocalTime.prototype);
      (rolledTime as any).originalFormat = '23:00:00';
      
      // Test what toISOString returns when the date has rolled over
      expect((rolledTime as LocalTime).toISOString()).toBe('01:00:00');
    });

    it('should correctly handle getUTCHours when date has rolled to previous day', () => {
      const time = new LocalTime('01:00:00', '01:00:00');
      
      // Manually subtract 2 hours to cause rollover
      const rolledTime = new Date(time.getTime() - 2 * 60 * 60 * 1000);
      
      // The underlying date is 1969-12-31, hours should be 23
      Object.setPrototypeOf(rolledTime, LocalTime.prototype);
      (rolledTime as any).originalFormat = '01:00:00';
      
      // Test what toISOString returns when the date has rolled over
      expect((rolledTime as LocalTime).toISOString()).toBe('23:00:00');
    });
  });

  describe('edge case: multiple day rollovers', () => {
    it('should handle adding 25 hours (more than one day)', () => {
      const time = new LocalTime('10:00:00', '10:00:00');
      
      // Add 25 hours: should result in 11:00:00 (next day)
      const newTime = new Date(time.getTime() + 25 * 60 * 60 * 1000);
      
      const result = new LocalTime(
        newTime.toISOString().split('T')[1].split('Z')[0],
        '10:00:00'
      );
      
      expect(result.toISOString()).toBe('11:00:00');
    });

    it('should handle subtracting 25 hours (more than one day)', () => {
      const time = new LocalTime('14:00:00', '14:00:00');
      
      // Subtract 25 hours: should result in 13:00:00 (previous day)
      const newTime = new Date(time.getTime() - 25 * 60 * 60 * 1000);
      
      const result = new LocalTime(
        newTime.toISOString().split('T')[1].split('Z')[0],
        '14:00:00'
      );
      
      expect(result.toISOString()).toBe('13:00:00');
    });
  });

  describe('time normalization when underlying date has changed', () => {
    it('should normalize time values when directly modifying a LocalTime instance', () => {
      const time = new LocalTime('22:30:00', '22:30:00');
      
      // Simulate some operation that changes the underlying time past midnight
      // by setting the time to be 3 hours later
      time.setTime(time.getTime() + 3 * 60 * 60 * 1000);
      
      // Now the date is 1970-01-02T01:30:00
      // but toISOString should only return the time part: 01:30:00
      expect(time.toISOString()).toBe('01:30:00');
    });

    it('should normalize time values when going backward past midnight', () => {
      const time = new LocalTime('02:30:00', '02:30:00');
      
      // Go back 4 hours
      time.setTime(time.getTime() - 4 * 60 * 60 * 1000);
      
      // Now the date is 1969-12-31T22:30:00
      // but toISOString should only return the time part: 22:30:00
      expect(time.toISOString()).toBe('22:30:00');
    });

    it('should preserve millisecond precision when crossing midnight', () => {
      const time = new LocalTime('23:59:00.123', '23:59:00.123');
      
      // Add 2 minutes to cross midnight
      time.setTime(time.getTime() + 2 * 60 * 1000);
      
      // Should show 00:01:00.123
      expect(time.toISOString()).toBe('00:01:00.123');
    });
  });

  describe('PR comment concern: day rollover causing incorrect time values', () => {
    // This test directly addresses the concern raised in the PR comment:
    // "adding 2 hours to '23:00:00' would result in '01:00:00' on 0000-01-02,
    // but the toISOString method doesn't account for day changes"
    
    it('should correctly show 01:00:00 when adding 2 hours to 23:00:00 (PR example)', () => {
      const time = new LocalTime('23:00:00', '23:00:00');
      
      time.setTime(time.getTime() + 2 * 60 * 60 * 1000);
      
      // The underlying date is now 0000-01-02T01:00:00Z
      // Verify the date component actually changed
      expect(time.getUTCFullYear()).toBe(0);
      expect(time.getUTCMonth()).toBe(0); // January
      expect(time.getUTCDate()).toBe(2); // Day 2
      
      // But toISOString should correctly return just 01:00:00
      // NOT something incorrect like 25:00:00 or an error
      expect(time.toISOString()).toBe('01:00:00');
      
      // Verify getUTCHours returns 1, not 25
      expect(time.getUTCHours()).toBe(1);
    });

    it('should correctly extract time components even when date has changed', () => {
      const time = new LocalTime('12:00:00', '12:00:00');
      
      // Move forward by 36 hours (1.5 days)
      time.setTime(time.getTime() + 36 * 60 * 60 * 1000);
      
      // Date should be 1970-01-03 (2 days later)
      expect(time.getUTCDate()).toBe(3);
      
      // Time should be 00:00:00 (12:00 + 36h = 48:00 = 00:00 on day 3)
      expect(time.getUTCHours()).toBe(0);
      expect(time.toISOString()).toBe('00:00:00');
    });

    it('demonstrates that JavaScript Date handles hour wrapping automatically', () => {
      
      // Add various amounts of hours
      const testCases = [
        { hoursToAdd: 5, expectedDay: 2, expectedTime: '01:00:00' },    // 20 + 5 = 25 = 01:00 next day
        { hoursToAdd: 28, expectedDay: 3, expectedTime: '00:00:00' },   // 20 + 28 = 48 = 00:00 on day 3
        { hoursToAdd: -22, expectedDay: 31, expectedTime: '22:00:00' }, // 20 - 22 = -2 = 22:00 prev day (Dec 31, 1969)
      ];
      
      testCases.forEach(({ hoursToAdd, expectedDay, expectedTime }) => {
        const testTime = new LocalTime('20:00:00', '20:00:00');
        testTime.setTime(testTime.getTime() + hoursToAdd * 60 * 60 * 1000);
        
        expect(testTime.getUTCDate()).toBe(expectedDay);
        expect(testTime.toISOString()).toBe(expectedTime);
      });
    });
  });
});


/**
 * Tests to verify the offset datetime handling logic
 * 
 * This addresses PR comment: https://github.com/DecimalTurn/toml-patch/pull/82#discussion_r2624336071
 * which claims the logic is "fundamentally flawed" when time changes don't align to whole days.
 */

import { DateFormatHelper } from '../date-format';

describe('OffsetDateTime partial-day time changes', () => {
  it('should correctly handle adding 2 hours to 23:30:00-07:00 (PR example)', () => {
    const originalRaw = '2024-01-15T23:30:00-07:00';
    
    // "2024-01-15T23:30:00-07:00" is 2024-01-16T06:30:00Z in UTC
    const originalDate = new Date('2024-01-16T06:30:00Z');
    
    // Add 2 hours: should become 2024-01-16T08:30:00Z in UTC
    const newJSDate = new Date(originalDate.getTime() + 2 * 60 * 60 * 1000);
    
    const result = DateFormatHelper.createDateWithOriginalFormat(
      newJSDate,
      originalRaw
    );
    
    // Expected: "2024-01-16T01:30:00-07:00" (which is 2024-01-16T08:30:00Z in UTC)
    expect(result.toISOString()).toBe('2024-01-16T01:30:00-07:00');
  });

  it('should correctly handle adding 30 minutes crossing midnight', () => {
    const originalRaw = '2024-01-15T23:45:00-07:00';
    const originalDate = new Date('2024-01-16T06:45:00Z');
    const newJSDate = new Date(originalDate.getTime() + 30 * 60 * 1000);
    
    const result = DateFormatHelper.createDateWithOriginalFormat(
      newJSDate,
      originalRaw
    );
    
    expect(result.toISOString()).toBe('2024-01-16T00:15:00-07:00');
  });

  it('should correctly handle subtracting 2 hours from 01:00:00-07:00', () => {
    const originalRaw = '2024-01-16T01:00:00-07:00';
    const originalDate = new Date('2024-01-16T08:00:00Z');
    const newJSDate = new Date(originalDate.getTime() - 2 * 60 * 60 * 1000);
    
    const result = DateFormatHelper.createDateWithOriginalFormat(
      newJSDate,
      originalRaw
    );
    
    expect(result.toISOString()).toBe('2024-01-15T23:00:00-07:00');
  });

  it('should preserve space separator with partial-day changes', () => {
    const originalRaw = '2024-01-15 23:30:00-07:00';
    const originalDate = new Date('2024-01-16T06:30:00Z');
    const newJSDate = new Date(originalDate.getTime() + 2 * 60 * 60 * 1000);
    
    const result = DateFormatHelper.createDateWithOriginalFormat(
      newJSDate,
      originalRaw
    );
    
    expect(result.toISOString()).toBe('2024-01-16 01:30:00-07:00');
  });

  it('should handle whole-day changes correctly', () => {
    const originalRaw = '2024-01-15T10:30:00-07:00';
    const originalDate = new Date('2024-01-15T17:30:00Z');
    const newJSDate = new Date(originalDate.getTime() + 24 * 60 * 60 * 1000);
    
    const result = DateFormatHelper.createDateWithOriginalFormat(
      newJSDate,
      originalRaw
    );
    
    // Time should stay the same, only date changes
    expect(result.toISOString()).toBe('2024-01-16T10:30:00-07:00');
  });
});
