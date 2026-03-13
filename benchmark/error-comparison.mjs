/**
 * Compare error messages between smol-toml and @decimalturn/toml-patch
 * when parsing invalid TOML files from the toml-test suite.
 */

import { join, dirname } from 'path';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';
import { globSync } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ── Load smol-toml from cache ──────────────────────────────────────
const cacheDir = join(__dirname, '../.bench-cache');
const smolDir = join(cacheDir, 'smol-toml', 'node_modules', 'smol-toml');
if (!existsSync(smolDir)) {
  console.log('Installing smol-toml to benchmark cache...');
  const dest = join(cacheDir, 'smol-toml');
  execSync(`npm install --prefix "${dest}" --no-save --no-package-lock smol-toml`, { stdio: 'pipe' });
}
const pkg = JSON.parse(readFileSync(join(smolDir, 'package.json'), 'utf8'));
const entry = pkg.exports?.import ?? pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main;
const smolToml = await import(pathToFileURL(join(smolDir, entry)).href);

// ── Load toml-patch ────────────────────────────────────────────────
const tomlPatch = await import(pathToFileURL(join(rootDir, 'dist', 'toml-patch.js')).href);

// ── Curated selection of invalid files ─────────────────────────────
// Pick a variety of error categories to show the difference in messaging
const invalidDir = join(rootDir, 'submodules', 'toml-test', 'tests', 'invalid');

const curatedFiles = [
  // Duplicate keys/tables
  'table/duplicate-key-01.toml',
  'table/duplicate-key-04.toml',
  'key/duplicate-keys-01.toml',
  // Bad escapes
  'string/bad-escape-01.toml',
  'string/bad-escape-02.toml',
  // Integer errors
  'integer/leading-zero-01.toml',
  'integer/double-sign-plus.toml',
  // Float errors
  'float/double-point-01.toml',
  'float/leading-zero-01.toml',
  // Array errors
  'array/no-close-01.toml',
  'array/missing-separator-01.toml',
  'array/text-in-array.toml',
  // Table errors
  'table/array-no-close-01.toml',
  'table/redefine-01.toml',
  'table/redefine-02.toml',
  // Inline table
  'inline-table/no-close-01.toml',
  'inline-table/duplicate-key-01.toml',
  // Datetime
  'datetime/offset-overflow-hour.toml',
  // Bool
  'bool/almost-true.toml',
  'bool/capitalized-true.toml',
  // Key errors
  'key/bare-invalid-character-01.toml',
  'key/no-value-01.toml',
  // Multiline string
  'string/basic-multiline-out-of-range-unicode-escape-1.toml',
  // Control chars
  'control/bare-null.toml',
].filter(f => existsSync(join(invalidDir, f)));

// Also grab a deterministic set of extra files to broaden coverage
const allInvalid = globSync('**/*.toml', { cwd: invalidDir }).map(f => f.replace(/\\/g, '/'));
const extraFiles = [...new Set(allInvalid)]
  .filter(f => !curatedFiles.includes(f))
  .sort((a, b) => a.localeCompare(b))
  .slice(0, 15);

const testFiles = [...curatedFiles, ...extraFiles];

// ── Run comparison ─────────────────────────────────────────────────

const results = [];
let smolOnlyFails = 0;
let patchOnlyFails = 0;
let bothFail = 0;
let neitherFails = 0;

for (const relPath of testFiles) {
  const fullPath = join(invalidDir, relPath);
  let content;
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch {
    continue;
  }

  let smolError = null;
  let patchError = null;

  try {
    smolToml.parse(content);
  } catch (e) {
    smolError = e.message;
  }

  try {
    tomlPatch.parse(content);
  } catch (e) {
    patchError = e.message;
  }

  if (smolError && patchError) bothFail++;
  else if (smolError && !patchError) smolOnlyFails++;
  else if (!smolError && patchError) patchOnlyFails++;
  else neitherFails++;

  results.push({
    file: relPath,
    content: content.length > 120 ? content.slice(0, 120) + '...' : content,
    smolError,
    patchError,
  });
}

// ── Print results ──────────────────────────────────────────────────

console.log('═'.repeat(80));
console.log('  Error Message Comparison: smol-toml vs @decimalturn/toml-patch');
console.log('═'.repeat(80));
console.log(`\nFiles tested: ${results.length}`);
console.log(`Both reject: ${bothFail} | Only smol-toml rejects: ${smolOnlyFails} | Only toml-patch rejects: ${patchOnlyFails} | Neither rejects: ${neitherFails}\n`);

for (const r of results) {
  console.log('─'.repeat(80));
  console.log(`📄 ${r.file}`);
  console.log(`   TOML: ${r.content.replace(/\n/g, '\\n').slice(0, 100)}`);
  console.log();
  console.log(`   smol-toml:  ${r.smolError || '(no error - accepted!)'}`);
  console.log(`   toml-patch: ${r.patchError || '(no error - accepted!)'}`);
  console.log();
}

// ── Write markdown summary ─────────────────────────────────────────
let md = `# Error Message Comparison: smol-toml vs @decimalturn/toml-patch\n\n`;
md += `## How to generate this report\n\n`;
md += `From the repository root:\n\n`;
md += `1. Build the package (required so \`dist/toml-patch.js\` exists):\n`;
md += `   \`pnpm run build\`\n`;
md += `2. Run the comparison script:\n`;
md += `   \`node benchmark/error-comparison.mjs\`\n\n`;
md += `The script writes this file (\`benchmark/error-comparison.md\`) directly.\n\n`;
md += `Note: the script includes a deterministic set of extra invalid test files (alphabetically sorted), so rows and counts are stable unless the source test files change.\n\n`;
md += `Files tested: ${results.length} | Both reject: ${bothFail} | smol-only: ${smolOnlyFails} | patch-only: ${patchOnlyFails} | neither: ${neitherFails}\n\n`;

md += `| File | smol-toml error | toml-patch error |\n`;
md += `|------|-----------------|------------------|\n`;
for (const r of results) {
  const smol = (r.smolError || '*(accepted)*').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const patch = (r.patchError || '*(accepted)*').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  md += `| ${r.file} | ${smol} | ${patch} |\n`;
}

writeFileSync(join(rootDir, 'benchmark', 'error-comparison.md'), md);
console.log('\n📝 Full comparison written to benchmark/error-comparison.md');
