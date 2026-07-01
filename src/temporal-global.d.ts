/**
 * Minimal type declaration for the Temporal global API (Stage 4).
 * The full types are available from @js-temporal/polyfill, but we only
 * need enough to avoid TS2304 errors when casting `(Temporal as any)`.
 *
 * When the TS lib includes Temporal natively, this file can be removed.
 */
declare var Temporal: {
  PlainDate: {
    from(value: string): any;
  };
  PlainTime: {
    from(value: string): any;
  };
  PlainDateTime: {
    from(value: string): any;
  };
  ZonedDateTime: {
    from(value: string): any;
  };
};
