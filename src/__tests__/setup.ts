/**
 * Global test setup for Vitest.
 *
 * Loads the @js-temporal/polyfill so Temporal API tests work
 * on all Node.js versions (v22 needs the polyfill; v24+ has native Temporal).
 */
import { Temporal } from '@js-temporal/polyfill';

if (typeof globalThis.Temporal === 'undefined') {
  (globalThis as any).Temporal = Temporal;
}
