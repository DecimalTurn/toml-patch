# Integer Validation Fixes - Group 1

## Summary
Fixed 20 integer validation test failures by adding comprehensive validation for integer format requirements in TOML.

## Test Results
- **Before**: 223 spec test failures
- **After**: 203 spec test failures  
- **Tests Fixed**: 20 tests
- **Category**: Integer validation

## Validations Added

### 1. Underscore Placement Validation
**Issue**: TOML requires underscores in numbers to be surrounded by digits.

**Invalid Examples**:
- `123_` - trailing underscore
- `_123` - leading underscore  
- `1__23` - consecutive underscores
- `0x_FF` - underscore after prefix
- `0o_77` - underscore after prefix

**Validation Added**:
```typescript
// No trailing underscores
if (/_$/.test(raw)) {
  throw new ParseError(..., "underscores cannot be at the end");
}

// No leading underscores (after optional sign)
if (/^[+\-]?_/.test(raw)) {
  throw new ParseError(..., "underscores cannot be at the start");
}

// No consecutive underscores
if (/__/.test(raw)) {
  throw new ParseError(..., "consecutive underscores are not allowed");
}
```

**Tests Fixed**:
- ✅ `integer/trailing-us`
- ✅ `integer/trailing-us-oct`
- ✅ `integer/trailing-us-hex`
- ✅ `integer/trailing-us-bin`
- ✅ `integer/leading-us`
- ✅ `integer/leading-us-oct`
- ✅ `integer/leading-us-hex`
- ✅ `integer/leading-us-bin`
- ✅ `integer/double-us`
- ✅ `integer/us-after-oct`
- ✅ `integer/us-after-hex`
- ✅ `integer/us-after-bin`

### 2. Incomplete Number Validation
**Issue**: Numbers with only a prefix (0x, 0o, 0b) but no digits are invalid.

**Invalid Examples**:
- `0x` - incomplete hexadecimal
- `0o` - incomplete octal
- `0b` - incomplete binary

**Validation Added**:
```typescript
// For hexadecimal
numericPart = raw.replace(/^0x/i, '');
if (!numericPart || numericPart === '_' || /^_/.test(numericPart)) {
  throw new ParseError(..., "incomplete hexadecimal number");
}

// Similar for octal and binary
```

**Tests Fixed**:
- ✅ `integer/incomplete-hex`
- ✅ `integer/incomplete-oct`
- ✅ `integer/incomplete-bin`

### 3. Invalid Digit Validation
**Issue**: Each number base must use only valid digits for that base.

**Invalid Examples**:
- `0o778` - '8' is not a valid octal digit (0-7 only)
- `0xGG` - 'G' is not a valid hex digit
- `0b102` - '2' is not a valid binary digit (0-1 only)

**Validation Added**:
```typescript
// Hexadecimal validation
const hexDigits = numericPart.replace(/_/g, '');
if (!/^[0-9a-fA-F]+$/.test(hexDigits)) {
  throw new ParseError(..., "invalid hexadecimal digits");
}

// Octal validation
const octalDigits = numericPart.replace(/_/g, '');
if (!/^[0-7]+$/.test(octalDigits)) {
  throw new ParseError(..., "invalid octal digits (must be 0-7)");
}

// Binary validation
const binaryDigits = numericPart.replace(/_/g, '');
if (!/^[01]+$/.test(binaryDigits)) {
  throw new ParseError(..., "invalid binary digits (must be 0 or 1)");
}
```

**Tests Fixed**:
- ✅ `integer/invalid-hex-01`
- ✅ `integer/invalid-hex-02`
- ✅ `integer/invalid-hex-03`
- ✅ `integer/invalid-oct`
- ✅ `integer/invalid-bin`

## Remaining Integer Validation Issues (13 tests)

These require tokenizer-level changes or are edge cases:

1. **Capital Prefixes** (3 tests): `0X1`, `0O7`, `0B1` - need to reject capital X, O, B
2. **Signed Non-Decimal** (6 tests): Already validated but may need refinement
3. **Double Signs** (2 tests): `++99`, `--99` - need tokenizer changes
4. **Leading Zero Edge Cases** (2 tests): `+0_1` type patterns

## Files Modified
- `src/parse-toml.ts` - Enhanced `integer()` function with comprehensive validation

## Impact
- ✅ All 419 main library tests still pass
- ✅ 20 additional spec tests now pass
- ✅ Pass rate increased from 74.2% to 76.5%
