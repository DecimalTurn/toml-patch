/**
 * Smoke test: @js-temporal/polyfill (delegates to harmony suite).
 *
 * Sets up the polyfill as globalThis.Temporal, then runs the exact same
 * comprehensive API probe as the harmony smoke test.
 *
 * Usage: node scripts/smoke-temporal-polyfill.mjs
 */

import { Temporal } from '@js-temporal/polyfill';

globalThis.Temporal = Temporal;

// Run the shared harmony test suite
await import('./smoke-temporal-harmony.cjs');
