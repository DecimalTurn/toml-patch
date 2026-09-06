import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const devPackageDir = join(root, 'dist', 'dev-package');
const devFile = 'dist/dev/toml-patch.js';
const declarationFile = 'dist/toml-patch.d.ts';

rmSync(devPackageDir, { force: true, recursive: true });
mkdirSync(join(devPackageDir, 'dist'), { recursive: true });
cpSync(join(root, 'dist', 'dev'), join(devPackageDir, 'dist', 'dev'), { recursive: true });
cpSync(join(root, declarationFile), join(devPackageDir, declarationFile));

const devPackageJson = {
  name: packageJson.name,
  version: `${packageJson.version}-dev`,
  description: packageJson.description,
  homepage: packageJson.homepage,
  repository: packageJson.repository,
  license: packageJson.license,
  type: 'module',
  sideEffects: false,
  types: `./${declarationFile}`,
  files: ['dist/'],
  exports: {
    '.': {
      types: `./${declarationFile}`,
      import: `./${devFile}`,
      default: `./${devFile}`,
    },
  },
  publishConfig: {
    access: 'public',
  },
};

writeFileSync(
  join(devPackageDir, 'package.json'),
  `${JSON.stringify(devPackageJson, null, 2)}\n`,
);