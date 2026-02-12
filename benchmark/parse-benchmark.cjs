/**
 * Benchmark parse function using iarna-toml files
 * 
 * Usage:
 *   npm run benchmark [-- <options>]
 *   
 * Options:
 *   --example     Run only the spec example benchmark
 *   --package     Only run benchmark for specific package (by index)
 *   --file <n>    Run specific file(s) using a matching pattern
 */

const { join, basename } = require('path');
const { readFileSync } = require('fs');
const { Suite, formatNumber } = require('benchmark');
const { sync: glob } = require('glob');
const mri = require('mri');

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

// Define TOML implementations to test
const TOML_IMPLEMENTATIONS = [
  { 
    name: 'toml-patch (current)',
    path: '../dist/toml-patch.js',
    esm: true
  },
  { 
    name: 'toml-patch (published)',
    path: '../node_modules/@decimalturn/toml-patch'
  },
  { 
    name: '@iarna/toml',
    path: '../submodules/iarna-toml/toml'
  }
];

// Parse command line args
const { help, example, package: packageIndex, file, _: filter } = mri(process.argv.slice(2), {
  boolean: ['help', 'example'],
  string: ['file'],
  number: ['package']
});

if (help) {
  console.log(`Run parse benchmarks for TOML implementations
  
Usage: node benchmark/parse-benchmark.js [options]

Options:
  --example       Just run benchmark for a spec example
  --package <n>   Run benchmark for specific implementation:
                    0: toml-patch
                    1: @iarna/toml
                  (Default: run all implementations)
  --file <n>      Run specific file(s) matching pattern`);
  process.exit(0);
}

// Determine which files to benchmark
const search = example ? '0A-spec-01-example-v0.4.0.toml' : 
               file ? `*${file}*.toml` : 
               filter.length > 0 ? `*${filter.join('*')}*.toml` : '*.toml';

// Find benchmark files
const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
const searchPattern = join(benchmark_dir, search).replace(/\\/g, '/');
const benchmarks = glob(searchPattern).map(path => {
  const name = basename(path, '.toml');
  const data = readFileSync(path, 'utf8');

  return { name, data };
});

if (!benchmarks.length) {
  throw new Error(`No matching benchmarks found for ${example ? '--example' : 
                                                     file ? `--file ${file}` : 
                                                     filter.length > 0 ? filter.join(' ') : 'all files'}`);
}

// Determine which implementations to run
const implementationsToRun = packageIndex !== undefined ? 
  [TOML_IMPLEMENTATIONS[packageIndex]] :
  TOML_IMPLEMENTATIONS;

// Run benchmarks for each implementation
(async function runImplementations() {
  for (const implementation of implementationsToRun) {
    // Load TOML module
    let TOML;
    try {
      if (implementation.esm) {
        TOML = await import(implementation.path);
      } else {
        TOML = require(implementation.path);
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
          if (example || file || filter.length > 0) {
            const count = benchmarks.length;
            const filter_text = example ? '--example' : 
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
          
          resolve();
        })
        .run({ async: true });
    });
  }
})();

// Just in case we want memory/time profiling later
function profileFunction(fn, name) {
  console.time(name);
  const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
  try {
    const result = fn();
    const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
    console.timeEnd(name);
    console.log(`Memory usage for ${name}: ${(endMem - startMem).toFixed(2)} MB`);
    return result;
  } catch (error) {
    console.timeEnd(name);
    console.log(`Error in ${name}: ${error.message}`);
    return null;
  }
}