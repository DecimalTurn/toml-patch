# toml-patch

[![NPM Version](https://img.shields.io/npm/v/%40decimalturn%2Ftoml-patch?logo=npm&logoColor=white&labelColor=red&color=blue)](https://www.npmjs.com/package/@decimalturn/toml-patch)
[![JSR Version](https://img.shields.io/jsr/v/%40decimalturn/toml-patch?logo=jsr&color=blue)](https://jsr.io/@decimalturn/toml-patch)
[![GitHub branch status](https://img.shields.io/github/check-runs/DecimalTurn/toml-patch/latest)](https://github.com/DecimalTurn/toml-patch/actions/workflows/test-and-build.yml)

Patch, parse, and stringify [TOML](https://toml.io/en/) while preserving comments and formatting.

Note that this is a maintenance fork of the original toml-patch package. This fork aims at addressing existing issues from the original project and perform dev-dependencies updates. 
Hopefully, the work done here can go upstream one day if timhall returns, but until then, welcome aboard![^1]

## Installation

toml-patch is dependency-free and can be installed via npm or yarn.

```
$ npm install --save @decimalturn/toml-patch
```

For browser usage, you can use unpkg:

```html
<script src="https://unpkg.com/@decimalturn/toml-patch"></script>
```

## API

<a href="#patch" name="patch">#</a> <b>patch</b>(<i>existing</i>, <i>updated</i>)

Patch an existing TOML string with the given updated JS/JSON value, while attempting to retain the format of the existing document, including comments, indentation, and structure.

```js
const TOML = require('@decimalturn/toml-patch');
const assert = require('assert');

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

<a href="#parse" name="parse">#</a> <b>parse</b>(<i>value</i>)

Parse a TOML string into a JS/JSON value.

```js
const TOML = require('@decimalturn/toml-patch');
const assert = require('assert');

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

<a href="#stringify" name="stringify">#</a> <b>stringify</b>(<i>value</i>[, <i>options</i>])

Convert a JS/JSON value to a TOML string. `options` can be provided for high-level formatting guidelines that follows prettier's configuration.

<b>options</b>

- `[printWidth = 80]` - (coming soon)
- `[trailingComma = false]` - Add trailing comma to inline tables
- `[bracketSpacing = true]` - `true`: `{ key = "value" }`, `false`: `{key = "value"}`

```js
const TOML = require('@decimalturn/toml-patch');
const assert = require('assert');

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

## Development

1. Update submodules: `git submodule update --remote`
2. Typecheck: `npm run typecheck`
3. Build: `npm run build`
4. Test: `npm test`
5. Specs compliance: `npm run specs`
6. Benchmark: `npm run benchmark [<filter>] [--help] [--example] [--reference]`

[^1]: Tim Hall has been inactive on most of his open source projects for more than 3 years. The sentence wording was inspired by the npm-run-all2 project.
