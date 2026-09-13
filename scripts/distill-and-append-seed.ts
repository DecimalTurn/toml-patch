import { appendFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const seed = arg('--seed');
const target = resolve(arg('--target', process.cwd())!);
const testFile = resolve(target, arg('--test-file', 'src/__tests__/patch.fuzz.test.ts')!);
const variant = arg('--variant', '3');
const passes = arg('--passes', '4');

if (!seed || !Number.isInteger(Number(seed))) {
  throw new Error(
    'Usage: npx -y tsx scripts/distill-and-append-seed.ts --seed N [--variant 3] [--passes N]'
  );
}

if (!existsSync(testFile)) {
  throw new Error(`Test file not found: ${testFile}`);
}

const output = resolve(tmpdir(), `toml-patch-seed-${seed}-${Date.now()}.test.ts`);
const distiller = resolve(target, 'scripts/distill-seed.ts');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

try {
  const result = spawnSync(
    npx,
    ['-y', 'tsx', distiller, '--seed', seed, '--variant', variant, '--passes', passes, '--target', target, '--out', output],
    { cwd: target, stdio: 'inherit', shell: process.platform === 'win32' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`distill-seed.ts exited with status ${result.status ?? 'unknown'}`);
  }

  const current = readFileSync(testFile, 'utf8');
  const generated = readFileSync(output, 'utf8');
  const separator = current.endsWith('\n') ? '' : '\n';
  appendFileSync(testFile, separator + generated, 'utf8');
  console.log(`Appended seed ${seed} regression to ${testFile}`);
} finally {
  if (existsSync(output)) unlinkSync(output);
}