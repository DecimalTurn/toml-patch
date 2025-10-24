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
const { readFileSync } = require('fs');
const { Suite, formatNumber } = require('benchmark');
const { sync: glob } = require('glob');
const mri = require('mri');

// Define TOML implementations to test
const TOML_IMPLEMENTATIONS = [
  { 
    name: 'toml-patch (current)',
    path: '../'
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
const { help, example, detailed, package, file, _: filter } = mri(process.argv.slice(2), {
  boolean: ['help', 'example', 'detailed'],
  string: ['file'],
  number: ['package']
});

if (help) {
  console.log(`Run stringify benchmarks for TOML implementations
  
Usage: node benchmark/stringify-benchmark.js [options]

Options:
  --example        Just run benchmark for spec example
  --detailed       Run detailed profiling of stringify components
  --package <n>    Run benchmark for specific implementation:
                     0: toml-patch (current) (default)
                     1: toml-patch (published)
                     2: @iarna/toml
  --file <n>       Run specific file(s) matching pattern`);
  process.exit(0);
}

// Determine which implementations to run
const implementationsToRun = package !== undefined ? 
  [TOML_IMPLEMENTATIONS[package]] :
  TOML_IMPLEMENTATIONS;

// First load the current version to parse all TOML files
const currentToml = require('../');

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

// Run benchmarks for each implementation
(async function runImplementations() {
  for (const implementation of implementationsToRun) {
    // Load TOML module
    let tomlModule;
    try {
      tomlModule = require(implementation.path);
    } catch (error) {
      console.error(`Error loading ${implementation.name}: ${error.message}`);
      continue;
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`Stringify Benchmark: ${implementation.name}`);
    console.log(`${'='.repeat(40)}\n`);

    // Run detailed benchmarks if requested
    if (detailed) {
      runDetailedBenchmarks(benchmarks, tomlModule, implementation.name);
    } else {
      await runGeneralBenchmarks(benchmarks, tomlModule, implementation.name);
    }
  }
})();

/**
 * Runs a general benchmark suite for stringify operations
 */
async function runGeneralBenchmarks(benchmarks, tomlModule, implementationName) {
  console.log('General Stringify Benchmark:');
  
  // Create benchmark suite
  const suite = new Suite(`${implementationName}-stringify`);
  
  // Add benchmarks
  benchmarks.forEach(({ name, parsed }) => {
    try {
      // Test if stringify works before adding to benchmark
      tomlModule.stringify(parsed);
      suite.add(name, () => tomlModule.stringify(parsed));
    } catch (error) {
      console.log(`${name}: Error - ${error.message}`);
    }
  });

  // Run benchmarks
  return new Promise(resolve => {
    suite
      .on('start', () => {
        if (example || file || filter.length > 0) {
          const count = benchmarks.length;
          const filter_text = example ? '--example' : 
                              file ? `--file ${file}` :
                              filter.length > 0 ? filter.join(' ') : '';
          console.log(`Filter: ${filter_text ? `"${filter_text}"` : 'none'} -> ${count} ${count === 1 ? 'benchmark' : 'benchmarks'}`);
        }
      })
      .on('cycle', event => {
        console.log(String(event.target));
      })
      .on('complete', event => {
        const suite = event.currentTarget;
        if (!suite.length) return resolve();

        const hz = suite.reduce((total, benchmark) => total + benchmark.hz, 0) / suite.length;

        console.log();
        console.log(`${implementationName} stringify average: ${formatNumber(hz.toFixed(hz < 100 ? 2 : 0))} ops/sec`);
        
        // Print fastest/slowest
        const sorted = Array.from(suite).sort((a, b) => b.hz - a.hz);
        console.log(`Fastest: ${sorted[0].name} (${formatNumber(sorted[0].hz.toFixed(sorted[0].hz < 100 ? 2 : 0))} ops/sec)`);
        console.log(`Slowest: ${sorted[sorted.length-1].name} (${formatNumber(sorted[sorted.length-1].hz.toFixed(sorted[sorted.length-1].hz < 100 ? 2 : 0))} ops/sec)`);
        resolve();
      })
      .run({ async: true });
  });
}

/**
 * Runs detailed benchmarks for stringify
 */
function runDetailedBenchmarks(benchmarks, tomlModule, implementationName) {
  console.log('Simplified Stringify Process Benchmark:');

  benchmarks.forEach(({ name, parsed }) => {
    console.log(`\nBenchmark for: ${name}`);
    
    const detailSuite = new Suite(`${name}-detailed-${implementationName}`);
    
    try {
      // Test if stringify works before adding to benchmark
      tomlModule.stringify(parsed);
      
      // Test full stringify
      detailSuite.add(`${name}-stringify`, () => {
        return tomlModule.stringify(parsed);
      });
      
      // Profile memory usage
      console.log('Memory usage profile:');
      const startMemory = process.memoryUsage().heapUsed;
      
      // Quick profile for stringify
      console.time(`${name}-stringify`);
      tomlModule.stringify(parsed);
      console.timeEnd(`${name}-stringify`);
      
      const endMemory = process.memoryUsage().heapUsed;
      console.log(`Memory used: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
      
      // Run benchmark
      detailSuite
        .on('cycle', event => {
          console.log(String(event.target));
        })
        .run();
    } catch (error) {
      console.log(`${name}: Error - ${error.message}`);
    }
  });
}