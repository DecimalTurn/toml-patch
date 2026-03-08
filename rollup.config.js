import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import filesize from 'rollup-plugin-filesize';
import { readFileSync } from 'fs';

// Load package.json using fs instead of import assertions
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

const banner = `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`;

export default [
  // 1. Preserved modules (for bundler consumers — enables tree-shaking)
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].js',
      banner
    },
    plugins: [typescript(), filesize()]
  },
  // 2. Single minified bundle (for direct browser / CDN usage)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/toml-patch.min.js',
      format: 'es',
      banner
    },
    plugins: [typescript(), terser(), filesize()]
  },
  // 3. Type declarations (preserved modules)
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].d.ts',
      banner
    },
    plugins: [dts()]
  }
];
