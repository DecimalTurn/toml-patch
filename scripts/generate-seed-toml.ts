import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomToml } from '../src/__tests__/randomizer';

const seedArgument = process.argv[2];
const seed = Number(seedArgument);

if (!seedArgument || !Number.isInteger(seed) || seed < 0) {
  console.error('Usage: pnpm run seed-toml -- <seed>');
  process.exit(2);
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repositoryRoot, `tmp-seed-${seed}.toml`);

writeFileSync(outputPath, randomToml({ seed }).toml, 'utf8');
console.log(`wrote ${outputPath}`);