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
const browserPackageDir = join(root, 'dist', 'browser-package');
const browserFile = 'dist/browser/toml-patch.js';

rmSync(browserPackageDir, { force: true, recursive: true });
mkdirSync(join(browserPackageDir, 'dist', 'browser'), { recursive: true });
cpSync(join(root, 'dist', 'browser', 'toml-patch.js'), join(browserPackageDir, browserFile));

const browserPackageJson = {
  name: packageJson.name,
  version: `${packageJson.version}-browser`,
  description: packageJson.description,
  homepage: packageJson.homepage,
  repository: packageJson.repository,
  license: packageJson.license,
  type: 'module',
  files: ['dist/browser/'],
  exports: {
    '.': {
      import: `./${browserFile}`,
      default: `./${browserFile}`,
    },
  },
  publishConfig: {
    access: 'public',
  },
};

writeFileSync(
  join(browserPackageDir, 'package.json'),
  `${JSON.stringify(browserPackageJson, null, 2)}\n`,
);
