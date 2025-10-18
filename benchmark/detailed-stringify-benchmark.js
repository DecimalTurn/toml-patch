const { join, basename } = require('path');
const { readFileSync } = require('fs');
const { Suite } = require('benchmark');
const { sync: glob } = require('glob');

// Import components directly to test individual parts
const parseJS = require('../src/parse-js').default;
const toTOML = require('../src/to-toml').default;
const { stringify } = require('../src/index');

// Define a sample that's representative
const samples = [
  '0A-spec-01-example-v0.4.0.toml',      // Standard example
  '0C-scaling-array-inline-nested-1000.toml', // Complex nested array (very slow)
  '01-small-doc-mixed-type-inline-array.toml' // Small document (very fast)
];

const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
const benchmarks = samples.map(sampleName => {
  const path = join(benchmark_dir, sampleName);
  const name = basename(path, '.toml');
  try {
    const data = readFileSync(path, 'utf8');
    // Parse the TOML data to get a JS object
    const parsed = require('../src/index').parse(data);
    return { name, data, parsed };
  } catch (error) {
    console.error(`Error loading benchmark ${name}: ${error.message}`);
    return null;
  }
}).filter(Boolean);

// Test individual components of the stringify process
benchmarks.forEach(({ name, parsed }) => {
  console.log(`\nDetailed benchmark for: ${name}`);
  
  const suite = new Suite(`${name}-detailed`);
  
  // Profile memory usage
  const startMemory = process.memoryUsage().heapUsed;
  
  // Test parseJS function
  suite.add(`parseJS`, () => {
    return parseJS(parsed);
  });
  
  // Test toTOML function (with pre-generated document)
  const document = parseJS(parsed);
  suite.add(`toTOML`, () => {
    return toTOML(document.items);
  });
  
  // Test full stringify
  suite.add(`stringify`, () => {
    return stringify(parsed);
  });
  
  // Profile specific operations in parseJS
  suite.add(`reorderElements`, () => {
    const reorderElements = require('../src/parse-js').default.__test__.reorderElements;
    return reorderElements(parsed);
  });

  suite.add(`walkObject`, () => {
    const walkObject = require('../src/parse-js').default.__test__.walkObject;
    const format = {};
    return [...walkObject(parsed, format)];
  });
  
  // Profile specific operations in writer.ts
  suite.add(`applyWrites`, () => {
    const document = parseJS(parsed);
    const applyWrites = require('../src/writer').applyWrites;
    applyWrites(document);
    return document;
  });
  
  suite
    .on('cycle', event => {
      console.log(String(event.target));
    })
    .run();
    
  const endMemory = process.memoryUsage().heapUsed;
  console.log(`Memory used: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
});