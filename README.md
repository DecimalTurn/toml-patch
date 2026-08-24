<img src="assets/toml-patch-logo.png" alt="toml-patch logo" width="120"/>

# toml-patch

[![NPM Version](https://img.shields.io/npm/v/%40decimalturn%2Ftoml-patch?logo=npm&logoColor=white&labelColor=red&color=blue)](https://www.npmjs.com/package/@decimalturn/toml-patch)
[![JSR Version](https://img.shields.io/jsr/v/%40decimalturn/toml-patch?logo=jsr&color=blue)](https://jsr.io/@decimalturn/toml-patch)
[![GitHub branch status](https://img.shields.io/github/check-runs/DecimalTurn/toml-patch/latest)](https://github.com/DecimalTurn/toml-patch/actions/workflows/test-and-build.yml)

Patch, parse, and stringify [TOML](https://toml.io/en/) (v1.1.0) while preserving comments and formatting.

This project started as a fork of the [original toml-patch](https://github.com/timhall/toml-patch) but has since evolved into a standalone project with significant improvements in reliability and features. We've added TOML v1.1 support, introduced new APIs like `TomlDocument` and `TomlFormat` classes, fixed numerous bugs through increase in testing namely with [toml-test](https://github.com/toml-lang/toml-test).

We hope that these improvements can be incorporated upstream one day if the original author returns, but until then, this project is the actively maintained version.

## Documentation

- [Installation](#installation)
- [API](#api)
- [Comment ownership](#comment-ownership)
- [Date/time handling and Temporal](#datetime-handling--temporal)
- [Formatting](#formatting)
- [Changelog](https://github.com/DecimalTurn/toml-patch/blob/v3.0.4/CHANGELOG.md)
- [Contributing](https://github.com/DecimalTurn/toml-patch/blob/v3.0.4/CONTRIBUTING.md)

## Installation

toml-patch is dependency-free and can be installed via your favorite package manager.

*Example with NPM*

```
$ npm install --save @decimalturn/toml-patch
```

For browser usage, you can use unpkg:

```html
<script type="module">
  import * as TOML from 'https://unpkg.com/@decimalturn/toml-patch@browser/dist/browser/toml-patch.js';
</script>
```

## API

overwrite(tomlString: string): void
toml-patch provides a functional API for one-time operations and a document-oriented API for workflows that need multiple operations on the same TOML document.

See the [API reference](https://github.com/DecimalTurn/toml-patch/blob/v3.0.4/docs/API.md) for `patch`, `parse`, `stringify` and the `TomlDocument` class.

For a quick start, patch an existing TOML string like this:

```js
import { patch } from '@decimalturn/toml-patch';

const existing = 'title = "TOML example"\nowner.name = "Bob"\n';
const updated = patch(existing, {
  title: 'TOML example',
  owner: { name: 'Tim' }
});
```

## Comment Ownership

When `patch()` removes or reorders an entry, any comment describing it — a same-line trailing
comment, or an own-line comment directly above with no blank line in between — travels along with
it, instead of being left behind to describe whatever ends up in that spot. This applies to root
keys, `[table]`/`[[array-of-tables]]` blocks, and elements inside multi-line arrays and inline
tables.

```js
import * as TOML from '@decimalturn/toml-patch';
import { strict as assert } from 'assert';

const existing = `
x = 1 # a note about x
y = 2
`;

const patched = TOML.patch(existing, { y: 2 });

assert.strictEqual(patched, `
y = 2
`);
```

See the [comment ownership guide](https://github.com/DecimalTurn/toml-patch/blob/v3.0.4/docs/Comment-Ownership.md) for the full behavior, including how a blank line opts a comment out of ownership and current scope limitations.

Note that `patch()` does not reorder entries by default.
To have it match the key order of the object you pass in, enable `updateOrder` in the [formatting options](https://github.com/DecimalTurn/toml-patch/blob/v3.0.4/docs/Formatting.md#updateorder).

## Date/Time Handling & Temporal

TOML date/time values are parsed into custom `Date` subclasses (`LocalDate`, `LocalTime`, `LocalDateTime`, `OffsetDateTime`) by default. Set `temporal: true` to receive [Temporal](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Temporal) objects instead. `stringify()` and `patch()` auto-detect Temporal objects and serialize them correctly.

### Enabling Temporal

The `temporal: true` option requires `Temporal` to be available in the runtime:

| Runtime | How to enable |
|---|---|
| **Node.js 26+** | Built-in — enable with `temporal: true` |
| **Node.js 20–24** | `node --harmony-temporal` flag |
| **Node.js 14–26** | [@js-temporal/polyfill](https://www.npmjs.com/package/@js-temporal/polyfill) |

```js
import * as TOML from '@decimalturn/toml-patch';

// Node 26+ (native) or Node 20–24 with --harmony-temporal:
const obj = TOML.parse('d = 2024-01-15\n', { temporal: true });
// obj.d → Temporal.PlainDate

// All Node versions with the polyfill:
import { Temporal } from '@js-temporal/polyfill';
globalThis.Temporal = Temporal;
const obj2 = TOML.parse('d = 2024-01-15\n', { temporal: true });
// obj2.d → PlainDate (polyfill)
```

> **Note:** Only offset-based timezones (`+05:30`, `Z`) are supported in TOML. IANA timezone annotations (e.g., `[Asia/Kolkata]`) will throw an error.

See the [date/time guide](https://github.com/DecimalTurn/toml-patch/blob/v3.0.4/docs/Dates.md) for details and examples.

## Formatting

The `TomlFormat` class controls how TOML documents are formatted during stringification and patching operations.

```typescript
class TomlFormat {
  newLine: string
  trailingNewline: number
  trailingComma: boolean
  bracketSpacing: boolean
  inlineTableStart?: number
  truncateZeroTimeInDates: boolean
  minimumDecimals?: number
  leadingBom: boolean
  updateOrder?: boolean

  static default(): TomlFormat
  static autoDetectFormat(tomlString: string): TomlFormat
}
```

Start with `TomlFormat.default()` and override the options you need:

```js
import { stringify, TomlFormat } from '@decimalturn/toml-patch';

const format = TomlFormat.default();
format.newLine = '\r\n';
format.trailingNewline = 0;
format.trailingComma = true;
format.bracketSpacing = false;

const toml = stringify({
  title: 'My App',
  tags: ['dev', 'config'],
  database: { host: 'localhost', port: 5432 }
}, format);

```

See the [formatting reference](https://github.com/DecimalTurn/toml-patch/blob/v3.0.4/docs/Formatting.md) for the complete list of options, auto-detection behavior, `updateOrder` and more examples.