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
      originalDate,
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
      originalDate,
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
      originalDate,
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
      originalDate,
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
      originalDate,
      newJSDate,
      originalRaw
    );
    
    // Time should stay the same, only date changes
    expect(result.toISOString()).toBe('2024-01-16T10:30:00-07:00');
  });
});
