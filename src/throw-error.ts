/**
 * @file Helper to throw prefixed errors with minimal bundle size.
 *
 * Using a single helper function instead of inlining "toml-patch: "
 * in every error message string keeps the prefix stored once and
 * makes each call site shorter (e() vs throw new Error()), reducing
 * the overall bundle size.
 */

const PREFIX = 'toml-patch: ';

/**
 * Throws an Error prefixed with "toml-patch: ".
 *
 * This is deliberately a separate function (not inlined) so that
 * Terser keeps the prefix string in one place and each call site
 * compiles to a short `e("...")` call instead of a full
 * `throw new Error("...")` with the prefix repeated.
 */
export function throwError(msg: string): never {
  throw new Error(PREFIX + msg);
}
