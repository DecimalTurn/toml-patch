import { detectTrailingComma, detectBracketSpacing } from '../toml-format';
import { TomlFormat } from '../toml-format';
import parseTOML from '../parse-toml';

function autoDetectFormat(toml: string) {
  return TomlFormat.autoDetectFormat(toml, parseTOML(toml));
}

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
    const format = autoDetectFormat(toml);
    
    expect(format.newLine).toBe('\r\n');
    expect(format.trailingNewline).toBe(1);
  });

  test('should detect LF line endings', () => {
    const toml = 'title = "test"\nkey = "value"\n';
    const format = autoDetectFormat(toml);
    
    expect(format.newLine).toBe('\n');
    expect(format.trailingNewline).toBe(1);
  });

  test('should detect no trailing newlines', () => {
    const toml = 'title = "test"';
    const format = autoDetectFormat(toml);
    
    expect(format.trailingNewline).toBe(0);
  });

  test('should detect multiple trailing newlines', () => {
    const toml = 'title = "test"\n\n\n';
    const format = autoDetectFormat(toml);
    
    expect(format.trailingNewline).toBe(3);
  });

  test('should detect trailing comma usage', () => {
    const toml = 'array = ["a", "b", "c",]\ntable = { x = 1, y = 2, }';
    const format = autoDetectFormat(toml);
    
    expect(format.trailingComma).toBe(true);
  });

  test('should detect no trailing comma usage', () => {
    const toml = 'array = ["a", "b", "c"]\ntable = { x = 1, y = 2 }';
    const format = autoDetectFormat(toml);
    
    expect(format.trailingComma).toBe(false);
  });

  test('should set trailingComma to false when no comma structures found', () => {
    const toml = 'title = "Example"\n[section]\nkey = "value"';
    const format = autoDetectFormat(toml);
    
    expect(format.trailingComma).toBe(false);
  });

  test('should handle malformed TOML gracefully', () => {
    const toml = 'title = "Example\n[broken section';
    const format = autoDetectFormat(toml);
    
    // Should still detect basic formatting even if parsing fails
    expect(format.newLine).toBe('\n');
    expect(format.trailingNewline).toBe(0);
    expect(format.trailingComma).toBe(false);
    expect(format.bracketSpacing).toBe(true); // Should default to true
  });
});

describe('detectBracketSpacing', () => {
  test('should detect bracket spacing in inline array', () => {
    const toml = `array = [ "a", "b", "c" ]`;
    const ast = parseTOML(toml);
    expect(detectBracketSpacing(toml, ast)).toBe(true);
  });

  test('should detect no bracket spacing in inline array', () => {
    const toml = `array = ["a", "b", "c"]`;
    const ast = parseTOML(toml);
    expect(detectBracketSpacing(toml, ast)).toBe(false);
  });

  test('should detect bracket spacing in inline table', () => {
    const toml = `table = { a = "1", b = "2" }`;
    const ast = parseTOML(toml);
    expect(detectBracketSpacing(toml, ast)).toBe(true);
  });

  test('should detect no bracket spacing in inline table', () => {
    const toml = `table = {a = "1", b = "2"}`;
    const ast = parseTOML(toml);
    expect(detectBracketSpacing(toml, ast)).toBe(false);
  });

  test('should return true for TOML without bracket structures', () => {
    const toml = `
      title = "Example"
      [section]
      key = "value"
    `;
    const ast = parseTOML(toml);
    expect(detectBracketSpacing(toml, ast)).toBe(true); // Default to true
  });

  test('should find bracket spacing in nested structures', () => {
    const toml = `
      title = "Example"
      [section]
      array = [ "a", "b" ]
    `;
    const ast = parseTOML(toml);
    expect(detectBracketSpacing(toml, ast)).toBe(true);
  });

  test('should handle mixed bracket spacing correctly', () => {
    const toml = `array1 = [ "a", "b" ]
array2 = ["c", "d"]`;
    const ast = parseTOML(toml);
    // Should return true based on the first occurrence found
    expect(detectBracketSpacing(toml, ast)).toBe(true);
  });
});

describe('TomlFormat.autoDetectFormat with bracket spacing', () => {
  test('should detect bracket spacing preference', () => {
    const toml = `array = [ "a", "b" ]
table = { x = 1, y = 2 }`;
    const format = autoDetectFormat(toml);
    
    expect(format.bracketSpacing).toBe(true);
  });

  test('should detect no bracket spacing preference', () => {
    const toml = `array = ["a", "b"]
table = {x = 1, y = 2}`;
    const format = autoDetectFormat(toml);
    
    expect(format.bracketSpacing).toBe(false);
  });

  test('should handle combined format detection', () => {
    const toml = `array = [ "a", "b", ]
table = { x = 1, y = 2, }`;
    const format = autoDetectFormat(toml);
    
    expect(format.bracketSpacing).toBe(true);
    expect(format.trailingComma).toBe(true);
  });
});