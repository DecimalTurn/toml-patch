import { insert, applyWrites, formatMultilineStringReplacement } from '../writer';
import toTOML from '../to-toml';
import {
  generateInlineArray,
  generateKeyValue,
  generateInlineItem,
  generateString,
  generateDocument
} from '../generate';
import { TomlFormat } from '../toml-format';
import { String as StringNode, NodeType } from '../ast';

test('it should insert elements into empty inline array', () => {
  const inline_array = generateInlineArray();
  const key_value = generateKeyValue(['a'], inline_array);
  const ast = [key_value];
  const format = TomlFormat.default();

  expect(toTOML(ast, format)).toEqual(`a = []\n`);

  insert(key_value, inline_array, generateInlineItem(generateString('b')));
  applyWrites(key_value);

  expect(toTOML(ast, format)).toEqual(`a = ["b"]\n`);

  insert(key_value, inline_array, generateInlineItem(generateString('c')));
  insert(key_value, inline_array, generateInlineItem(generateString('d')));
  insert(key_value, inline_array, generateInlineItem(generateString('e')));
  applyWrites(key_value);

  expect(toTOML(ast, format)).toEqual(`a = ["b", "c", "d", "e"]\n`);
});

test('it should insert first item on first line in document', () => {
  const document = generateDocument();
  const item = generateKeyValue(['a'], generateString('b'));
  const format = TomlFormat.default();

  insert(document, document, item);

  expect(toTOML(document.items, format)).toEqual(`a = "b"\n`);
});

describe('formatMultilineStringReplacement', () => {
  // Helper function to create a mock String node
  const createStringNode = (raw: string, value: string): StringNode => ({
    type: NodeType.String,
    raw,
    value,
    loc: {
      start: { line: 1, column: 0 },
      end: { line: 1, column: raw.length }
    }
  });

  describe('basic multiline strings (""")', () => {
    test('should escape three consecutive quotes correctly', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('Three quotes: """', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Three quotes should be escaped as: two literal quotes + escaped quote
      expect(result.raw).toBe('"""Three quotes: ""\\""""');
    });

    test('should escape four consecutive quotes correctly', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('Four quotes: """"', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // First three quotes escaped as ""\" and fourth remains literal
      expect(result.raw).toBe('"""Four quotes: ""\\"""""');
    });

    test('should escape five consecutive quotes correctly', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('Five quotes: """""', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Pattern: ""\" + remaining quotes
      expect(result.raw).toBe('"""Five quotes: ""\\""""""');
    });

    test('should escape six consecutive quotes correctly', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('Six quotes: """"""', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Two sets of three quotes: ""\" + """ (second set becomes ""\")
      // Input: """""" -> First three (""") becomes ""\", next three (""") becomes ""\"
      expect(result.raw).toBe('"""Six quotes: ""\\"""\\""""');
    });

    test('should handle multiple triple quote sequences', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('First: """ and second: """', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      expect(result.raw).toBe('"""First: ""\\" and second: ""\\""""');
    });

    test('should escape backslashes before escaping quotes', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('Path: C:\\Data and quotes: """', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Backslashes escaped first, then quotes
      expect(result.raw).toBe('"""Path: C:\\\\Data and quotes: ""\\""""');
    });

    test('should handle one or two quotes (not escaped)', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('One " or two "" quotes', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Single and double quotes are allowed unescaped
      expect(result.raw).toBe('"""One " or two "" quotes"""');
    });

    test('should escape control characters', () => {
      const existing = createStringNode('"""old"""', 'old');
      const escapedReplacement = generateString('Tab:\there Newline:\nallowed', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Tab escaped, newlines allowed in multiline strings
      expect(result.raw).toBe('"""Tab:\\there Newline:\nallowed"""');
    });
  });

  describe("literal multiline strings (''')", () => {
    test('should convert to basic string when value contains triple quotes', () => {
      const existing = createStringNode("'''old'''", 'old');
      const escapedReplacement = generateString("Three quotes: '''", existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Should convert from literal (''') to basic (""")
      // Note: ''' doesn't need escaping in basic strings
      expect(result.raw).toBe('"""Three quotes: \'\'\'"""');
    });

    test('should not escape backslashes in literal strings', () => {
      const existing = createStringNode("'''old'''", 'old');
      const escapedReplacement = generateString("Path: C:\\Data\\Files", existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      // Backslashes are literal in ''' strings
      expect(result.raw).toBe("'''Path: C:\\Data\\Files'''");
    });
  });

  describe('non-multiline strings', () => {
    test('should return replacement unchanged for regular strings', () => {
      const existing = createStringNode('"regular"', 'regular');
      const replacement = createStringNode('"new"', 'new value');
      
      const result = formatMultilineStringReplacement(existing, replacement);
      
      // Should return the original replacement unchanged
      expect(result).toBe(replacement);
    });
  });

  describe('newline handling', () => {
    test('should preserve leading newline format', () => {
      const existing = createStringNode('"""\nold"""', 'old');
      const escapedReplacement = generateString('new value', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      expect(result.raw).toBe('"""\nnew value"""');
    });

    test('should detect and use CRLF line endings', () => {
      const existing = createStringNode('"""\r\nold"""', 'old');
      const escapedReplacement = generateString('new value', existing.raw);
      
      const result = formatMultilineStringReplacement(existing, escapedReplacement);
      
      expect(result.raw).toBe('"""\r\nnew value"""');
    });
  });
});
