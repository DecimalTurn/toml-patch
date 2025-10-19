/**
 * This file provides detailed profiling tools for both parse and stringify operations.
 * 
 * Usage:
 *   npm run benchmark:detailed [-- <options>]
 *   
 * Options:
 *   --parse         Focus on parse operations
 *   --stringify     Focus on stringify operations
 *   --file <name>   Profile specific file(s) matching pattern
 */

const { join, basename } = require('path');
const { readFileSync } = require('fs');
const { Suite } = require('benchmark');
const { sync: glob } = require('glob');
const mri = require('mri');

// Parse command line args
const { help, parse, stringify, file, _: filter } = mri(process.argv.slice(2), {
  boolean: ['help', 'parse', 'stringify'],
  string: ['file'],
  default: { 
    parse: false,
    stringify: true
  }
});

if (help) {
  console.log(`Run detailed profiling for toml-patch
  
Usage: node benchmark/detailed.js [options]

Options:
  --parse        Focus on parse operations
  --stringify    Focus on stringify operations (default)
  --file <name>  Profile specific file(s) matching pattern`);
  process.exit(0);
}

// Load TOML module
const tomlPatch = require('../dist/toml-patch.es.js');

// Define some sample files to test - focus on files that cover different use cases
const samples = file ? [`*${file}*.toml`] : [
  '0A-spec-01-example-v0.4.0.toml',      // Standard example
  '0C-scaling-array-inline-1000.toml',   // Large array
  '01-small-doc-mixed-type-inline-array.toml' // Small document (very fast)
];

// Load benchmark files
const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
const benchmarks = [];

for (const pattern of samples) {
  const files = glob(join(benchmark_dir, pattern));
  
  for (const path of files) {
    const name = basename(path, '.toml');
    try {
      const data = readFileSync(path, 'utf8');
      // Parse the TOML data to get a JS object
      const parsed = tomlPatch.parse(data);
      benchmarks.push({ name, data, parsed });
    } catch (error) {
      console.error(`Error loading benchmark ${name}: ${error.message}`);
    }
  }
}

if (!benchmarks.length) {
  throw new Error(`No matching benchmarks found`);
}

// For profiling memory and time consumption
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

// Profiling parse operations
if (parse) {
  console.log("\n=== PARSE PROFILING ===\n");
  
  benchmarks.forEach(({ name, data }) => {
    console.log(`\n--- Profiling ${name} ---`);
    
    console.log("Profiling parse...");
    const result = profileFunction(() => tomlPatch.parse(data), `${name} parse`);
    
    // Simple size stats
    console.log(`Input TOML size: ${data.length} bytes`);
    console.log(`Output JS object keys: ${Object.keys(result).length}`);
    
    // Run the benchmark suite for this sample
    console.log("\nRunning benchmark...");
    const suite = new Suite(name);
    
    suite.add(`${name} parse`, () => {
      return tomlPatch.parse(data);
    });
    
    suite
      .on('cycle', event => {
        console.log(String(event.target));
      })
      .run();
  });
}

// Profiling stringify operations
if (stringify) {
  console.log("\n=== STRINGIFY PROFILING ===\n");
  
  benchmarks.forEach(({ name, data, parsed }) => {
    console.log(`\n--- Profiling ${name} ---`);
    
    console.log("Profiling stringify...");
    const result = profileFunction(() => tomlPatch.stringify(parsed), `${name} stringify`);
    
    // Simple size stats
    console.log(`Input JS object keys: ${Object.keys(parsed).length}`);
    if (result) {
      console.log(`Output TOML size: ${result.length} bytes`);
    }
    
    // Run the benchmark suite for this sample
    console.log("\nRunning benchmark...");
    const suite = new Suite(name);
    
    // Only add to benchmark if stringify worked
    if (result !== null) {
      suite.add(`${name} stringify`, () => {
        return tomlPatch.stringify(parsed);
      });
    } else {
      console.log(`Skipping benchmark for ${name} due to stringify error`);
    }
    
    suite
      .on('cycle', event => {
        console.log(String(event.target));
      })
      .run();
  });
}