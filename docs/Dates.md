# Date/Time Handling & Temporal

TOML supports four date/time types: [offset date-time](https://toml.io/en/v1.1.0#offset-date-time), [local date-time](https://toml.io/en/v1.1.0#local-date-time), [local date](https://toml.io/en/v1.1.0#local-date), and [local time](https://toml.io/en/v1.1.0#local-time). This library preserves each type's semantics through both parsing and serialization.

## Default behavior (Date subclasses)

By default (`temporal: false`), TOML date/time values are parsed into custom `Date` subclasses that preserve the original TOML format:

| TOML example | JS class |
|---|---|
| `2024-01-15` | `LocalDate` |
| `10:30:00` | `LocalTime` |
| `2024-01-15T10:30:00` | `LocalDateTime` |
| `2024-01-15T10:30:00+05:30` | `OffsetDateTime` |

Each class extends `Date`, so you can treat them as normal `Date` objects. When stringified back to TOML, each class serializes to the correct format automatically — a `LocalDate` never gains a time component, and an `OffsetDateTime` preserves its timezone offset.

## Temporal API (opt-in)

Set `temporal: true` in `ParseOptions` to receive [Temporal](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Temporal) objects instead:

| TOML type | Temporal type |
|---|---|
| Offset Date-Time | `Temporal.ZonedDateTime` |
| Local Date-Time | `Temporal.PlainDateTime` |
| Local Date | `Temporal.PlainDate` |
| Local Time | `Temporal.PlainTime` |

```js
import { parse } from '@decimalturn/toml-patch';

const obj = parse(
  'd = 2024-01-15\nz = 2024-01-15T10:30:00+05:30\n',
  { temporal: true }
);
// obj.d → Temporal.PlainDate
// obj.z → Temporal.ZonedDateTime
```

### Runtime requirements

Temporal is Stage 4 and available in modern browsers. For runtimes without native support (including Node.js 24 and earlier), use [`@js-temporal/polyfill`](https://www.npmjs.com/package/@js-temporal/polyfill) and set it on `globalThis` before parsing:

```js
import { Temporal } from '@js-temporal/polyfill';
globalThis.Temporal = Temporal;

// Now parse() with temporal: true works
const obj = parse('d = 2024-01-15\n', { temporal: true });
```

## Temporal in stringify and patch

`stringify()` and `patch()` auto-detect Temporal objects in the input JS — no option needed:

```js
import { stringify, patch } from '@decimalturn/toml-patch';

stringify({
  start: Temporal.PlainDate.from('2024-01-15'),
  due: Temporal.ZonedDateTime.from('2024-12-31T23:59:59Z[UTC]')
});
// start = 2024-01-15
// due = 2024-12-31T23:59:59Z

patch('d = 2024-01-15\n', {
  d: Temporal.PlainDateTime.from('2025-06-01T12:00:00')
});
// d = 2025-06-01T12:00:00
```

> **Note:** TOML only supports timezone offsets (`+05:30`, `Z`), not IANA timezone names. When a `Temporal.ZonedDateTime` with an IANA annotation (e.g. `[Asia/Kolkata]`) is serialized, only the offset portion is kept.

## Format transitions

When patching, the output format automatically adapts to the new Temporal type. Upgrading a date-only value to a `PlainDateTime` adds the time component; downgrading a `ZonedDateTime` to a `PlainDate` strips the time and offset:

```js
// Upgrade: date-only → datetime
patch('d = 2024-01-15\n', { d: Temporal.PlainDateTime.from('2025-06-01T12:00:00') });
// → 'd = 2025-06-01T12:00:00'

// Downgrade: offset datetime → date-only
patch('z = 2024-01-15T10:30:00+05:30\n', { z: Temporal.PlainDate.from('2025-06-01') });
// → 'z = 2025-06-01'
```

## Integer representation

Date/time handling is often paired with the `integersAsBigInt` option which controls how TOML integers are represented in JS.

See the [main README](../README.md#parse) for details on `ParseOptions`.
