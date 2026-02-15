/**
 * Benchmark parse function using iarna-toml files
 * 
 * Usage:
 *   npm run benchmark [-- <options>]
 *   
 * Options:
 *   --sample      Run curated sample of 10 representative benchmarks
 *   --package     Only run benchmark for specific package (by index)
 *   --file <n>    Run specific file(s) using a matching pattern
 */

import { join, basename, resolve, dirname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import Benchmark from 'benchmark';
import { globSync } from 'glob';
import mri from 'mri';

const { Suite, formatNumber } = Benchmark;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Single cache buster for this benchmark run (shared across all module loads)
const CACHE_BUSTER = `?t=${Date.now()}`;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

// Helper functions for colored output
const c = {
  title: (text) => `${colors.bright}${colors.cyan}${text}${colors.reset}`,
  success: (text) => `${colors.green}${text}${colors.reset}`,
  warning: (text) => `${colors.yellow}${text}${colors.reset}`,
  info: (text) => `${colors.blue}${text}${colors.reset}`,
  highlight: (text) => `${colors.bright}${colors.magenta}${text}${colors.reset}`,
  bright: (text) => `${colors.bright}${text}${colors.reset}`,
  dim: (text) => `${colors.dim}${text}${colors.reset}`,
  error: (text) => `${colors.red}${text}${colors.reset}`,
};

// Simple table formatter
function createTable(headers, rows) {
  // Strip ANSI codes for length calculation
  const stripAnsi = (str) => String(str).replace(/\x1b\[[0-9;]*m/g, '');
  
  const colWidths = headers.map((h, i) => 
    Math.max(h.length, ...rows.map(r => stripAnsi(r[i] || '').length))
  );
  
  const separator = '─'.repeat(colWidths.reduce((a, b) => a + b + 3, 1));
  const headerRow = '│ ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' │ ') + ' │';
  const dataRows = rows.map(row => 
    '│ ' + row.map((cell, i) => {
      const cellStr = String(cell || '');
      const padding = colWidths[i] - stripAnsi(cellStr).length;
      return cellStr + ' '.repeat(padding);
    }).join(' │ ') + ' │'
  );
  
  return [
    c.dim(separator),
    c.bright(headerRow),
    c.dim(separator),
    ...dataRows,
    c.dim(separator)
  ].join('\n');
}

/**
 * Install a package to the cache directory
 * @param {string} packageName - npm package name (e.g., '@decimalturn/toml-patch')
 * @param {string} [version] - Version to install (e.g., '0.6.0'), or empty for latest
 * @returns {string|null} - Path to the installed module
 */
function installPackageToCache(packageName, version) {
  const cacheDir = join(__dirname, '../.bench-cache');
  const cacheKey = version ? `${packageName.replace(/[\/@ ]/g, '-')}-${version}` : packageName.replace(/[\/@ ]/g, '-');
  const versionDir = join(cacheDir, cacheKey);
  const modulePath = join(versionDir, 'node_modules', packageName);
  const spec = version ? `${packageName}@${version}` : packageName;
  
  // Check if already cached (skip cache for 'latest' to ensure we get current version)
  if (version !== 'latest' && existsSync(modulePath)) {
    return modulePath;
  }
  
  // Clear stale cache for 'latest' tag
  if (version === 'latest' && existsSync(versionDir)) {
    rmSync(versionDir, { recursive: true, force: true });
  }
  
  // Create cache directory if needed
  if (!existsSync(versionDir)) {
    mkdirSync(versionDir, { recursive: true });
  }
  
  console.log(c.info(`  📦 Installing ${spec} to cache...`));
  
  try {
    execSync(
      `npm install --prefix "${versionDir}" --no-save --no-package-lock ${spec}`,
      { stdio: 'pipe' }
    );
    
    if (existsSync(modulePath)) {
      console.log(c.success(`  ✓ Cached ${spec}`));
      return modulePath;
    } else {
      throw new Error('Installation completed but module not found');
    }
  } catch (error) {
    console.error(c.error(`  ❌ Failed to install ${spec}: ${error.message}`));
    return null;
  }
}

/**
 * Dynamically import a module, resolving ESM entry points for cached packages.
 * @param {string} modulePath - Absolute or relative path to the module
 * @returns {Promise<object>} - The imported module
 */
async function loadModule(modulePath) {
  const absPath = resolve(__dirname, modulePath);
  let importPath = absPath;

  // For directories, resolve entry point from package.json
  const pkgJsonPath = join(absPath, 'package.json');
  if (existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const entry = (pkg.exports && (typeof pkg.exports === 'string' ? pkg.exports :
      pkg.exports.import || (pkg.exports['.'] && (typeof pkg.exports['.'] === 'string' ? pkg.exports['.'] : pkg.exports['.'].import)))) 
      || pkg.module || pkg.main;
    if (entry) importPath = join(absPath, entry);
  }

  // Bust Node.js ESM cache to ensure fresh module on each run, but consistent within run
  const finalPath = importPath + CACHE_BUSTER;
  console.log(c.info(`  📂 Loading: ${importPath}`));
  
  // Show file stats for debugging
  try {
    const stats = statSync(importPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    const modTime = stats.mtime.toISOString();
    console.log(c.info(`     Size: ${sizeKB} KB, Modified: ${modTime}`));
  } catch (e) {
    // Ignore if file doesn't exist (e.g., for directories)
  }
  
  return import(finalPath);
}

// Parse command line args
const { help, sample, package: packageIndex, file, versions, _: filter } = mri(process.argv.slice(2), {
  boolean: ['help', 'sample'],
  string: ['file', 'versions'],
  number: ['package']
});

if (help) {
  console.log(`Run parse benchmarks for TOML implementations
  
Usage: node benchmark/parse-benchmark.mjs [options]

Options:
  --sample           Run curated sample of 10 representative benchmarks
  --package <index>  Only run benchmark for the given implementation (0-based index)
  --file <pattern>   Run benchmarks matching the file pattern
  --versions <list>  Comma-separated list of versions to benchmark (e.g., 0.7.0,0.6.0)
  
Examples:
  npm run benchmark
  npm run benchmark -- --sample
  npm run benchmark -- --file hard
  npm run benchmark -- --package 0
  npm run benchmark -- --versions 0.7.0,0.6.0`);
  process.exit(0);
}

// Define TOML implementations to test
let TOML_IMPLEMENTATIONS = [
  { 
    name: 'toml-patch (current)',
    path: '../dist/toml-patch.js',
  },
  { 
    name: '@iarna/toml',
    path: '../submodules/iarna-toml/toml.js',
  },
  {
    name: 'smol-toml',
    path: installPackageToCache('smol-toml'),
  },
  {
    name: '@rainbowatcher/toml-edit-js',
    path: installPackageToCache('@rainbowatcher/toml-edit-js'),
    needsInit: true,
  }
].filter(impl => impl.path != null);

// Add specific versions if requested
if (versions) {
  const versionList = versions.split(',').map(v => v.trim());
  
  console.log(c.info(`\n📦 Testing versions: current, ${versionList.join(', ')}`));
  console.log();
  
  const versionImpls = [];
  for (const version of versionList) {
    const modulePath = installPackageToCache('@decimalturn/toml-patch', version);
    if (modulePath) {
      const pkgPath = join(modulePath, 'package.json');
      const resolvedVersion = existsSync(pkgPath)
        ? JSON.parse(readFileSync(pkgPath, 'utf8')).version || version
        : version;
      versionImpls.push({
        name: `toml-patch (v${resolvedVersion})`,
        path: modulePath
      });
    }
  }
  
  // Replace default implementations with current + requested versions
  TOML_IMPLEMENTATIONS = [
    TOML_IMPLEMENTATIONS[0], // Keep current
    ...versionImpls
  ];
  
  console.log();
}

// Curated sample of representative benchmarks
const SAMPLE_FILES = [
  '0A-spec-01-example-v0.4.0.toml',
  '0A-spec-02-example-hard-unicode.toml',
  '01-small-doc-mixed-type-inline-array.toml',
  '0C-scaling-string-40kb.toml',
  '0C-scaling-array-inline-1000.toml',
  '0C-scaling-table-inline-1000.toml',
  '0B-types-scalar-string-multiline-1079-chars.toml',
  '0B-types-scalar-datetimes.toml',
  '0B-types-scalar-ints.toml',
  '0B-types-table.toml'
];

// Determine which files to benchmark
const search = sample ? `{${SAMPLE_FILES.join(',')}}` : 
               file ? `*${file}*.toml` : 
               filter.length > 0 ? `*${filter.join('*')}*.toml` : '*.toml';

// Find benchmark files
const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
const searchPattern = join(benchmark_dir, search).replace(/\\/g, '/');
const benchmarks = globSync(searchPattern).map(path => {
  const name = basename(path, '.toml');
  const data = readFileSync(path, 'utf8');

  return { name, data };
});

if (!benchmarks.length) {
  throw new Error(`No matching benchmarks found for ${sample ? '--sample' : 
                                                     file ? `--file ${file}` : 
                                                     filter.length > 0 ? filter.join(' ') : 'all files'}`);
}

// Determine which implementations to run
const implementationsToRun = packageIndex !== undefined ? 
  [TOML_IMPLEMENTATIONS[packageIndex]] :
  TOML_IMPLEMENTATIONS;

// Collect results across implementations for global comparison
const allResults = [];

// Run benchmarks for each implementation
for (const implementation of implementationsToRun) {
  // Load TOML module
  let TOML;
  try {
    TOML = await loadModule(implementation.path);
    // Initialize WASM-based modules if needed
    if (implementation.needsInit && typeof TOML.init === 'function') {
      await TOML.init();
    }
  } catch (error) {
    console.error(`Error loading ${implementation.name}: ${error.message}`);
    continue;
  }

  // Create benchmark suite
  const suite = new Suite(`${implementation.name}-parse`);
  benchmarks.forEach(({ name, data }) => {
    suite.add(name, () => TOML.parse(data));
  });

  // Run benchmarks
  console.log('\n' + c.title('═'.repeat(60)));
  console.log(c.title(`  🚀 Parse Benchmark: ${implementation.name}`));
  console.log(c.title('═'.repeat(60)) + '\n');

  const results = [];
  let currentIndex = 0;

  await new Promise(resolve => {
    suite
      .on('start', () => {
        if (sample || file || filter.length > 0) {
          const count = benchmarks.length;
          const filter_text = sample ? '--sample' : 
                              file ? `--file ${file}` :
                              filter.length > 0 ? filter.join(' ') : '';
          
          console.log(c.info(`📁 Filter: ${filter_text ? `"${filter_text}"` : 'none'} → ${count} ${count === 1 ? 'benchmark' : 'benchmarks'}\n`));
        }
      })
      .on('cycle', event => {
        const benchmark = event.target;
        currentIndex++;
        const progress = `[${currentIndex}/${benchmarks.length}]`;
        const opsPerSec = formatNumber(benchmark.hz.toFixed(benchmark.hz < 100 ? 2 : 0));
        
        results.push({
          name: benchmark.name,
          hz: benchmark.hz,
          opsPerSec: opsPerSec,
          rme: benchmark.stats.rme.toFixed(2)
        });
        
        console.log(`${c.dim(progress)} ${c.success('✓')} ${benchmark.name} ${c.dim('×')} ${c.highlight(opsPerSec)} ${c.dim('ops/sec ±' + benchmark.stats.rme.toFixed(2) + '%')}`);
      })
      .on('complete', event => {
        const suite = event.currentTarget;
        if (!suite.length) return;

        const hz = suite.reduce((total, benchmark) => total + benchmark.hz, 0) / suite.length;
        const sorted = Array.from(suite).sort((a, b) => b.hz - a.hz);

        console.log('\n' + c.title(`📊 Summary: ${implementation.name}`));
        console.log();
        
        // Create results table
        const tableRows = sorted.map((b, idx) => {
          const emoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
          const ops = formatNumber(b.hz.toFixed(b.hz < 100 ? 2 : 0));
          const rme = b.stats.rme.toFixed(2) + '%';
          return [emoji, b.name, ops, rme];
        });
        
        console.log(createTable(
          ['Rank', 'Benchmark', 'ops/sec', '±RME'],
          tableRows
        ));
        
        console.log();
        console.log(c.highlight(`⚡ Average: ${formatNumber(hz.toFixed(hz < 100 ? 2 : 0))} ops/sec`));
        console.log(c.success(`🏆 Fastest: ${sorted[0].name} (${formatNumber(sorted[0].hz.toFixed(sorted[0].hz < 100 ? 2 : 0))} ops/sec)`));
        console.log(c.warning(`🐌 Slowest: ${sorted[sorted.length-1].name} (${formatNumber(sorted[sorted.length-1].hz.toFixed(sorted[sorted.length-1].hz < 100 ? 2 : 0))} ops/sec)`));
        
        // Collect for global comparison
        allResults.push({
          name: implementation.name,
          benchmarks: Object.fromEntries(Array.from(suite).map(b => [b.name, b.hz])),
          average: hz
        });

        resolve();
      })
      .run({ async: true });
  });
}

// Print global comparison if multiple implementations were benchmarked
if (allResults.length > 1) {
  printGlobalSummary(allResults, 'Parse');
  writeMarkdownSummary(allResults, 'Parse', 'benchmark-parse.md');
}

/**
 * Prints a cross-implementation comparison table
 */
function printGlobalSummary(allResults, benchmarkType) {
  console.log('\n' + c.title('═'.repeat(70)));
  console.log(c.title(`  📊 Cross-Implementation Comparison: ${benchmarkType}`));
  console.log(c.title('═'.repeat(70)) + '\n');

  const baseline = allResults[0];
  const benchmarkNames = Object.keys(baseline.benchmarks);
  const showRatio = allResults.length === 2;

  const headers = ['Benchmark', ...allResults.map(r => r.name)];
  if (showRatio) headers.push('Ratio');

  const rows = [];
  for (const benchName of benchmarkNames) {
    const row = [benchName];
    for (const impl of allResults) {
      const hz = impl.benchmarks[benchName];
      row.push(hz != null ? formatNumber(hz.toFixed(hz < 100 ? 2 : 0)) : 'N/A');
    }
    if (showRatio) {
      const baseHz = baseline.benchmarks[benchName];
      const otherHz = allResults[1].benchmarks[benchName];
      if (baseHz && otherHz && otherHz > 0) {
        const ratio = baseHz / otherHz;
        const formatted = `${ratio.toFixed(2)}x`;
        row.push(ratio >= 1 ? c.success(formatted) : c.error(formatted));
      } else {
        row.push('N/A');
      }
    }
    rows.push(row);
  }

  // Average row (only when there are multiple benchmarks)
  if (benchmarkNames.length > 1) {
    const avgRow = [c.bright('Average')];
    for (const impl of allResults) {
      avgRow.push(c.bright(formatNumber(impl.average.toFixed(impl.average < 100 ? 2 : 0))));
    }
    if (showRatio && allResults[1].average > 0) {
      const ratio = baseline.average / allResults[1].average;
      const formatted = `${ratio.toFixed(2)}x`;
      avgRow.push(ratio >= 1 ? c.success(c.bright(formatted)) : c.error(c.bright(formatted)));
    }
    rows.push(avgRow);
  }

  console.log(createTable(headers, rows));

  // Print ranking by average when more than 2 implementations
  if (allResults.length > 2) {
    const ranked = [...allResults].sort((a, b) => b.average - a.average);
    console.log();
    console.log(c.title('🏆 Ranking by average throughput:'));
    ranked.forEach((impl, idx) => {
      const emoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
      const ops = formatNumber(impl.average.toFixed(impl.average < 100 ? 2 : 0));
      console.log(`  ${emoji} ${impl.name}: ${c.highlight(ops)} ops/sec`);
    });
  }

  console.log();
}

/**
 * Writes a markdown summary of benchmark results
 */
function writeMarkdownSummary(allResults, benchmarkType, filename) {
  const baseline = allResults[0];
  const benchmarkNames = Object.keys(baseline.benchmarks);
  const showRatio = allResults.length === 2;

  let markdown = `# ${benchmarkType} Benchmark Results\n\n`;
  markdown += `*All measurements in operations per second (ops/sec). Higher is better.*\n\n`;
  markdown += `## Cross-Implementation Comparison\n\n`;

  // Table header
  const headers = ['Benchmark', ...allResults.map(r => r.name)];
  if (showRatio) headers.push('Ratio');
  markdown += '| ' + headers.join(' | ') + ' |\n';
  markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

  // Table rows
  for (const benchName of benchmarkNames) {
    const row = [benchName];
    for (const impl of allResults) {
      const hz = impl.benchmarks[benchName];
      row.push(hz != null ? hz.toFixed(hz < 100 ? 2 : 0) : 'N/A');
    }
    if (showRatio) {
      const baseHz = baseline.benchmarks[benchName];
      const otherHz = allResults[1].benchmarks[benchName];
      if (baseHz && otherHz && otherHz > 0) {
        const ratio = baseHz / otherHz;
        row.push(ratio.toFixed(2));
      } else {
        row.push('N/A');
      }
    }
    markdown += '| ' + row.join(' | ') + ' |\n';
  }

  // Average row (only when there are multiple benchmarks)
  if (benchmarkNames.length > 1) {
    const avgRow = ['**Average**'];
    for (const impl of allResults) {
      avgRow.push(`**${impl.average.toFixed(impl.average < 100 ? 2 : 0)}**`);
    }
    if (showRatio && allResults[1].average > 0) {
      const ratio = baseline.average / allResults[1].average;
      avgRow.push(`**${ratio.toFixed(2)}**`);
    }
    markdown += '| ' + avgRow.join(' | ') + ' |\n';
  }

  // Ranking when more than 2 implementations
  if (allResults.length > 2) {
    const ranked = [...allResults].sort((a, b) => b.average - a.average);
    markdown += '\n## Ranking by Average Throughput\n\n';
    ranked.forEach((impl, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      const ops = impl.average.toFixed(impl.average < 100 ? 2 : 0);
      markdown += `${medal} ${impl.name}: ${ops} ops/sec\n`;
    });
  }

  // Write to file
  writeFileSync(filename, markdown, 'utf8');
  console.log(c.dim(`\n📝 Benchmark results written to ${filename}\n`));
}
