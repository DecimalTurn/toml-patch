export type IntegersAsBigInt = boolean | 'asNeeded';

export interface ParseOptions {
  /**
   * Controls how TOML integers are returned in the parsed JavaScript object.
   * - `true`: All integers are returned as `bigint`.
   * - `false`: All integers are returned as `number` (may lose precision for large integers).
   * - `'asNeeded'` (default): Integers that fit within the JavaScript safe-integer range are returned as `number`; larger integers are returned as `bigint`.
   */
  integersAsBigInt?: IntegersAsBigInt;
  /**
   * When true, TOML date/time values are parsed into Temporal objects
   * (Temporal.PlainDate, Temporal.PlainTime, Temporal.PlainDateTime,
   * Temporal.ZonedDateTime) instead of custom Date subclasses.
   *
   * The Temporal API must be available in the runtime.
   * - Node.js >= v26: full native support.
   * - Node.js < v26: enable with the `--harmony-temporal` flag.
   * - Modern browsers: native support.
   * - Other runtimes: use @js-temporal/polyfill.
   *
   * Default: false (returns custom Date subclasses for backward compatibility).
   */
  temporal?: boolean;
}
