# toml-patch

[![NPM Version](https://img.shields.io/npm/v/%40decimalturn%2Ftoml-patch?logo=npm&logoColor=white&labelColor=red&color=blue)](https://www.npmjs.com/package/@decimalturn/toml-patch)
[![JSR Version](https://img.shields.io/jsr/v/%40decimalturn/toml-patch?logo=jsr&color=blue)](https://jsr.io/@decimalturn/toml-patch)
[![GitHub branch status](https://img.shields.io/github/check-runs/DecimalTurn/toml-patch/latest)](https://github.com/DecimalTurn/toml-patch/actions/workflows/test-and-build.yml)
<img src="assets/toml-patch-logo.png" alt="toml-patch logo" width="120" align="right" />



Patch, parse, and stringify [TOML](https://toml.io/en/) (v1.1.0) while preserving comments and formatting.

This project started as a fork of the [original toml-patch](https://github.com/timhall/toml-patch) but has since evolved into a standalone project with significant improvements in reliability and features. We've added TOML v1.1 support, introduced new APIs like `TomlDocument` and `TomlFormat` classes, fixed numerous bugs through increase in testing namely with [toml-test](https://github.com/toml-lang/toml-test).

We hope that these improvements can be incorporated upstream one day if the original author returns, but until then, this project is the actively maintained version.

## Table of Contents

- [Installation](#installation)
- [API](#api)
  - [Functional API](#functional-api)
    - [patch](#patch)
      - [Example 1](#example-1)
      - [Example 2](#example-2)
    - [parse](#parse)
      - [Example](#example)
    - [stringify](#stringify)
      - [Example](#example-1)
  - [TomlDocument Class ](#tomldocument-class)
    - [Constructor](#constructor)
      - [Basic Usage Example](#basic-usage-example)
    - [Properties](#properties)
    - [Methods](#methods)
      - [patch() Example](#patch-example)
      - [update() Example](#update-example)
- [Formatting](#formatting)
  - [TomlFormat Class](#tomlformat-class)
  - [Basic Usage](#basic-usage)
  - [Formatting Options](#formatting-options)
  - [Auto-Detection and Patching](#auto-detection-and-patching)
  - [Complete Example](#complete-example)
  - [Legacy Format Objects](#legacy-format-objects)
- [Changelog](#changelog)
- [Contributing](#contributing)


## Installation

toml-patch is dependency-free and can be installed via your favorite package manager.

*Example with NPM*

```
$ npm install --save @decimalturn/toml-patch
```

For browser usage, you can use unpkg:

```html
<script src="https://unpkg.com/@decimalturn/toml-patch"></script>
```

## API

toml-patch provides both a [functional API]((#functional-api)) for one-time operations and a [document-oriented API](#tomldocument-class) for more complex workflows.

### Functional API

For simple one-time operations, you can use the functional API:

#### <a id="patch"></a>patch(*existing*, *updated*, *format?*)

```typescript
function patch(
  existing: string,
  updated: any,
  format?: Format,
): string
```

Applies modifications to a TOML document by comparing an existing TOML string with updated JavaScript data.

This function preserves formatting and comments from the existing TOML document while applying changes from the updated data structure. It performs a diff between the existing and updated data, then strategically applies only the necessary changes to maintain the original document structure as much as possible.

**Parameters:**
- `existing: string` - The original TOML document as a string
- `updated: any` - The updated JavaScript object with desired changes
- `format?: Format` - Optional formatting options to apply to new or modified sections

**Returns:** `string` - A new TOML string with the changes applied

Patch an existing TOML string with the given updated JS/JSON value, while attempting to retain the format of the existing document, including comments, indentation, and structure.

##### Example 1
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

##### Example 2
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

#### <a id="parse"></a>parse(*value*, *options?*)

```typescript
function parse(value: string | Uint8Array, options?: ParseOptions): any
```

Parses a TOML string (or raw UTF-8 bytes) into a JavaScript object.

**Parameters:**
- `value: string | Uint8Array` - The TOML source to parse
- `options?: ParseOptions` - Optional parse options
  - `integersAsBigInt?: 'asNeeded' | true | false` — Controls how TOML integers are represented in JS:
    - `'asNeeded'` *(default)* — integers within the JS safe-integer range are `number`; larger values are `bigint` to preserve precision
    - `true` — all integers are returned as `bigint`
    - `false` — all integers are returned as `number` (large values lose precision)

**Returns:** `any` - The parsed JavaScript object

> **Note:** The default `'asNeeded'` mode is a behavioral change from v1.0.7 and earlier. If your code serializes the result to JSON or mixes `number`/`bigint` arithmetic, set `integersAsBigInt: false` to restore the previous behavior.

##### Example
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

#### <a id="stringify"></a>stringify(*value*, *format?*)

```typescript
function stringify(
  value: any,
  format?: Format,
): string
```

Converts a JavaScript object to a TOML string.

**Parameters:**
- `value: any` - The JavaScript object to stringify
- `format?: Format` - Optional formatting options for the resulting TOML

**Returns:** `string` - The stringified TOML representation

**Format Options:**

See [Formatting Options](#formatting-options) for more details.

##### Example

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

### TomlDocument Class

The `TomlDocument` class provides a stateful interface for working with TOML documents. It's ideal when you need to perform multiple operations on the same document.

#### Constructor

```typescript
new TomlDocument(tomlSource: string | Uint8Array, options?: ParseOptions)
```

Initializes the TomlDocument with TOML source, parsing it into an internal representation (AST). When bytes are provided they are decoded as UTF-8 in fatal mode, rejecting invalid sequences before parsing.

**Parameters:**
- `tomlSource: string | Uint8Array` - The TOML source to parse
- `options?: ParseOptions` - Optional parse options
  - `integersAsBigInt?: 'asNeeded' | true | false` — Controls how TOML integers are represented in `toJsObject`:
    - `'asNeeded'` *(default)* — integers within the JS safe-integer range are `number`; larger values are `bigint` to preserve precision
    - `true` — all integers are returned as `bigint`
    - `false` — all integers are returned as `number` (large values lose precision)

##### Basic Usage Example

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
// Output: { title: "My App", version: "1.0.0", database: { host: "localhost", port: 5432 } }
```

#### Properties

```typescript
get toJsObject(): any
get toTomlString(): string
```

- `toJsObject: any` - Returns the JavaScript object representation of the TOML document
- `toTomlString: string` - Returns the current TOML string representation

#### Methods

```typescript
patch(updatedObject: any, format?: Format): void
update(tomlString: string): void
overwrite(tomlString: string): void
```

**patch(updatedObject, format?)**
- Applies a patch to the current AST using a modified JS object
- Updates the internal AST while preserving formatting and comments
- Use `toTomlString` getter to retrieve the updated TOML string
- **Parameters:**
  - `updatedObject: any` - The modified JS object to patch with
  - `format?: Format` - Optional formatting options

**update(tomlString)**
- Updates the internal AST by supplying a modified TOML string
- Uses incremental parsing for efficiency (only re-parses changed portions)
- Use `toJsObject` getter to retrieve the updated JS object representation
- **Parameters:**
  - `tomlString: string` - The modified TOML string to update with

**overwrite(tomlString)**
- Overwrites the internal AST by fully re-parsing the supplied TOML string
- Simpler but slower than `update()` which uses incremental parsing
- **Parameters:**
  - `tomlString: string` - The TOML string to overwrite with

##### patch() Example

*Using patch() to modify values while preserving formatting*

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

// Modify the JavaScript object
const config = doc.toJsObject;
config.version = "2.0.0";
config.database.port = 3306;
config.database.name = "myapp_db";

// Apply changes while preserving comments and formatting
doc.patch(config);

console.log(doc.toTomlString);
// Output:
// # Configuration file
// title = "My App"
// version = "2.0.0"
// 
// [database]
// host = "localhost"
// port = 3306
// name = "myapp_db"
```

##### update() Example

*Using update() for efficient incremental parsing when the TOML string was edited*

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

// Make a small change to the TOML string
const updatedToml = originalToml.replace('port = 8080', 'port = 3000');

// Efficiently update - only re-parses the changed portion
doc.update(updatedToml);

console.log(doc.toJsObject.server.port); // 3000
```

## Formatting

The `TomlFormat` class provides decent control over how TOML documents are formatted during stringification and patching operations. This class encapsulates all formatting preferences, making it easy to maintain consistent styling across your TOML documents.

### TomlFormat Class

```typescript
class TomlFormat {
  newLine: string
  trailingNewline: number
  trailingComma: boolean
  bracketSpacing: boolean
  inlineTableStart?: number
  truncateZeroTimeInDates: boolean
  minimumDecimals?: number

  static default(): TomlFormat
  static autoDetectFormat(tomlString: string): TomlFormat
}
```

### Basic Usage

The recommended approach is to start with `TomlFormat.default()` and override specific options as needed:

```js
import { patch, stringify, TomlFormat } from '@decimalturn/toml-patch';

// Create a custom format configuration
const format = TomlFormat.default();
format.newLine = '\r\n';        // Windows line endings
format.trailingNewline = 0;     // No trailing newline
format.trailingComma = true;    // Add trailing commas
format.bracketSpacing = false;  // No spaces in brackets

// Use with stringify
const toml = stringify({
  title: 'My App',
  tags: ['dev', 'config'],
  database: { host: 'localhost', port: 5432 }
}, format);

```

### Formatting Options

**newLine**
- **Type:** `string`
- **Default:** `'\n'`
- **Description:** The line ending character(s) to use in the output TOML. This option affects only the stringification process, not the internal representation (AST).

```js
const format = TomlFormat.default();
format.newLine = '\n';    // Unix/Linux line endings
format.newLine = '\r\n';  // Windows line endings
```

**trailingNewline**
- **Type:** `number`
- **Default:** `1`
- **Description:** The number of trailing newlines to add at the end of the TOML document. This option affects only the stringification process, not the internal representation (AST).

```js
const format = TomlFormat.default();
format.trailingNewline = 0;  // No trailing newline
format.trailingNewline = 1;  // One trailing newline (standard)
format.trailingNewline = 2;  // Two trailing newlines (adds extra spacing)
```

**trailingComma**
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Whether to add trailing commas after the last element in arrays and inline tables.

```js
const format = TomlFormat.default();
format.trailingComma = false;  // [1, 2, 3] and { x = 1, y = 2 }
format.trailingComma = true;   // [1, 2, 3,] and { x = 1, y = 2, }
```

**bracketSpacing**
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Whether to add spaces after opening brackets/braces and before closing brackets/braces in arrays and inline tables.

```js
const format = TomlFormat.default();
format.bracketSpacing = true;   // [ 1, 2, 3 ] and { x = 1, y = 2 }
format.bracketSpacing = false;  // [1, 2, 3] and {x = 1, y = 2}
```

**inlineTableStart**
- **Type:** `number` (optional)
- **Default:** `1`
- **Description:** The nesting depth at which new tables should start being formatted as inline tables. When adding new tables during patching or stringifying objects, tables at depth bigger or equal to `inlineTableStart` will be formatted as inline tables, while tables at depth smaller than `inlineTableStart` will be formatted as separate table sections. Note that a table at the top-level of the TOML document is considered to have a depth of 0.

```js
const format = TomlFormat.default();
format.inlineTableStart = 0;  // All tables are inline tables including top-level
format.inlineTableStart = 1;  // Top-level tables as sections, nested tables as inline (default)
format.inlineTableStart = 2;  // Two levels as sections, deeper nesting as inline
```

Example with `inlineTableStart = 0`:
```js
// With inlineTableStart = 0, all tables become inline
const format = TomlFormat.default();
format.inlineTableStart = 0;
stringify({ database: { host: 'localhost', port: 5432 } }, format);
// Output: database = { host = "localhost", port = 5432 }
```

Example with `inlineTableStart = 1` (default):
```js
// With inlineTableStart = 1, top-level tables are sections
const format = TomlFormat.default();
format.inlineTableStart = 1;
stringify({ database: { host: 'localhost', port: 5432 } }, format);
// Output:
// [database]
// host = "localhost"
// port = 5432
```

**truncateZeroTimeInDates**
- **Type:** `boolean`
- **Default:** `false`
- **Description:** When `true`, JavaScript Date objects with all time components set to zero (midnight UTC) are automatically serialized as date-only values in TOML. This only affects new values during stringify operations; existing TOML dates maintain their original format during patch operations.

```js
const format = TomlFormat.default();
format.truncateZeroTimeInDates = false;  // new Date('2024-01-15T00:00:00.000Z') → 2024-01-15T00:00:00.000Z
format.truncateZeroTimeInDates = true;   // new Date('2024-01-15T00:00:00.000Z') → 2024-01-15
```

Example with mixed dates:
```js
import { stringify, TomlFormat } from '@decimalturn/toml-patch';

const format = TomlFormat.default();
format.truncateZeroTimeInDates = true;

const data = {
  startDate: new Date('2024-01-15T00:00:00.000Z'),  // Will be: 2024-01-15
  endDate: new Date('2024-12-31T23:59:59.999Z')     // Will be: 2024-12-31T23:59:59.999Z
};

stringify(data, format);
// Output:
// startDate = 2024-01-15
// endDate = 2024-12-31T23:59:59.999Z
```

**minimumDecimals**
- **Type:** `number` (optional)
- **Default:** `0`
- **Description:** The minimum number of decimal places to use when serializing JS numbers as TOML floats. When greater than `0`, plain JS integer values are serialized as TOML floats padded with zeros to reach the specified decimal count. `bigint` values are always serialized as TOML integers regardless of this setting.

```js
const format = TomlFormat.default();
format.minimumDecimals = 0;  // { x: 1, y: 1.5 }  →  { x = 1, y = 1.5 }  (default)
format.minimumDecimals = 1;  // { x: 1, y: 1.5 }  →  { x = 1.0, y = 1.5 }
format.minimumDecimals = 2;  // { x: 1, y: 1.5 }  →  { x = 1.00, y = 1.50 }
```

### Auto-Detection and Patching

The `TomlFormat.autoDetectFormat()` method analyzes existing TOML strings to automatically detect and preserve their current formatting. If you don't supply the `format` argument when patching an existing document, this is what will be used to determine the formatting to use when inserting new elements.

Note that formatting of existing elements of a TOML string won't be affected by the `format` passed to  `patch()` except for `newLine` and `trailingNewline` which are applied at the document level.


### Complete Example

Here's a comprehensive example showing different formatting configurations:

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

// Compact formatting (minimal whitespace)
const compact = TomlFormat.default();
compact.bracketSpacing = false;
compact.trailingNewline = 0;

console.log(stringify(data, compact));
// Output:
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

// Spacious formatting (with trailing commas and extra spacing)
const spacious = TomlFormat.default();
spacious.trailingComma = true;
spacious.bracketSpacing = true;
spacious.trailingNewline = 2;

console.log(stringify(data, spacious));
// Output:
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
// 
// 

// Windows-style formatting
const windows = TomlFormat.default();
windows.newLine = '\r\n';
windows.bracketSpacing = false;
windows.trailingNewline = 1;

console.log(stringify(data, windows));
// Same structure as compact but with \r\n line endings
```

### Legacy Format Objects

For backward compatibility, you can still use anonymous objects for formatting options.
```js
// Legacy approach (still supported)
const result = stringify(data, {
  trailingComma: true,
  bracketSpacing: false
});

// Recommended approach
const format = TomlFormat.default();
format.trailingComma = true;
format.bracketSpacing = false;
const result = stringify(data, format);
```

## Changelog

For a detailed history of changes, see the [CHANGELOG](CHANGELOG.md).

## Contributing

We welcome contributions! Please see the [CONTRIBUTING](CONTRIBUTING.md) guide for details on how to get started, development workflow, and pull request requirements.
