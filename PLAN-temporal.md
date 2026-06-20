# Plan: Temporal API Support for toml-patch

## Overview

The TOML spec has 4 date/time types that map cleanly to the [Temporal API](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Temporal) (Stage 4, shipping in browsers and Node.js):

| TOML Type | Temporal Type |
|---|---|
| Offset Date-Time | `Temporal.ZonedDateTime` |
| Local Date-Time | `Temporal.PlainDateTime` |
| Local Date | `Temporal.PlainDate` |
| Local Time | `Temporal.PlainTime` |

The implementation touches two independent concerns:

- **Parsing** (TOML → JS): opt-in via a new `temporal: boolean` option in `ParseOptions` (default `false`).
- **Serializing** (JS → TOML): automatic — if a Temporal object is found in the input JS object, it serializes to the correct TOML date/time type.

---

## Files to Modify

| # | File | Change |
|---|---|---|
| 1 | `src/parse-options.ts` | Add `temporal?: boolean` |
| 2 | `src/utils.ts` | Add `isTemporal()` guard, update `datesEqual`, `stableStringify` |
| 3 | `src/to-js.ts` | Thread `temporal` option; DateTime → Temporal when enabled |
| 4 | `src/parse-js.ts` | Detect Temporal objects in `walkValue()` |
| 5 | `src/generate.ts` | `generateDateTime` to accept Temporal objects |
| 6 | `src/date-format.ts` | `createDateWithOriginalFormat` to handle Temporal |
| 7 | `src/patch.ts` | `preserveFormatting` for Temporal values |
| 8 | `src/diff.ts` | Ensure date comparison works with Temporal |
| 9 | `src/index.ts` | Export new option type, update JSDoc |
| 10 | `src/__tests__/temporal.test.ts` | New test file |

---

## Step 1 — Add `temporal` option to `ParseOptions`

**File:** `src/parse-options.ts`

```ts
export interface ParseOptions {
  integersAsBigInt?: IntegersAsBigInt;
  /** When true, TOML date/time values are returned as Temporal objects
   *  instead of custom Date subclasses. Default: false. */
  temporal?: boolean;
}
```

**File:** `src/index.ts` — update `parse()` JSDoc to document the new option.

---

## Step 2 — Temporal type guards in `utils.ts`

**File:** `src/utils.ts`

Add a duck-type check for Temporal objects:

```ts
export function isTemporal(value: any): boolean {
  return value != null
    && typeof value === 'object'
    && typeof value.toString === 'function'
    && value.constructor?.name?.startsWith?.('Temporal.');
}
```

Update `datesEqual` to handle Temporal:

```ts
export function datesEqual(a: any, b: any): boolean {
  if (isTemporal(a) && isTemporal(b)) {
    return a.toString() === b.toString();
  }
  return isDate(a) && isDate(b) && a.toISOString() === b.toISOString();
}
```

Update `stableStringify` to handle Temporal:

```ts
// In stableStringify, after the isObject check:
if (isTemporal(object)) {
  return JSON.stringify(object.toString());
}
```

---

## Step 3 — Parse path: DateTime CST nodes → Temporal objects

**File:** `src/to-js.ts`

### 3a. Thread `temporal` option

The `toJS()` function signature currently accepts `integersAsBigInt`. Add `temporal`:

```ts
export default function toJS(
  cst: CST,
  input: string = '',
  integersAsBigInt: IntegersAsBigInt = 'asNeeded',
  temporal: boolean = false
): any {
```

Also update `toValue()`:

```ts
export function toValue(
  node: Value,
  integersAsBigInt: IntegersAsBigInt = 'asNeeded',
  temporal: boolean = false
): any {
```

### 3b. Convert DateTime to Temporal

In the `NodeType.DateTime` case of `toValue()`:

```ts
case NodeType.DateTime:
  if (temporal) {
    if (typeof Temporal === 'undefined') {
      throw new Error(
        'Temporal API is not available in this runtime. ' +
        'Set temporal: false or use a runtime with Temporal support.'
      );
    }
    return dateValueToTemporal(node.value, node.raw);
  }
  return node.value;
```

### 3c. New helper: `dateValueToTemporal`

New function (could live in `src/date-format.ts` or a new `src/temporal.ts`):

```ts
import { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './date-format';

function dateValueToTemporal(value: Date, raw: string): any {
  // LocalDate → Temporal.PlainDate
  if (value instanceof LocalDate) {
    return Temporal.PlainDate.from(value.toISOString());
  }
  // LocalTime → Temporal.PlainTime
  if (value instanceof LocalTime) {
    return Temporal.PlainTime.from(value.toISOString());
  }
  // LocalDateTime → Temporal.PlainDateTime
  if (value instanceof LocalDateTime) {
    return Temporal.PlainDateTime.from(value.toISOString());
  }
  // OffsetDateTime → Temporal.ZonedDateTime
  if (value instanceof OffsetDateTime) {
    const iso = value.toISOString();
    // Extract offset: e.g. "2024-01-15T10:30:00+05:30"
    // ZonedDateTime needs a timezone; we use the offset directly
    const offsetMatch = iso.match(/([+-]\d{2}:\d{2}|Z)$/);
    const offset = offsetMatch ? offsetMatch[1] : 'Z';
    const plainIso = iso.replace(/([+-]\d{2}:\d{2}|Z)$/, '');
    return Temporal.ZonedDateTime.from(`${plainIso}${offset}[${offset}]`);
  }
  // Fallback: native Date → PlainDateTime
  return Temporal.PlainDateTime.from(value.toISOString().replace('Z', ''));
}
```

---

## Step 4 — Serialize path: detect Temporal in JS → TOML

**File:** `src/parse-js.ts`

In `walkValue()`, before the `isDate` check:

```ts
import { isTemporal } from './utils';

function walkValue(value: any, format: TomlFormat): Value {
  // ... existing checks ...

  if (isTemporal(value)) {
    return generateTemporalDateTime(value, format.truncateZeroTimeInDates);
  }
  if (isDate(value)) {
    return generateDateTime(value, format.truncateZeroTimeInDates);
  }
  // ...
}
```

**File:** `src/generate.ts`

New function `generateTemporalDateTime`:

```ts
export function generateTemporalDateTime(
  value: any,
  truncateZeroTimeInDates: boolean = false
): DateTime {
  const constructorName: string = value.constructor?.name ?? '';

  let raw: string;

  if (constructorName === 'Temporal.PlainDate') {
    raw = value.toString();
    // truncateZeroTimeInDates doesn't apply — PlainDate is always date-only
  } else if (constructorName === 'Temporal.PlainTime') {
    raw = value.toString();
  } else if (constructorName === 'Temporal.PlainDateTime') {
    raw = value.toString();
  } else if (constructorName === 'Temporal.ZonedDateTime') {
    // TOML only supports offset, not IANA timezone.
    // Use the offset from the ZonedDateTime.
    raw = value.toString({ timeZoneName: 'never', offset: 'auto', smallestUnit: 'millisecond' });
  } else {
    // Unknown Temporal type — fall back to toString()
    raw = value.toString();
  }

  return {
    type: NodeType.DateTime,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}
```

> **Note for `ZonedDateTime`:** `toString()` returns something like `"2024-01-15T10:30:00+05:30[Asia/Kolkata]"`. The `[Asia/Kolkata]` IANA annotation is not valid TOML. Use `toString({ timeZoneName: 'never' })` to suppress it, giving `"2024-01-15T10:30:00+05:30"` which is valid TOML offset date-time.

Also update the `toJSON()` helper in `parse-js.ts` — skip Temporal objects (don't call `.toJSON()` on them, they already represent themselves):

```ts
function toJSON(value: any): any {
  if (!value) return value;
  if (isDate(value)) return value;
  if (isTemporal(value)) return value;  // Temporal objects represent themselves
  if (typeof value.toJSON === 'function') return value.toJSON();
  return value;
}
```

---

## Step 5 — Diff/Patch Temporal compatibility

### 5a. `datesEqual` and `stableStringify` (already covered in Step 2)

### 5b. `patch.ts` — `preserveFormatting`

In `preserveFormatting()`, the DateTime branch currently calls `DateFormatHelper.createDateWithOriginalFormat(newValue, originalRaw)` which expects `Date` subclasses. When `newValue` is a Temporal object, it already carries its own type information (a `Temporal.PlainDate` will always serialize as date-only), so we can skip the format-preservation step:

```ts
if (isDateTime(existing) && isDateTime(replacement)) {
  if (isTemporal(replacement.value)) {
    // Temporal objects preserve their own type — no format conversion needed.
    // Just update the raw string from the Temporal's toString().
    replacement.raw = replacement.value.toString();
    replacement.loc.end.column = replacement.loc.start.column + replacement.raw.length;
  } else {
    // existing Date subclass logic
    const formattedDate = DateFormatHelper.createDateWithOriginalFormat(replacement.value, existing.raw);
    replacement.value = formattedDate;
    replacement.raw = formattedDate.toISOString();
    replacement.loc.end.column = replacement.loc.start.column + replacement.raw.length;
  }
}
```

### 5c. `patchCst` — thread `temporal` to `toJS`

When calling `toJS(items)` and `toJS(updated_document.items)` inside `patchCst`, we need to pass the `temporal` option. The `patch()` function signature may need to accept the option too, or we can detect Temporal in the `updated` object and set it automatically.

Simpler approach: auto-detect. If the `updated` JS object contains any Temporal values, enable temporal mode for the diff:

```ts
function hasTemporal(obj: any, seen = new WeakSet()): boolean {
  if (obj == null || typeof obj !== 'object') return false;
  if (isTemporal(obj)) return true;
  if (seen.has(obj)) return false;
  seen.add(obj);
  for (const v of Object.values(obj)) {
    if (hasTemporal(v, seen)) return true;
  }
  return false;
}
```

---

## Step 6 — Verify stringify integration

`stringify()` calls `parseJS()` → `walkValue()` → `generateTemporalDateTime()`. Once Step 4 is done, stringify naturally handles Temporal objects. No extra changes needed.

---

## Step 7 — Export and JSDoc update

**File:** `src/index.ts`

- Export `isTemporal` from utils (optional, but useful for consumers)
- Update `parse()` JSDoc to document `temporal` option

---

## Step 8 — Tests

**File:** `src/__tests__/temporal.test.ts`

### Test cases

1. **Parse with `temporal: true`:**
   - `"2024-01-15"` → `Temporal.PlainDate`
   - `"10:30:00"` → `Temporal.PlainTime`
   - `"2024-01-15T10:30:00"` → `Temporal.PlainDateTime`
   - `"2024-01-15T10:30:00+05:30"` → `Temporal.ZonedDateTime`
   - `"2024-01-15 10:30:00-05:00"` (space separator) → `Temporal.ZonedDateTime`

2. **Parse with `temporal: false` (default):**
   - All date/time values return custom Date subclasses (existing behavior unchanged)

3. **Parse with `temporal: true` but no Temporal runtime:**
   - Skip or mock if Temporal isn't available; test that it throws a clear error

4. **Stringify with Temporal input:**
   ```ts
   stringify({ d: Temporal.PlainDate.from("2024-01-15") })
   // → 'd = 2024-01-15\n'
   ```
   ```ts
   stringify({ t: Temporal.PlainTime.from("10:30:00.123") })
   // → 't = 10:30:00.123\n'
   ```
   ```ts
   stringify({ dt: Temporal.PlainDateTime.from("2024-01-15T10:30:00") })
   // → 'dt = 2024-01-15T10:30:00\n'
   ```
   ```ts
   stringify({ z: Temporal.ZonedDateTime.from("2024-01-15T10:30:00+05:30[Asia/Kolkata]") })
   // → 'z = 2024-01-15T10:30:00+05:30\n'
   ```

5. **Patch with Temporal:**
   ```ts
   patch('d = 2024-01-15\n', { d: Temporal.PlainDate.from("2025-06-01") })
   // → 'd = 2025-06-01\n'
   ```

6. **Roundtrip:**
   ```ts
   const obj = parse(tomlStr, { temporal: true });
   const out = stringify(obj);
   const obj2 = parse(out, { temporal: true });
   // obj and obj2 should be equivalent
   ```

### Note on test environment

Temporal is available in recent V8/Node.js versions. Tests may need to check `typeof Temporal !== 'undefined'` and skip if unavailable, or use a `describeIf` pattern.

---

## Execution Order

| Order | Step | Files | Risk |
|---|---|---|---|
| 1 | Add `temporal` option | `parse-options.ts` | Low |
| 2 | Temporal type guards | `utils.ts` | Low |
| 3 | Parse path conversion | `to-js.ts`, new helper | Medium |
| 4 | Serialize path detection | `parse-js.ts`, `generate.ts` | Medium |
| 5 | Diff/patch compatibility | `utils.ts`, `patch.ts`, `date-format.ts` | Medium |
| 6 | Verify stringify | just verify | Low |
| 7 | Export & JSDoc | `index.ts` | Low |
| 8 | Tests | new `__tests__/temporal.test.ts` | Low |

---

## Design Decisions

1. **`temporal` is opt-in (default `false`).** This avoids a breaking change. In a future major version it could become opt-out or the default once Temporal reaches Baseline.
2. **Temporal detection in serialize path is automatic.** If a user has a Temporal object in their JS, we want it to serialize correctly without extra configuration.
3. **Duck-typing for Temporal detection** rather than `instanceof` checks, because Temporal objects may come from different realms (e.g., iframes, vm contexts).
4. **For `ZonedDateTime` with IANA timezone**, we strip the IANA annotation and keep only the offset in TOML output. TOML does not support IANA timezone names.
5. **`patch()` auto-detects Temporal** in the `updated` object to enable temporal mode for the internal `toJS` diffs, avoiding a change to the `patch()` signature.
