/**
 * Benchmark full `patch()` vs `patch-lite()` on the same in-place edit
 * workload. Both distributions can edit existing scalar values, so the two are
 * measured with an identical update object and the throughput is compared.
 *
 * Usage:
 *   node benchmark/patch-benchmark.mjs
 *
 * Prerequisites:
 *   pnpm run build   (so dist/patch-lite.js and dist/toml-patch.js exist)
 *
 * The report is written to benchmark/patch-benchmark.md (regenerated on every
 * run). Numbers vary by machine, so that file is gitignored.
 */
import { join, dirname } from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import Benchmark from 'benchmark';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const importDist = (file) => import(pathToFileURL(join(rootDir, 'dist', file)).href);

const { parse, patch } = await importDist('toml-patch.js');
const { patch: patchLite } = await importDist('patch-lite.js');

const source = [
  'title = "TOML Example"',
  'description = "A representative document for benchmarking"',
  'version = "1.0.0"',
  'enabled = true',
  'port = 8080',
  'threshold = 0.75',
  '',
  '[server]',
  'host = "localhost"',
  'ports = [8000, 8001, 8002]',
  '',
  '[owner]',
  'name = "Tom Preston-Werner"',
  'dob = 1979-05-27',
  '',
].join('\n');

// Build the edited object once. patch() does not mutate its `updated` argument,
// and patch-lite() re-parses the source itself.
const updated = parse(source);
updated.version = '1.0.1';
updated.port = 9090;
updated.enabled = false;
updated.server.host = '127.0.0.1';

// Both must agree on the result for the comparison to be meaningful.
const fullResult = patch(source, updated);
const liteResult = patchLite(source, updated);
if (fullResult !== liteResult) {
  console.error('Sanity check failed: full patch and patch-lite disagree on this workload.');
  process.exit(1);
}

const format = (n) => Math.round(n).toLocaleString('en-US');

function printReport(fullOps, liteOps) {
  const speedup = liteOps / fullOps;
  const table = [
    `  ${'Metric'.padEnd(16)} ${'patch (full)'.padEnd(18)} ${'patch-lite'.padEnd(18)} Speedup`,
    `  ${'-'.repeat(16)} ${'-'.repeat(18)} ${'-'.repeat(18)} ${'-'.repeat(8)}`,
    `  ${'ops/sec'.padEnd(16)} ${format(fullOps).padStart(18)} ${format(liteOps).padStart(18)} ${speedup.toFixed(2)}x`,
  ].join('\n');

  console.log();
  console.log('======================================================================');
  console.log('  Performance Comparison: patch vs patch-lite (in-place edits)');
  console.log('======================================================================');
  console.log();
  console.log(table);
  console.log();

  const markdown = [
    '# Performance Comparison: patch vs patch-lite\n',
    '## How to generate this report\n',
    'From the repository root:\n',
    '1. Build the package: `pnpm run build`\n',
    '2. Run the comparison: `node benchmark/patch-benchmark.mjs`\n',
    'The script writes this file directly. Numbers vary by machine.\n',
    '## Results\n',
    '| Metric | patch (full) | patch-lite | Speedup |',
    '|--------|--------------|------------|---------|',
    `| ops/sec | ${format(fullOps)} | ${format(liteOps)} | ${speedup.toFixed(2)}x |\n`,
  ].join('\n');

  writeFileSync(join(rootDir, 'benchmark', 'patch-benchmark.md'), markdown);
  console.log('Report written to benchmark/patch-benchmark.md');
}

const suite = new Benchmark.Suite('patch-vs-patch-lite');
suite
  .add('patch (full)', () => patch(source, updated), { maxTime: 2 })
  .add('patch-lite', () => patchLite(source, updated), { maxTime: 2 });

await new Promise((resolve) => {
  suite
    .on('cycle', (event) => console.log(String(event.target)))
    .on('complete', function () {
      printReport(this[0].hz, this[1].hz);
      resolve();
    })
    .run({ async: true });
});
