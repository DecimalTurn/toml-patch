/**
 * Measure how much tree-shaking saves when a consumer only needs `patch`.
 *
 * Usage:
 *   node benchmark/tree-shake-size.mjs
 *
 * Prerequisites:
 *   pnpm run build   (so that dist/toml-patch.js and dist/dev/* exist)
 *
 * The script:
 *   1. Bundles several entry points with esbuild (minified, all deps inlined)
 *   2. Reports minified / gzip / brotli sizes side by side
 *   3. Writes benchmark/tree-shaking.md
 *
 * Every scenario uses the exact same esbuild settings, so the numbers are
 * directly comparable. Two entry points are tested for each scenario:
 *   - the published bundle (dist/toml-patch.js), which a bundler still has to
 *     dead-code-eliminate internally
 *   - the unbundled dev build (dist/dev/toml-patch.js), which a bundler can
 *     drop module by module
 */

import { join, dirname } from 'node:path';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const cacheDir = join(rootDir, '.bench-cache');

const prodEntry = './dist/toml-patch.js';
const devEntry = './dist/dev/toml-patch.js';

// ── Helpers ────────────────────────────────────────────────────────

const kB = (bytes) => (bytes / 1024).toFixed(2);
const pct = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;

// ── Ensure esbuild is available ────────────────────────────────────

function ensureEsbuild() {
  const esbuildMain = join(cacheDir, 'esbuild', 'node_modules', 'esbuild', 'lib', 'main.js');
  if (!existsSync(esbuildMain)) {
    console.log('Installing esbuild to benchmark cache...');
    mkdirSync(join(cacheDir, 'esbuild'), { recursive: true });
    execSync(`npm install --prefix "${join(cacheDir, 'esbuild')}" --no-save --no-package-lock esbuild`, {
      stdio: 'pipe',
    });
  }
  return esbuildMain;
}

const esbuild = await import(pathToFileURL(ensureEsbuild()).href);

// ── Bundling ───────────────────────────────────────────────────────

function bundle(source) {
  const result = esbuild.buildSync({
    stdin: { contents: `${source}\n`, resolveDir: rootDir, loader: 'js' },
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'esnext',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const output = result.metafile.outputs[Object.keys(result.metafile.outputs)[0]];
  // Modules from dist/dev that actually contributed bytes to the output.
  const devModules = Object.keys(output.inputs)
    .filter((p) => /dist[\\/]dev[\\/][^\\/]+\.js$/.test(p) && output.inputs[p].bytesInOutput > 0)
    .map((p) => p.replace(/\\/g, '/').split('/').pop())
    .sort();
  return {
    bytes: Buffer.byteLength(code, 'utf8'),
    gzip: gzipSync(code).length,
    brotli: brotliCompressSync(code).length,
    devModules,
  };
}

// ── Scenarios ──────────────────────────────────────────────────────

function run(label, entry, names) {
  const imports =
    names === '*'
      ? `export * from '${entry}';`
      : `import { ${names.join(', ')} } from '${entry}';\nexport { ${names.join(', ')} };`;
  console.log(`Bundling ${label}...`);
  return { label, ...bundle(imports) };
}

const scenarios = [
  run('full package (all exports), prod bundle', prodEntry, '*'),
  run('`patch` only, prod bundle', prodEntry, ['patch']),
  run('full package (all exports), dev build', devEntry, '*'),
  run('`patch` only, dev build', devEntry, ['patch']),
  run('`parse` only, dev build', devEntry, ['parse']),
  run('`stringify` only, dev build', devEntry, ['stringify']),
  run('`LocalDate` only, dev build', devEntry, ['LocalDate']),
];

const [fullProd, patchProd, fullDev, patchDev, parseDev, stringifyDev, localDateDev] = scenarios;
const keptModules = patchDev.devModules;
const droppedModules = fullDev.devModules.filter((m) => !keptModules.includes(m));

// Deltas always compare within the same build flavor.
const savingMin = kB(fullProd.bytes - patchProd.bytes);
const savingMinPct = pct(fullProd.bytes - patchProd.bytes, fullProd.bytes);
const savingGz = kB(fullProd.gzip - patchProd.gzip);
const savingGzPct = pct(fullProd.gzip - patchProd.gzip, fullProd.gzip);
const savingDevMin = kB(fullDev.bytes - patchDev.bytes);
const savingDevPct = pct(fullDev.bytes - patchDev.bytes, fullDev.bytes);

// ── Print results ──────────────────────────────────────────────────

console.log();
console.log('═'.repeat(96));
console.log('  Tree-shaking: bundle size per entry point (esbuild, minified)');
console.log('═'.repeat(96));
console.log();
console.log(`  ${'Scenario'.padEnd(40)} ${'minified'.padStart(11)} ${'gzip'.padStart(10)} ${'brotli'.padStart(10)}`);
console.log(`  ${'─'.repeat(40)} ${'─'.repeat(11)} ${'─'.repeat(10)} ${'─'.repeat(10)}`);
for (const s of scenarios) {
  console.log(
    `  ${s.label.padEnd(40)} ${(kB(s.bytes) + ' kB').padStart(11)} ${(kB(s.gzip) + ' kB').padStart(10)} ${(
      kB(s.brotli) + ' kB'
    ).padStart(10)}`,
  );
}
console.log();
console.log(
  `  patch-only saving: ${savingMin} kB minified (${savingMinPct}), ${savingGz} kB gzipped (${savingGzPct})`,
);
console.log(`  (dev build vs dev build: ${savingDevMin} kB minified, ${savingDevPct})`);
console.log();

// ── Write markdown report ──────────────────────────────────────────

const delta = (base, s) => `−${kB(base.bytes - s.bytes)} kB (${pct(base.bytes - s.bytes, base.bytes)})`;
const row = (s, vsFull) =>
  `| ${s.label} | ${kB(s.bytes)} kB | ${kB(s.gzip)} kB | ${kB(s.brotli)} kB | ${vsFull} |`;

const table = [
  '| Entry point | Minified | Gzipped | Brotli | vs full package (same build) |',
  '|---|---|---|---|---|',
  row(fullProd, '—'),
  row(patchProd, delta(fullProd, patchProd)),
  row(fullDev, '—'),
  row(patchDev, delta(fullDev, patchDev)),
  row(parseDev, delta(fullDev, parseDev)),
  row(stringifyDev, delta(fullDev, stringifyDev)),
  row(localDateDev, delta(fullDev, localDateDev)),
].join('\n');

let md = `# Tree-Shaking: how much is saved when only \`patch\` is needed\n\n`;
md += `## How to generate this report\n\n`;
md += `From the repository root:\n\n`;
md += `1. Build the package (required so \`dist/toml-patch.js\` and \`dist/dev/*\` exist):\n`;
md += `   \`pnpm run build\`\n`;
md += `2. Run the benchmark:\n`;
md += `   \`node benchmark/tree-shake-size.mjs\`\n\n`;
md += `The script writes this file (\`benchmark/tree-shaking.md\`) directly.\n\n`;
md += `All scenarios are bundled with the same esbuild settings (\`--bundle --format=esm --minify --target=esnext\`) `;
md += `with every dependency inlined, so the numbers are directly comparable. `;
md += `\`prod bundle\` means the published \`dist/toml-patch.js\` (a bundler has to eliminate the unused code inside that single file); `;
md += `\`dev build\` means the unbundled \`~3.1.0-dev\` build in \`dist/dev/\` (a bundler can drop whole modules).\n\n`;
md += `## Results\n\n`;
md += `${table}\n\n`;
md += `**Tree-shaking away everything except \`patch\` saves ${savingMin} kB minified (${savingMinPct}) and ${savingGz} kB gzipped (${savingGzPct}).** `;
md += `That result holds for both builds: the unbundled dev build saves ${savingDevMin} kB minified (${savingDevPct}) over the full dev build.\n\n`;
const droppedList = droppedModules.map((m) => `\`${m}\``).join(', ');
md += `## Why the saving is small\n\n`;
md += `\`patch\` is the heaviest entry point: it needs the tokenizer, the parser, the writer, the generator, `;
md += `the formatter and the comment-handling machinery. Out of ${fullDev.devModules.length} dev modules a `;
md += `\`patch\`-only bundle keeps ${keptModules.length}, dropping only ${droppedList}.\n\n`;
md += `That dropped chain is the \`TomlDocument\` API (\`toml-document.js\` → \`truncate.js\`) plus the entry `;
md += `barrel's own code, which only declares the \`parse\`/\`stringify\`/\`parseDocument\` wrappers.\n\n`;
md += `The other entry points reuse the same internals, so for them tree-shaking pays off a lot: `;
md += `\`parse\` alone is ${kB(parseDev.bytes)} kB, ${pct(fullDev.bytes - parseDev.bytes, fullDev.bytes)} smaller than the full package.\n\n`;
md += `## Takeaway\n\n`;
md += `- A consumer that needs \`patch\` should not expect meaningful savings from tree-shaking: `;
md += `${savingMin} kB minified, ${savingGz} kB gzipped.\n`;
md += `- The unbundled \`dev\` build is not faster for \`patch\`-only consumers; both builds land within ~1 kB of each other.\n`;
md += `- Tree-shaking matters for consumers who use \`parse\`, \`stringify\` or the individual date classes without \`patch\`.\n`;

writeFileSync(join(rootDir, 'benchmark', 'tree-shaking.md'), md);
console.log('📝 Report written to benchmark/tree-shaking.md');
