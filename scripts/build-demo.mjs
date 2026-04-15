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

// Replace the commented-out unpkg line + local import with just the unpkg import
html = html.replace(
  /(\s*)\/\/ import \* as TOML from 'https:\/\/unpkg\.com\/@decimalturn\/toml-patch';\r?\n\s*import \* as TOML from '\.\/dist\/toml-patch\.js';/,
  "$1import * as TOML from 'https://unpkg.com/@decimalturn/toml-patch';"
);

// Update the footer: remove the local build link, activate the unpkg link
html = html.replace(
  /·\s*<!--(Loaded via <a href="https:\/\/unpkg\.com\/@decimalturn\/toml-patch">unpkg<\/a>)-->\s*\r?\n\s*·\s*Loaded from <a href="\.\/dist\/toml-patch\.js">local build<\/a>/,
  '· $1'
);

writeFileSync(dest, html, 'utf-8');
console.log(`demo.html written from dev_demo.html`);
