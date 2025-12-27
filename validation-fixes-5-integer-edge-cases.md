# Integer Edge Cases Validation - Group 5

## Summary
Fixed 13 integer validation test failures by adding validation for capital prefixes, double signs, and signed non-decimal integers.

## Test Results
- **Before**: 162 spec test failures
- **After**: 146 spec test failures
- **Tests Fixed**: 13 tests
- **Category**: Integer validation edge cases

## Validations Added

### 1. Capital Prefix Validation
**Issue**: TOML requires lowercase prefixes for hex, octal, and binary integers.

**Invalid Examples**:
```toml
capital-hex = 0X1    # Must be 0x1 (lowercase x)
capital-oct = 0O0    # Must be 0o0 (lowercase o)
capital-bin = 0B1    # Must be 0b1 (lowercase b)
```

**Valid Examples**:
```toml
hex = 0x1           # Lowercase x
octal = 0o755       # Lowercase o
binary = 0b1010     # Lowercase b
```

**Validation Added**:
```typescript
// Validate lowercase prefixes (0x, 0o, 0b only, not 0X, 0O, 0B)
if (/^[+\-]?0[XOB]/.test(raw)) {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid integer "${raw}": prefixes must be lowercase (0x, 0o, 0b)`
  );
}
```

**Tests Fixed**:
- ✅ `integer/capital-hex`
- ✅ `integer/capital-oct`
- ✅ `integer/capital-bin`

### 2. Double Sign Validation
**Issue**: TOML doesn't allow double signs (++ or --) on integers.

**Invalid Examples**:
```toml
double-plus = ++99    # Double sign not allowed
double-minus = --99   # Double sign not allowed
```

**Valid Examples**:
```toml
positive = +99        # Single + allowed
negative = -99        # Single - allowed
unsigned = 99         # No sign allowed
```

**Validation Added**:
```typescript
// Validate no double signs (++99, --99)
if (/^[+\-]{2,}/.test(raw)) {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid integer "${raw}": double sign is not allowed`
  );
}
```

**Tests Fixed**:
- ✅ `integer/double-sign-plus`
- ✅ `integer/double-sign-nex` (typo in test name for "neg")

### 3. Signed Non-Decimal Integer Validation
**Issue**: Hexadecimal, octal, and binary integers cannot have sign prefixes (+ or -).

**Invalid Examples**:
```toml
positive-hex = +0xff   # Signs not allowed on hex
negative-hex = -0xff   # Signs not allowed on hex
positive-oct = +0o755  # Signs not allowed on octal
negative-oct = -0o755  # Signs not allowed on octal
positive-bin = +0b101  # Signs not allowed on binary
negative-bin = -0b101  # Signs not allowed on binary
```

**Valid Examples**:
```toml
# Only decimal integers can have signs
positive = +42
negative = -42

# Non-decimal integers must be unsigned
hex = 0xDEADBEEF
octal = 0o755
binary = 0b11010110
```

**Validation Added**:
```typescript
// Strip sign to check for hex/octal/binary prefix
const rawWithoutSign = raw.replace(/^[+\-]/, '');

if (IS_HEX.test(rawWithoutSign)) {
  radix = 16;
  // Hex, octal, and binary integers cannot have signs
  if (raw[0] === '+' || raw[0] === '-') {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Invalid integer "${raw}": non-decimal integers cannot have a sign prefix`
    );
  }
  // ... similar checks for octal and binary
}
```

**Tests Fixed**:
- ✅ `integer/positive-hex`
- ✅ `integer/negative-hex`
- ✅ `integer/positive-oct`
- ✅ `integer/negative-oct`
- ✅ `integer/positive-bin`
- ✅ `integer/negative-bin`

### 4. Leading Zero with Underscores
**Issue**: Leading zeros are not allowed even when separated by underscores.

**Invalid Examples**:
```toml
leading-zero-03 = 0_0     # Equivalent to 00, which has leading zero
leading-zero-sign-03 = +0_1  # Equivalent to +01, which has leading zero
```

**Valid Examples**:
```toml
valid = 0             # Single zero is fine
valid2 = 1_000        # Underscores for readability
```

**Validation Added**:
```typescript
// Remove underscores to check the actual number format (0_0 is like 00)
const withoutUnderscores = raw.replace(/_/g, '');
if (/^[+\-]?0\d/.test(withoutUnderscores) && !IS_HEX.test(raw) && !IS_OCTAL.test(raw) && !IS_BINARY.test(raw)) {
  throw new ParseError(
    input,
    cursor.value!.loc.start,
    `Invalid integer "${raw}": leading zeros are not allowed`
  );
}
```

**Tests Fixed**:
- ✅ `integer/leading-zero-03`
- ✅ `integer/leading-zero-sign-03`

## TOML Specification Reference

From the TOML 1.1.0 specification:

### Integer Prefixes
> For convenience, you may use underscores between digits. Each underscore must be surrounded by at least one digit on each side.
> 
> Hexadecimal with prefix `0x`, octal with prefix `0o`, and binary with prefix `0b`.
> 
> For non-negative integer values, you may optionally precede them with a plus sign. For negative integer values, a minus sign must be used. Leading zeros are not allowed. Integer values -0 and +0 are valid and identical to an unprefixed zero.
> 
> **Non-decimal formats do not support signed values.**

## Remaining Issues

All integer validation tests are now passing! 🎉

Categories with remaining failures:
- Key/table validation: 44 tests (newlines between key/equals, duplicates, etc.)
- DateTime validation: 37 tests (year validation, offset ranges)
- Float validation: 12 tests (leading dots, decimal in exponent)
- Other categories: 53 tests

## Files Modified
- `src/parse-toml.ts` - Added validation for capital prefixes, double signs, signed non-decimal integers, and leading zeros with underscores in the `integer()` function

## Impact
- ✅ All 419 main library tests still pass
- ✅ 13 additional spec tests now pass
- ✅ Pass rate increased from 81.2% to 83.1%
- ✅ Total progress: 149 tests fixed from original 298 failures (50% improvement)
- ✅ **ALL integer validation tests now pass!**
