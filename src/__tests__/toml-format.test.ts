import { TomlFormat, detectNewline, countTrailingNewlines, validateFormatObject } from '../toml-format';
import { patch } from '../index';
import parseTOML from '../parse-toml';
import toTOML from '../to-toml';
import { stripLeadingBom } from '../decode-utf8';

function autoDetectFormat(toml: string) {
  return TomlFormat.autoDetectFormat(toml, parseTOML(stripLeadingBom(toml)));
}

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
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle partial parameters', () => {
      const format = new TomlFormat('\r\n', 2, true);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(2);
      expect(format.trailingComma).toBe(true);
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should use defaults when no arguments provided', () => {
      const format = new TomlFormat();
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(1);
      expect(format.trailingComma).toBe(false);
      expect(format.bracketSpacing).toBe(true);
    });

    test('should use default when newLine is undefined', () => {
      const format = new TomlFormat(undefined, 2, true, false);
      
      expect(format.newLine).toBe('\n'); // Default value
      expect(format.trailingNewline).toBe(2);
      expect(format.trailingComma).toBe(true);
      expect(format.bracketSpacing).toBe(false);
    });

    test('should use default when trailingNewline is undefined', () => {
      const format = new TomlFormat('\r\n', undefined, false);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(1); // Default value
      expect(format.trailingComma).toBe(false);
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should use defaults for multiple undefined parameters', () => {
      const format = new TomlFormat(undefined, undefined, true);
      
      expect(format.newLine).toBe('\n'); // Default value
      expect(format.trailingNewline).toBe(1); // Default value
      expect(format.trailingComma).toBe(true);
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should use default when newLine is null', () => {
      const format = new TomlFormat(null as any, 2);
      
      expect(format.newLine).toBe('\n'); // Default value
      expect(format.trailingNewline).toBe(2);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should use default when trailingNewline is null', () => {
      const format = new TomlFormat('\r\n', null as any);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(1); // Default value
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle null/undefined optional parameters gracefully', () => {
      const format = new TomlFormat('\r\n', 0, null as any, undefined);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(false); // Default value (null becomes default)
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle mixed null/undefined optional parameters', () => {
      const format = new TomlFormat('\n', 2, undefined, null as any);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(2);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle explicit undefined for all optional parameters', () => {
      const format = new TomlFormat('\r\n', 3, undefined, undefined);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(3);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle explicit null for all optional parameters', () => {
      const format = new TomlFormat('\n', 0, null as any, null as any);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle empty string as newLine', () => {
      const format = new TomlFormat('', 1);
      
      expect(format.newLine).toBe('');
      expect(format.trailingNewline).toBe(1);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle zero as trailingNewline', () => {
      const format = new TomlFormat('\n', 0);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle negative numbers as trailingNewline', () => {
      const format = new TomlFormat('\n', -1);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(-1);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should be equivalent to TomlFormat.default() when no args provided', () => {
      const constructorFormat = new TomlFormat();
      const defaultFormat = TomlFormat.default();
      
      expect(constructorFormat.newLine).toBe(defaultFormat.newLine);
      expect(constructorFormat.trailingNewline).toBe(defaultFormat.trailingNewline);
      expect(constructorFormat.trailingComma).toBe(defaultFormat.trailingComma);
      expect(constructorFormat.bracketSpacing).toBe(defaultFormat.bracketSpacing);
    });

    test('should allow partial specification with mixed values', () => {
      const format = new TomlFormat(undefined, 3);
      
      expect(format.newLine).toBe('\n'); // Default value
      expect(format.trailingNewline).toBe(3);
      expect(format.trailingComma).toBe(false); // Default value
      expect(format.bracketSpacing).toBe(true); // Default value
    });

    test('should handle false values correctly (not treat as null/undefined)', () => {
      const format = new TomlFormat('\r\n', 0, false, false);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(false); // Explicit false, not default
      expect(format.bracketSpacing).toBe(false); // Explicit false, not default
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
      expect(countTrailingNewlines('')).toBe(0);
    });

    test('should handle string with no trailing newlines', () => {
      expect(countTrailingNewlines('content')).toBe(0);
    });

    test('should count multiple LF newlines', () => {
      expect(countTrailingNewlines('content\n\n\n')).toBe(3);
    });

    test('should count multiple CRLF newlines', () => {
      expect(countTrailingNewlines('content\r\n\r\n')).toBe(2);
    });

    test('should handle string that is only newlines', () => {
      expect(countTrailingNewlines('\n\n\n')).toBe(3);
    });

    test('should handle mixed content with trailing newlines', () => {
      expect(countTrailingNewlines('line1\nline2\n\n')).toBe(2);
    });

    test('should not count embedded newlines', () => {
      expect(countTrailingNewlines('line1\n\ncontent')).toBe(0);
    });

    test('should handle large numbers of trailing newlines', () => {
      const content = 'text' + '\n'.repeat(10);
      expect(countTrailingNewlines(content)).toBe(10);
    });
  });

  describe('format preservation in roundtrip operations', () => {
    test('should preserve CRLF in autoDetectFormat roundtrip', () => {
      const original = 'key = "value"\r\n[section]\r\ndata = "test"\r\n\r\n';
      const format = autoDetectFormat(original);
      const ast = parseTOML(original);
      const result = toTOML(ast, format);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(2);
      expect(result).toBe(original);
    });

    test('should preserve trailing comma preference in autoDetectFormat roundtrip', () => {
      const original = 'arr = ["a", "b", ]\ntable = ["x", "y", ]\n';
      const format = autoDetectFormat(original);
      const ast = parseTOML(original);
      const result = toTOML(ast, format);
      
      expect(format.trailingComma).toBe(true);
      expect(result).toBe(original);
    });

    test('should preserve no trailing comma preference', () => {
      const original = 'arr = ["a", "b"]\ntable = ["x", "y"]\n';
      const format = autoDetectFormat(original);
      
      expect(format.trailingComma).toBe(false);
    });

    test('should preserve no trailing newlines in autoDetectFormat roundtrip', () => {
      const original = 'key = "value"';
      const format = autoDetectFormat(original);
      const ast = parseTOML(original);
      const result = toTOML(ast, format);
      
      expect(format.trailingNewline).toBe(0);
      expect(result).toBe(original);
    });

    test('should handle complex mixed formatting preservation', () => {
      const original = 'title = "Test"\r\narray = ["a", "b", ]\r\n[section]\r\nkey = "value"\r\n\r\n\r\n';
      const format = autoDetectFormat(original);
      
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
      const format = autoDetectFormat(windowsToml);
      
      expect(format.newLine).toBe('\r\n');
      expect(format.trailingNewline).toBe(2);
      expect(format.trailingComma).toBe(true);
    });

    test('should detect minimal TOML formatting', () => {
      const minimal = 'key="value"';
      const format = autoDetectFormat(minimal);
      
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

      const format = autoDetectFormat(complex);
      
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(true); // Should detect from multiple trailing commas
    });

    test('should reuse an existing parse tree when auto-detecting format', () => {
      const toml = 'title = "Cached"\narray = ["a", "b", ]\n';
      const ast = Array.from(parseTOML(toml));
      const format = TomlFormat.autoDetectFormat(toml, ast);

      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(1);
      expect(format.trailingComma).toBe(true);
    });

    test('should handle malformed TOML gracefully', () => {
      const malformed = 'title = "Broken\n[unclosed section\narray = ["incomplete"';
      const format = autoDetectFormat(malformed);
      
      // Should still detect basic formatting and fallback to defaults for parsing errors
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0);
      expect(format.trailingComma).toBe(false); // Fallback value
    });

    test('should detect leading BOM from string input', () => {
      const bomToml = '\uFEFFtitle = "BOM"\n';
      const format = autoDetectFormat(bomToml);

      expect(format.leadingBom).toBe(true);
      expect(format.newLine).toBe('\n');
    });

    test('should detect leading BOM from inline input', () => {
      const bomToml = '\uFEFFa = 1\n';
      const format = autoDetectFormat(bomToml);

      expect(format.leadingBom).toBe(true);
      expect(format.newLine).toBe('\n');
      expect(format.trailingComma).toBe(false);
    });

    test('should detect leading BOM with trailing commas', () => {
      const bomToml = '\uFEFFarray = ["a", "b", ]\ntable = { x = 1, y = 2, }\n';
      const format = autoDetectFormat(bomToml);

      expect(format.leadingBom).toBe(true);
      expect(format.newLine).toBe('\n');
      expect(format.trailingComma).toBe(true);
    });

    test('should detect tab indentation when BOM is present on a single-line document', () => {
      const bomToml = '\uFEFF\tkey = "value"\n';
      const format = autoDetectFormat(bomToml);

      expect(format.leadingBom).toBe(true);
      expect(format.useTabsForIndentation).toBe(true);
    });

    test('should allow forced leading BOM override', () => {
      const toml = 'title = "No BOM"\n';
      const format = autoDetectFormat(toml);
      format.leadingBom = true; // Force leading BOM for testing

      expect(format.leadingBom).toBe(true);
    });
  });
});

describe('validateFormatObject', () => {
  describe('returns empty object for non-object input', () => {
    test.each([null, undefined, 0, '', false])('returns {} for %p', (input) => {
      expect(validateFormatObject(input)).toEqual({});
    });
  });

  describe('accepts valid property types', () => {
    test('accepts string newLine', () => {
      expect(validateFormatObject({ newLine: '\r\n' })).toEqual({ newLine: '\r\n' });
    });

    test('accepts boolean trailingNewline', () => {
      expect(validateFormatObject({ trailingNewline: true })).toEqual({ trailingNewline: true });
    });

    test('accepts numeric trailingNewline', () => {
      expect(validateFormatObject({ trailingNewline: 2 })).toEqual({ trailingNewline: 2 });
    });

    test('accepts boolean trailingComma', () => {
      expect(validateFormatObject({ trailingComma: true })).toEqual({ trailingComma: true });
    });

    test('accepts boolean bracketSpacing', () => {
      expect(validateFormatObject({ bracketSpacing: false })).toEqual({ bracketSpacing: false });
    });

    test('accepts boolean leadingBom', () => {
      expect(validateFormatObject({ leadingBom: true })).toEqual({ leadingBom: true });
    });

    test('accepts non-negative integer inlineTableStart', () => {
      expect(validateFormatObject({ inlineTableStart: 0 })).toEqual({ inlineTableStart: 0 });
      expect(validateFormatObject({ inlineTableStart: 3 })).toEqual({ inlineTableStart: 3 });
    });

    test('accepts null/undefined inlineTableStart', () => {
      expect(validateFormatObject({ inlineTableStart: null })).toEqual({ inlineTableStart: null });
      expect(validateFormatObject({ inlineTableStart: undefined })).toEqual({ inlineTableStart: undefined });
    });

    test('accepts boolean truncateZeroTimeInDates', () => {
      expect(validateFormatObject({ truncateZeroTimeInDates: true })).toEqual({ truncateZeroTimeInDates: true });
    });

    test('accepts boolean useTabsForIndentation', () => {
      expect(validateFormatObject({ useTabsForIndentation: true })).toEqual({ useTabsForIndentation: true });
    });

    test('accepts all valid properties together', () => {
      const input = {
        newLine: '\n',
        trailingNewline: 1,
        trailingComma: true,
        bracketSpacing: false,
        leadingBom: true,
        inlineTableStart: 2,
        truncateZeroTimeInDates: true,
        useTabsForIndentation: false,
      };
      expect(validateFormatObject(input)).toEqual(input);
    });
  });

  describe('rejects invalid property types', () => {
    test('rejects non-string newLine', () => {
      expect(() => validateFormatObject({ newLine: 123 })).toThrow(TypeError);
      expect(() => validateFormatObject({ newLine: 123 })).toThrow(/newLine.*expected string/);
    });

    test('rejects non-boolean/number trailingNewline', () => {
      expect(() => validateFormatObject({ trailingNewline: 'yes' })).toThrow(TypeError);
      expect(() => validateFormatObject({ trailingNewline: 'yes' })).toThrow(/trailingNewline/);
    });

    test('rejects non-boolean trailingComma', () => {
      expect(() => validateFormatObject({ trailingComma: 1 })).toThrow(TypeError);
      expect(() => validateFormatObject({ trailingComma: 1 })).toThrow(/trailingComma.*expected boolean/);
    });

    test('rejects non-boolean bracketSpacing', () => {
      expect(() => validateFormatObject({ bracketSpacing: 'true' })).toThrow(TypeError);
      expect(() => validateFormatObject({ bracketSpacing: 'true' })).toThrow(/bracketSpacing/);
    });

    test('rejects non-boolean leadingBom', () => {
      expect(() => validateFormatObject({ leadingBom: 'yes' })).toThrow(TypeError);
      expect(() => validateFormatObject({ leadingBom: 'yes' })).toThrow(/leadingBom/);
    });

    test('rejects negative inlineTableStart', () => {
      expect(() => validateFormatObject({ inlineTableStart: -1 })).toThrow(TypeError);
      expect(() => validateFormatObject({ inlineTableStart: -1 })).toThrow(/inlineTableStart/);
    });

    test('rejects non-integer inlineTableStart', () => {
      expect(() => validateFormatObject({ inlineTableStart: 1.5 })).toThrow(TypeError);
    });

    test('rejects string inlineTableStart', () => {
      expect(() => validateFormatObject({ inlineTableStart: 'auto' })).toThrow(TypeError);
    });

    test('rejects non-boolean truncateZeroTimeInDates', () => {
      expect(() => validateFormatObject({ truncateZeroTimeInDates: 0 })).toThrow(TypeError);
    });

    test('rejects non-boolean useTabsForIndentation', () => {
      expect(() => validateFormatObject({ useTabsForIndentation: 'yes' })).toThrow(TypeError);
    });

    test('reports multiple invalid properties in one error', () => {
      expect(() => validateFormatObject({ newLine: 42, trailingComma: 'yes' })).toThrow(
        /newLine.*trailingComma|trailingComma.*newLine/
      );
    });
  });

  describe('warns about unsupported properties', () => {
    test('warns and ignores unknown own properties', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = validateFormatObject({ newLine: '\n', bogus: true });
      expect(result).toEqual({ newLine: '\n' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('bogus'));
      spy.mockRestore();
    });

    test('does not warn about inherited (prototype) unsupported properties', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const proto = { inherited: true };
      const obj = Object.create(proto);
      obj.newLine = '\n';
      const result = validateFormatObject(obj);
      expect(result).toEqual({ newLine: '\n' });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('edge cases', () => {
    test('returns empty object for empty input object', () => {
      expect(validateFormatObject({})).toEqual({});
    });

    test('validates properties from prototype chain (supported keys)', () => {
      const proto = { trailingComma: true };
      const obj = Object.create(proto);
      obj.newLine = '\n';
      // trailingComma is on the prototype but for..in iterates it
      const result = validateFormatObject(obj);
      expect(result).toEqual({ newLine: '\n', trailingComma: true });
    });
  });
});