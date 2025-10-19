/**
 * Benchmark stringify function using iarna-toml files
 * 
 * Usage:
 *   npm run benchmark:stringify [-- <options>]
 *   
 * Options:
 *   --example        Run only the spec example benchmark
 *   --detailed       Run detailed profiling of stringify components
 *   --file <name>    Run specific file(s) matching pattern
 */

const { join, basename } = require('path');
const { readFileSync } = require('fs');
const { Suite, formatNumber } = require('benchmark');
const { sync: glob } = require('glob');
const mri = require('mri');

// Parse command line args
const { help, example, detailed, file, _: filter } = mri(process.argv.slice(2), {
  boolean: ['help', 'example', 'detailed'],
  string: ['file']
});

if (help) {
  console.log(`Run stringify benchmarks for toml-patch
  
Usage: node benchmark/stringify.js [options]

Options:
  --example     Just run benchmark for spec example
  --detailed    Run detailed profiling of stringify components
  --file <name> Run specific file(s) matching pattern`);
  process.exit(0);
}

// Load TOML module
const tomlPatch = require('../');
const { parseJS, toTOML } = tomlPatch;

// Determine which files to benchmark
const search = example ? '0A-spec-01-example-v0.4.0.toml' : 
               file ? `*${file}*.toml` : 
               filter.length > 0 ? `*${filter.join('*')}*.toml` : '*.toml';

const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
const benchmarks = glob(join(benchmark_dir, search)).map(path => {
  const name = basename(path, '.toml');
  const data = readFileSync(path, 'utf8');
  try {
    // Parse the TOML data to get a JS object
    const parsed = tomlPatch.parse(data);
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

// Run detailed benchmarks if requested
if (detailed) {
  runDetailedBenchmarks(benchmarks);
} else {
  runGeneralBenchmarks(benchmarks);
}

/**
 * Runs a general benchmark suite for stringify operations
 */
function runGeneralBenchmarks(benchmarks) {
  console.log('General Stringify Benchmark:');
  
  // Create benchmark suite
  const suite = new Suite('toml-patch-stringify');
  
  // Add benchmarks
  benchmarks.forEach(({ name, parsed }) => {
    try {
      // Test if stringify works before adding to benchmark
      tomlPatch.stringify(parsed);
      suite.add(name, () => tomlPatch.stringify(parsed));
    } catch (error) {
      console.log(`${name}: Error - ${error.message}`);
    }
  });

  // Run benchmarks
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
      console.log(`toml-patch stringify average: ${formatNumber(hz.toFixed(hz < 100 ? 2 : 0))} ops/sec`);
      
      // Print fastest/slowest
      const sorted = Array.from(suite).sort((a, b) => b.hz - a.hz);
      console.log(`Fastest: ${sorted[0].name} (${formatNumber(sorted[0].hz.toFixed(sorted[0].hz < 100 ? 2 : 0))} ops/sec)`);
      console.log(`Slowest: ${sorted[sorted.length-1].name} (${formatNumber(sorted[sorted.length-1].hz.toFixed(sorted[sorted.length-1].hz < 100 ? 2 : 0))} ops/sec)`);
    })
    .run();
}

/**
 * Runs detailed benchmarks for individual components of stringify
 */
function runDetailedBenchmarks(benchmarks) {
  console.log('Detailed Stringify Process Benchmark:');

  benchmarks.forEach(({ name, parsed }) => {
    console.log(`\nBenchmark for: ${name}`);
    
    const detailSuite = new Suite(`${name}-detailed`);
    
    // Test just parseJS 
    detailSuite.add(`${name}-parseJS`, () => {
      return parseJS(parsed);
    });
    
    // Test just toTOML
    detailSuite.add(`${name}-toTOML`, () => {
      const document = parseJS(parsed);
      return toTOML(document.items);
    });
    
    // Test full stringify
    detailSuite.add(`${name}-stringify`, () => {
      return tomlPatch.stringify(parsed);
    });
    
    // Profile memory usage
    console.log('Memory usage profile:');
    const startMemory = process.memoryUsage().heapUsed;
    
    // Quick profile for parseJS
    console.time(`${name}-parseJS`);
    const document = parseJS(parsed);
    console.timeEnd(`${name}-parseJS`);
    
    // Quick profile for toTOML
    console.time(`${name}-toTOML`);
    toTOML(document.items);
    console.timeEnd(`${name}-toTOML`);
    
    // Quick profile for stringify
    console.time(`${name}-stringify`);
    tomlPatch.stringify(parsed);
    console.timeEnd(`${name}-stringify`);
    
    const endMemory = process.memoryUsage().heapUsed;
    console.log(`Memory used: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
    
    // Run benchmark
    detailSuite
      .on('cycle', event => {
        console.log(String(event.target));
      })
      .run();
  });
}