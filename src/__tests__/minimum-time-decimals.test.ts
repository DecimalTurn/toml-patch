import dedent from 'dedent';
import { parse as smolParse } from 'smol-toml';
import { parse, patch, stringify } from '../';
import { LocalTime, padFractionalSeconds } from '../date-format';
import { TomlFormat } from '../toml-format';

describe('padFractionalSeconds', () => {
  test('pads a time that has no fraction', () => {
    expect(padFractionalSeconds('07:32:00', 3)).toBe('07:32:00.000');
  });

  test('never removes digits already written', () => {
    expect(padFractionalSeconds('07:32:00.123456', 3)).toBe('07:32:00.123456');
  });

  test('pads before the offset', () => {
    expect(padFractionalSeconds('1979-05-27T07:32:00-07:00', 2)).toBe(
      '1979-05-27T07:32:00.00-07:00'
    );
    expect(padFractionalSeconds('1979-05-27T07:32:00Z', 1)).toBe('1979-05-27T07:32:00.0Z');
  });

  test('adds the seconds a TOML 1.1 time omitted', () => {
    expect(padFractionalSeconds('07:32', 2)).toBe('07:32:00.00');
  });

  test('leaves date-only values and a zero count alone', () => {
    expect(padFractionalSeconds('1979-05-27', 3)).toBe('1979-05-27');
    expect(padFractionalSeconds('07:32:00', 0)).toBe('07:32:00');
  });
});

describe('minimumTimeDecimals on dates', () => {
  const doc = dedent`
    time = 07:32:00
    short = 07:32:00.5
    long = 07:32:00.123456
    dt = 1979-05-27T07:32:00
    spaced = 1979-05-27 07:32:00.5
    utc = 1979-05-27T07:32:00Z
    offset = 1979-05-27T07:32:00.5-07:00
    date = 1979-05-27
  ` + '\n';

  test('stringify pads every time-bearing kind', () => {
    expect(stringify(parse(doc), { minimumTimeDecimals: 3 })).toEqual(dedent`
      time = 07:32:00.000
      short = 07:32:00.500
      long = 07:32:00.123456
      dt = 1979-05-27T07:32:00.000
      spaced = 1979-05-27 07:32:00.500
      utc = 1979-05-27T07:32:00.000Z
      offset = 1979-05-27T07:32:00.500-07:00
      date = 1979-05-27
    ` + '\n');
  });

  test('the default writes every value as it stands', () => {
    expect(stringify(parse(doc))).toEqual(doc);
  });

  test('pads Temporal values, including an omitted seconds field', () => {
    const obj = {
      time: Temporal.PlainTime.from('07:32'),
      dt: Temporal.PlainDateTime.from('1979-05-27T07:32:00.5'),
      zoned: Temporal.ZonedDateTime.from('1979-05-27T07:32:00Z[+00:00]'),
      date: Temporal.PlainDate.from('1979-05-27')
    };

    expect(stringify(obj, { minimumTimeDecimals: 3 })).toEqual(dedent`
      time = 07:32:00.000
      dt = 1979-05-27T07:32:00.500
      zoned = 1979-05-27T07:32:00.000Z
      date = 1979-05-27
    ` + '\n');
  });

  test('pads smol-toml dates', () => {
    const obj = smolParse('time = 07:32:00\ndt = 1979-05-27T07:32:00\n');

    expect(stringify(obj, { minimumTimeDecimals: 3 })).toBe(
      'time = 07:32:00.000\ndt = 1979-05-27T07:32:00.000\n'
    );
  });

  test('patch pads an edited date and leaves an untouched row alone', () => {
    const existing = dedent`
      edited = 07:32:00
      untouched = 07:32:00
    ` + '\n';

    const updated = parse(existing);
    updated.edited = new LocalTime('09:15:30', '09:15:30');

    expect(patch(existing, updated, { minimumTimeDecimals: 3 })).toBe(dedent`
      edited = 09:15:30.000
      untouched = 07:32:00
    ` + '\n');
  });

  test('patch pads a Temporal replacement', () => {
    const existing = 't = 07:32:00\n';
    const updated = parse(existing);
    updated.t = Temporal.PlainTime.from('09:15:30');

    expect(patch(existing, updated, { minimumTimeDecimals: 2 })).toBe('t = 09:15:30.00\n');
  });

  test('a source with more digits than the option keeps them', () => {
    const existing = 't = 07:32:00.123456\n';
    const updated = parse(existing);
    updated.t = new LocalTime('09:15:30.123', '09:15:30.123');

    expect(patch(existing, updated, { minimumTimeDecimals: 2 })).toBe('t = 09:15:30.123456\n');
  });

  test('truncateZeroTimeInDates still wins over the decimal floor', () => {
    const source = 'dt = 1979-05-27T00:00:00\n';
    const updated = parse(source);
    updated.dt = Temporal.PlainDateTime.from('1979-05-27T00:00:00');

    expect(patch(source, updated, { minimumTimeDecimals: 3, truncateZeroTimeInDates: true })).toBe(
      'dt = 1979-05-27\n'
    );
  });

  test('is independent from minimumDecimals', () => {
    const source = 'n = 1.5\nt = 07:32:00\n';

    // Numbers only.
    expect(stringify(parse(source), { minimumDecimals: 3 })).toBe('n = 1.500\nt = 07:32:00\n');

    // Dates only.
    expect(stringify(parse(source), { minimumTimeDecimals: 3 })).toBe(
      'n = 1.5\nt = 07:32:00.000\n'
    );

    // Both at once, each on its own kind of value.
    expect(stringify(parse(source), { minimumDecimals: 3, minimumTimeDecimals: 1 })).toBe(
      'n = 1.500\nt = 07:32:00.0\n'
    );
  });

  test('TomlFormat defaults the option to 0', () => {
    expect(TomlFormat.default().minimumTimeDecimals).toBe(0);
  });
});
