import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../';

const invalidFixturesDirectory = join(__dirname, '../__invalid__');
const invalidFixtures = readdirSync(invalidFixturesDirectory)
  .filter(filename => filename.endsWith('.toml'));

test.each(invalidFixtures)('rejects invalid fixture: %s', filename => {
  const fixture = readFileSync(join(invalidFixturesDirectory, filename));

  if (filename === 'lone-surogate-escaped.toml') {
    expect(() => parse(fixture)).toThrow(/Invalid \\uD800: surrogates not allowed/);
  } else {
    expect(() => parse(fixture)).toThrow('The encoded data was not valid for encoding utf-8');
  }
});