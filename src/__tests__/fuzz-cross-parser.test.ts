import dedent from 'dedent';
import { parse } from '../';
import { crossParserMismatch } from './fuzz-cross-parser';

describe('crossParserMismatch', () => {
  test('agrees on every value kind toml-patch parses', () => {
    const toml = dedent`
      title = "release notes"
      count = 3
      large = 9007199254740993
      ratio = 0.5
      negative_zero = -0.0
      not_a_number = nan
      infinite = -inf
      enabled = true
      released_on = 1979-05-27
      starts_at = 07:32:00.25
      local_moment = 1979-05-27T07:32:00
      utc_moment = 1979-05-27T07:32:00Z
      offset_moment = 1979-05-27T00:32:00.123456-07:00
      tags = ["alpha", "beta"]

      [owner]
      name = "Tom"

      [[releases]]
      version = "1.0.0"
    ` + '\n';

    expect(crossParserMismatch(toml, parse(toml))).toBeUndefined();
  });

  test('reports a document smol-toml rejects', () => {
    // Not valid TOML: the second line redefines the first value as a table.
    const toml = 'released = 1979-05-27\nreleased.note = "first"\n';
    const lenientParse = { released: new Date('1979-05-27T00:00:00Z') };

    expect(crossParserMismatch(toml, lenientParse)).toMatch(/^smol-toml rejected a document/);
  });

  test('reports a key toml-patch dropped', () => {
    const toml = 'name = "demo"\nversion = "1.0.0"\n';

    expect(crossParserMismatch(toml, { name: 'demo' })).toBe(
      'toml-patch and smol-toml disagree at <root>: keys only in toml-patch [], only in smol-toml ["version"]'
    );
  });

  test('reports a value read differently, with its path', () => {
    const toml = '[package]\nversion = "1.0.0"\n';

    expect(crossParserMismatch(toml, { package: { version: '1.0' } })).toBe(
      'toml-patch and smol-toml disagree at package.version: toml-patch "1.0" vs smol-toml "1.0.0"'
    );
  });

  test('reports an integer read as a float', () => {
    expect(crossParserMismatch('count = 3\n', { count: 3.5 })).toMatch(/at count: toml-patch 3\.5 vs smol-toml 3/);
  });

  test('reports a date read as the wrong kind', () => {
    const toml = 'moment = 1979-05-27T07:32:00\n';
    const offsetMoment = parse('moment = 1979-05-27T07:32:00Z\n');

    expect(crossParserMismatch(toml, offsetMoment)).toMatch(
      /at moment: toml-patch offset-datetime .* vs smol-toml local-datetime 1979-05-27T07:32:00\.000/
    );
  });

  test('reports an array with a missing element', () => {
    expect(crossParserMismatch('tags = ["alpha", "beta"]\n', { tags: ['alpha'] })).toMatch(
      /at tags: array length 1 vs 2/
    );
  });
});
