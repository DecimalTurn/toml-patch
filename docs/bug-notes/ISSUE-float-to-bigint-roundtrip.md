## Float exponent notation round-trips as wrong type (number → bigint)

### Summary

When a TOML float is expressed with exponent notation and the resulting value exceeds `Number.MAX_SAFE_INTEGER`, the `parse` → `stringify` → `parse` round-trip changes the type from `number` to `bigint`.

### Reproduction

```typescript
import { parse, stringify } from '@decimalturn/toml-patch';

const toml = 'x = 743e+15\n';
const obj1 = parse(toml);
console.log(typeof obj1.x); // "number"

const toml2 = stringify(obj1);
console.log(toml2); // "x = 743000000000000000\n"

const obj2 = parse(toml2);
console.log(typeof obj2.x); // "bigint" — WRONG!
```

### Root Cause

The value `743000000000000000` exceeds `Number.MAX_SAFE_INTEGER` (`9007199254740991`).

In `src/parse-js.ts`, `isInteger()` returns `true` for this value because it's a finite whole number. So it gets routed to `generateInteger()` which outputs the raw integer literal `743000000000000000`.

When re-parsed, `parse()` sees an integer literal exceeding `MAX_SAFE_INTEGER` and (with default `integersAsBigInt: 'asNeeded'`) promotes it to `bigint`.

The original TOML source (`743e+15`) was unambiguously a float — the exponent notation is only valid for floats in TOML. But the library loses this type information in the round-trip.

### Affected seeds (found by fuzzer)

| Seed | Original | Value | Stringified |
|------|----------|-------|-------------|
| 8 | `743e+15` | `743000000000000000` (number) | `743000000000000000` (re-parsed as bigint) |
| 171 | `425e+14` | `42500000000000000` (number) | `42500000000000000` (re-parsed as bigint) |
| 193 | `-666e+14` | `-66600000000000000` (number) | `-66600000000000000` (re-parsed as bigint) |

### Possible fix

In `src/utils.ts`, `isInteger()` should return `false` for values outside the safe integer range, forcing them through `generateFloat()` which adds `.0`:

```ts
// Before
export function isInteger(value: any): value is number {
  return typeof value === 'number' && value % 1 === 0 && isFinite(value) && !Object.is(value, -0);
}

// After
export function isInteger(value: any): value is number {
  return typeof value === 'number' 
    && value % 1 === 0 
    && isFinite(value) 
    && !Object.is(value, -0)
    && value >= Number.MIN_SAFE_INTEGER
    && value <= Number.MAX_SAFE_INTEGER;
}
```

This would cause `generateFloat()` to receive the value, outputting `743000000000000000.0` which round-trips correctly as a float.

### Impact

- Any TOML float with exponent notation that produces a value outside the safe integer range
- Also affects integer-keyed floats like `9007199254740993.0` that happen to be whole numbers outside safe range
- The original JSON `stringify` round-trip works correctly — this is specific to TOML generation
