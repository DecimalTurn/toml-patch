/**
 * Smoke test: native Temporal (delegates to harmony suite).
 *
 * No polyfill, no --harmony-temporal flag — relies on the runtime's
 * built-in Temporal (Node 26+). Runs the same comprehensive API probe
 * as the harmony test.
 *
 * Usage: node scripts/smoke-temporal-native.cjs
 */

(async () => {
  await import('./smoke-temporal-harmony.cjs');
})().catch(e => { console.error(e); process.exit(1); });