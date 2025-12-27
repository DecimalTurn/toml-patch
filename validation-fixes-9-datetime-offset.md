# Validation Fixes - Group 9: DateTime Timezone Offset Validation

## Overview
This group addresses validation of datetime timezone offset formats and fractional seconds, including:
- Timezone offset format (must include colon separator)
- Timezone offset hour and minute digit counts
- Timezone offset value ranges (hour: 00-23, minute: 00-59)
- Missing offset components validation
- Fractional seconds format (must have digits after decimal point)
- Date separator validation (year-month separator required)

## Tests Fixed

### Fractional Seconds Validation (1 test)
- `datetime/second-trailing-dotz` - Rejects fractional seconds with no digits after decimal (e.g., `2016-09-09T09:09:09.Z`)

### Timezone Offset Format Validation (11 tests)
- `datetime/offset-plus-no-minute` - Rejects offset missing minute component (e.g., `+09`)
- `datetime/offset-plus-no-hour-minute` - Rejects offset with only `+` sign (e.g., `+`)
- `datetime/offset-plus-no-hour-minute-sep` - Rejects offset without separator (e.g., `+0909`)
- `datetime/offset-plus-minute-1digit` - Rejects offset with 1-digit minute (e.g., `+09:9`)
- `datetime/offset-overflow-minute` - Rejects offset minute > 59 (e.g., `+12:60`)
- `datetime/offset-overflow-hour` - Rejects offset hour > 23 (e.g., `+25:00`)
- `datetime/offset-minus-no-minute` - Rejects negative offset missing minute (e.g., `-09`)
- `datetime/offset-minus-no-hour-minute` - Rejects offset with only `-` sign (e.g., `-`)
- `datetime/offset-minus-no-hour-minute-sep` - Rejects negative offset without separator
- `datetime/offset-minus-minute-1digit` - Rejects negative offset with 1-digit minute (e.g., `-09:9`)
- `datetime/no-year-month-sep` - Rejects dates with missing year-month separator (e.g., `199709-09`)

## Implementation Details

### Files Modified
- `src/parse-toml.ts`

### Changes Made

1. **Enhanced validateDateTimeFormat() function**:
   - Added validation for fractional seconds (must have at least one digit after decimal point)
   - Added validation for trailing +/- without hour/minute components
   - Added timezone offset format validation (requires colon separator, exact digit counts, range checks)
   - Validates offset only appears after time components (not after date-only values)

2. **Enhanced integer() function**:
   - Added check for 6-digit numbers followed by hyphen (e.g., `199709-09`)
   - Prevents invalid date formats from being parsed as integers

### Code Example

```typescript
function validateDateTimeFormat(raw: string, input: string, loc: any): void {
  // Check for invalid fractional seconds (e.g., ".Z" with no digits after the dot)
  if (/\.\s*[Zz]/.test(raw) || /\.\s*[+-]/.test(raw)) {
    throw new ParseError(
      input, loc,
      `Invalid datetime "${raw}": fractional seconds must have at least one digit after decimal point`
    );
  }
  
  // Check for trailing +/- without hour/minute (e.g., "2024-01-15T10:30:00+")
  if (/[+-]\s*$/.test(raw)) {
    throw new ParseError(
      input, loc,
      `Invalid datetime "${raw}": timezone offset requires hour and minute components`
    );
  }
  
  // Check for timezone offset format if present (must come after time, not after date)
  const hasTime = /\d{2}:\d{2}/.test(raw);
  const offsetMatch = hasTime ? raw.match(/[+-](\d+):?(\d*)\s*$/) : null;
  if (offsetMatch) {
    const [fullOffset, hours, minutes] = offsetMatch;
    
    // Check if offset is missing the colon separator (e.g., +0909 instead of +09:09)
    if (!fullOffset.includes(':')) {
      throw new ParseError(input, loc,
        `Invalid timezone offset "${fullOffset}": must use colon separator (e.g., +09:09)`);
    }
    
    // Validate hour component (must be exactly 2 digits)
    if (hours.length !== 2) {
      throw new ParseError(input, loc,
        `Invalid timezone offset "${fullOffset}": hour must be exactly 2 digits`);
    }
    
    // Validate hour range (00-23)
    const hourNum = parseInt(hours, 10);
    if (hourNum < 0 || hourNum > 23) {
      throw new ParseError(input, loc,
        `Invalid timezone offset "${fullOffset}": hour must be between 00 and 23, found ${hours}`);
    }
    
    // Validate minute component exists and is exactly 2 digits
    if (!minutes || minutes.length === 0) {
      throw new ParseError(input, loc,
        `Invalid timezone offset "${fullOffset}": minute component is required`);
    }
    if (minutes.length !== 2) {
      throw new ParseError(input, loc,
        `Invalid timezone offset "${fullOffset}": minute must be exactly 2 digits`);
    }
    
    // Validate minute range (00-59)
    const minuteNum = parseInt(minutes, 10);
    if (minuteNum < 0 || minuteNum > 59) {
      throw new ParseError(input, loc,
        `Invalid timezone offset "${fullOffset}": minute must be between 00 and 59, found ${minutes}`);
    }
  }
}
```

### Key Insights

1. **Offset Context Matters**: Timezone offsets are only valid after time components, not after date-only values. The validation checks for the presence of time (`\d{2}:\d{2}`) before attempting to validate an offset.

2. **Regex Precision**: The offset regex `[+-](\d+):?(\d*)\s*$` must be carefully applied to avoid false matches on date components (e.g., `-15` in `2024-01-15`).

3. **Range Validation**: Hour must be 00-23 (not 00-24 as some implementations might allow), and minute must be 00-59.

4. **Separator Requirement**: TOML 1.1 requires the colon separator in timezone offsets (e.g., `+09:09`, not `+0909`).

## Test Results
- **Tests Fixed**: 12 tests (1 fractional + 11 offset)
- **Previous Status**: 100 failing tests
- **Current Status**: 88 failing tests
- **Improvement**: +12 tests passing

## TOML Specification Compliance
These fixes ensure strict compliance with TOML 1.1.0 specification for datetime timezone offsets:
- Timezone offsets must use format `[+-]HH:MM` with colon separator
- Offset hour must be exactly 2 digits (00-23)
- Offset minute must be exactly 2 digits (00-59)
- Fractional seconds must have at least one digit after decimal point
- Date components must be properly separated with hyphens
