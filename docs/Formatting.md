# Formatting

The `TomlFormat` class controls how TOML documents are formatted during stringification and patching.

## `TomlFormat` class

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

## Basic usage

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

## Formatting options

### `newLine`

- **Type:** `string`
- **Default:** `\n`
- **Description:** The line ending to use in output TOML. This affects stringification, not the internal concrete syntax tree.

```js
const format = TomlFormat.default();
format.newLine = '\n';
format.newLine = '\r\n';
```

### `trailingNewline`

- **Type:** `number`
- **Default:** `1`
- **Description:** The number of trailing newlines to add at the end of the TOML document.

```js
const format = TomlFormat.default();
format.trailingNewline = 0;
format.trailingNewline = 1;
format.trailingNewline = 2;
```

### `trailingComma`

- **Type:** `boolean`
- **Default:** `false`
- **Description:** Whether to add a trailing comma after the last element in arrays and inline tables.

```js
const format = TomlFormat.default();
format.trailingComma = false;  // [1, 2, 3] and { x = 1, y = 2 }
format.trailingComma = true;   // [1, 2, 3,] and { x = 1, y = 2, }
```

### `bracketSpacing`

- **Type:** `boolean`
- **Default:** `true`
- **Description:** Whether to add spaces after opening brackets or braces and before closing brackets or braces in arrays and inline tables.

```js
const format = TomlFormat.default();
format.bracketSpacing = true;   // [ 1, 2, 3 ] and { x = 1, y = 2 }
format.bracketSpacing = false;  // [1, 2, 3] and {x = 1, y = 2}
```

### `leadingBom`

- **Type:** `boolean`
- **Default:** `false`, auto-detected from input
- **Description:** Whether to prepend a UTF-8 BOM (byte order mark, U+FEFF) to output TOML. The option is automatically detected from input strings and maintained through patch and stringify operations.

### `inlineTableStart`

- **Type:** `number` (optional)
- **Default:** `1`
- **Description:** The nesting depth at which new tables start being formatted as inline tables. Tables at a depth greater than or equal to `inlineTableStart` are inline tables. Tables at a smaller depth are separate table sections. A top-level table has depth 0.

```js
const format = TomlFormat.default();
format.inlineTableStart = 0;  // All tables are inline tables, including top-level tables.
format.inlineTableStart = 1;  // Top-level tables are sections, nested tables are inline.
format.inlineTableStart = 2;  // Two levels are sections, deeper nesting is inline.
```

With `inlineTableStart = 0`, all tables are inline tables:

```js
const format = TomlFormat.default();
format.inlineTableStart = 0;
stringify({ database: { host: 'localhost', port: 5432 } }, format);
// database = { host = "localhost", port = 5432 }
```

With `inlineTableStart = 1`, top-level tables are sections:

```js
const format = TomlFormat.default();
format.inlineTableStart = 1;
stringify({ database: { host: 'localhost', port: 5432 } }, format);
// [database]
// host = "localhost"
// port = 5432
```

### `truncateZeroTimeInDates`

- **Type:** `boolean`
- **Default:** `false`
- **Description:** When `true`, JavaScript `Date` objects with all time components set to zero, or midnight UTC, are serialized as date-only values in TOML. This affects new values during stringification. Existing TOML dates keep their original format during patching.

```js
const format = TomlFormat.default();
format.truncateZeroTimeInDates = false;
// new Date('2024-01-15T00:00:00.000Z') -> 2024-01-15T00:00:00.000Z

format.truncateZeroTimeInDates = true;
// new Date('2024-01-15T00:00:00.000Z') -> 2024-01-15
```

Example with mixed dates:

```js
import { stringify, TomlFormat } from '@decimalturn/toml-patch';

const format = TomlFormat.default();
format.truncateZeroTimeInDates = true;

const data = {
  startDate: new Date('2024-01-15T00:00:00.000Z'),
  endDate: new Date('2024-12-31T23:59:59.999Z')
};

stringify(data, format);
// startDate = 2024-01-15
// endDate = 2024-12-31T23:59:59.999Z
```

### `minimumDecimals`

- **Type:** `number` (optional)
- **Default:** `0`
- **Description:** The minimum number of decimal places to use when serializing JavaScript numbers as TOML floats. When greater than `0`, plain JavaScript integer values are serialized as TOML floats padded with zeros to reach the specified decimal count. `bigint` values are always serialized as TOML integers.

```js
const format = TomlFormat.default();
format.minimumDecimals = 0;  // { x: 1, y: 1.5 } -> { x = 1, y = 1.5 }
format.minimumDecimals = 1;  // { x: 1, y: 1.5 } -> { x = 1.0, y = 1.5 }
format.minimumDecimals = 2;  // { x: 1, y: 1.5 } -> { x = 1.00, y = 1.50 }
```

### `updateOrder`

- **Type:** `boolean` (optional)
- **Default:** `false`
- **Description:** Whether `patch()` should reorder entries to match the key order of the JavaScript object, instead of preserving the existing document's order. This applies to root key-values, `[table]` and `[[array-of-tables]]` section blocks, and rows inside table bodies. Each entry's comments travel with it. See [Comment ownership](CommentOwnership.md).

This option only affects `patch()` and is never auto-detected. With the option off, `patch()` changes values that differ and leaves their order alone:

```toml
b = 2
a = 1
```

```js
patch(existing, { a: 1, b: 2 });
// unchanged: b = 2 then a = 1

patch(existing, { a: 1, b: 2 }, { updateOrder: true });
// reordered: a = 1 then b = 2
```

Comments travel with their entry:

```toml
# the second one
b = 2

# the first one
a = 1
```

```js
patch(existing, { a: 1, b: 2 }, { updateOrder: true });
```

```toml
# the first one
a = 1

# the second one
b = 2
```

TOML validity takes precedence over the requested order. A root key-value cannot appear after a section header because it would bind to that section. Root keys and section blocks are therefore reordered independently. A section is never pulled ahead of a root key, regardless of where it sits in the object.

```toml
[section]
key = "value"
```

```js
patch(existing, { new_root: 42, section: { key: 'value' } }, { updateOrder: true });
```

```toml
new_root = 42

[section]
key = "value"
```

Some shapes are not reordered yet: the interiors of inline tables (`{ a = 1, b = 2 }`) and `[[array-of-tables]]` entries, dotted-key implicit tables, and documents where a table's sub-tables are non-contiguous (`[a]`, `[b]`, `[a.c]`). In each case, the affected entry is left where it was and `patch()` emits a `console.warn` naming what it could not place.

## Auto-detection and patching

`TomlFormat.autoDetectFormat()` analyzes an existing TOML string to detect and preserve its current formatting. If you do not supply the `format` argument when patching an existing document, toml-patch uses the detected format when inserting new elements.

Formatting of existing elements is not affected by the `format` passed to `patch()`, except for `newLine` and `trailingNewline`, which apply at the document level.

## Complete example

```js
import { stringify, TomlFormat } from '@decimalturn/toml-patch';

const data = {
  title: 'Configuration Example',
  settings: {
    debug: true,
    timeout: 30
  },
  servers: ['web1', 'web2', 'db1'],
  database: {
    host: 'localhost',
    port: 5432,
    ssl: true
  }
};

const compact = TomlFormat.default();
compact.bracketSpacing = false;
compact.trailingNewline = 0;

console.log(stringify(data, compact));
// title = "Configuration Example"
// servers = ["web1", "web2", "db1"]
//
// [settings]
// debug = true
// timeout = 30
//
// [database]
// host = "localhost"
// port = 5432
// ssl = true

const spacious = TomlFormat.default();
spacious.trailingComma = true;
spacious.bracketSpacing = true;
spacious.trailingNewline = 2;

console.log(stringify(data, spacious));
// title = "Configuration Example"
// servers = [ "web1", "web2", "db1", ]
//
// [settings]
// debug = true
// timeout = 30
//
// [database]
// host = "localhost"
// port = 5432
// ssl = true

const windows = TomlFormat.default();
windows.newLine = '\r\n';
windows.bracketSpacing = false;
windows.trailingNewline = 1;

console.log(stringify(data, windows));
// Same structure as compact, with \r\n line endings.
```

## Legacy format objects

Anonymous objects are still supported for backward compatibility:

```js
const result = stringify(data, {
  trailingComma: true,
  bracketSpacing: false
});

const format = TomlFormat.default();
format.trailingComma = true;
format.bracketSpacing = false;
const recommendedResult = stringify(data, format);
```
