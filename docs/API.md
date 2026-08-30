# API reference

The library provides a functional API for one-time operations and a document-oriented API for workflows that need multiple operations on the same TOML document.

## Functional API

### `patch(existing, updated, format?)`

```typescript
function patch(
  existing: string,
  updated: any,
  format?: Format,
): string
```

Applies modifications to a TOML document by comparing an existing TOML string with updated JavaScript data.

This function preserves formatting and comments from the existing TOML document while applying changes from the updated data structure. It performs a diff between the existing and updated data, then applies only the necessary changes to maintain the original document structure as much as possible.

Parameters:

- `existing: string` - The original TOML document as a string.
- `updated: any` - The updated JavaScript object with the desired changes.
- `format?: Format` - Optional formatting options for new or modified sections.

Returns a new TOML string with the changes applied.

#### Example 1

```js
import * as TOML from '@decimalturn/toml-patch';
import { strict as assert } from 'assert';

const existing = `
# This is a TOML document

title = "TOML example"
owner.name = "Bob"
`;
const patched = TOML.patch(existing, {
  title: 'TOML example',
  owner: {
    name: 'Tim'
  }
});

assert.strictEqual(
  patched,
  `
# This is a TOML document

title = "TOML example"
owner.name = "Tim"
`
);
```

#### Example 2

```js
import * as TOML from '@decimalturn/toml-patch';
import { strict as assert } from 'assert';

const existing = `
# This is a TOML document

title = "TOML example"
owner.name = "Bob"
`;

const jsObject = TOML.parse(existing);
jsObject.owner.name = "Tim";

const patched = TOML.patch(existing, jsObject);

assert.strictEqual(
  patched,
  `
# This is a TOML document

title = "TOML example"
owner.name = "Tim"
`
);
```

### `parse(value, options?)`

```typescript
function parse(value: string | Uint8Array, options?: ParseOptions): any
```

Parses a TOML string or raw UTF-8 bytes into a JavaScript object.

Parameters:

- `value: string | Uint8Array` - The TOML source to parse.
- `options?: ParseOptions` - Optional parse options:
  - `integersAsBigInt?: 'asNeeded' | true | false` - Controls how TOML integers are represented in JavaScript:
    - `'asNeeded'` (default) - Integers within the JavaScript safe-integer range are `number`; larger values are `bigint` to preserve precision.
    - `true` - All integers are returned as `bigint`.
    - `false` - All integers are returned as `number`; large values lose precision.
  - `temporal?: boolean` - When `true`, TOML date/time values are returned as [Temporal](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Temporal) objects instead of custom `Date` subclasses. The default is `false`. See [Date/time handling](Dates.md).

Returns the parsed JavaScript object.

> The default `'asNeeded'` mode is a behavioral change from v1.0.7 and earlier. If your code serializes the result to JSON or mixes `number` and `bigint` arithmetic, set `integersAsBigInt: false` to restore the previous behavior.

#### Example

```js
import * as TOML from '@decimalturn/toml-patch';
import { strict as assert } from 'assert';

const parsed = TOML.parse(`
# This is a TOML document.

title = "TOML Example"

[owner]
name = "Tim"`);

assert.deepStrictEqual(parsed, {
  title: 'TOML Example',
  owner: {
    name: 'Tim'
  }
});
```

### `stringify(value, format?)`

```typescript
function stringify(
  value: any,
  format?: Format,
): string
```

Converts a JavaScript object to a TOML string.

Parameters:

- `value: any` - The JavaScript object to stringify.
- `format?: Format` - Optional formatting options for the resulting TOML. See [Formatting](Formatting.md).

Returns the stringified TOML representation.

#### Example

```js
import * as TOML from '@decimalturn/toml-patch';
import { strict as assert } from 'assert';

const toml = TOML.stringify({
  title: 'TOML Example',
  owner: {
    name: 'Tim'
  }
});

assert.strictEqual(
  toml,
  `title = "TOML Example"

[owner]
name = "Tim"`
);
```

## `TomlDocument` class

The `TomlDocument` class provides a stateful interface for working with TOML documents. It is useful when you need to perform multiple operations on the same document.

### Constructor

```typescript
new TomlDocument(tomlSource: string | Uint8Array, options?: ParseOptions)
```

Initializes a `TomlDocument` with TOML source, parsing it into an internal concrete syntax tree. When bytes are provided, they are decoded as UTF-8 in fatal mode, rejecting invalid sequences before parsing.

> `parseDocument(value, options)` is a convenience alternative to `new TomlDocument(value, options)`.

Parameters:

- `tomlSource: string | Uint8Array` - The TOML source to parse.
- `options?: ParseOptions` - Optional parse options:
  - `integersAsBigInt?: 'asNeeded' | true | false` - Controls how TOML integers are represented in `toJsObject`.
  - `temporal?: boolean` - When `true`, TOML date/time values are returned as [Temporal](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Temporal) objects. The default is `false`. See [Date/time handling](Dates.md).

#### Basic usage example

```js
import * as TOML from '@decimalturn/toml-patch';

const doc = new TOML.TomlDocument(`
# Configuration file
title = "My App"
version = "1.0.0"

[database]
host = "localhost"
port = 5432
`);

console.log(doc.toJsObject);
// { title: "My App", version: "1.0.0", database: { host: "localhost", port: 5432 } }
```

### Properties

```typescript
get toJsObject(): any
get toTomlString(): string
```

- `toJsObject: any` - Returns the JavaScript object representation of the TOML document.
- `toTomlString: string` - Returns the current TOML string representation.

### Methods

```typescript
patch(updatedObject: any, format?: Format): void
update(tomlString: string): void
overwrite(tomlString: string): void
```

#### `patch(updatedObject, format?)`

- Applies a patch to the current concrete syntax tree using a modified JavaScript object.
- Updates the internal tree while preserving formatting and comments.
- Use the `toTomlString` getter to retrieve the updated TOML string.
- `updatedObject: any` - The modified JavaScript object to patch with.
- `format?: Format` - Optional formatting options.

#### `update(tomlString)`

- Updates the internal concrete syntax tree with a modified TOML string.
- Uses incremental parsing for efficiency by re-parsing only changed portions.
- Use the `toJsObject` getter to retrieve the updated JavaScript object.
- `tomlString: string` - The modified TOML string to update with.

#### `overwrite(tomlString)`

- Overwrites the internal concrete syntax tree by fully re-parsing the supplied TOML string.
- Simpler but slower than `update()`, which uses incremental parsing.
- `tomlString: string` - The TOML string to overwrite with.

#### `patch()` example

Using `patch()` to modify values while preserving formatting:

```js
import * as TOML from '@decimalturn/toml-patch';
// or: import { TomlDocument } from '@decimalturn/toml-patch';

const doc = new TOML.TomlDocument(`
# Configuration file
title = "My App"
version = "1.0.0"

[database]
host = "localhost"
port = 5432
`);

const config = doc.toJsObject;
config.version = "2.0.0";
config.database.port = 3306;
config.database.name = "myapp_db";

doc.patch(config);

console.log(doc.toTomlString);
// # Configuration file
// title = "My App"
// version = "2.0.0"
//
// [database]
// host = "localhost"
// port = 3306
// name = "myapp_db"
```

#### `update()` example

Using `update()` for efficient incremental parsing when the TOML string was edited:

```js
import * as TOML from '@decimalturn/toml-patch';
// or: import { TomlDocument } from '@decimalturn/toml-patch';

const originalToml = `
# Server configuration
[server]
host = "localhost"
port = 8080
debug = true
`;

const doc = new TOML.TomlDocument(originalToml);
const updatedToml = originalToml.replace('port = 8080', 'port = 3000');

doc.update(updatedToml);

console.log(doc.toJsObject.server.port); // 3000
```

For formatting options, see [Formatting](Formatting.md). For date/time and Temporal behavior, see [Dates](Dates.md).