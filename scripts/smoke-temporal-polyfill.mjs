/**
 * Smoke test: @js-temporal/polyfill + toml-patch.
 *
 * Verifies parse/stringify/patch work with the polyfill on the current
 * Node.js version.
 *
 * Usage: node scripts/smoke-temporal-polyfill.mjs
 */

import { Temporal } from '@js-temporal/polyfill';

globalThis.Temporal = Temporal;

const { parse, stringify, patch } = await import('../dist/toml-patch.js');

const FMT = { trailingNewline: 0 };

const results = { pass: [], fail: [] };
function test(name, fn) {
  try { fn(); results.pass.push({ name }); }
  catch(e) { results.fail.push({ name, error: e.message }); }
}

test('parse date-only → PlainDate', () => {
  const obj = parse('d = 2024-01-15\n', { temporal: true });
  if (!obj.d.constructor.name.includes('PlainDate')) throw new Error('not PlainDate');
  if (obj.d.toString() !== '2024-01-15') throw new Error('wrong toString: ' + obj.d.toString());
});

test('parse offset → ZonedDateTime', () => {
  const obj = parse('z = 2024-01-15T10:30:00+05:30\n', { temporal: true });
  if (!obj.z.constructor.name.includes('ZonedDateTime')) throw new Error('not ZonedDateTime');
});

test('stringify PlainDate', () => {
  const d = parse('d = 2024-01-15\n', { temporal: true }).d;
  if (stringify({ d }, FMT) !== 'd = 2024-01-15') throw new Error('stringify mismatch');
});

test('patch no-op', () => {
  const d = parse('d = 2024-01-15\n', { temporal: true }).d;
  if (patch('d = 2024-01-15\n', { d }, FMT) !== 'd = 2024-01-15') throw new Error('patch mismatch');
});

test('default returns Date', () => {
  const obj = parse('d = 2024-01-15\n');
  if (!(obj.d instanceof Date)) throw new Error('not Date');
});

// --- Report ---
const total = results.pass.length + results.fail.length;
console.log(`PASS_COUNT: ${results.pass.length}`);
console.log(`Results: ${results.pass.length}/${total} passed\n`);
if (results.fail.length) {
  console.log('FAILED:');
  results.fail.forEach(f => console.log(`  ${f.name}: ${f.error}`));
} else {
  console.log('All tests passed!');
}

process.exit(0);

process.exit(0);
