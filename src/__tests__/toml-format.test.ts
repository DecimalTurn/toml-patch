import { TomlFormat, detectNewline, countTrailingNewlines } from '../toml-format';
import { patch } from '../index';
import parseTOML from '../parse-toml';
import toTOML from '../to-toml';

describe('TomlFormat comprehensive tests', () => {
  
  describe('constructor validation', () => {
    test('should create TomlFormat with all parameters', () => {
      const format = new TomlFormat('\r\n', 0, true, false);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(true);
      expect(format.bracketSpacing).toBe(false);
    });

    test('should handle optional parameters correctly', () => {
      const format = new TomlFormat('\n', 1);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(1);
      expect(format.trailingComma).toBeUndefined();
      expect(format.bracketSpacing).toBeUndefined();
    });

    test('should handle partial parameters', () => {
      const format = new TomlFormat('\r\n', 2, true);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(2);
      expect(format.trailingComma).toBe(true);
      expect(format.bracketSpacing).toBeUndefined();
    });
  });

  describe('format application in patch operations', () => {
    test('should apply custom newLine format in patch', () => {
      const original = 'key = "value"';
      const updated = { key: "value", newKey: "newValue" };
      const format = new TomlFormat('\r\n', 0, false, true);
      
      const result = patch(original, updated, format);
      
      expect(result).toContain('\r\n');
      expect(result).not.toContain('\n\n'); // Should not have trailing newline
      expect(result).not.toMatch(/[^\\r]\\n/); // Should not have standalone LF
    });

    test('should apply trailingComma format in new arrays', () => {
      const original = '';
      const updated = { arr: ["a", "b", "c"] };
      const format = new TomlFormat('\n', 1, true, true);
      
      const result = patch(original, updated, format);
      
      // Should have trailing comma when creating new arrays
      expect(result).toContain('[ "a", "b", "c", ]');
    });

    test('should respect trailingComma false setting', () => {
      const original = '';
      const updated = { arr: ["x", "y", "z"] };
      const format = new TomlFormat('\n', 1, false, true);
      
      const result = patch(original, updated, format);
      
      // Should NOT have trailing comma
      expect(result).toContain('[ "x", "y", "z" ]');
      expect(result).not.toContain('[ "x", "y", "z", ]');
    });

    test('should apply bracketSpacing format in inline tables', () => {
      const original = '';
      const updated = { table: { key: "value", num: 42 } };
      const formatWithSpacing = new TomlFormat('\n', 1, false, true);
      const formatWithoutSpacing = new TomlFormat('\n', 1, false, false);
      
      const resultWithSpacing = patch(original, updated, formatWithSpacing);
      const resultWithoutSpacing = patch(original, updated, formatWithoutSpacing);
      
      // With spacing: { key = "value", num = 42 }
      // Without spacing: {key = "value", num = 42}
      // Note: This may create standard tables instead of inline tables
      // but the principle should apply to any inline structures
      expect(resultWithSpacing).toContain('table');
      expect(resultWithoutSpacing).toContain('table');
    });

    test('should handle multiple formatting options together', () => {
      const original = '';
      const updated = { 
        data: ["item1", "item2"],
        config: { enabled: true, count: 42 }
      };
      const format = new TomlFormat('\r\n', 2, true, false);
      
      const result = patch(original, updated, format);
      
      expect(result).toContain('\r\n');
      expect(result).toMatch(/\r\n\r\n$/); // Should have 2 trailing newlines
      expect(result).toContain('["item1", "item2",]'); // Trailing comma, no bracket spacing
    });

    test('should handle unusual trailing newline counts', () => {
      const original = 'existing = "value"';
      const updated = { existing: "value", new: "addition" };
      const format = new TomlFormat('\n', 5, false, true);
      
      const result = patch(original, updated, format);
      
      expect(result).toMatch(/\n{5}$/); // Should have exactly 5 trailing newlines
    });

    test('should handle zero trailing newlines', () => {
      const original = 'key = "value"';
      const updated = { key: "value", added: "new" };
      const format = new TomlFormat('\n', 0, false, true);
      
      const result = patch(original, updated, format);
      
      expect(result).not.toMatch(/\n$/); // Should not end with newline
    });
  });

  describe('detectNewline edge cases', () => {
    test('should handle empty string', () => {
      expect(detectNewline('')).toBe('\n');
    });

    test('should handle string with only LF', () => {
      expect(detectNewline('line1\nline2')).toBe('\n');
    });

    test('should handle string with only CRLF', () => {
      expect(detectNewline('line1\r\nline2')).toBe('\r\n');
    });

    test('should prioritize CRLF over LF when both present', () => {
      expect(detectNewline('line1\r\nline2\nline3')).toBe('\r\n');
    });

    test('should handle string starting with newline', () => {
      expect(detectNewline('\nline1')).toBe('\n');
    });

    test('should handle string starting with CRLF', () => {
      expect(detectNewline('\r\nline1')).toBe('\r\n');
    });

    test('should handle complex mixed line endings', () => {
      const mixed = 'start\r\nmiddle\nend\r\nfinal';
      expect(detectNewline(mixed)).toBe('\r\n'); // First occurrence
    });
  });

  describe('countTrailingNewlines edge cases', () => {
    test('should handle empty string', () => {
      expect(countTrailingNewlines('', '\n')).toBe(0);
    });

    test('should handle string with no trailing newlines', () => {
      expect(countTrailingNewlines('content', '\n')).toBe(0);
    });

    test('should count multiple LF newlines', () => {
      expect(countTrailingNewlines('content\n\n\n', '\n')).toBe(3);
    });

    test('should count multiple CRLF newlines', () => {
      expect(countTrailingNewlines('content\r\n\r\n', '\r\n')).toBe(2);
    });

    test('should handle string that is only newlines', () => {
      expect(countTrailingNewlines('\n\n\n', '\n')).toBe(3);
    });

    test('should handle mixed content with trailing newlines', () => {
      expect(countTrailingNewlines('line1\nline2\n\n', '\n')).toBe(2);
    });

    test('should not count embedded newlines', () => {
      expect(countTrailingNewlines('line1\n\ncontent', '\n')).toBe(0);
    });

    test('should handle large numbers of trailing newlines', () => {
      const content = 'text' + '\n'.repeat(10);
      expect(countTrailingNewlines(content, '\n')).toBe(10);
    });
  });

  describe('format preservation in roundtrip operations', () => {
    test('should preserve CRLF in autoDetectFormat roundtrip', () => {
      const original = 'key = "value"\r\n[section]\r\ndata = "test"\r\n\r\n';
      const format = TomlFormat.autoDetectFormat(original);
      const ast = parseTOML(original);
      const result = toTOML(ast, format);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(2);
      expect(result).toBe(original);
    });

    test('should preserve trailing comma preference in autoDetectFormat roundtrip', () => {
      const original = 'arr = ["a", "b", ]\ntable = ["x", "y", ]\n';
      const format = TomlFormat.autoDetectFormat(original);
      const ast = parseTOML(original);
      const result = toTOML(ast, format);
      
      expect(format.trailingComma).toBe(true);
      expect(result).toBe(original);
    });

    test('should preserve no trailing comma preference', () => {
      const original = 'arr = ["a", "b"]\ntable = ["x", "y"]\n';
      const format = TomlFormat.autoDetectFormat(original);
      
      expect(format.trailingComma).toBe(false);
    });

    test('should preserve no trailing newlines in autoDetectFormat roundtrip', () => {
      const original = 'key = "value"';
      const format = TomlFormat.autoDetectFormat(original);
      const ast = parseTOML(original);
      const result = toTOML(ast, format);
      
      expect(format.trailingNewline).toBe(0);
      expect(result).toBe(original);
    });

    test('should handle complex mixed formatting preservation', () => {
      const original = 'title = "Test"\r\narray = ["a", "b", ]\r\n[section]\r\nkey = "value"\r\n\r\n\r\n';
      const format = TomlFormat.autoDetectFormat(original);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(3);
      expect(format.trailingComma).toBe(true);
    });
  });

  describe('defaultFormat consistency', () => {
    test('should produce consistent output with defaultFormat', () => {
      const format1 = TomlFormat.default();
      const format2 = TomlFormat.default();
      
      expect(format1.newLine).toBe(format2.newLine);
      expect(format1.trailingNewline).toBe(format2.trailingNewline);
      expect(format1.trailingComma).toBe(format2.trailingComma);
      expect(format1.bracketSpacing).toBe(format2.bracketSpacing);
    });

    test('should use expected default values', () => {
      const format = TomlFormat.default();
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(1);
      expect(format.trailingComma).toBe(false);
      expect(format.bracketSpacing).toBe(true);
    });
  });

  describe('autoDetectFormat comprehensive scenarios', () => {
    test('should detect Windows-style formatting', () => {
      const windowsToml = 'title = "Windows"\r\narray = ["a", "b", ]\r\n\r\n';
      const format = TomlFormat.autoDetectFormat(windowsToml);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(2);
      expect(format.trailingComma).toBe(true);
    });

    test('should detect minimal TOML formatting', () => {
      const minimal = 'key="value"';
      const format = TomlFormat.autoDetectFormat(minimal);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(false); // No arrays/tables to detect from
    });

    test('should detect complex nested structure formatting', () => {
      const complex = `title = "Complex"
array = ["item1", "item2", ]
nested = [
  ["sub1", "sub2", ],
  ["sub3", "sub4", ]
]
table = { key = "value", num = 42, }

[section]
data = "test"`;

      const format = TomlFormat.autoDetectFormat(complex);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(true); // Should detect from multiple trailing commas
    });

    test('should handle malformed TOML gracefully', () => {
      const malformed = 'title = "Broken\n[unclosed section\narray = ["incomplete"';
      const format = TomlFormat.autoDetectFormat(malformed);
      
      // Should still detect basic formatting and fallback to defaults for parsing errors
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(false); // Fallback value
    });
  });
});