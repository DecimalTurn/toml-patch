import { parseString } from '../parse-string';

const double_quoted = `"a._#\\"\\t\\"\\u1234"`;
const single_quoted = `'a._#\\"\\t\\"\\u1234'`;
const multiline = `"""
a\\"b\\t
"""`;
const multiline_literal = `'''
a\\"b\\t
'''`;
const line_ending_backslash = `"""abc\\   
def"""`;

test('should parse double-quoted string', () => {
  expect(parseString(double_quoted)).toBe('a._#"\t"\u1234');
});

test('should parse single-quoted string', () => {
  expect(parseString(single_quoted)).toBe('a._#\\"\\t\\"\\u1234');
});

test('should parse double-quoted multiline string', () => {
  expect(parseString(multiline)).toBe('a"b\t\n');
});

test('should parse single-quoted multiline string', () => {
  expect(parseString(multiline_literal)).toBe('a\\"b\\t\n');
});

test('should escape unicode expressions', () => {
  expect(parseString('"\\U00000000"')).toEqual('\u0000');
});

test('should handle line-ending backslash', () => {
  expect(parseString(line_ending_backslash)).toBe('abcdef');
});

test('should parse TOML 1.1.0 \\xHH hex escapes', () => {
  expect(parseString('"\\x41"')).toBe('A');
});

test('should not parse escaped TOML 1.1.0 \\xHH hex escapes', () => {
  // "\\x41" in TOML means a literal "\x41" in the value
  expect(parseString('"\\\\x41"')).toBe('\\x41');
});

test('should handle odd/even preceding backslashes for \\xHH', () => {
  // 3 backslashes then x => one literal backslash + hex escape
  expect(parseString('"\\\\\\x41"')).toBe('\\A');
});

test('should parse TOML 1.1.0 \\e escape', () => {
  expect(parseString('"\\e"')).toBe('\u001b');
});

test('should not parse escaped TOML 1.1.0 \\e escape', () => {
  // "\\e" in TOML means a literal "\e" in the value
  expect(parseString('"\\\\e"')).toBe('\\e');
});

test('should handle odd/even preceding backslashes for \\e', () => {
  // 3 backslashes then e => one literal backslash + ESC
  expect(parseString('"\\\\\\e"')).toBe('\\' + '\u001b');
});
