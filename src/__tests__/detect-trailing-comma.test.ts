import { detectTrailingComma } from '../toml-format';
import { TomlFormat } from '../toml-format';
import parseTOML from '../parse-toml';

describe('detectTrailingComma', () => {
  test('should detect trailing comma in inline array', () => {
    const toml = `array = ["a", "b", "c",]`;
    const ast = parseTOML(toml);
    expect(detectTrailingComma(ast)).toBe(true);
  });

  test('should detect no trailing comma in inline array', () => {
    const toml = `array = ["a", "b", "c"]`;
    const ast = parseTOML(toml);
    expect(detectTrailingComma(ast)).toBe(false);
  });

  test('should detect trailing comma in inline table', () => {
    const toml = `table = { a = "1", b = "2", }`;
    const ast = parseTOML(toml);
    expect(detectTrailingComma(ast)).toBe(true);
  });

  test('should detect no trailing comma in inline table', () => {
    const toml = `table = { a = "1", b = "2" }`;
    const ast = parseTOML(toml);
    expect(detectTrailingComma(ast)).toBe(false);
  });

  test('should return false for TOML without comma-separated structures', () => {
    const toml = `
      title = "Example"
      [section]
      key = "value"
    `;
    const ast = parseTOML(toml);
    expect(detectTrailingComma(ast)).toBe(false);
  });

  test('should find trailing comma in nested structures', () => {
    const toml = `
      title = "Example"
      [section]
      array = ["a", "b",]
    `;
    const ast = parseTOML(toml);
    expect(detectTrailingComma(ast)).toBe(true);
  });
});

describe('TomlFormat.autoDetectFormat', () => {
  test('should detect CRLF line endings', () => {
    const toml = 'title = "test"\r\nkey = "value"\r\n';
    const format = TomlFormat.autoDetectFormat(toml);
    
    expect(format.newLine).toBe('\r\n');
    expect(format.trailingNewline).toBe(1);
  });

  test('should detect LF line endings', () => {
    const toml = 'title = "test"\nkey = "value"\n';
    const format = TomlFormat.autoDetectFormat(toml);
    
    expect(format.newLine).toBe('\n');
    expect(format.trailingNewline).toBe(1);
  });

  test('should detect no trailing newlines', () => {
    const toml = 'title = "test"';
    const format = TomlFormat.autoDetectFormat(toml);
    
    expect(format.trailingNewline).toBe(0);
  });

  test('should detect multiple trailing newlines', () => {
    const toml = 'title = "test"\n\n\n';
    const format = TomlFormat.autoDetectFormat(toml);
    
    expect(format.trailingNewline).toBe(3);
  });

  test('should detect trailing comma usage', () => {
    const toml = 'array = ["a", "b", "c",]\ntable = { x = 1, y = 2, }';
    const format = TomlFormat.autoDetectFormat(toml);
    
    expect(format.trailingComma).toBe(true);
  });

  test('should detect no trailing comma usage', () => {
    const toml = 'array = ["a", "b", "c"]\ntable = { x = 1, y = 2 }';
    const format = TomlFormat.autoDetectFormat(toml);
    
    expect(format.trailingComma).toBe(false);
  });

  test('should set trailingComma to false when no comma structures found', () => {
    const toml = 'title = "Example"\n[section]\nkey = "value"';
    const format = TomlFormat.autoDetectFormat(toml);
    
    expect(format.trailingComma).toBe(false);
  });

  test('should handle malformed TOML gracefully', () => {
    const toml = 'title = "Example\n[broken section';
    const format = TomlFormat.autoDetectFormat(toml);
    
    // Should still detect basic formatting even if parsing fails
    expect(format.newLine).toBe('\n');
    expect(format.trailingNewline).toBe(0);
    expect(format.trailingComma).toBe(false);
  });
});