#!/usr/bin/env node
/**
 * Generates demo.html from dev_demo.html by replacing the local
 * ./dist/toml-patch.js import with the unpkg CDN URL and updating
 * the footer link accordingly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'dev_demo.html');
const dest = join(root, 'demo.html');

let html = readFileSync(src, 'utf-8');

// Update the header: swap the dev-demo banner for the production-demo banner.
html = html.replace(
  /<!-- dev_demo\.html — Development demo\. Loads toml-patch from local build \(\.\/dist\/\)\. -->(\r?\n)<!-- For the production CDN version, use demo\.html instead \(loads from unpkg\)\. -->/,
  '<!-- demo.html — Production demo. Loads toml-patch from unpkg CDN. -->$1<!-- For local development, use dev_demo.html instead (loads from ./dist/). -->'
);

// Replace the commented-out unpkg line + local import with just the unpkg import
html = html.replace(
  /(\s*)\/\/ import \* as TOML from 'https:\/\/unpkg\.com\/@decimalturn\/toml-patch\/dist\/toml-patch\.js';.*\r?\n\s*import \* as TOML from '\.\/dist\/toml-patch\.js';/,
  "$1import * as TOML from 'https://unpkg.com/@decimalturn/toml-patch/dist/toml-patch.js';"
);

// Update the footer: remove the local build link, activate the unpkg link
html = html.replace(
  /·\s*<!--(Loaded via <a href="https:\/\/unpkg\.com\/@decimalturn\/toml-patch\/dist\/toml-patch\.js">unpkg<\/a>)-->\s*\r?\n\s*·\s*Loaded from <a href="\.\/dist\/toml-patch\.js">local build<\/a>/,
  '· $1'
);

// Fail loudly instead of shipping a demo.html that still imports the local
// build: the replacement above must have removed both the local import and
// the `--- IGNORE ---` marker that trails the commented-out unpkg line.
if (
  html.includes("import * as TOML from './dist/toml-patch.js'") ||
  html.includes('--- IGNORE ---')
) {
  throw new Error(
    'build-demo: failed to replace the local toml-patch import; ' +
      'check the replacement regexes in scripts/build-demo.mjs'
  );
}

writeFileSync(dest, html, 'utf-8');
console.log(`demo.html written from dev_demo.html`);
