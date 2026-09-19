import { parse } from '../';
import { patch } from '../patch-lite-entry';
import { collectEditableLeaves, setAt } from './fuzz-patch-lite';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

/**
 * Returns the file paths of all TOML files in a directory
 */
function getTomlFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath)
    .filter(file => file.endsWith('.toml'))
    .map(file => join(directoryPath, file));
}

// Deterministic replacement values, cycled across a document's leaves. The mix
// exercises string escaping, integers, floats, booleans and bigints.
const EDIT_VALUES: unknown[] = [
  'lite-edit',
  'with "quotes" \\ and\nnewline',
  -12345,
  1234.5,
  true,
  false,
  9007199254740993n
];

/**
 * Identity round-trip: patching with the unchanged parsed value returns the
 * original document byte for byte.
 */
function testIdentityRoundtrip(filePath: string) {
  test(`roundtrip patch-lite identity: ${basename(filePath)}`, () => {
    const tomlContent = readFileSync(filePath, 'utf8');
    expect(patch(tomlContent, parse(tomlContent))).toBe(tomlContent);
  });
}

/**
 * Value round-trip: every editable leaf is replaced, then the patched output is
 * re-parsed and must equal the edited object. Date/time values are left alone
 * so the replacement generator can stay scalar-only; their text must survive
 * untouched.
 */
function testEditedRoundtrip(filePath: string) {
  test(`roundtrip patch-lite edits: ${basename(filePath)}`, () => {
    const tomlContent = readFileSync(filePath, 'utf8');
    const updated = parse(tomlContent);
    const leaves = collectEditableLeaves(updated);

    leaves.forEach((path, index) => {
      setAt(updated, path, EDIT_VALUES[index % EDIT_VALUES.length]);
    });

    expect(parse(patch(tomlContent, updated))).toEqual(updated);
  });
}

// Get all TOML files from the benchmark directory
const benchmarkDir = join(__dirname, '../../submodules/iarna-toml/benchmark');

// Get all TOML files from the fixtures directory
const fixturesDir = join(__dirname, '../__fixtures__');

// Combine all test files
const allTomlFiles = [...getTomlFiles(benchmarkDir), ...getTomlFiles(fixturesDir)];

allTomlFiles.forEach(filePath => {
  testIdentityRoundtrip(filePath);
  testEditedRoundtrip(filePath);
});
