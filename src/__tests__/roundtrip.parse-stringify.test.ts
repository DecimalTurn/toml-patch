import { parse, stringify } from '../';
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
 * Runs a roundtrip test on a TOML file
 * - Parses the TOML to JS object
 * - Stringifies the JS object back to TOML
 * - Parses the new TOML again
 * - Compares the two JS objects for equality
 */
function testRoundtrip(filePath: string) {
  const filename = basename(filePath);
  
  test(`roundtrip: ${filename}`, () => {
    const tomlContent = readFileSync(filePath, 'utf8');
    
    // Parse TOML to JS
    const parsedObject = parse(tomlContent);
    
    // Stringify JS back to TOML
    const stringifiedToml = stringify(parsedObject);
    
    // Parse the new TOML
    const reparsedObject = parse(stringifiedToml);
    
    // Compare the objects (this may fail, which is valuable for debugging)
    expect(reparsedObject).toEqual(parsedObject);
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

// Run roundtrip test on all files
allTomlFiles.forEach(filePath => {
  testRoundtrip(filePath);
});