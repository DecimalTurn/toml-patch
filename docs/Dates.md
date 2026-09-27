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

### Sub-millisecond precision

A `Date` holds milliseconds, but TOML fractional seconds can carry any number of digits. The classes keep the source fraction, so the extra digits survive a round trip:

```js
stringify(parse('t = 07:32:00.123456\n'));
// 't = 07:32:00.123456\n'
```

`patch()` leaves the digits alone when the value does not change, a value that only differs in how its fraction is spelled (`.5` against `.500`) is not an edit, and an edit below the millisecond (`.123456` to `.123999`) is applied. When the value does change, it writes the digits it needs to be exact, widened to the source's width when the source declared zeros there: 750 ms against a source that wrote `.5` becomes `.75` and never `.7`, `.500` becomes `.750`, and `.500000` becomes `.750000`. Digits that were significant are not padding, so `.123456` edited to 500 ms becomes `.5` — the same rule numbers follow, where `1.00` keeps its decimals and `1.5` becomes `2`. Use [`minimumTimeDecimals`](Formatting.md#minimumtimedecimals) when a document wants a wider fraction. A source written without a fraction stays without one unless the new value has a non-zero millisecond, which is then written in its minimal form. Every class behaves the same way, `LocalTime` included. With `temporal: true` the value is a Temporal object, which is not limited to milliseconds, so sub-millisecond digits survive edits too.

The `minimumTimeDecimals` formatting option sets a floor on the written fractional-second digits, independently of `minimumDecimals`, which applies to numbers. See [`minimumTimeDecimals`](Formatting.md#minimumtimedecimals).

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

Temporal is a Stage 4 proposal.

- **Node.js >= v26**: native support.
- **Node.js < v26**: enable with `--harmony-temporal` flag.
- **Modern browsers**: native support.
- **Other runtimes**: use [`@js-temporal/polyfill`](https://www.npmjs.com/package/@js-temporal/polyfill) and set it on `globalThis` before parsing:

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

> **Note:** TOML only supports timezone offsets (`+05:30`, `Z`), not IANA timezone names. Passing a `Temporal.ZonedDateTime` with an IANA annotation (e.g. `[Asia/Kolkata]`) will throw an error. Use offset-based timezones (`[+05:30]`, `[+00:00]`) instead.

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
