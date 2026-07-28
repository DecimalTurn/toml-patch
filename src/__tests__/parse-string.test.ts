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

// Surrogate code points are not Unicode scalar values, so they have no valid UTF-8 encoding
// and cannot appear in a TOML document — in either escape form, paired or not. The 8-digit
// form needs an explicit check: unlike an out-of-range code point, String.fromCodePoint
// accepts a surrogate and simply yields an unpaired code unit.

test('should reject a lone high surrogate in a 4-digit unicode escape', () => {
  expect(() => parseString('"\\uD800"')).toThrow(/surrogates not allowed/);
});

test('should reject a lone low surrogate in a 4-digit unicode escape', () => {
  expect(() => parseString('"\\uDFFF"')).toThrow(/surrogates not allowed/);
});

test('should reject a surrogate pair written as two 4-digit unicode escapes', () => {
  // These two would combine into a valid astral character in UTF-16, but TOML forbids the
  // escapes themselves — the 8-digit form is the correct spelling.
  expect(() => parseString('"\\uD83D\\uDE00"')).toThrow(/surrogates not allowed/);
});

test('should reject a lone high surrogate in an 8-digit unicode escape', () => {
  expect(() => parseString('"\\U0000D800"')).toThrow(/surrogates not allowed/);
});

test('should reject a lone low surrogate in an 8-digit unicode escape', () => {
  expect(() => parseString('"\\U0000DFFF"')).toThrow(/surrogates not allowed/);
});

test('should reject a surrogate in an 8-digit unicode escape inside a multiline string', () => {
  expect(() => parseString('"""\\U0000D800"""')).toThrow(/surrogates not allowed/);
});

test('should still accept a valid astral character via an 8-digit unicode escape', () => {
  expect(parseString('"\\U0001F600"')).toBe('\u{1F600}');
});

test('should still reject an out-of-range 8-digit unicode escape', () => {
  expect(() => parseString('"\\U00110000"')).toThrow();
});
