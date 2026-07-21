/**
 * Smoke test: native Temporal + toml-patch (toml-patch API only).
 *
 * Tests only the Temporal APIs that toml-patch actually uses (parse,
 * stringify, patch). No polyfill, no --harmony-temporal flag — relies
 * on the runtime's built-in Temporal (Node 26+).
 *
 * Usage: node scripts/smoke-temporal-native-toml.cjs
 */

(async () => {

const { parse, stringify, patch } = await import('../dist/toml-patch.js');

console.log('[smoke-native-toml] Temporal available:', typeof Temporal !== 'undefined');

const FMT = { trailingNewline: 0 };

let ok = true;
function check(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); ok = false; }
}

console.log('[smoke-native-toml] step 1: parse date-only with temporal:true');
const obj = parse('d = 2024-01-15\n', { temporal: true });
check(obj.d.constructor.name.includes('PlainDate'), 'parse date-only → PlainDate');
check(obj.d.toString() === '2024-01-15', 'PlainDate toString');

console.log('[smoke-native-toml] step 2: parse offset datetime → ZonedDateTime');
const obj2 = parse('z = 2024-01-15T10:30:00+05:30\n', { temporal: true });
check(obj2.z.constructor.name.includes('ZonedDateTime'), 'parse offset → ZonedDateTime');

console.log('[smoke-native-toml] step 3: stringify PlainDate');
check(stringify({ d: obj.d }, FMT) === 'd = 2024-01-15', 'stringify PlainDate');

console.log('[smoke-native-toml] step 4: stringify ZonedDateTime');
const z = Temporal.ZonedDateTime.from('2024-01-15T10:30:00+00:00[+00:00]');
check(stringify({ z }, FMT).includes('Z'), 'stringify ZonedDateTime (native)');

console.log('[smoke-native-toml] step 5: patch no-op');
check(patch('d = 2024-01-15\n', { d: obj.d }, FMT) === 'd = 2024-01-15', 'patch no-op');

console.log('[smoke-native-toml] step 6: parse without temporal (default Date)');
const obj3 = parse('d = 2024-01-15\n');
check(obj3.d instanceof Date, 'default returns Date');

if (ok) {
  console.log('OK');
  process.exit(0);
}
console.error('FAILED');
process.exit(1);

})().catch(e => { console.error(e); process.exit(1); });
