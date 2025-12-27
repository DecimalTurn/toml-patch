# TOML Test Suite Compliance Status

This document tracks the compliance status of `toml-patch` with the official [toml-test](https://github.com/toml-lang/toml-test) suite.

## ✅ What's Working

### Valid Test Coverage
- ✅ Reading TOML files from `submodules/toml-test/tests/valid/*.toml`
- ✅ Reading corresponding JSON expected output
- ✅ Implementing tagged JSON format conversion via `expandJSON` function
- ✅ Testing spec-tests from `submodules/spec-tests/values/*.toml`

### Tagged JSON Type Support
The `expandJSONValue` function properly handles:
- ✅ `string` - Basic string values
- ✅ `integer` - Integer values
- ✅ `float` - Floating point values
- ✅ `bool` - Boolean values
- ✅ `datetime` - Offset date-time values
- ✅ `datetime-local` - Local date-time values
- ⚠️ `date` - Partially working (see issues below)
- ⚠️ `time` - Partially working (see issues below)

### Test Statistics (Before Invalid Tests Added)
- Valid tests: ~100+ passing
- Invalid tests: Not tested (0)

---

## ❌ What's Missing

### 1. Invalid Test Coverage ⚠️ **CRITICAL**

**Status:** ✅ Now added (but many failing - indicates parser bugs)

**Problem:** 
- 483+ invalid TOML test files from `submodules/toml-test/tests/invalid/**/*.toml` were not being tested
- 54+ invalid test files from `submodules/spec-tests/errors/*.toml` were not being tested

**According to the README:**
> Tests are divided into two groups: "invalid" and "valid". Decoders or encoders that reject "invalid" tests pass the tests.

**Impact:**
The parser was not being validated to properly reject malformed TOML, which is critical for security and correctness.

**Current Status (After Adding Invalid Tests):**
```
TOML Version: 1.1.0
Tests:       298 failed, 565 passed, 863 total
Pass Rate:   65.5%
```
This indicates significant gaps in validation logic that need to be addressed.

---

### 2. Incorrect Date/Time Type Names

**Status:** ❌ Not fixed

**Problem:**
The toml-test specification defines these date/time types:
- `datetime` ✅ Implemented correctly
- `datetime-local` ✅ Implemented correctly  
- `date-local` ❌ Implementation uses `date` instead
- `time-local` ❌ Implementation uses `time` instead

**Location:** `specs/specs.test.ts`, lines 68-71

**Current Code:**
```typescript
} else if (value.type === 'date') {
  return new Date(`${value.value}T00:00:00.000Z`);
} else if (value.type === 'time') {
  return new Date(`0000-01-01T${value.value}`);
```

**Should be:**
```typescript
} else if (value.type === 'date-local') {
  return new Date(`${value.value}T00:00:00.000Z`);
} else if (value.type === 'time-local') {
  return new Date(`0000-01-01T${value.value}`);
```

---

### 3. Questionable Date/Time Conversion Logic

**Status:** ❌ Not addressed

**Problems:**

#### a) Loss of Type Information
Converting all date/time types to JavaScript `Date` objects loses the distinction between:
- Offset date-times (with timezone)
- Local date-times (no timezone)
- Local dates (no time component)
- Local times (no date component)

This is a fundamental semantic difference in TOML that should be preserved.

#### b) Arbitrary Date/Time Values
The current conversion for local times:
```typescript
return new Date(`0000-01-01T${value.value}`)
```

Uses an arbitrary date (`0000-01-01`) which:
- May not be a valid date in all calendars
- Doesn't represent the actual semantic meaning (time without date)
- Could cause timezone conversion issues

**Possible Solutions:**
1. Keep the raw string values and type information
2. Use a custom type system (e.g., `{ type: 'time-local', value: '12:30:00' }`)
3. Use a date/time library that preserves type distinctions (e.g., `js-joda`)

---

### 4. No TOML Version Filtering

**Status:** ✅ **IMPLEMENTED** (TOML 1.1.0)

**Solution:**
Version filtering has been implemented for TOML 1.1.0. The test suite now:
- Reads the `submodules/toml-test/tests/files-toml-1.1.0` file list
- Filters both valid and invalid tests based on this list
- Only runs tests appropriate for TOML 1.1.0 specification

**Implementation Details:**
- Configuration: Set via `TOML_VERSION = '1.1.0'` constant in `specs/specs.test.ts`
- Helper function: `isIncludedInVersion()` checks if a file should be tested
- Applied to: Both `valid` and `invalid` test categories from toml-test

**To switch versions:**
Simply change the `TOML_VERSION` constant to `'1.0.0'` or `'1.1.0'` as needed.

---

## 📊 Test Coverage Summary

**Testing against:** TOML 1.1.0 specification

| Test Category | Files | Status | Pass Rate |
|--------------|-------|--------|-----------|
| toml-test valid | ~280 | ✅ Running (filtered) | ~100% |
| toml-test invalid | ~580 | ⚠️ Running (filtered) | ~51% (298 failing) |
| spec-tests valid | ~70 | ✅ Running | ~100% |
| spec-tests invalid | ~54 | ⚠️ Running | Low (most failing) |
| **TOTAL** | **~863** | **Running** | **~65.5% (565/863)** |

**Note:** The invalid test failures indicate areas where the parser is not properly rejecting malformed TOML according to the TOML 1.1.0 specification.

---

## 🎯 Recommended Next Steps

### Priority 1: Critical Issues
1. **Fix invalid test failures** - 298 failing tests indicate parser bugs
   - Review common failure patterns
   - Fix validation logic to properly reject malformed TOML
   - Ensure security implications are addressed

### Priority 2: Correctness Issues  
2. **Fix date/time type names** - Align with toml-test specification
   - Update `date` → `date-local`
   - Update `time` → `time-local`

3. ~~**Implement TOML version filtering**~~ ✅ **COMPLETED**
   - ✅ Implemented for TOML 1.1.0
   - ✅ Uses `files-toml-1.1.0` list to filter tests
   - ✅ Configurable via `TOML_VERSION` constant

### Priority 3: Design Improvements
4. **Reconsider date/time representation**
   - Evaluate if `Date` objects are appropriate for all types
   - Consider preserving type information in parsed output
   - Document any semantic limitations

---

## 📝 Notes

### TOML Version Support
- **Target Version:** TOML 1.1.0
- **Filtering:** Enabled via `files-toml-1.1.0` list
- **Configuration:** See `TOML_VERSION` constant in `specs/specs.test.ts`

### Submodule Version
- **toml-test**: Updated to v2.0.0 (commit `229ce2e`)
- **spec-tests**: Already up to date

### Test Execution
Run compliance tests with:
```bash
npm run specs
```

### References
- [toml-test README](submodules/toml-test/README.md)
- [TOML Specification](https://toml.io)
- [Tagged JSON Format Documentation](submodules/toml-test/README.md#json-encoding)
