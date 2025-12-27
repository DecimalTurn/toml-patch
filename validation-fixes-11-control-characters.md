# Validation Fixes - Group 11: Control Character Validation

## Overview
This group addresses strict validation of control characters in TOML documents:
- Reject VT (vertical tab, 0x0B) and FF (form feed, 0x0C) at top level
- Reject standalone CR (carriage return, 0x0D) in multiline strings
- Ensure CR is only allowed as part of CRLF sequence

## Tests Fixed

### Top-Level Control Characters (2 tests)
- `control/only-vt` - Rejects vertical tab character at document root
- `control/only-ff` - Rejects form feed character at document root

### Multiline String Control Characters (1 test)
- `control/rawmulti-cr` - Rejects standalone CR in literal multiline strings (must be CRLF)

## Implementation Details

### Files Modified
- `src/tokenizer.ts`

### Changes Made

1. **Added top-level control character validation**:
   - Check for VT (0x0B) and FF (0x0C) in main tokenizer loop
   - Throw error with hex code for better debugging

2. **Enhanced multiline string validation**:
   - CR (0x0D) is only allowed when followed by LF (0x0A) to form CRLF
   - Standalone CR throws error with clear message
   - Maintains support for tab, LF, and CRLF in multiline strings

### Code Example

```typescript
// In main tokenizer loop
while (!cursor.done) {
  // Check for control characters at the top level
  const charCode = cursor.value!.charCodeAt(0);
  if (charCode === 0x0B || charCode === 0x0C) {
    throw new Error(
      `Control character 0x${charCode.toString(16).toUpperCase().padStart(2, '0')} is not allowed in TOML`
    );
  }
  // ... rest of tokenization
}

// In multiline function
while (!cursor.done && (!checkThree(input, cursor.index, multiline_char) || ...)) {
  const code = cursor.value.charCodeAt(0);
  const isCR = code === 0x0D;
  
  // CR is only allowed if followed by LF (CRLF sequence)
  if (isCR) {
    const nextChar = input[cursor.index + 1];
    const nextIsLF = nextChar && nextChar.charCodeAt(0) === 0x0A;
    if (!nextIsLF) {
      throw new ParseError(input, findPosition(input, cursor.index),
        `Invalid standalone CR (\\r) in multiline string (must be part of CRLF sequence)`);
    }
  }
  // ... rest of multiline string processing
}
```

### Key Insights

1. **Platform Line Endings**: The TOML specification allows CRLF (Windows-style) line endings but not standalone CR. This ensures consistent handling across platforms.

2. **Control Character Codes**:
   - VT (0x0B): Vertical tab
   - FF (0x0C): Form feed
   - CR (0x0D): Carriage return
   - LF (0x0A): Line feed

3. **Multiline String Rules**: In multiline strings (both basic and literal), only tab (0x09), LF (0x0A), and CRLF (0x0D 0x0A) are allowed. Other control characters are rejected.

4. **Top-Level Strictness**: At the document root level, even fewer control characters are allowed - essentially just whitespace and newlines.

## Test Results
- **Tests Fixed**: 3 tests
- **Previous Status**: 82 failing tests
- **Current Status**: 79 failing tests
- **Improvement**: +3 tests passing

## TOML Specification Compliance
These fixes ensure strict compliance with TOML 1.1.0 specification for control characters:
- VT and FF are not allowed anywhere in TOML documents
- CR must always be part of a CRLF sequence
- Multiline strings can only contain tab, LF, and CRLF for whitespace
- Clear error messages with hex codes for debugging control character issues
