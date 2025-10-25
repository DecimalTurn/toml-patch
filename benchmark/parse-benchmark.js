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

// Define TOML implementations to test
const TOML_IMPLEMENTATIONS = [
  { 
    name: 'toml-patch (current)',
    path: '../dist/toml-patch.es.js'
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
      TOML = require(implementation.path);
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
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Parse Benchmark: ${implementation.name}`);
    console.log(`${'='.repeat(40)}\n`);

    await new Promise(resolve => {
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
          if (!suite.length) return;

          const hz = suite.reduce((total, benchmark) => total + benchmark.hz, 0) / suite.length;

          console.log();
          console.log(`${implementation.name} parse average: ${formatNumber(hz.toFixed(hz < 100 ? 2 : 0))} ops/sec`);
          
          // Print fastest/slowest
          const sorted = Array.from(suite).sort((a, b) => b.hz - a.hz);
          console.log(`Fastest: ${sorted[0].name} (${formatNumber(sorted[0].hz.toFixed(sorted[0].hz < 100 ? 2 : 0))} ops/sec)`);
          console.log(`Slowest: ${sorted[sorted.length-1].name} (${formatNumber(sorted[sorted.length-1].hz.toFixed(sorted[sorted.length-1].hz < 100 ? 2 : 0))} ops/sec)`);
          
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