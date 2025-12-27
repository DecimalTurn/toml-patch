# Validation Fixes - Group 8: DateTime Format Validation

## Overview
This group addresses validation of datetime component formats, including:
- Year digit count (must be exactly 4 digits)
- Month/day digit count (must be exactly 2 digits with leading zeros)
- Hour/minute/second digit count (must be exactly 2 digits with leading zeros)
- Trailing invalid characters after dates
- Missing separators between date and time components

## Tests Fixed

### Year Digit Count (5 tests)
- `datetime/year-3digits` - Rejects dates with 3-digit years (e.g., `199-09-09`)
- `datetime/y10k` - Rejects dates with 5-digit years (e.g., `10000-01-01`)
- `datetime/y10k-1` - Rejects dates with years exceeding 9999
- `datetime/y10k-2` - Rejects dates with years exceeding 9999
- `datetime/y10k-3` - Rejects dates with years exceeding 9999

### Leading Zero Validation (6 tests)
- `datetime/no-leads` - Rejects dates with missing leading zeros in month (e.g., `1987-7-05`)
- `datetime/no-leads-month` - Rejects dates with 1-digit months
- `datetime/no-leads-day` - Rejects dates with missing leading zeros in day
- `datetime/day-1digit` - Rejects dates with 1-digit days (e.g., `1997-09-9`)
- `datetime/time-no-leads-01` - Rejects times with missing leading zeros in hour (e.g., `1:32:00`)
- `datetime/time-no-leads-02` - Rejects times with missing leading zeros in second (e.g., `01:32:0`)

### Trailing Character Validation (2 tests)
- `datetime/trailing-t` - Rejects dates ending with 'T' without time component (e.g., `2006-01-30T`)
- `datetime/trailing-x` - Rejects dates with invalid trailing characters (e.g., `2020-01-01x`)

### Separator Validation (2 tests)
- `datetime/no-t` - Rejects datetimes with missing separator between date and time (e.g., `1987-07-0517:45:00`)
- `datetime/missing-separator` - Rejects datetimes without 'T' or space separator

## Implementation Details

### Files Modified
- `src/parse-toml.ts`

### Changes Made

1. **Enhanced validateDateTimeFormat() function**:
   - Added pre-validation checks at the start of the function
   - Validates year is exactly 4 digits before component extraction
   - Validates month and day are exactly 2 digits with leading zeros
   - Validates time components (hour, minute, second) are exactly 2 digits
   - Checks for trailing invalid characters using character class `[a-su-zA-SU-Z]` (excludes T/t which are valid separators)
   - Checks for missing separators between date and time

2. **Added fallback validation in integer() function**:
   - Rejects patterns that look like invalid dates (e.g., `199-09-09`, `1987-7-05`)
   - Rejects patterns that look like invalid times (e.g., `1:32:00`)
   - Catches edge cases where invalid formats might slip through as integers

### Code Example

```typescript
function validateDateTimeFormat(raw: string, input: string, loc: any): void {
  // First, check for invalid formats that regex might partially match
  
  // Check for trailing invalid characters FIRST before other validations
  const validDateTimePattern = /^[\d]{4}-[\d]{2}-[\d]{2}(?:[T ][\d]{2}:[\d]{2}(?::[\d]{2})?(?:\.[\d]+)?(?:[Zz]|[+-][\d]{2}:[\d]{2})?)?$/;
  const validTimePattern = /^[\d]{2}:[\d]{2}(?::[\d]{2})?(?:\.[\d]+)?$/;
  
  if (!validDateTimePattern.test(raw) && !validTimePattern.test(raw)) {
    // Check for trailing T without time
    if (/^\d{4}-\d{2}-\d{2}T$/.test(raw)) {
      throw new ParseError(input, loc, 
        `Invalid date "${raw}": date cannot end with 'T' without a time component`);
    }
    
    // Check for any invalid character after date (excluding T/t which are valid)
    if (/^\d{4}-\d{2}-\d{2}[a-su-zA-SU-Z]/.test(raw)) {
      throw new ParseError(input, loc, 
        `Invalid date "${raw}": unexpected character after date`);
    }
    
    // Check for missing separator
    if (/^\d{4}-\d{2}-\d{2}\d{2}:\d{2}/.test(raw)) {
      throw new ParseError(input, loc, 
        `Invalid datetime "${raw}": missing separator 'T' or space between date and time`);
    }
  }
  
  // Check for year with wrong number of digits (must be exactly 4)
  const yearMatch = raw.match(/^(\d+)-/);
  if (yearMatch && yearMatch[1].length !== 4) {
    throw new ParseError(input, loc, 
      `Invalid date "${raw}": year must be exactly 4 digits, found ${yearMatch[1].length}`);
  }
  
  // Additional component validation...
}
```

### Key Insights

1. **Character Class for Trailing Characters**: The regex `[a-su-zA-SU-Z]` correctly excludes T/t (valid datetime separators) while catching all other letters. Initial attempt used `[a-wyzA-WYZ]` which incorrectly excluded the letter 'x'.

2. **Validation Order Matters**: Pre-validation checks must run BEFORE component extraction to catch malformed patterns that regex might partially match.

3. **Fallback Validation**: Adding validation in integer() catches edge cases where invalid date/time patterns don't trigger datetime() but would be incorrectly parsed as numbers.

4. **Regex Anchors**: End anchors ($) are crucial for exact format matching to prevent partial matches.

## Test Results
- **Tests Fixed**: 15 tests
- **Previous Status**: 121 failing tests
- **Current Status**: 100 failing tests
- **Improvement**: +21 tests passing (includes 15 from this group + 6 side effects)

## TOML Specification Compliance
These fixes ensure strict compliance with TOML 1.1.0 specification for datetime formats:
- Years must be exactly 4 digits (0000-9999)
- Months and days must be exactly 2 digits with leading zeros (01-12, 01-31)
- Hours, minutes, and seconds must be exactly 2 digits with leading zeros (00-23, 00-59, 00-60)
- Datetime separator must be 'T' or space character
- No trailing invalid characters after valid datetime values
