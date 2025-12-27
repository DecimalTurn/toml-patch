# Float Edge Cases Validation - Group 6

## Summary
Fixed 12 float validation test failures by adding validation for leading dots, incomplete exponents, decimal points in exponents, and underscores before exponents.

## Test Results
- **Before**: 146 spec test failures
- **After**: 132 spec test failures  
- **Tests Fixed**: 14 tests (12 invalid + 1 valid + 1 other)
- **Category**: Float validation edge cases

## Validations Added

### 1. Leading Dot Validation
**Issue**: Floats cannot start with a decimal point - there must be at least one digit before the dot.

**Invalid Examples**:
```toml
leading-dot-plus = +.12345    # Must have digit before dot
leading-dot-neg = -.12345     # Must have digit before dot
```

**Valid Examples**:
```toml
valid = 0.12345              # Leading zero is fine for floats
valid2 = +0.5                # Signed float with leading zero
valid3 = -1.5                # Negative float
```

**Validation Added**:
```typescript
// Validate that there's an integer part before the decimal point
const withoutSign = raw.replace(/^[+\-]/, '');
if (withoutSign === '' || withoutSign === '_') {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid float: decimal point must be preceded by at least one digit`
  );
}
```

**Tests Fixed**:
- ✅ `float/leading-dot-plus`
- ✅ `float/leading-dot-neg`

### 2. Fractional Part Must Start with Digit
**Issue**: The fractional part (after the decimal point) must start with a digit, not an exponent marker.

**Invalid Examples**:
```toml
trailing-exp-dot = 0.e        # Fractional part cannot be just "e"
exp-dot-02 = 1.e2             # Fractional part cannot start with "e"
exp-dot-03 = 3.e+20           # Fractional part cannot start with "e"
```

**Valid Examples**:
```toml
valid = 1.0e2                 # Fractional part "0e2" starts with digit
valid2 = 3.14e+20             # Fractional part "14e+20" starts with digit
```

**Validation Added**:
```typescript
// Validate that fractional part starts with digits
if (!/^\d/.test(fracPart)) {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid float: fractional part must start with a digit, found "${fracPart}"`
  );
}
```

**Tests Fixed**:
- ✅ `float/trailing-exp-dot` (actually `0.e`, not `0.0e`)
- ✅ `float/exp-dot-02`
- ✅ `float/exp-dot-03`

### 3. Incomplete Exponent Validation
**Issue**: Exponents must have digits after the `e` or `E` marker (and optional sign).

**Invalid Examples**:
```toml
trailing-exp = 0.0E           # Exponent has no digits
trailing-exp-plus = 0.0e+     # Exponent has sign but no digits
trailing-exp-minus = 0.0e-    # Exponent has sign but no digits
```

**Valid Examples**:
```toml
valid = 0.0E0                 # Complete exponent
valid2 = 1.5e+10              # Complete exponent with sign
valid3 = 2.0e-5               # Complete negative exponent
```

**Validation Added**:
```typescript
// Check for incomplete exponent (just E with nothing or just sign after)
if (/[eE][+\-]?$/.test(raw)) {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid float "${raw}": incomplete exponent`
  );
}
```

**Tests Fixed**:
- ✅ `float/trailing-exp`
- ✅ `float/trailing-exp-plus`
- ✅ `float/trailing-exp-minus`

### 4. Decimal Point in Exponent Validation
**Issue**: Exponents must be integers - they cannot contain decimal points.

**Invalid Examples**:
```toml
exp-dot-01 = 1e2.3            # Exponent cannot have decimal (2.3)
```

**Valid Examples**:
```toml
valid = 1e2                   # Integer exponent
valid2 = 1.0e-5               # Integer exponent (5, not 5.0)
```

**Validation Added**:
```typescript
// Check for decimal point in exponent
if (/[eE][+\-]?.*\./.test(raw)) {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid float "${raw}": decimal point not allowed in exponent`
  );
}
```

**Tests Fixed**:
- ✅ `float/exp-dot-01`

### 5. Underscore Before Exponent Validation
**Issue**: Underscores cannot appear immediately before the exponent marker.

**Invalid Examples**:
```toml
trailing-us-exp-02 = 1.2_e2   # Underscore before "e" not allowed
exp-trailing-us-02 = 1.2_e2   # Same test (duplicate)
```

**Valid Examples**:
```toml
valid = 1.2e2                 # No underscore before "e"
valid2 = 1_000.5e2            # Underscores for readability in integer part
valid3 = 1.000_5e2            # Underscores in fractional part
```

**Validation Added**:
```typescript
// Check for trailing underscore before E
if (/_[eE]/.test(raw)) {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid float "${raw}": underscore before exponent is not allowed`
  );
}
```

**Tests Fixed**:
- ✅ `float/trailing-us-exp-02`
- ✅ `float/exp-trailing-us-02`

### 6. Special Float Values (inf/nan) Fix
**Issue**: The test framework wasn't correctly converting string representations of `inf` and `nan` to JavaScript values.

**Fix**: Updated the test framework to properly handle special float string values:
- `"inf"` → `Infinity`
- `"-inf"` → `-Infinity`
- `"nan"` → `NaN`

**Note**: Both `+nan` and `-nan` are converted to `NaN` (the sign is not preserved, as per TOML spec).

**Tests Fixed**:
- ✅ `float/inf-and-nan` (valid test)

## TOML Specification Reference

From the TOML 1.1.0 specification:

### Float Format
> A float consists of an integer part (which follows the same rules as decimal integer values) followed by a fractional part and/or an exponent part.
> 
> **A fractional part is a decimal point followed by one or more digits.**
> 
> An exponent part is an E (upper or lower case) followed by an integer part (which follows the same rules as decimal integer values but may have a leading +).

### Special Float Values
> Float values -0.0 and +0.0 are valid and should map according to IEEE 754.
> 
> Special float values can also be expressed. They are always lowercase.
> - `inf` - positive infinity
> - `+inf` - positive infinity
> - `-inf` - negative infinity
> - `nan` - not a number
> - `+nan` - not a number (sign not preserved)
> - `-nan` - not a number (sign not preserved)

## Remaining Issues

All float validation tests are now passing! 🎉

Categories with remaining failures:
- Key/table validation: 44 tests (newlines between key/equals, duplicates, etc.)
- DateTime validation: 37 tests (year validation, offset ranges)
- Other categories: 51 tests

## Files Modified
- `src/parse-toml.ts` - Added validation for leading dots, incomplete exponents, decimal in exponent, underscore before exponent, fractional part format, and fixed NaN sign handling
- `specs/specs.test.ts` - Fixed test framework to correctly convert `inf` and `nan` string values to JavaScript `Infinity` and `NaN`

## Impact
- ✅ All 419 main library tests still pass
- ✅ 14 additional spec tests now pass
- ✅ Pass rate increased from 83.1% to 84.7%
- ✅ Total progress: 166 tests fixed from original 298 failures (55.7% improvement)
- ✅ **ALL float validation tests now pass!**
