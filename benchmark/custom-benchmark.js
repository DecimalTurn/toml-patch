const { join, basename } = require('path');
const { readFileSync } = require('fs');
const { Suite } = require('benchmark');

// Import components directly to test individual parts
const { parse, stringify } = require('../');

// Define some sample files to test
const samples = [
  '0A-spec-01-example-v0.4.0.toml',      // Standard example
  '0C-scaling-array-inline-1000.toml',   // Large array
  '01-small-doc-mixed-type-inline-array.toml' // Small document (very fast)
];

const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
const benchmarks = samples.map(sampleName => {
  const path = join(benchmark_dir, sampleName);
  const name = basename(path, '.toml');
  try {
    const data = readFileSync(path, 'utf8');
    // Parse the TOML data to get a JS object
    const parsed = parse(data);
    return { name, data, parsed };
  } catch (error) {
    console.error(`Error loading benchmark ${name}: ${error.message}`);
    return null;
  }
}).filter(Boolean);

// For profiling memory and time consumption
function profileFunction(fn, name) {
  console.time(name);
  const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const result = fn();
  const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
  console.timeEnd(name);
  console.log(`Memory usage for ${name}: ${(endMem - startMem).toFixed(2)} MB`);
  return result;
}

// Profiling individual benchmarks
benchmarks.forEach(({ name, data, parsed }) => {
  console.log(`\n--- Profiling ${name} ---`);
  
  // Run stringify with profiling
  console.log("Profiling stringify...");
  const result = profileFunction(() => stringify(parsed), `${name} stringify`);
  
  // Simple size stats
  console.log(`Input JS object keys: ${Object.keys(parsed).length}`);
  console.log(`Output TOML size: ${result.length} bytes`);
  
  // Run the benchmark suite for this sample
  console.log("\nRunning benchmark...");
  const suite = new Suite(name);
  
  suite.add(`${name} stringify`, () => {
    return stringify(parsed);
  });
  
  suite
    .on('cycle', event => {
      console.log(String(event.target));
    })
    .run();
});