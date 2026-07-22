import { defineConfig } from 'tsdown';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default defineConfig({
  entry: {
    'toml-patch': 'src/index.ts',
  },
  format: 'esm',
  outDir: 'dist',
  clean: true,
  dts: true,
  minify: true,
  fixedExtension: false,
  banner: {
    js: `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`,
  },
});
