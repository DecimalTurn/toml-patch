# Float Validation Fixes - Group 2

## Summary
Fixed 9 float validation test failures by adding comprehensive validation for float format requirements in TOML.

## Test Results
- **Before**: 203 spec test failures
- **After**: 194 spec test failures
- **Tests Fixed**: 9 tests
- **Category**: Float validation

## Validations Added

### 1. Underscore Placement in Float Integer Part
**Issue**: TOML requires underscores in floats to be surrounded by digits, not adjacent to operators or decimal points.

**Invalid Examples**:
- `1_.2` - underscore before decimal point
- `_1.2` - leading underscore
- `1__2.3` - consecutive underscores

**Validation Added**:
```typescript
// No trailing underscore before decimal
if (/_$/.test(raw)) {
  throw new ParseError(..., "underscore before decimal point is not allowed");
}

// No leading underscore
if (/^[+\-]?_/.test(raw)) {
  throw new ParseError(..., "leading underscore is not allowed");
}

// No consecutive underscores
if (/__/.test(raw)) {
  throw new ParseError(..., "consecutive underscores are not allowed");
}
```

**Tests Fixed**:
- ✅ `float/us-before-dot`
- ✅ `float/leading-us`

### 2. Underscore Placement in Fractional Part
**Issue**: Fractional part (after decimal) cannot start or end with underscore.

**Invalid Examples**:
- `1._2` - underscore after decimal point
- `1.2_` - trailing underscore in fractional part

**Validation Added**:
```typescript
// Validate fractional part
if (/^_/.test(fracPart)) {
  throw new ParseError(..., "underscore after decimal point is not allowed");
}
if (/_$/.test(fracPart)) {
  throw new ParseError(..., "trailing underscore in fractional part is not allowed");
}
```

**Tests Fixed**:
- ✅ `float/us-after-dot`
- ✅ `float/trailing-us`

### 3. Underscore Placement in Exponent
**Issue**: Exponents cannot have underscores at the start, end, or around the 'e'/'E'.

**Invalid Examples**:
- `1e_23` - underscore at start of exponent
- `1e23_` - trailing underscore in exponent
- `1_e23` - underscore before exponent marker

**Validation Added**:
```typescript
// Check for trailing underscore before E
if (/_[eE]/.test(raw)) {
  throw new ParseError(..., "underscore before exponent is not allowed");
}

// Check for underscore after E or after sign
if (/[eE][+\-]?_/.test(raw)) {
  throw new ParseError(..., "underscore at start of exponent is not allowed");
}

// Check for trailing underscore in exponent
if (/_$/.test(raw)) {
  throw new ParseError(..., "trailing underscore in exponent is not allowed");
}
```

**Tests Fixed**:
- ✅ `float/exp-leading-us`
- ✅ `float/exp-trailing-us`
- ✅ `float/exp-trailing-us-01`

### 4. Consecutive Underscores in Exponent
**Issue**: Double underscores not allowed anywhere in the number.

**Invalid Examples**:
- `1e1__23` - consecutive underscores in exponent

**Validation Added**:
Already covered by general consecutive underscore check.

**Tests Fixed**:
- ✅ `float/exp-double-us`

## Remaining Float Validation Issues (12 tests)

These require different approaches:

1. **Leading Dot** (2 tests): `.5`, `+.12` - numbers starting with decimal point (tokenizer issue)
2. **Incomplete Exponent** (6 tests): `1e`, `1e+`, `1e-` - these are partially caught but need refinement
3. **Decimal in Exponent** (3 tests): `1e2.3` - decimal point in exponent part
4. **Valid test** (1 test): `inf-and-nan` test expects pass but may be failing for other reasons

## Files Modified
- `src/parse-toml.ts` - Enhanced `float()` function with comprehensive underscore and exponent validation

## Impact
- ✅ All 419 main library tests still pass
- ✅ 9 additional spec tests now pass
- ✅ Pass rate increased from 76.5% to 77.5%
- ✅ Total progress: 75 tests fixed from original 298 failures
