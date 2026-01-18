import { generateString } from '../generate';
import { NodeType } from '../ast';

describe('generateString', () => {
  describe('with multiline basic string format preservation', () => {
    test('should escape three consecutive quotes correctly', () => {
      const result = generateString('Three quotes: """', '"""old"""');
      
      expect(result.type).toBe(NodeType.String);
      expect(result.value).toBe('Three quotes: """');
      expect(result.raw).toBe('"""Three quotes: ""\\""""');
    });

    test('should escape four consecutive quotes correctly', () => {
      const result = generateString('Four quotes: """"', '"""old"""');
      
      // Four quotes become: """ (matched) -> ""\" plus the remaining "
      expect(result.raw).toBe('"""Four quotes: ""\\"""""');
      expect(result.value).toBe('Four quotes: """"');
    });

    test('should escape five consecutive quotes correctly', () => {
      const result = generateString('Five quotes: """""', '"""old"""');
      
      // Five quotes become: """ (matched) -> ""\" plus remaining ""
      expect(result.raw).toBe('"""Five quotes: ""\\""""""');
      expect(result.value).toBe('Five quotes: """""');
    });

    test('should escape backslashes before escaping quotes', () => {
      const result = generateString('Backslash then quotes: \\"""', '"""old"""');
      
      expect(result.raw).toBe('"""Backslash then quotes: \\\\""\\""""');
      expect(result.value).toBe('Backslash then quotes: \\"""');
    });

    test('should escape control characters', () => {
      const result = generateString('Tab:\there\nNewline', '"""old"""');
      
      expect(result.raw).toContain('\\t');
      expect(result.raw).not.toContain('\t'); // actual tab should be escaped
      expect(result.value).toBe('Tab:\there\nNewline');
    });

    test('should handle strings without triple quotes', () => {
      const result = generateString('Just a regular string', '"""old"""');
      
      expect(result.raw).toBe('"""Just a regular string"""');
      expect(result.value).toBe('Just a regular string');
    });

    test('should handle one or two quotes (not escaped)', () => {
      const result = generateString('One " or two "" quotes', '"""old"""');
      
      expect(result.raw).toBe('"""One " or two "" quotes"""');
      expect(result.value).toBe('One " or two "" quotes');
    });
  });

  describe('with multiline literal string format preservation', () => {
    test('should convert to basic string when value contains triple quotes', () => {
      const result = generateString("Three quotes: '''", "'''old'''");
      
      expect(result.type).toBe(NodeType.String);
      expect(result.value).toBe("Three quotes: '''");
      // Should convert from literal (''') to basic (""")
      // Note: ''' doesn't need escaping in basic strings, only """ needs escaping
      expect(result.raw).toBe('"""Three quotes: \'\'\'"""');
    });

    test('should not escape backslashes in literal strings', () => {
      const result = generateString('Backslash: \\n', "'''old'''");
      
      expect(result.raw).toBe("'''Backslash: \\n'''");
      expect(result.value).toBe('Backslash: \\n');
      expect(result.raw).not.toContain('\\\\'); // backslashes should not be escaped
    });

    test('should preserve leading newline when converting from literal to basic (with leading newline)', () => {
      // Original literal string with leading newline: '''\nold'''
      const result = generateString("new value with '''", "'''\nold'''");
      
      // Should convert to basic and preserve leading newline
      expect(result.raw).toBe('"""\nnew value with \'\'\'"""');
    });

    test('should NOT add leading newline when converting from literal without leading newline', () => {
      // Original literal string WITHOUT leading newline but WITH newline in content: '''old\nnewline'''
      const result = generateString("value with '''", "'''old\nnewline'''");
      
      // Should convert to basic but NOT add leading newline (newline is in middle of content)
      expect(result.raw).toBe('"""value with \'\'\'"""');
    });

    test('should preserve leading newline with CRLF when converting from literal to basic', () => {
      // Original literal string with CRLF leading newline
      const result = generateString("new with '''", "'''\r\nold'''");
      
      // Should convert to basic and preserve CRLF leading newline
      expect(result.raw).toBe('"""\r\nnew with \'\'\'"""');
    });
  });

  describe('without existing multiline format', () => {
    test('should use JSON.stringify for regular strings', () => {
      const result = generateString('Regular string with "quotes"');
      
      expect(result.raw).toBe('"Regular string with \\"quotes\\""');
      expect(result.value).toBe('Regular string with "quotes"');
    });

    test('should escape triple quotes with JSON.stringify', () => {
      const result = generateString('Triple """quotes"""');
      
      expect(result.raw).toBe('"Triple \\"\\"\\\"quotes\\"\\"\\""');
      expect(result.value).toBe('Triple """quotes"""');
    });
  });
});
