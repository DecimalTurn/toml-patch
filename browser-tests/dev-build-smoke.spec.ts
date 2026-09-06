import { test, expect } from '@playwright/test';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

const devBundlePath = join(process.cwd(), 'dist/dev/toml-patch.js');
const devMapPath = join(process.cwd(), 'dist/dev/toml-patch.js.map');
const devBundle = readFileSync(devBundlePath, 'utf-8');

async function loadTOML(page: import('@playwright/test').Page) {
  await page.goto('about:blank');
  await page.evaluate(async (src: string) => {
    const blob = new Blob([src], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    (window as any).__TOML__ = await import(url);
    URL.revokeObjectURL(url);
  }, devBundle);
}

test.beforeEach(async ({ page }) => {
  await loadTOML(page);
});

test('parse should work in a real browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    (window as any).__TOML__.parse('key = "hello"')
  );
  expect(result).toEqual({ key: 'hello' });
});

test('stringify should work in a real browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    (window as any).__TOML__.stringify({ key: 'hello' })
  );
  expect(result).toBe('key = "hello"\n');
});

test('patch should work in a real browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    (window as any).__TOML__.patch('key = "hello"\n', { key: 'world' })
  );
  expect(result).toBe('key = "world"\n');
});

test('dev build includes readable code and a source map', () => {
  expect(devBundle).toContain('\n');
  expect(devBundle).toContain('//# sourceMappingURL=toml-patch.js.map');
  expect(statSync(devMapPath).size).toBeGreaterThan(0);
  expect(statSync(devBundlePath).size).toBeGreaterThan(
    statSync(join(process.cwd(), 'dist/toml-patch.js')).size,
  );
});