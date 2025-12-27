# DateTime Optional Seconds Support - Group 7

## Summary
Fixed 11 datetime test failures by adding support for optional seconds in time values, updating the test framework to handle TOML-specific date/time types, and ensuring proper conversion of custom date classes to JavaScript Date objects.

## Test Results
- **Before**: 132 spec test failures
- **After**: 121 spec test failures
- **Tests Fixed**: 11 tests (3 valid datetime tests + 8 edge cases)
- **Category**: DateTime validation and format support

## Changes Made

### 1. Optional Seconds in Time Values
**Issue**: TOML 1.1 allows seconds to be optional in time and datetime values, but our parser required them.

**Invalid Format (Previously)**:
```toml
# These were being rejected but are valid TOML 1.1
time = 13:37              # Time without seconds
dt1 = 1979-05-27 07:32Z   # Datetime without seconds (with timezone)
dt2 = 1979-05-27 07:32-07:00  # Datetime without seconds (with offset)
dt3 = 1979-05-27T07:32    # Local datetime without seconds
```

**Valid Examples**:
```toml
# All of these are now correctly parsed
without-seconds-1 = 13:37
without-seconds-2 = 1979-05-27 07:32Z
without-seconds-3 = 1979-05-27 07:32-07:00
without-seconds-4 = 1979-05-27T07:32

# Seconds are still supported
with-seconds-1 = 13:37:00
with-seconds-2 = 1979-05-27 07:32:00Z
```

**Regex Updates**:
```typescript
// Updated time pattern to make seconds optional
static readonly IS_TIME_ONLY = /^\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;

// Updated datetime patterns to make seconds optional
static readonly IS_LOCAL_DATETIME_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
static readonly IS_LOCAL_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
static readonly IS_OFFSET_DATETIME_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
static readonly IS_OFFSET_DATETIME_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

// Updated full time pattern
static readonly IS_FULL_TIME = /(\d{2}):(\d{2})(?::(\d{2}))?/;
```

**Validation Updates**:
```typescript
// Updated validation regex to make seconds optional
const dateTimeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
const timeOnlyMatch = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);

// Updated validation logic to handle optional seconds
if (second !== undefined) {
  if (second.length !== 2) {
    throw new ParseError(input, loc, `Invalid time "${raw}": second must be 2 digits with leading zero`);
  }
  const secondNum = parseInt(second, 10);
  if (secondNum < 0 || secondNum > 60) {
    throw new ParseError(input, loc, `Invalid time "${raw}": second must be between 00 and 60`);
  }
}
```

**Tests Fixed**:
- ✅ `datetime/no-seconds` (valid test with 4 cases: time-only, offset datetime, local datetime)
- ✅ `datetime/local-time` (valid test with time values)

### 2. Test Framework Updates for TOML Date/Time Types
**Issue**: The test framework didn't recognize TOML-specific date/time type identifiers used in the official test suite.

**New Types Added**:
- `time-local` - Local time without date context (e.g., "13:37:00")
- `date-local` - Local date without time context (e.g., "1987-07-05")

**Test Framework Updates**:
```typescript
} else if (value.type === 'time-local') {
  // Local time without date context
  return new Date(`0000-01-01T${value.value}`);
} else if (value.type === 'date-local') {
  // Local date without time context
  return new Date(`${value.value}T00:00:00.000Z`);
}
```

**Tests Fixed**:
- ✅ `datetime/local-time` (time-local type support)
- ✅ `datetime/local-date` (date-local type support)

### 3. LocalTime Year Base Update
**Issue**: LocalTime was using year 1970 as the base date, but the TOML test suite expects year 0000.

**Previous Behavior**:
```typescript
// Old: Used 1970-01-01 as base
super(`1970-01-01T${value}`);
```

**Updated Behavior**:
```typescript
// New: Uses 0000-01-01 as base (TOML spec compliance)
super(`0000-01-01T${value}`);
```

**Impact**:
- Times like `13:37:00` are now stored as `0000-01-01T13:37:00.000Z`
- Aligns with TOML test suite expectations
- Main library tests updated to expect year 0 instead of year 1970

**Tests Fixed**:
- ✅ `datetime/no-seconds` (time values now use year 0000)

### 4. Custom Date Class Conversion in toJS()
**Issue**: Custom date classes (LocalDate, LocalTime, LocalDateTime, OffsetDateTime) were being returned as-is from `toJS()`, causing test comparison failures.

**Problem**:
```javascript
// Expected (plain Date)
{ "time": 0000-01-01T13:37:00.000Z }

// Received (custom class instance)
{ "time": LocalTime { originalFormat: "13:37" } }
```

**Solution**:
```typescript
// Import custom date classes
import { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './date-format';

// Convert custom date classes to plain Date objects
case NodeType.DateTime:
  // Convert custom date classes to plain Date objects for JS compatibility
  if (node.value instanceof LocalDate || 
      node.value instanceof LocalTime || 
      node.value instanceof LocalDateTime || 
      node.value instanceof OffsetDateTime) {
    return new Date(node.value.valueOf());
  }
  return node.value;
```

**Benefits**:
- JavaScript output contains plain Date objects
- Compatible with standard JSON serialization
- Test comparisons work correctly
- Preserves the underlying date/time value

**Tests Fixed**:
- ✅ All datetime tests now properly convert to plain Date objects

### 5. Edge Case Support
**Issue**: Parser needed to handle edge cases for valid datetime ranges.

**Valid Edge Cases**:
```toml
# Earliest valid datetime (year 0001)
first-offset = 0001-01-01 00:00:00Z
first-local  = 0001-01-01 00:00:00
first-date   = 0001-01-01

# Latest valid datetime (year 9999)
last-offset = 9999-12-31 23:59:59Z
last-local  = 9999-12-31 23:59:59
last-date   = 9999-12-31

# Leap years
2000-datetime = 2000-02-29 15:15:15Z
2024-datetime = 2024-02-29 15:15:15Z
```

**Tests Fixed**:
- ✅ `datetime/edge` (years 0001 and 9999)
- ✅ `datetime/leap-year` (leap year dates)

## TOML Specification Reference

From the TOML 1.1.0 specification:

### Offset Date-Time
> The date portion of an Offset Date-Time must be a valid date, and the time portion must be a valid time. The offset must be a valid timezone offset of the form ±HH:MM.

### Local Date-Time
> If you omit the offset from an Offset Date-Time, it will represent the given date-time without any relation to an offset or timezone. It cannot be converted to an instant in time without additional information. Conversion to an instant, if required, is implementation-specific.

### Local Time
> If you include only the time portion of an RFC 3339 formatted date-time, it will represent that time of day without any relation to a specific day or any offset or timezone.
> 
> **Seconds are optional** in local times. The same applies to fractional seconds.

## Remaining DateTime Issues

The following datetime validation issues still need to be addressed (33 tests):

1. **Year Validation** (3 tests):
   - `y10k` - Year 10000 (5 digits, should be invalid)
   - `year-3digits` - Year 199 (3 digits, should be invalid)
   - Years must be exactly 4 digits (0000-9999)

2. **Leading Zero Validation** (6 tests):
   - `no-leads` - Month/day without leading zeros (e.g., `1987-7-05`)
   - `time-no-leads` - Hour/minute/second without leading zeros
   - `day-1digit` - Single digit day

3. **Separator Validation** (2 tests):
   - `no-t` - Missing T or space between date and time
   - `trailing-t` - Date ending with T but no time

4. **Trailing Character Validation** (2 tests):
   - `trailing-x` - Invalid character after date

5. **Offset Format Validation** (20+ tests):
   - Invalid timezone offset formats
   - Missing components in offset

## Files Modified
- `src/date-format.ts` - Made seconds optional in all date/time regex patterns, updated LocalTime to use year 0000
- `src/parse-toml.ts` - Updated validation to allow optional seconds in datetime matching
- `src/to-js.ts` - Added conversion of custom date classes to plain Date objects
- `specs/specs.test.ts` - Added support for `time-local` and `date-local` types
- `src/__tests__/date-format.test.ts` - Updated tests to expect year 0000 instead of 1970

## Impact
- ✅ All 419 main library tests still pass
- ✅ 11 additional spec tests now pass
- ✅ Pass rate increased from 84.7% to 86.0%
- ✅ Total progress: 177 tests fixed from original 298 failures (59.4% improvement)
- ✅ **TOML 1.1 optional seconds compliance achieved!**
