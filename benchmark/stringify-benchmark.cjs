/**
 * Benchmark stringify function using iarna-toml files
 * 
 * Usage:
 *   npm run benchmark:stringify [-- <options>]
 *   
 * Options:
 *   --example        Run only the spec example benchmark
 *   --detailed       Run detailed profiling of stringify components
 *   --package <n>    Run benchmark for specific implementation
 *   --file <n>       Run specific file(s) matching pattern
 */

const { join, basename } = require('path');
const { readFileSync, existsSync, mkdirSync } = require('fs');
const { Suite, formatNumber } = require('benchmark');
const { sync: glob } = require('glob');
const { execSync } = require('child_process');
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

/**
 * Install a specific version to the cache directory
 * @param {string} version - Version to install (e.g., '0.6.0')
 * @returns {string} - Path to the installed module
 */
function installVersionToCache(version) {
  const cacheDir = join(__dirname, '../.bench-cache');
  const versionDir = join(cacheDir, `toml-patch-${version}`);
  const modulePath = join(versionDir, 'node_modules', '@decimalturn', 'toml-patch');
  
  // Check if already cached
  if (existsSync(modulePath)) {
    return modulePath;
  }
  
  // Create cache directory if needed
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  if (!existsSync(versionDir)) {
    mkdirSync(versionDir, { recursive: true });
  }
  
  console.log(c.info(`  📦 Installing v${version} to cache...`));
  
  try {
    // Install to cache directory
    execSync(
      `npm install --prefix "${versionDir}" --no-save --no-package-lock @decimalturn/toml-patch@${version}`,
      { stdio: 'pipe' }
    );
    
    if (existsSync(modulePath)) {
      console.log(c.success(`  ✓ Cached v${version}`));
      return modulePath;
    } else {
      throw new Error('Installation completed but module not found');
    }
  } catch (error) {
    console.error(c.error(`  ❌ Failed to install v${version}: ${error.message}`));
    return null;
  }
}

// Parse command line args
const { help, example, detailed, package: packageIndex, file, versions, _: filter } = mri(process.argv.slice(2), {
  boolean: ['help', 'example', 'detailed'],
  string: ['file', 'versions'],
  number: ['package']
});

if (help) {
  console.log(`Run stringify benchmarks for TOML implementations
  
Usage: node benchmark/stringify-benchmark.js [options]

Options:
  --example          Just run benchmark for spec example
  --detailed         Run detailed profiling of stringify components
  --package <n>      Run benchmark for specific implementation:
                       0: toml-patch (current) (default)
                       1: toml-patch (published)
                       2: @iarna/toml
  --file <pattern>   Run specific file(s) matching pattern
  --versions <list>  Test specific versions (comma-separated)
                     Example: --versions 0.6.0,0.7.0
                     Versions are automatically downloaded and cached`);
  process.exit(0);
}

// Define TOML implementations to test
let TOML_IMPLEMENTATIONS = [
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

// Add specific versions if requested
if (versions) {
  const versionList = versions.split(',').map(v => v.trim());
  
  console.log(c.info(`\n📦 Testing versions: current, ${versionList.join(', ')}`));
  console.log();
  
  const versionImpls = [];
  for (const version of versionList) {
    const modulePath = installVersionToCache(version);
    if (modulePath) {
      versionImpls.push({
        name: `toml-patch (v${version})`,
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

// Determine which implementations to run
const implementationsToRun = packageIndex !== undefined ? 
  [TOML_IMPLEMENTATIONS[packageIndex]] :
  TOML_IMPLEMENTATIONS;

// Main async function to handle ESM imports and run benchmarks
(async function main() {
  // First load the current version to parse all TOML files
  const currentToml = await import('../dist/toml-patch.js');

  // Determine which files to benchmark
  const search = example ? '0A-spec-01-example-v0.4.0.toml' : 
                 file ? `*${file}*.toml` : 
                 filter.length > 0 ? `*${filter.join('*')}*.toml` : '*.toml';

  const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
  const searchPattern = join(benchmark_dir, search).replace(/\\/g, '/');
  const benchmarks = glob(searchPattern).map(path => {
    const name = basename(path, '.toml');
    const data = readFileSync(path, 'utf8');
    try {
      // Parse the TOML data to get a JS object
      const parsed = currentToml.parse(data);
      return { name, data, parsed };
    } catch (error) {
      console.error(`Error parsing ${name}: ${error.message}`);
      return null;
    }
  }).filter(Boolean);

  if (!benchmarks.length) {
    throw new Error(`No matching benchmarks found for ${example ? '--example' : 
                                                       file ? `--file ${file}` : 
                                                       filter.length > 0 ? filter.join(' ') : 'all files'}`);
  }
  for (const implementation of implementationsToRun) {
    // Load TOML module
    let tomlModule;
    try {
      tomlModule = require(implementation.path);
    } catch (error) {
      console.error(`Error loading ${implementation.name}: ${error.message}`);
      continue;
    }

    console.log('\n' + c.title('═'.repeat(60)));
    console.log(c.title(`  📝 Stringify Benchmark: ${implementation.name}`));
    console.log(c.title('═'.repeat(60)) + '\n');

    // Run detailed benchmarks if requested
    if (detailed) {
      runDetailedBenchmarks(benchmarks, tomlModule, implementation.name);
    } else {
      await runGeneralBenchmarks(benchmarks, tomlModule, implementation.name);
    }
  }
  // Run benchmarks for each implementation

/**
 * Runs a general benchmark suite for stringify operations
 */
async function runGeneralBenchmarks(benchmarks, tomlModule, implementationName) {
  console.log(c.title('📊 General Stringify Benchmark:\n'));
  
  // Create benchmark suite
  const suite = new Suite(`${implementationName}-stringify`);
  
  // Add benchmarks
  benchmarks.forEach(({ name, parsed }) => {
    try {
      // Test if stringify works before adding to benchmark
      tomlModule.stringify(parsed);
      suite.add(name, () => tomlModule.stringify(parsed));
    } catch (error) {
      console.log(c.error(`❌ ${name}: Error - ${error.message}`));
    }
  });

  // Run benchmarks
  const results = [];
  let currentIndex = 0;

  return new Promise(resolve => {
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
        const progress = `[${currentIndex}/${suite.length}]`;
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
        if (!suite.length) return resolve();

        const hz = suite.reduce((total, benchmark) => total + benchmark.hz, 0) / suite.length;
        const sorted = Array.from(suite).sort((a, b) => b.hz - a.hz);

        console.log('\n' + c.title(`📊 Summary: ${implementationName}`));
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

/**
 * Runs detailed benchmarks for stringify
 */
function runDetailedBenchmarks(benchmarks, tomlModule, implementationName) {
  console.log(c.title('🔍 Detailed Stringify Process Benchmark:\n'));

  benchmarks.forEach(({ name, parsed }) => {
    console.log('\n' + c.info(`📦 Benchmark for: ${name}`));
    console.log(c.dim('─'.repeat(50)));
    
    const detailSuite = new Suite(`${name}-detailed-${implementationName}`);
    
    try {
      // Test if stringify works before adding to benchmark
      tomlModule.stringify(parsed);
      
      // Test full stringify
      detailSuite.add(`${name}-stringify`, () => {
        return tomlModule.stringify(parsed);
      });
      
      // Profile memory usage
      console.log(c.title('\n💾 Memory usage profile:'));
      const startMemory = process.memoryUsage().heapUsed;
      
      // Quick profile for stringify
      const startTime = Date.now();
      tomlModule.stringify(parsed);
      const endTime = Date.now();
      
      const endMemory = process.memoryUsage().heapUsed;
      const memUsed = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);
      const timeUsed = (endTime - startTime).toFixed(2);
      
      console.log(c.info(`  ⏱️  Time: ${timeUsed} ms`));
      console.log(c.info(`  🧠 Memory: ${memUsed} MB`));
      
      // Run benchmark
      console.log(c.title('\n⚡ Performance:'));
      detailSuite
        .on('cycle', event => {
          const benchmark = event.target;
          const opsPerSec = formatNumber(benchmark.hz.toFixed(benchmark.hz < 100 ? 2 : 0));
          console.log(`  ${c.success('✓')} ${c.highlight(opsPerSec)} ${c.dim('ops/sec ±' + benchmark.stats.rme.toFixed(2) + '%')}`);
        })
        .run();
    } catch (error) {
      console.log(c.error(`❌ ${name}: Error - ${error.message}`));
    }
  });
}})();
