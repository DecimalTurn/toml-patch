import { parse, patch, stringify } from '../';
import { readFileSync, readdirSync } from 'fs';
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
 * Runs a roundtrip patch test on a TOML file
 * - Parses the TOML to JS object
 * - Patches the original TOML with the same JS object
 * - Compares the result with the original for exact match
 */
function testRoundtripPatch(filePath: string) {
  const filename = basename(filePath);
  
  test(`roundtrip patch: ${filename}`, () => {
    const tomlContent = readFileSync(filePath, 'utf8');
    
    // Parse TOML to JS
    const parsedObject = parse(tomlContent);
    
    // Patch the original TOML with the same JS object (no changes)
    const patchedToml = patch(tomlContent, parsedObject);
    
    // Compare the original and "patched" TOML for exact match
    expect(patchedToml).toEqual(tomlContent);
  });
}

// Get all TOML files from the benchmark directory
const benchmarkDir = join(__dirname, '../../submodules/iarna-toml/benchmark');
const benchmarkFiles = getTomlFiles(benchmarkDir);

// Get all TOML files from the fixtures directory
const fixturesDir = join(__dirname, '../__fixtures__');
const fixtureFiles = getTomlFiles(fixturesDir);

// Combine all test files
const allTomlFiles = [...benchmarkFiles, ...fixtureFiles];

// Run roundtrip patch test on all files
allTomlFiles.forEach(filePath => {
  testRoundtripPatch(filePath);
});