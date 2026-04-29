import { TomlDocument } from '../';
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
 * Runs a roundtrip patch-parse AST test on a TOML file
 * - Parses the original TOML into a TomlDocument
 * - Adds a new root key-value pair and patches the document
 * - Stringifies the patched document and parses it into a second TomlDocument
 * - Compares the two ASTs for equality
 */
function testRoundtripPatchParse(filePath: string) {
  const filename = basename(filePath);

  test(`roundtrip patch-parse: ${filename}`, () => {
    const tomlContent = readFileSync(filePath, 'utf8');

    // Parse the original TOML and apply the patch
    const doc = new TomlDocument(tomlContent);
    const modifiedObject = { ...doc.toJsObject, roundtrip: 'test' };
    doc.patch(modifiedObject);

    // Parse the patched TOML string into a fresh document
    const reparsedDoc = new TomlDocument(doc.toTomlString);

    // The two ASTs should be identical
    expect(reparsedDoc.ast).toEqual(doc.ast);
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
