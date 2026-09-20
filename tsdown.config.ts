import { defineConfig } from 'tsdown';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const banner = `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`;

// Main build options. Each entry point is built in its own config block so the
// output is a single self-contained bundle. Building several entries together
// would code-split the shared modules into chunk files, which is the shim/chunk
// layout this package deliberately avoids.
const mainBuild = {
  format: 'esm' as const,
  outDir: 'dist',
  clean: false,
  dts: true,
  minify: true,
  treeshake: true,
  fixedExtension: false,
  banner: {
    js: banner,
  },
};

export default defineConfig([
  {
    // Main entry point: the full library.
    entry: { 'toml-patch': 'src/index.ts' },
    ...mainBuild,
  },
  {
    entry: { patch: 'src/patch-entry.ts' },
    ...mainBuild,
  },
  {
    entry: { 'patch-lite': 'src/patch-lite-entry.ts' },
    ...mainBuild,
  },
  {
    entry: { format: 'src/format-entry.ts' },
    ...mainBuild,
  },
  {
    // Development build: readable ESM with source maps for debugging.
    entry: {
      'toml-patch': 'src/index.ts',
      'patch-lite': 'src/patch-lite-entry.ts',
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
