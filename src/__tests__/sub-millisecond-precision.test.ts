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

  test('an edited value drops significant digits the new value cannot fill', () => {
    // Every digit of the source was significant, so the new value writes only
    // the digits it needs rather than padding itself out to the old width.
    const cases: Array<[string, Date, string]> = [
      [
        'time = 07:32:00.123456\n',
        new LocalTime('09:15:30.5', '09:15:30.5'),
        'time = 09:15:30.5\n'
      ],
      [
        'dt = 1979-05-27T07:32:00.123456\n',
        new LocalDateTime('1999-01-01T00:00:00.5'),
        'dt = 1999-01-01T00:00:00.5\n'
      ],
      [
        'o = 1979-05-27T07:32:00.123456-07:00\n',
        new OffsetDateTime('1999-01-01T00:00:00.5-07:00'),
        'o = 1999-01-01T00:00:00.5-07:00\n'
      ]
    ];

    for (const [source, replacement, expected] of cases) {
      const updated: any = parse(source);
      updated[Object.keys(updated)[0]] = replacement;
      expect(patch(source, updated), source.trim()).toBe(expected);
    }
  });

  test('an edited value keeps a width the source declared with zeros', () => {
    // The digits past the source's own significant ones were zeros, so the
    // document asked for that width and keeps it. `07:32:00.500` and
    // `07:32:00.123000` both stay six digits wide.
    const cases: Array<[string, Date, string]> = [
      [
        't = 07:32:00.500000\n',
        new LocalTime('09:15:30.750', '09:15:30.750'),
        't = 09:15:30.750000\n'
      ],
      [
        't = 07:32:00.123000\n',
        new LocalTime('09:15:30.750', '09:15:30.750'),
        't = 09:15:30.750000\n'
      ],
      ['t = 07:32:00.000\n', new LocalTime('09:15:30.750', '09:15:30.750'), 't = 09:15:30.750\n'],
      // A whole second keeps the declared width, and drops a fraction the
      // source never padded. This is what `1.0` -> `2.0` and `1.5` -> `2` do
      // for numbers.
      ['t = 07:32:00.500\n', new LocalTime('09:15:30', '09:15:30'), 't = 09:15:30.000\n'],
      ['t = 07:32:00.5\n', new LocalTime('09:15:30', '09:15:30'), 't = 09:15:30\n']
    ];

    for (const [source, replacement, expected] of cases) {
      const updated: any = parse(source);
      updated[Object.keys(updated)[0]] = replacement;
      expect(patch(source, updated), source.trim()).toBe(expected);
    }
  });

  test('a sub-millisecond edit is applied for every kind', () => {
    // `.123999` and `.123456` are both 123 ms to a Date, so the digits are the
    // only record of the difference between the two values.
    const cases: Array<[string, Date, string]> = [
      [
        'time = 07:32:00.123456\n',
        new LocalTime('07:32:00.123999'),
        'time = 07:32:00.123999\n'
      ],
      [
        'dt = 1979-05-27T07:32:00.123456\n',
        new LocalDateTime('1979-05-27T07:32:00.123999'),
        'dt = 1979-05-27T07:32:00.123999\n'
      ],
      [
        'spaced = 1979-05-27 07:32:00.123456\n',
        new LocalDateTime('1979-05-27 07:32:00.123999', true),
        'spaced = 1979-05-27 07:32:00.123999\n'
      ],
      [
        'utc = 1979-05-27T07:32:00.123456Z\n',
        new OffsetDateTime('1979-05-27T07:32:00.123999Z'),
        'utc = 1979-05-27T07:32:00.123999Z\n'
      ]
    ];

    for (const [source, replacement, expected] of cases) {
      const updated: any = parse(source);
      updated[Object.keys(updated)[0]] = replacement;
      expect(patch(source, updated), source.trim()).toBe(expected);
    }
  });

  test('a value that only carries milliseconds leaves the source fraction alone', () => {
    // A Date cannot express the sub-millisecond digits, so a replacement that
    // does not spell them out is the source's instant rather than an edit. Only
    // a value that writes its own digits past the millisecond counts as one.
    const source = 'utc = 1979-05-27T07:32:00.123456Z\n';
    const updated: any = parse(source);
    updated.utc = new Date('1979-05-27T07:32:00.123Z');

    expect(patch(source, updated)).toBe(source);
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

  test('an edited value widens the fraction instead of losing digits', () => {
    // 750 ms cannot be written with the single digit the source used, so the
    // fraction widens. Slicing to one digit would write `.7`, silently turning
    // the value into 700 ms.
    const cases: Array<[string, Date, string]> = [
      ['t = 07:32:00.5\n', new LocalTime('09:15:30.750', '09:15:30.750'), 't = 09:15:30.75\n'],
      ['t = 07:32:00.50\n', new LocalTime('09:15:30.789', '09:15:30.789'), 't = 09:15:30.789\n'],
      // The source's wider padding is kept, so this one stays three digits.
      ['t = 07:32:00.500\n', new LocalTime('09:15:30.750', '09:15:30.750'), 't = 09:15:30.750\n'],
      [
        'dt = 1979-05-27T07:32:00.5\n',
        new LocalDateTime('1999-01-01T00:00:00.750'),
        'dt = 1999-01-01T00:00:00.75\n'
      ],
      [
        'spaced = 1979-05-27 07:32:00.5\n',
        new LocalDateTime('1999-01-01 00:00:00.750', true),
        'spaced = 1999-01-01 00:00:00.75\n'
      ],
      [
        'o = 1979-05-27T07:32:00.5Z\n',
        new OffsetDateTime('1999-01-01T00:00:00.750Z'),
        'o = 1999-01-01T00:00:00.75Z\n'
      ]
    ];

    for (const [source, replacement, expected] of cases) {
      const updated: any = parse(source);
      updated[Object.keys(updated)[0]] = replacement;
      expect(patch(source, updated), source.trim()).toBe(expected);
    }
  });

  test('a widened fraction re-parses to the requested instant', () => {
    const source = 't = 07:32:00.5\n';
    const updated: any = parse(source);
    updated.t = new LocalTime('09:15:30.750', '09:15:30.750');

    const reparsed: any = parse(patch(source, updated));

    expect(reparsed.t.getUTCMilliseconds()).toBe(750);
    expect(reparsed.t.getTime()).toBe(updated.t.getTime());
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
