import dedent from 'dedent';
import { parse, patch, stringify } from '../';
import { LocalTime } from '../date-format';

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

  test('an edited value keeps the source fractional-digit count', () => {
    const source = 'time = 07:32:00.123456\n';
    const updated: any = parse(source);
    updated.time = new LocalTime('09:15:30.5', '09:15:30.5');

    expect(patch(source, updated)).toBe('time = 09:15:30.5\n');
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
