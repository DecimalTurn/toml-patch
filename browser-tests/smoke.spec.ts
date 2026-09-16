import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, normalize, sep } from 'path';

const distDir = join(process.cwd(), 'dist');
const origin = 'http://toml-patch.test';

// The ESM build is code-split, so the root entry imports relative chunks.
// Serve the dist directory over a synthetic origin so the browser can resolve
// those imports, then load the entry in a real browser module context with no
// Node.js APIs available.
async function loadTOML(page: import('@playwright/test').Page) {
  await page.route(`${origin}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname === '/') {
      await route.fulfill({
        body: '<!doctype html><title>toml-patch</title>',
        contentType: 'text/html'
      });
      return;
    }

    const file = normalize(join(distDir, pathname.slice(1)));
    if (!file.startsWith(distDir + sep)) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }

    let body: string;
    try {
      body = readFileSync(file, 'utf-8');
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }

    await route.fulfill({ body, contentType: 'application/javascript' });
  });

  await page.goto(`${origin}/`);
  await page.evaluate(async (entry: string) => {
    (window as any).__TOML__ = await import(entry);
  }, `${origin}/index.js`);
}

test.beforeEach(async ({ page }) => {
  await loadTOML(page);
});

test('parse should work in real browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    (window as any).__TOML__.parse('key = "hello"')
  );
  expect(result).toEqual({ key: 'hello' });
});

test('stringify should work in real browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    (window as any).__TOML__.stringify({ key: 'hello' })
  );
  expect(result).toBe('key = "hello"\n');
});

test('patch should work in real browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    (window as any).__TOML__.patch('key = "hello"\n', { key: 'world' })
  );
  expect(result).toBe('key = "world"\n');
});
