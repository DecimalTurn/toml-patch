/**
 * Smoke test: native Temporal + toml-patch.
 *
 * Requires --harmony-temporal flag.
 * Uses dynamic import() to load ESM dist from CJS (works on Node 13.2+).
 *
 * Usage: node --harmony-temporal scripts/smoke-temporal-harmony.cjs
 */

(async () => {

const { parse, stringify } = await import('../dist/toml-patch.js');

// Quick sanity: is Temporal actually functional on this runtime?
// Some older --harmony-temporal builds have incomplete V8 support
// and will crash with "unimplemented code" rather than throw.
console.log('[smoke] Temporal available:', typeof Temporal !== 'undefined');

const FMT = { trailingNewline: 0 };

let ok = true;
function check(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); ok = false; }
}

console.log('[smoke] step 1: parse date-only with temporal:true');
const obj = parse('d = 2024-01-15\n', { temporal: true });
check(obj.d.constructor.name.includes('PlainDate'), 'parse date-only → PlainDate');
check(obj.d.toString() === '2024-01-15', 'PlainDate toString');

console.log('[smoke] step 2: stringify ZonedDateTime (native)');
const z = Temporal.ZonedDateTime.from('2024-01-15T10:30:00+00:00[+00:00]');
check(stringify({ z }, FMT).includes('Z'), 'stringify ZonedDateTime (native)');

console.log('[smoke] step 3: parse without temporal (default Date)');
const obj2 = parse('d = 2024-01-15\n');
check(obj2.d instanceof Date, 'default returns Date');

if (ok) {
  console.log('OK');
  process.exit(0);
}
console.error('FAILED');
process.exit(1);

})().catch(e => { console.error(e); process.exit(1); });
