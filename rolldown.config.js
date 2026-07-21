import { defineConfig } from 'rolldown';
import { bundleAnalyzerPlugin } from 'rolldown/experimental';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const banner = `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`;

export default defineConfig({
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    entryFileNames: 'toml-patch.js',
    format: 'esm',
    banner,
    minify: true,
  },
  plugins: [bundleAnalyzerPlugin()],
});
