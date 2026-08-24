import { defineConfig } from 'tsdown';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const banner = `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`;

export default defineConfig([
  {
    // Main build: consumed by bundlers (webpack/rollup/esbuild/vite) and Node.
    // Left unminified so downstream bundlers get real names/structure for
    // tree-shaking and dead-code elimination, and readable stack traces —
    // they'll apply their own minification at the end of their own build anyway.
    entry: {
      'toml-patch': 'src/index.ts',
    },
    format: 'esm',
    outDir: 'dist',
    clean: false,
    dts: true,
    minify: false,
    fixedExtension: false,
    banner: {
      js: banner,
    },
  },
  {
    // Browser build: a single minified ESM file for direct
    // <script type="module"> usage via a CDN (unpkg/jsdelivr), where users
    // pay for every byte on every page load and have no bundler of their own.
    entry: {
      'toml-patch': 'src/index.ts',
    },
    format: 'esm',
    outDir: 'dist/browser',
    clean: false,
    dts: false,
    minify: true,
    fixedExtension: false,
    banner: {
      js: banner,
    },
  },
]);
