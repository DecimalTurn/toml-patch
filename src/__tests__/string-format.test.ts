import {
  BasicString,
  LiteralString,
  MultilineBasicString,
  MultilineLiteralString,
  detectLineContinuation,
  rawStringWrapper,
} from '../string-format';

describe('rawStringWrapper', () => {
  test('returns null for invalid raw values', () => {
    expect(rawStringWrapper('plain text')).toBeNull();
    expect(rawStringWrapper('"unterminated')).toBeNull();
    expect(rawStringWrapper("'unterminated")).toBeNull();
    expect(rawStringWrapper('"mismatch\'')).toBeNull();
    expect(rawStringWrapper("'mismatch\"")).toBeNull();
  });

  test('returns the correct wrapper type and parsed value for each valid format', () => {
    expect(rawStringWrapper('"abc"')).toMatchObject({
      raw: '"abc"',
      value: 'abc',
      type: 'basic',
    });
    expect(rawStringWrapper('"abc"')).toBeInstanceOf(BasicString);

    expect(rawStringWrapper("'abc'" )).toMatchObject({
      raw: "'abc'",
      value: 'abc',
      type: 'literal',
    });
    expect(rawStringWrapper("'abc'" )).toBeInstanceOf(LiteralString);

    expect(rawStringWrapper('"""abc"""')).toMatchObject({
      raw: '"""abc"""',
      value: 'abc',
      type: 'multiline-basic',
    });
    expect(rawStringWrapper('"""abc"""')).toBeInstanceOf(MultilineBasicString);

    expect(rawStringWrapper("'''abc'''" )).toMatchObject({
      raw: "'''abc'''",
      value: 'abc',
      type: 'multiline-literal',
    });
    expect(rawStringWrapper("'''abc'''" )).toBeInstanceOf(MultilineLiteralString);
  });
});

test('constructors validate their input format', () => {
  expect(() => new BasicString("'wrong quotes'" as string)).toThrow();
  expect(() => new LiteralString('"wrong quotes"' as string)).toThrow();
  expect(() => new MultilineBasicString('""unterminated' as string)).toThrow();
  expect(() => new MultilineLiteralString("''unterminated" as string)).toThrow();
});

describe('detectLineContinuation', () => {
  // Helper to build a MultilineBasicString from its inner value (chars between """)
  function mlbs(value: string): MultilineBasicString {
    return new MultilineBasicString(`"""${value}"""`);
  }

  test('returns false for a string with no backslashes', () => {
    expect(detectLineContinuation(mlbs(''))).toBe(false);
    expect(detectLineContinuation(mlbs('hello world'))).toBe(false);
    expect(detectLineContinuation(mlbs('hello\nworld'))).toBe(false);
  });

  test('returns false when a backslash appears only in the middle of a line', () => {
    // mid-line backslash is not a LEB
    expect(detectLineContinuation(mlbs('hello\\world'))).toBe(false);
    expect(detectLineContinuation(mlbs('a\\b\nc\\d'))).toBe(false);
  });

  test('returns true for a single (odd) backslash at the end of a line', () => {
    // value: \ + NL + more  — classic LEB
    expect(detectLineContinuation(mlbs('\\\n'))).toBe(true);
    expect(detectLineContinuation(mlbs('hello\\\nworld'))).toBe(true);
  });

  test('returns false for an even number of backslashes (escaped backslash) at end of a line', () => {
    // value: \\ + NL — the two backslashes are an escape sequence, not a LEB
    expect(detectLineContinuation(mlbs('\\\\\n'))).toBe(false);
    expect(detectLineContinuation(mlbs('hello\\\\\nworld'))).toBe(false);
  });

  test('returns true for three (odd) backslashes at the end of a line', () => {
    // value: \\\ + NL — two escaped \\ then a real LEB \
    expect(detectLineContinuation(mlbs('\\\\\\\n'))).toBe(true);
    expect(detectLineContinuation(mlbs('hello\\\\\\\nworld'))).toBe(true);
  });

  test('returns true when at least one line ends with an odd backslash', () => {
    expect(detectLineContinuation(mlbs('no leb\nhas leb\\\nnone here'))).toBe(true);
  });

  test('hasLineEndingBackslash property reflects detectLineContinuation', () => {
    expect(mlbs('hello\\\nworld').hasLineEndingBackslash).toBe(true);
    expect(mlbs('hello\nworld').hasLineEndingBackslash).toBe(false);
  });
});
