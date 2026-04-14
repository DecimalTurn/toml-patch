import {
  BasicString,
  LiteralString,
  MultilineBasicString,
  MultilineLiteralString,
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
