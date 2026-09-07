/**
 * Verifies the development package as a consumer would receive it.
 *
 * Packs and installs the generated tarball in a temporary consumer, checks that
 * source maps are included and exercises the public parse, stringify and patch API.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmOptions = { shell: process.platform === 'win32' };
const tempDir = mkdtempSync(join(tmpdir(), 'toml-patch-dev-package-'));
const packDir = join(tempDir, 'pack');
const consumerDir = join(tempDir, 'consumer');

try {
  mkdirSync(packDir);
  const packOutput = execFileSync(
    npmCommand,
    ['pack', join(root, 'dist', 'dev-package'), '--pack-destination', packDir, '--json'],
    { ...npmOptions, cwd: root, encoding: 'utf8' },
  );
  const tarball = join(packDir, JSON.parse(packOutput)[0].filename);

  mkdirSync(consumerDir);
  execFileSync(npmCommand, ['init', '--yes'], {
    ...npmOptions,
    cwd: consumerDir,
    stdio: 'inherit',
  });
  execFileSync(npmCommand, ['install', '--ignore-scripts', tarball], {
    ...npmOptions,
    cwd: consumerDir,
    stdio: 'inherit',
  });

  const installedPackageDir = join(
    consumerDir,
    'node_modules',
    '@decimalturn',
    'toml-patch',
  );
  if (!existsSync(join(installedPackageDir, 'dist', 'dev', 'toml-patch.js.map'))) {
    throw new Error('The installed dev package is missing its source map');
  }

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { parse, stringify, patch } from '@decimalturn/toml-patch';
const source = 'a = 1\\n';
if (parse(source).a !== 1) throw new Error('parse failed');
if (!stringify({ a: 1 }).includes('a = 1')) throw new Error('stringify failed');
if (!patch(source, { a: 2 }).includes('a = 2')) throw new Error('patch failed');`,
    ],
    { cwd: consumerDir, stdio: 'inherit' },
  );
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}