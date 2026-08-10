import { defineConfig } from 'tsdown';
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
  // Skip minification for profiling builds so function names are readable.
  minify: !process.env.PROFILE_BUILD,
  fixedExtension: false,
  banner: {
    js: `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`,
  },
});
