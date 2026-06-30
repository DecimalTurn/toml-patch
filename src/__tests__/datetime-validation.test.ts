/**
 * Tests for datetime validation, especially for edge cases with years 0-99
 * 
 * JavaScript's Date constructor treats years 0-99 as 1900-1999, which causes
 * incorrect validation of dates in TOML. These tests ensure that date validation
 * works correctly for all years, including 0000-0099.
 */

import parseTOML from '../parse-toml';
import ParseError from '../parse-error';

describe('DateTime validation for years 0-99', () => {
  describe('leap year validation', () => {
    it('should accept Feb 29 in year 0000 (leap year)', () => {
      // Year 0000 is a leap year (divisible by 400)
      const toml = 'date = 0000-02-29';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should reject Feb 30 in year 0000', () => {
      const toml = 'date = 0000-02-30';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
      expect(() => Array.from(parseTOML(toml))).toThrow(/day 30 invalid for 0000-02/);
    });

    it('should accept Feb 29 in year 0004 (leap year)', () => {
      // Year 0004 is a leap year (divisible by 4, not a century year)
      const toml = 'date = 0004-02-29';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should reject Feb 29 in year 0001 (not a leap year)', () => {
      const toml = 'date = 0001-02-29';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
      expect(() => Array.from(parseTOML(toml))).toThrow(/day 29 invalid for 0001-02/);
    });

    it('should reject Feb 29 in year 0100 (not a leap year, century but not divisible by 400)', () => {
      // Year 0100 is NOT a leap year (divisible by 100 but not by 400)
      const toml = 'date = 0100-02-29';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
      expect(() => Array.from(parseTOML(toml))).toThrow(/day 29 invalid for 0100-02/);
    });

    it('should accept Feb 28 in year 0001 (not a leap year)', () => {
      const toml = 'date = 0001-02-28';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should accept Feb 28 in year 0099', () => {
      const toml = 'date = 0099-02-28';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });
  });

  describe('days in month validation for years 0-99', () => {
    it('should accept Jan 31 in year 0050', () => {
      const toml = 'date = 0050-01-31';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should reject Jan 32 in year 0050', () => {
      const toml = 'date = 0050-01-32';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
      expect(() => Array.from(parseTOML(toml))).toThrow(/day must be 01-31/);
    });

    it('should accept Apr 30 in year 0075 (April has 30 days)', () => {
      const toml = 'date = 0075-04-30';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should reject Apr 31 in year 0075 (April only has 30 days)', () => {
      const toml = 'date = 0075-04-31';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
      expect(() => Array.from(parseTOML(toml))).toThrow(/day 31 invalid for 0075-04/);
    });
  });

  describe('comparison with regular years', () => {
    it('should validate year 2000 correctly (leap year)', () => {
      const toml = 'date = 2000-02-29';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should validate year 1900 correctly (not a leap year)', () => {
      const toml = 'date = 1900-02-29';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
      expect(() => Array.from(parseTOML(toml))).toThrow(/day 29 invalid for 1900-02/);
    });

    it('should validate year 2024 correctly (leap year)', () => {
      const toml = 'date = 2024-02-29';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });
  });

  describe('datetime with years 0-99', () => {
    it('should accept valid datetime with year 0042', () => {
      const toml = 'dt = 0042-12-25T10:30:00Z';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should reject invalid datetime with Feb 29 in year 0003', () => {
      const toml = 'dt = 0003-02-29T10:30:00Z';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
      expect(() => Array.from(parseTOML(toml))).toThrow(/day 29 invalid for 0003-02/);
    });
  });
});

describe('Offset on local time or local date must be rejected', () => {
  describe('local time with offset', () => {
    it('should reject local time with Z offset', () => {
      const toml = 't = 07:32:00Z';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
    });

    it('should reject local time with numeric offset', () => {
      const toml = 't = 07:32:00-07:00';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
    });

    it('should reject local time with positive offset', () => {
      const toml = 't = 08:30:00+05:30';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
    });
  });

  describe('local date with offset', () => {
    it('should reject local date with Z offset', () => {
      const toml = 'd = 1979-05-27Z';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
    });

    it('should reject local date with numeric offset (no T)', () => {
      const toml = 'd = 1979-05-27-07:00';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
    });

    it('should reject local date with positive offset (no T)', () => {
      const toml = 'd = 1979-05-27+02:00';
      expect(() => Array.from(parseTOML(toml))).toThrow(ParseError);
    });
  });

  describe('offset datetime should still work', () => {
    it('should accept offset datetime with T separator', () => {
      const toml = 'dt = 1979-05-27T07:32:00-07:00';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should accept offset datetime with space separator', () => {
      const toml = 'dt = 1979-05-27 07:32:00+02:00';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should accept offset datetime with Z', () => {
      const toml = 'dt = 1979-05-27T07:32:00Z';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });
  });

  describe('bare local time and local date should still work', () => {
    it('should accept bare local time', () => {
      const toml = 't = 07:32:00';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should accept bare local date', () => {
      const toml = 'd = 1979-05-27';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });

    it('should accept local datetime without offset', () => {
      const toml = 'dt = 1979-05-27T07:32:00';
      expect(() => Array.from(parseTOML(toml))).not.toThrow();
    });
  });
});
