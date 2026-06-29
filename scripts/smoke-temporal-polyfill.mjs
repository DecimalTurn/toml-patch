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

let ok = true;
function check(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); ok = false; }
}

const obj = parse('d = 2024-01-15\n', { temporal: true });
check(obj.d.constructor.name.includes('PlainDate'), 'parse date-only → PlainDate');
check(obj.d.toString() === '2024-01-15', 'PlainDate toString');

const obj2 = parse('z = 2024-01-15T10:30:00+05:30\n', { temporal: true });
check(obj2.z.constructor.name.includes('ZonedDateTime'), 'parse offset → ZonedDateTime');

check(stringify({ d: obj.d }, FMT) === 'd = 2024-01-15', 'stringify PlainDate');
check(patch('d = 2024-01-15\n', { d: obj.d }, FMT) === 'd = 2024-01-15', 'patch no-op');

const obj3 = parse('d = 2024-01-15\n');
check(obj3.d instanceof Date, 'default returns Date');

if (ok) {
  console.log('OK');
  process.exit(0);
}
console.error('FAILED');
process.exit(1);
