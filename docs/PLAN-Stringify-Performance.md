# Plan: faster stringify for the default-format case

## Goal

Speed up `stringify(value)` when no formatting options are passed, which is the common case, without changing the produced TOML. toml-patch stringify is currently ~30-40x slower than smol-toml on the 5 MB fixture. The first and largest win is a sequential emitter for generated CSTs that avoids coordinate painting.

## Current behavior

`stringify(value, format?)` runs two passes.

1. `parseJS(value, fmt)` builds a generated `Document` CST. Every node is routed through the patch writer (`insert` + `applyWrites`, plus `applyBracketSpacing` and `applyTrailingComma`) and then through four full-tree formatting passes (`formatTopLevel`, `formatNestedTablesMultiline`, `normalizeGeneratedInlineRows`, `formatEmptyLines`).
2. `toTOML(cst, fmt)` (the default export) serializes by coordinate painting. Each node is written with `write(lines, loc, raw)` or `writeSingle(...)`, which does `substring` + `padEnd` + concatenation per node and rebuilds each line string once per node written to it. For the ~400k-node fixture this is the dominant cost.

The source-aware emitter (`toTOMLCursor`) is used by `patch()`, not by `stringify()`, so the source-copy machinery (`getNodeSource`, `range`, `sourceSubtreeReusable`) is not part of this problem.

## Proposed changes, in order of impact

1. **Sequential emitter for generated CSTs.** Add a fast serialization path that walks the generated tree in order and appends raw content plus delimiters (`=`, `,`, `[`, `]`, `{`, `}`) to a buffer, tracking indentation and newlines explicitly, instead of painting text at recorded `loc` coordinates. This is used when the CST has no source attached, which is always the case for `stringify()`. It removes per-node `substring`/`padEnd`/concat and the `lines[]` join. Output must stay byte-identical to `toTOML` for generated CSTs.

2. **Reuse a frozen default format.** `resolveTomlFormat(format, TomlFormat.default())` allocates and merges a new object on every call. Return a shared frozen singleton when `format` is undefined. Cheap and removes allocation plus property copies on the hot path.

3. **Skip no-op formatting passes under default format.** With defaults (`inlineTableStart = 1`, `multilineTable`/`multilineArray = 'auto'`, no `updateOrder`), several `parseJS` passes traverse the whole tree doing little work. Guard them so they are skipped, or folded into the generation walk, when the format equals defaults.

4. **Generate positions directly instead of routing through `insert`/`applyWrites`.** Stringify has no existing document to reconcile against, so positions can be assigned inline while walking the object. This removes an entire layer of per-node shift and write work but is a larger refactor of `parseJS`.

5. **(Stretch) Direct JS-to-TOML writer without a CST.** Serialize straight from the JS object, as smol-toml does. Fastest possible, but it duplicates string, date, key quoting and table-nesting logic that currently lives in `generate.ts` and `parseJS`, so it has the highest risk of behavioral drift.

## Status

- Done: changes 1, 2 and 3.
- Change 4, partly: profiling showed the dominant stringify-generation cost was the writer's dirty tracking (`setDirty` via `Object.defineProperty`, `markMutation`, `linkParents`, `markSubtreeDirty`) rather than `insert`/`applyWrites` position math. `insert`/`remove`/`replace` now skip `markMutation` when the root is a stringify root, and every generated container is marked as one. Compact generated inline arrays and tables now place their children directly with `shiftNode`, avoiding nested `insert`/`applyWrites` calls. Multiline containers and table extraction still use the existing writer machinery. A fully direct position-generation path would remove the remaining `applyWrites`/`shiftNode`/`move` work.

## Scope

In scope:

- `stringify()` with no format argument, and with default-equivalent formats.
- Byte-identical output to the current `toTOML` coordinate painter for generated CSTs.
- Exact-output and parse round-trip tests for the fast path.
- Measurement via `pnpm run benchmark:smol` and `pnpm run bench:stringify`.

Out of scope:

- `patch()` and `TomlDocument.patch()`, which keep the source-aware emitters.
- Any change to formatting behavior or output.
- Non-default options such as `updateOrder`, `useTabsForIndentation`, `multilineTable`/`multilineArray` set to non-default values; these may fall back to the current path initially.

## Approach for change 1

- Add a new serializer (for example `toTOMLSequential` in `to-toml.ts`) that emits in structural order rather than by coordinates.
- Detect the applicable case by the root being a stringify root (`markStringifyRoot` already marks `parseJS` roots) or, more generally, by the CST having no source attached (`getNodeSource(root) === undefined`).
- Have `stringify()` call the fast serializer; keep `toTOML` as the reference and for every other caller.
- Multiline arrays and tables carry their structural newlines and indentation as gaps between recorded positions today. The sequential emitter must reproduce those gaps explicitly, which is the main correctness risk. A first implementation may fall back to coordinate painting when it encounters a multiline container and only fast-path compact single-line documents, then extend coverage.

## Validation

- The full existing suite must pass unchanged.
- New tests compare the fast-path output against `toTOML` output over a corpus of JS objects: nested tables, arrays of tables, arrays of objects, multiline strings, dates, bigints, floats, quoted keys, and empty containers.
- Compare `bench:stringify` and `benchmark:smol` stringify numbers before and after.
