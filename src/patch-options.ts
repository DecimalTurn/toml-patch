export interface PatchOptions {
  /**
   * Controls whether `patch()` verifies its own output before returning it.
   *
   * When true (the default), `patch()` re-parses the TOML it produced and
   * checks that it round-trips back to the `updated` object. If it does not,
   * `patch()` retries with a coarser writer that rewrites whole multiline
   * inline containers instead of splicing individual members, and throws if
   * that retry still does not round-trip. This guarantees `patch()` never
   * silently returns TOML that disagrees with the object it was given.
   *
   * The check costs one extra parse of the output plus a structural
   * comparison, which is roughly 20-40% of total `patch()` time (the
   * proportion is higher for small documents, where it does not amortise).
   *
   * Set to false to skip verification and return the first result directly.
   * The retry and the throw both become unreachable, so a patch that would
   * have been repaired instead returns malformed or mismatched TOML. Only
   * worth doing when patching is measurably hot and the inputs are known to
   * be well covered by tests.
   *
   * Default: true.
   */
  validate?: boolean;
}
