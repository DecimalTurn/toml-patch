# Plan: Make @decimalturn/toml-patch tree-shakable

## Motivation

Currently, `@decimalturn/toml-patch` ships a single entry point (`dist/toml-patch.js`) that bundles all functionality into one file. A consumer that only needs `parse` + `patch` (like confbox) still pulls in `TomlDocument`, `stringify` formatting logic, and other code they never call.

By restructuring the build to support tree-shaking, bundlers like rollup, webpack, and esbuild can eliminate unused code paths, reducing the effective size for consumers.

## Current state

### Single entry point

```
src/index.ts  →  dist/toml-patch.js  (67.6 kB minified, 18.2 kB gzipped)
```

### Exports from index.ts

| Export | Type | Used by confbox? |
|--------|------|------------------|
| `parse` | function | Yes |
| `stringify` | function | Possibly (without C&F) |
| `patch` | function | Yes (for C&F stringify) |
| `TomlFormat` | class | Maybe |
| `TomlDocument` | class | No |

### Internal dependency graph (key modules)

```
parse()     → parse-toml (1750 lines) → tokenizer, parse-string, cursor, location, parse-error
            → to-js (383 lines)       → ast, utils, parse-error

stringify() → parse-js (161 lines)    → ast, toml-format, utils, writer
            → to-toml (308 lines)     → location, tokenizer, toml-format, utils

patch()     → parse-toml, parse-js, to-js, to-toml, toml-format, ast, diff, find-by-path,
              utils, writer, generate, validate, date-format  (13 internal imports, 502 lines)

TomlDocument → parse-toml, to-toml, to-js, toml-format, ast, patch, truncate (174 lines)
```

### Circular dependency

- `toml-format` ↔ `generate` — these import each other. This **blocks** tree-shaking because bundlers cannot split a cycle without including both sides.

## Plan

### Phase 1: Fix the circular dependency (prerequisite)

**`toml-format.ts` ↔ `generate.ts`**

1. Audit what `toml-format` imports from `generate` and vice versa.
2. Extract the shared types/functions into a new module (e.g., `format-utils.ts`) that both can import without a cycle.
3. Alternatively, inline the small pieces one side needs from the other.
4. Verify no cycle exists after the change using a tool like `madge --circular src/`.

### Phase 2: Add `sideEffects: false` to package.json

This tells bundlers that all modules are safe to tree-shake:

```json
{
  "sideEffects": false
}
```

This is safe because toml-patch has no top-level side effects (no global mutations, no polyfills).

### Phase 3: Switch from single bundled output to preserved modules

Currently rollup bundles everything into one file, which removes the module boundaries that tree-shaking relies on.

**Option A: Ship unbundled ES modules (recommended)**

Change the rollup config to preserve the module structure:

```js
// rollup.config.js
{
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
    entryFileNames: '[name].js',
  },
  plugins: [typescript()] // no terser — let consumer's bundler minify
}
```

This produces `dist/index.js`, `dist/parse-toml.js`, `dist/patch.js`, etc. — each as a separate ES module.  Consumers' bundlers can then import only `parse` and only pull in the modules that `parse()` actually depends on.

**Option B: Multiple explicit entry points**

Add separate entry points for different use cases:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./parse": {
      "import": "./dist/parse.js",
      "types": "./dist/parse.d.ts"
    },
    "./patch": {
      "import": "./dist/patch-entry.js",
      "types": "./dist/patch-entry.d.ts"
    },
    "./stringify": {
      "import": "./dist/stringify.js",
      "types": "./dist/stringify.d.ts"
    }
  }
}
```

This requires creating thin entry files:
- `src/parse-entry.ts` — exports only `parse`
- `src/patch-entry.ts` — exports only `patch` and `TomlFormat`
- `src/stringify-entry.ts` — exports only `stringify` and `TomlFormat`

Option A and B are not mutually exclusive — combined they give the best results.

### Phase 4: Validate tree-shaking effectiveness

Write a test script that bundles a minimal consumer with rollup/esbuild and measures the output size:

```js
// test-tree-shake.mjs
// Simulate a consumer that only imports parse + patch
import { parse, patch } from '@decimalturn/toml-patch';
```

Then compare:
- Full bundle (all exports): should stay ~67.6 kB min
- `parse` only: expected ~40-45 kB min (parse-toml + to-js + deps)
- `parse` + `patch`: expected ~60-62 kB min (most of the lib, minus TomlDocument/truncate)
- `stringify` only: expected ~30-35 kB min (parse-js + to-toml + deps)

### Phase 5: Update TypeScript declarations

If using `preserveModules`, the `rollup-plugin-dts` config should also emit per-module `.d.ts` files:

```js
{
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  plugins: [dts()]
}
```

## Estimated size savings for confbox

confbox only needs `parse` + `patch` (and transitively `stringify` via `patch`). The main code that becomes droppable is:

| Module | Lines | Droppable? |
|--------|-------|-----------|
| `toml-document.ts` | 174 | Yes — not used by confbox |
| `truncate.ts` | 121 | Yes — only used by TomlDocument |
| Parts of `toml-format.ts` | ~771 | Partially — TomlFormat class is used, but format detection from existing docs may be droppable |

Conservative estimate: **~2-4 kB** minified savings for confbox's use case. The savings are modest because `patch()` already pulls in most of the library. However, the bigger win is that **other consumers** who only need `parse` or only need `stringify` would see significant savings (~25-35 kB minified).

## Task summary

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Break `toml-format` ↔ `generate` cycle | Medium | Prerequisite |
| 2 | Add `sideEffects: false` to package.json | Trivial | Enables tree-shaking |
| 3 | Switch to `preserveModules` in rollup | Small | Core change |
| 4 | (Optional) Add sub-path exports | Small | Better DX for targeted imports |
| 5 | Validate with tree-shake size test | Small | Verification |
| 6 | Update .d.ts generation | Small | TypeScript support |
