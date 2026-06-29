/**
 * Smoke test: native Temporal + toml-patch.
 *
 * Requires --harmony-temporal flag.
 * Uses CJS require since the polyfill is not needed.
 *
 * Usage: node --harmony-temporal scripts/smoke-temporal-harmony.cjs
 */

const { parse, stringify } = require('../dist/toml-patch.js');

const FMT = { trailingNewline: 0 };

let ok = true;
function check(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); ok = false; }
}

const obj = parse('d = 2024-01-15\n', { temporal: true });
check(obj.d.constructor.name.includes('PlainDate'), 'parse date-only → PlainDate');
check(obj.d.toString() === '2024-01-15', 'PlainDate toString');

const z = Temporal.ZonedDateTime.from('2024-01-15T10:30:00+00:00[+00:00]');
check(stringify({ z }, FMT).includes('Z'), 'stringify ZonedDateTime (native)');

const obj2 = parse('d = 2024-01-15\n');
check(obj2.d instanceof Date, 'default returns Date');

if (ok) {
  console.log('OK');
  process.exit(0);
}
console.error('FAILED');
process.exit(1);
