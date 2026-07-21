#!/usr/bin/env node
/**
 * Generate bundled TypeScript declarations.
 *
 * Uses dts-bundle-generator (standalone, no bundler dependency) to produce
 * a single `dist/toml-patch.d.ts` from `src/index.ts`.
 */
import { generateDtsBundle } from 'dts-bundle-generator';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const banner = `//! ${pkg.name} v${pkg.version} - ${pkg.homepage} - @license: ${pkg.license}`;

const [output] = generateDtsBundle([
  {
    filePath: join(root, 'src/index.ts'),
    output: {
      sortNodes: true,
      respectExternal: true,
    },
  },
], {
  preferredConfigPath: join(root, 'tsconfig.json'),
});

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/toml-patch.d.ts'), `${banner}\n${output}`, 'utf-8');
console.log('dist/toml-patch.d.ts written');

