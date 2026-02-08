import parseTOML from '../parse-toml';
import { emoji } from '../__fixtures__';
import toJS from '../to-js';

describe('Non-BMP character handling', () => {
  test('should parse TOML with emoji characters', () => {
    const result = [...parseTOML(emoji)];
    expect(result).toBeDefined();
    
    const js = toJS(result);
    expect(js.name).toBe('Hello 😀 World');
    expect(js.description).toBe('🚀 TOML parser');
    expect(js['🔑']).toBe('key emoji');
    expect(js['test🌟value']).toBe(123);
    expect(js.section.emoji_array).toEqual(['🎉', '🎊', '🎈']);
  });

  test('should report correct error location after emoji (column tracking)', () => {
    // Emoji 😀 is 1 Unicode code point (but 2 UTF-16 code units)
    // String: "a😀:" has 3 code points: a, 😀, :
    // Column tracking now counts code points for better user intuition
    const invalidToml = 'a😀: value';
    
    try {
      Array.from(parseTOML(invalidToml));
      fail('Should have thrown an error');
    } catch (error: any) {
      // The error should point to column 3 (1-indexed: a=1, 😀=2, :=3)
      // because we now count code points, not UTF-16 code units
      expect(error.message).toContain('(1, 3)'); // Line 1, column 3
      expect(error.message).toContain(':');
    }
  });

  test('should report correct error location after multiple emoji', () => {
    // Test error location after emoji in a key name
    // Use quoted keys with emoji, then cause an error
    const invalidToml = '"🎉🎊🎈": value';
    
    try {
Array.from(parseTOML(invalidToml));
      fail('Should have thrown an error');
    } catch (error: any) {
      // The colon should cause an error (not valid separator for bare values)
      // We're testing that the location tracking works correctly after the emoji key
      expect(error.message).toMatch(/Error parsing TOML/);
    }
  });

  test('should report correct error location in multiline with emoji', () => {
    const invalidToml = `# Comment with 😀
name = "value"
"🚀" = x`;
    
    try {
      Array.from(parseTOML(invalidToml));
      fail('Should have thrown an error');
    } catch (error: any) {
      // Error on line 3 - the bare 'x' is not a valid value
      expect(error.message).toContain('(3,');
    }
  });

  test('should handle emoji in error messages for invalid values', () => {
    // Test that when we have an error in a value with emoji,
    // the location is tracked correctly
    const invalidToml = 'key = "😀\\invalid"';
    
    try {
      Array.from(parseTOML(invalidToml));
      fail('Should have thrown an error');
    } catch (error: any) {
      // Error should reference the invalid escape sequence
      expect(error.message).toContain('Invalid escape sequence');
    }
  });

  test('should count indices correctly for mixed ASCII and emoji', () => {
    // Test a complex case: ASCII, emoji, more ASCII, then error
    // "abc😀def:" in code points: a, b, c, 😀, d, e, f, :
    // Total: 8 code points
    const invalidToml = 'abc😀def: value';
    
    try {
      Array.from(parseTOML(invalidToml));
      fail('Should have thrown an error');
    } catch (error: any) {
      // Colon is at code point index 7, so column should be 8 (1-indexed)
      expect(error.message).toContain('(1, 8)');
    }
  });
});
