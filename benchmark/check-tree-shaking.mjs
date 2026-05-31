/**
 * Validate tree-shaking effectiveness by bundling minimal consumers
 * with rollup and measuring the output sizes.
 */
import { rollup } from 'rollup';
import terser from '@rollup/plugin-terser';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const tmpDir = join(rootDir, '.tree-shake-test');

// Clean up and create temp dir
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

// Define test scenarios
const scenarios = [
  {
    name: 'Full (all exports)',
    code: `export { parse, stringify, patch, TomlFormat, TomlDocument } from '../dist/index.js';`,
  },
  {
    name: 'patch from root',
    code: `export { patch } from '../dist/index.js';`,
  },
  {
    name: 'patch from subpath',
    code: `export { patch } from '../dist/patch.js';`,
  },
  {
    name: 'patch + TomlFormat (root)',
    code: `export { patch, TomlFormat } from '../dist/index.js';`,
  },
  {
    name: 'patch + format subpaths',
    code: `export { patch } from '../dist/patch.js'; export { TomlFormat } from '../dist/format.js';`,
  },
];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} kB`;
}

console.log('Tree-shaking validation\n');
console.log('Bundling each scenario with rollup + terser...\n');

const results = [];

for (const scenario of scenarios) {
  const entryFile = join(tmpDir, `entry-${scenario.name.replace(/[^a-z0-9]/gi, '-')}.js`);
  const outFile = join(tmpDir, `out-${scenario.name.replace(/[^a-z0-9]/gi, '-')}.js`);
  
  writeFileSync(entryFile, scenario.code);
  
  try {
    const bundle = await rollup({
      input: entryFile,
      treeshake: true,
    });
    
    // Generate unminified
    const { output: rawOutput } = await bundle.generate({ format: 'es' });
    const rawSize = rawOutput[0].code.length;
    
    // Generate minified
    const bundleMin = await rollup({
      input: entryFile,
      treeshake: true,
      plugins: [terser()],
    });
    const { output: minOutput } = await bundleMin.generate({ format: 'es' });
    const minCode = minOutput[0].code;
    const minSize = minCode.length;
    const gzSize = gzipSync(minCode).length;
    
    writeFileSync(outFile, minCode);
    
    results.push({
      name: scenario.name,
      raw: rawSize,
      min: minSize,
      gz: gzSize,
    });
    
    await bundle.close();
    await bundleMin.close();
  } catch (err) {
    console.error(`  ERROR: ${scenario.name}: ${err.message}`);
    results.push({ name: scenario.name, raw: 0, min: 0, gz: 0 });
  }
}

// Print results table
const fullResult = results.find(r => r.name === 'Full (all exports)');

console.log('| Scenario | Raw | Minified | Gzipped | Savings vs Full |');
console.log('|----------|-----|----------|---------|-----------------|');
for (const r of results) {
  const savings = fullResult && fullResult.min > 0
    ? `${((1 - r.min / fullResult.min) * 100).toFixed(1)}%`
    : '-';
  console.log(`| ${r.name.padEnd(30)} | ${formatSize(r.raw).padStart(10)} | ${formatSize(r.min).padStart(10)} | ${formatSize(r.gz).padStart(9)} | ${savings.padStart(15)} |`);
}

// Clean up
rmSync(tmpDir, { recursive: true, force: true });
