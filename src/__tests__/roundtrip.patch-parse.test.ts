import { parse, patch } from '../';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

/**
 * Returns the file paths of all TOML files in a directory
 */
function getTomlFiles(directoryPath: string): string[] {
  const files = readdirSync(directoryPath);
  return files
    .filter(file => file.endsWith('.toml'))
    .map(file => join(directoryPath, file));
}

/**
 * Runs a roundtrip patch-parse test on a TOML file
 * - Parses the original TOML to a JS object
 * - Adds a new root key-value pair to the JS object
 * - Patches the original TOML with the modified JS object
 * - Parses the patched TOML again
 * - Compares the re-parsed object with the expected modified JS object
 */
function testRoundtripPatchParse(filePath: string) {
  const filename = basename(filePath);

  test(`roundtrip patch-parse: ${filename}`, () => {
    const tomlContent = readFileSync(filePath, 'utf8');

    // Parse TOML to JS
    const parsedObject = parse(tomlContent);

    // Add a new root key-value pair
    const modifiedObject = { ...parsedObject, roundtrip: 'test' };

    // Patch the original TOML with the modified JS object
    const patchedToml = patch(tomlContent, modifiedObject);

    // Parse the patched TOML
    const reparsedObject = parse(patchedToml);

    // The re-parsed object should equal the modified object
    expect(reparsedObject).toEqual(modifiedObject);
  });
}

// Get all TOML files from the benchmark directory
// Resolve the root from either the main repo or a worktree
const repoRoot = existsSync(join(__dirname, '../../submodules'))
  ? join(__dirname, '../..')
  : join(__dirname, '../../../..');
const benchmarkDir = join(repoRoot, 'submodules/iarna-toml/benchmark');
const benchmarkFiles = existsSync(benchmarkDir) ? getTomlFiles(benchmarkDir) : [];

// Get all TOML files from the fixtures directory
const fixturesDir = join(repoRoot, 'src/__fixtures__');
const fixtureFiles = getTomlFiles(fixturesDir);

// Combine all test files
const allTomlFiles = [...benchmarkFiles, ...fixtureFiles];

// Run roundtrip patch-parse test on all files
allTomlFiles.forEach(filePath => {
  testRoundtripPatchParse(filePath);
});
