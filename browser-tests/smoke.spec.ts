import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const bundle = readFileSync(join(process.cwd(), 'dist/toml-patch.js'), 'utf-8');

// Load the bundle into the page via a blob URL so it runs in a real browser
// module context — no Node.js APIs available.
async function loadTOML(page: import('@playwright/test').Page) {
  await page.goto('about:blank');
  await page.evaluate(async (src: string) => {
    const blob = new Blob([src], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    (window as any).__TOML__ = await import(url);
    URL.revokeObjectURL(url);
  }, bundle);
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
