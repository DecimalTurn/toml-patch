import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmOptions = { shell: process.platform === 'win32' };
const tempDir = mkdtempSync(join(tmpdir(), 'toml-patch-lite-package-'));
const packDir = join(tempDir, 'pack');
const consumerDir = join(tempDir, 'consumer');

try {
  const litePackageDir = join(root, 'dist', 'lite');
  if (!existsSync(join(litePackageDir, 'package.json'))) {
    throw new Error('dist/lite is missing. Run `pnpm run build:lite` first.');
  }

  mkdirSync(packDir);
  const packOutput = execFileSync(
    npmCommand,
    ['pack', litePackageDir, '--pack-destination', packDir, '--json'],
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
  if (!existsSync(join(installedPackageDir, 'dist', 'patch.js'))) {
    throw new Error('The installed lite package is missing dist/patch.js');
  }

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { patch } from '@decimalturn/toml-patch';
const source = 'version = "1.0.0"\\n';
const updated = { version: '1.0.1' };
const result = patch(source, updated);
if (result !== 'version = "1.0.1"\\n') throw new Error('lite patch failed');`,
    ],
    { cwd: consumerDir, stdio: 'inherit' },
  );
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
