const { join, basename } = require('path');
const { readFileSync } = require('fs');
const { Suite, formatNumber } = require('benchmark');
const { sync: glob } = require('glob');
const mri = require('mri');

const { help, example, _: filter } = mri(process.argv.slice(2), {
  boolean: ['help', 'example']
});

if (help) {
  console.log(`Run stringify benchmarks for toml-patch
  
Usage: node benchmark/stringify-benchmark <filter> [options]

Options:
  <filter>      Filter benchmarks
  --example     Just run benchmark for spec example`);
  process.exit(0);
}

const tomlPatch = require('../');
const search = example ? '0A-spec-01-example-v0.4.0.toml' : `${filter ? `*${filter}*` : '*'}.toml`;

const benchmark_dir = join(__dirname, '../submodules/iarna-toml/benchmark');
const benchmarks = glob(join(benchmark_dir, search)).map(path => {
  const name = basename(path, '.toml');
  const data = readFileSync(path, 'utf8');
  // Parse the TOML data to get a JS object
  const parsed = tomlPatch.parse(data);

  return { name, data, parsed };
});

if (!benchmarks.length) {
  throw new Error(`No matching benchmarks found for ${example ? '--example' : filter}`);
}

// First run a detailed benchmark on individual steps of stringify
console.log('Detailed Stringify Process Benchmark:');

benchmarks.forEach(({ name, parsed }) => {
  console.log(`\nBenchmark for: ${name}`);
  
  const detailSuite = new Suite(`${name}-detailed`);
  
  // Test just parseJS 
  detailSuite.add(`${name}-parseJS`, () => {
    const { parseJS } = require('../src/parse-js');
    return parseJS(parsed);
  });
  
  // Test just toTOML
  detailSuite.add(`${name}-toTOML`, () => {
    const { toTOML } = require('../src/to-toml');
    const { parseJS } = require('../src/parse-js');
    const document = parseJS(parsed);
    return toTOML(document.items);
  });
  
  // Test full stringify
  detailSuite.add(`${name}-stringify`, () => {
    return tomlPatch.stringify(parsed);
  });
  
  detailSuite
    .on('cycle', event => {
      console.log(String(event.target));
    })
    .run();
});

// Then run a general benchmark across all files
console.log('\nGeneral Stringify Benchmark:');

const suite = new Suite('toml-patch-stringify');
benchmarks.forEach(({ name, parsed }) => {
  suite.add(name, () => tomlPatch.stringify(parsed));
});

suite
  .on('start', () => {
    if (example || search) {
      const count = benchmarks.length;
      const filter_text = example ? '--example' : `"${filter}"`;
      console.log(`Filter: ${filter_text} -> ${count} ${count === 1 ? 'benchmark' : 'benchmarks'}`);
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
    console.log(`toml-patch stringify x ${formatNumber(hz.toFixed(hz < 100 ? 2 : 0))} ops/sec`);
  })
  .run();