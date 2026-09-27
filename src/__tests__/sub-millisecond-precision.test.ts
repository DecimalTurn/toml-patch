import dedent from 'dedent';
import { parse, patch, stringify } from '../';
import { LocalDateTime, LocalTime, OffsetDateTime } from '../date-format';

/**
 * A `Date` holds milliseconds, but TOML fractional seconds can carry any number
 * of digits. The date classes keep the source fraction, so the extra digits
 * survive a parse → stringify round trip, and `patch` keeps the source text
 * whenever the value only differs in how the fraction is spelled.
 */
describe('sub-millisecond fractional seconds', () => {
  const doc = dedent`
    time = 07:32:00.123456
    localDt = 1979-05-27T07:32:00.123456
    spaced = 1979-05-27 07:32:00.123456789
    utc = 1979-05-27T07:32:00.123456Z
    offset = 1979-05-27T07:32:00.123456789+02:00
  ` + '\n';

  test('parse → stringify keeps the full fraction for every kind', () => {
    expect(stringify(parse(doc))).toEqual(doc);
  });

  test('patch returns the document byte-for-byte for an unedited parse', () => {
    expect(patch(doc, parse(doc))).toBe(doc);
  });

  test('patch keeps the extra digits when another key changes', () => {
    const source = doc + 'version = "1.0.0"\n';
    const updated = parse(source);
    updated.version = '1.0.1';

    expect(patch(source, updated)).toEqual(doc + 'version = "1.0.1"\n');
  });

  test('a Date that only differs in fraction spelling is not an edit', () => {
    const source = 'time = 07:32:00.5\n';
    const updated: any = parse(source);
    // The same instant, spelled with three digits.
    updated.time = new LocalTime('07:32:00.500', '07:32:00.500');

    expect(patch(source, updated)).toBe(source);
  });

  test('an edited value takes the source fractional-digit count', () => {
    // The new millisecond differs from the source's leading digits, so only the
    // digits a Date holds can be written, capped at the source's count.
    const cases: Array<[string, Date, string]> = [
      [
        'time = 07:32:00.123456\n',
        new LocalTime('09:15:30.5', '09:15:30.5'),
        'time = 09:15:30.500\n'
      ],
      [
        'dt = 1979-05-27T07:32:00.123456\n',
        new LocalDateTime('1999-01-01T00:00:00.5'),
        'dt = 1999-01-01T00:00:00.500\n'
      ],
      [
        'o = 1979-05-27T07:32:00.123456-07:00\n',
        new OffsetDateTime('1999-01-01T00:00:00.5-07:00'),
        'o = 1999-01-01T00:00:00.500-07:00\n'
      ]
    ];

    for (const [source, replacement, expected] of cases) {
      const updated: any = parse(source);
      updated[Object.keys(updated)[0]] = replacement;
      expect(patch(source, updated), source.trim()).toBe(expected);
    }
  });

  test('an unchanged millisecond keeps the rest of the source fraction for every kind', () => {
    // 123 is the source's leading three digits, so the remaining digits of the
    // source fraction are kept. LocalTime must behave like the other classes.
    const cases: Array<[string, Date, string]> = [
      [
        'time = 07:32:00.123456\n',
        new LocalTime('09:15:30.123', '09:15:30.123'),
        'time = 09:15:30.123456\n'
      ],
      [
        'dt = 1979-05-27T07:32:00.123456\n',
        new LocalDateTime('1999-01-01T00:00:00.123'),
        'dt = 1999-01-01T00:00:00.123456\n'
      ],
      [
        'o = 1979-05-27T07:32:00.123456-07:00\n',
        new OffsetDateTime('1999-01-01T00:00:00.123-07:00'),
        'o = 1999-01-01T00:00:00.123456-07:00\n'
      ]
    ];

    for (const [source, replacement, expected] of cases) {
      const updated: any = parse(source);
      updated[Object.keys(updated)[0]] = replacement;
      expect(patch(source, updated), source.trim()).toBe(expected);
    }
  });

  test('Temporal objects keep the sub-millisecond digits', () => {
    const obj = parse(doc, { temporal: true });

    expect(String(obj.time)).toBe('07:32:00.123456');
    expect(String(obj.localDt)).toBe('1979-05-27T07:32:00.123456');
    expect(String(obj.spaced)).toBe('1979-05-27T07:32:00.123456789');
    expect(String(obj.utc)).toBe('1979-05-27T07:32:00.123456+00:00[+00:00]');
    expect(String(obj.offset)).toBe('1979-05-27T07:32:00.123456789+02:00[+02:00]');
  });

  test('Temporal values round-trip to the canonical text', () => {
    // Temporal has no space separator, so the spaced source is normalized to
    // `T`; every other row keeps its original spelling and full fraction.
    expect(stringify(parse(doc, { temporal: true }))).toEqual(dedent`
      time = 07:32:00.123456
      localDt = 1979-05-27T07:32:00.123456
      spaced = 1979-05-27T07:32:00.123456789
      utc = 1979-05-27T07:32:00.123456Z
      offset = 1979-05-27T07:32:00.123456789+02:00
    ` + '\n');
  });
});
