# toml-patch

[![NPM Version](https://img.shields.io/npm/v/%40decimalturn%2Ftoml-patch?logo=npm&logoColor=white&labelColor=red&color=blue)](https://www.npmjs.com/package/@decimalturn/toml-patch)
[![JSR Version](https://img.shields.io/jsr/v/%40decimalturn/toml-patch?logo=jsr&color=blue)](https://jsr.io/@decimalturn/toml-patch)
[![GitHub branch status](https://img.shields.io/github/check-runs/DecimalTurn/toml-patch/latest)](https://github.com/DecimalTurn/toml-patch/actions/workflows/test-and-build.yml)

Patch, parse, and stringify [TOML](https://toml.io/en/) while preserving comments and formatting.

Note that this is a maintenance fork of the original toml-patch package. This fork aims at addressing existing issues from the original project, add small to medium sized features and perform dev-dependencies updates. 
Hopefully, the work done here can go upstream one day if timhall returns, but until then, welcome aboard![^1]


**What's New in v0.4.0:**
- **TomlDocument class**: A new document-oriented API for stateful TOML manipulation
- **TomlFormat class**: A class encapsulating all TOML formatting options
- **TOML date patching support**: You can now safely patch/update a date value inside a TOML document and preserve the original formatting.

Note: The functional API (`patch`, `parse`, `stringify`) remains fully compatible with previous versions. The new `TomlDocument` class is an additive feature that doesn't break existing code. You can also still use anonymous objects to pass in formatting options. Globally, v0.4.0 shouldn't introduce any breaking changes.

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
    - [When to Use](#when-to-use-tomldocument-vs-functional-api)
  - [Formatting](#formatting)
    - [TomlFormat Class](#tomlformat-class)
    - [Basic Usage](#basic-usage)
    - [Formatting Options](#formatting-options)
    - [Auto-Detection and Patching](#auto-detection-and-patching)
    - [Complete Example](#complete-example)
    - [Legacy Format Objects](#legacy-format-objects)
- [Development](#development)


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

#### patch(*existing*, *updated*, *format?*)

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

#### parse(*value*)

```typescript
function parse(value: string): any
```

Parses a TOML string into a JavaScript object. The function converts TOML syntax to its JavaScript equivalent. This proceeds in two steps: first, it parses the TOML string into an abstract syntax tree (AST), and then it converts the AST into a JavaScript object.

**Parameters:**
- `value: string` - The TOML string to parse

**Returns:** `any` - The parsed JavaScript object

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

#### stringify(*value*, *format?*)

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

- `[trailingComma = false]` - Add trailing comma to inline tables
- `[bracketSpacing = true]` - `true`: `{ key = "value" }`, `false`: `{key = "value"}`

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
new TomlDocument(tomlString: string)
```

Initializes the TomlDocument with a TOML string, parsing it into an internal representation (AST).

**Parameters:**
- `tomlString: string` - The TOML string to parse

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
- `toTomlString: string` - Returns the TOML string representation (cached for performance)

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

#### When to use TomlDocument vs Functional API

| Use Case | TomlDocument | Functional API |
|----------|-------------|----------------|
| Multiple operations on same document | ✅ Preferred | ❌ Inefficient |
| One-time parsing/patching | ⚠️ Overkill | ✅ Preferred |
| Incremental text updates | ✅ `update()` method | ❌ Not supported |
| Preserving document state | ✅ Built-in | ❌ Manual |
| Working with large files | ✅ Better performance | ❌ Re-parses entirely |

### Formatting

The `TomlFormat` class provides comprehensive control over how TOML documents are formatted during stringification and patching operations. This class encapsulates all formatting preferences, making it easy to maintain consistent styling across your TOML documents.

#### TomlFormat Class

```typescript
class TomlFormat {
  newLine: string
  trailingNewline: number
  trailingComma: boolean
  bracketSpacing: boolean
  inlineTableStart?: number
  
  static default(): TomlFormat
  static autoDetectFormat(tomlString: string): TomlFormat
}
```

#### Basic Usage

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

#### Formatting Options

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

#### Auto-Detection and Patching

The `TomlFormat.autoDetectFormat()` method analyzes existing TOML strings to automatically detect and preserve their current formatting. If you don't supply the `format` argument when patching an existing document, this is what will be used to determine the formatting to use when inserting new elements.

Note that formatting of existing elements of a TOML string won't be affected by the `format` passed to  `patch()` except for `newLine` and `trailingNewline` which are applied at the document level.


#### Complete Example

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

#### Legacy Format Objects

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

## Development

1. Update submodules: `git submodule update --remote`
2. Typecheck: `npm run typecheck`
3. Build: `npm run build`
4. Test: `npm test`
5. Specs compliance: `npm run specs`
6. Benchmark: `npm run benchmark`

[^1]: Tim Hall has been inactive on most of his open source projects for more than 3 years. The sentence wording was inspired by the npm-run-all2 project.
