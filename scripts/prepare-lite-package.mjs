import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const litePackageDir = join(root, 'dist', 'lite');
const liteDistDir = join(litePackageDir, 'dist');
const sourceJs = join(root, 'dist', 'patch-lite.js');
const sourceTypes = join(root, 'dist', 'patch-lite.d.ts');

rmSync(litePackageDir, { force: true, recursive: true });
mkdirSync(liteDistDir, { recursive: true });

function copyReferencedFiles(sourceFile, targetName, pattern) {
  const pending = [{ sourceFile, targetName }];
  const copied = new Set();

  while (pending.length > 0) {
    const { sourceFile: currentSource, targetName: currentTarget } = pending.pop();
    if (copied.has(currentSource)) continue;
    copied.add(currentSource);

    const source = readFileSync(currentSource, 'utf8');
    writeFileSync(join(liteDistDir, currentTarget), source);

    for (const match of source.matchAll(pattern)) {
      const dependencyName = match[1];
      const dependencyFile = join(root, 'dist', dependencyName);
      pending.push({ sourceFile: dependencyFile, targetName: dependencyName });
    }
  }
}

copyReferencedFiles(
  sourceJs,
  'patch.js',
  /from["']\.\/([^"']+)["']/g,
);
copyReferencedFiles(
  sourceTypes,
  'patch.d.ts',
  /from["']\.\/([^"']+)["']/g,
);

const litePackageJson = {
  name: packageJson.name,
  version: `${packageJson.version}-lite`,
  description: `${packageJson.description} Lite value-editing distribution.`,
  homepage: packageJson.homepage,
  repository: packageJson.repository,
  license: packageJson.license,
  type: 'module',
  engines: packageJson.engines,
  sideEffects: false,
  types: './dist/patch.d.ts',
  files: ['dist/'],
  exports: {
    '.': {
      types: './dist/patch.d.ts',
      import: './dist/patch.js',
      default: './dist/patch.js',
    },
  },
  publishConfig: {
    access: 'public',
  },
};

writeFileSync(
  join(litePackageDir, 'package.json'),
  `${JSON.stringify(litePackageJson, null, 2)}\n`,
);
