import { defineConfig } from 'tsdown';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const banner = `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`;

export default defineConfig([
  {
    // Main build: consumed by bundlers (webpack/rollup/esbuild/vite) and Node.
    // Keep the published package compact. Downstream bundlers can still
    // tree-shake the ESM output and apply their own minification.
    entry: {
      'toml-patch': 'src/index.ts',
    },
    format: 'esm',
    outDir: 'dist',
    clean: false,
    dts: true,
    minify: true,
    treeshake: true,
    fixedExtension: false,
    banner: {
      js: banner,
    },
  },
  {
    // Development build: readable ESM with source maps for debugging.
    entry: {
      'toml-patch': 'src/index.ts',
    },
    format: 'esm',
    outDir: 'dist/dev',
    clean: false,
    dts: false,
    minify: false,
    sourcemap: true,
    treeshake: true,
    unbundle: true,
    fixedExtension: false,
    banner: {
      js: banner,
    },
  },
]);
