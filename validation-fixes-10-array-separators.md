# Validation Fixes - Group 10: Array Separator Validation

## Overview
This group addresses validation of array element separators, ensuring:
- Commas are required between array elements
- Double/consecutive commas are rejected
- Proper separator tracking in inline arrays

## Tests Fixed

### Missing Comma Validation (4 tests)
- `array/no-comma-01` - Rejects arrays with missing commas (e.g., `[true false]`)
- `array/no-comma-02` - Rejects arrays with multiple elements but no commas (e.g., `[1 2 3]`)
- `array/missing-separator-01` - Rejects arrays missing separators between elements
- `array/missing-separator-02` - Rejects arrays with consecutive values without commas

### Double Comma Validation (2 tests)
- `array/double-comma-01` - Rejects arrays with consecutive commas (e.g., `[1,,2]`)
- `array/double-comma-02` - Rejects arrays with double commas before closing bracket (e.g., `[1,2,,]`)

## Implementation Details

### Files Modified
- `src/parse-toml.ts`

### Changes Made

**Enhanced inlineArray() function**:
- Added validation to detect when a new value is added without a preceding comma
- Added validation to detect double commas (comma when previous item already has comma flag set)
- Throws clear error messages for both missing and double comma scenarios

### Code Example

```typescript
function inlineArray(cursor: Cursor<Token>, input: string): [InlineArray, Comment[]] {
  while (!cursor.done && !(cursor.value!.type === TokenType.Bracket && cursor.value.raw === ']')) {
    if (cursor.value.type === TokenType.Comma) {
      const previous = value.items[value.items.length - 1];
      if (!previous) {
        throw new ParseError(input, cursor.value!.loc.start,
          'Found "," without previous value for inline array');
      }
      
      // Check if previous item already has a comma (double comma)
      if (previous.comma) {
        throw new ParseError(input, cursor.value!.loc.start,
          'Found consecutive commas in array (double comma is not allowed)');
      }

      previous.comma = true;
      previous.loc.end = cursor.value!.loc.start;
    } else if (cursor.value.type === TokenType.Comment) {
      comments.push(comment(cursor));
    } else {
      // Check if we're adding a value when the previous value doesn't have a comma
      const previous = value.items[value.items.length - 1];
      if (previous && !previous.comma) {
        throw new ParseError(input, cursor.value!.loc.start,
          'Missing comma between array elements');
      }
      
      // Add the new item...
    }
    cursor.next();
  }
}
```

### Key Insights

1. **Comma Tracking**: Each array item has a `comma` flag that tracks whether a comma follows it. This flag is crucial for detecting both missing commas (next item added when flag is false) and double commas (comma encountered when flag is already true).

2. **Parse Order**: The validation checks happen during token processing, so we can detect issues immediately rather than waiting for AST construction.

3. **Clear Error Messages**: Specific error messages help users understand whether they're missing a comma or have an extra comma.

## Test Results
- **Tests Fixed**: 6 tests
- **Previous Status**: 88 failing tests
- **Current Status**: 82 failing tests
- **Improvement**: +6 tests passing

## TOML Specification Compliance
These fixes ensure strict compliance with TOML 1.1.0 specification for array syntax:
- Array elements must be separated by commas
- Consecutive commas (e.g., `,,`) are not allowed
- Trailing commas are allowed (e.g., `[1, 2, 3,]`)
- Arrays must have proper element separation
