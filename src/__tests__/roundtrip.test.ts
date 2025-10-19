import { parse, stringify } from '../';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Helper function to read TOML benchmark files
 */
function readBenchmarkFile(filename: string): string {
  const path = join(__dirname, '../../submodules/iarna-toml/benchmark', filename);
  return readFileSync(path, 'utf8');
}

/**
 * Runs a roundtrip test on a TOML file
 * - Parses the TOML to JS object
 * - Stringifies the JS object back to TOML
 * - Parses the new TOML again
 * - Compares the two JS objects for equality
 */
function testRoundtrip(filename: string, description: string) {
  test(`roundtrip: ${description}`, () => {
    const tomlContent = readBenchmarkFile(filename);
    
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

// Test problematic files that were causing errors in benchmarks
testRoundtrip('0C-scaling-table-inline-nested-1000.toml', 'deeply nested inline tables');
testRoundtrip('0B-types-array.toml', 'array of tables');
testRoundtrip('0A-spec-02-example-hard-unicode.toml', 'hard unicode example');

// Test other common cases
testRoundtrip('0A-spec-01-example-v0.4.0.toml', 'TOML spec example');
testRoundtrip('01-small-doc-mixed-type-inline-array.toml', 'small document with mixed types');



function testRoundtripString(filename: string, description: string) {
  test(`roundtrip format: ${description}`, () => {
    const tomlContent = readBenchmarkFile(filename);
    
    // Parse TOML to JS
    const parsedObject = parse(tomlContent);
    
    // Stringify JS back to TOML
    const stringifiedToml = stringify(parsedObject);
    
    // Compare the original and stringified TOML for exact match
    expect(stringifiedToml).toEqual(tomlContent);

  });
}

testRoundtripString('0A-spec-01-example-v0.4.0.toml', 'TOML spec example');
testRoundtripString('01-small-doc-mixed-type-inline-array.toml', 'small document with mixed types');