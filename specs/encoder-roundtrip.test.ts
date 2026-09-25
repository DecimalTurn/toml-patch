import { readFileSync } from 'fs';
import { sync as glob } from 'glob';
import { parse, stringify } from '../src/';

/**
 * Mirrors the check that `toml-test -encoder` performs in CI: decode every valid
 * fixture, re-encode it with `stringify()`, decode the result and compare the
 * two values.
 *
 * The decoder suite in specs.test.ts only compares `parse()` against the
 * expected JSON, so an encoder that changes a value while writing it stays
 * invisible there and is only caught by the Go bridge. This file covers that
 * direction so the failure shows up in `pnpm run specs`.
 *
 * The comparison is on our decoded values, which is weaker than toml-test's
 * type-tagged JSON, but it does catch any value the encoder fails to preserve.
 */

// Keep in step with run-toml-test.bash, which runs the 1.1 suite by default.
const TOML_VERSION = '1.1.0';

const tomlVersionFiles = new Set(
  readFileSync(`submodules/toml-test/tests/files-toml-${TOML_VERSION}`, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.trim())
);

function isIncludedInVersion(filePath: string): boolean {
  const relativePath = filePath.replace(/\\/g, '/').replace('submodules/toml-test/tests/', '');
  return (
    tomlVersionFiles.has(relativePath) || tomlVersionFiles.has(relativePath.replace('.json', '.toml'))
  );
}

/**
 * Key order is not part of a TOML value, so keys are sorted before comparing.
 * BigInt and the non-finite numbers need explicit handling because
 * JSON.stringify cannot render them.
 */
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && !Number.isFinite(value)) return `special:${value}`;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

const validFixtures = glob('submodules/toml-test/tests/valid/**/*.toml').filter(
  isIncludedInVersion
);

validFixtures.forEach(inputFile => {
  const name = inputFile
    .replace(/\\/g, '/')
    .replace('submodules/toml-test/tests/valid/', '')
    .replace('.toml', '');

  test(`toml-test encoder - ${name}`, () => {
    const source = readFileSync(inputFile, 'utf8');
    const decoded = parse(source);

    expect(canonical(parse(stringify(decoded)))).toEqual(canonical(decoded));
  });
});
