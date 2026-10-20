# Plan: simplify parser validation state



## Goal

Replace the parallel validation collections in `src/to-js.ts` with one metadata tree that mirrors TOML key paths. Keep `parse-toml.ts`, the CST, source positions, comments, and patch behavior unchanged.

`smol-toml` is a useful reference because it validates paths against a metadata tree as it builds the result object. Each table-array node tracks its entries separately, so a header after an unrelated section can still resolve against the correct latest AOT entry. Our converter walks an existing CST rather than source text, so reuse the metadata idea, not its parser loop.

## Current state

`toJS` currently combines these collections and lookups:

- `defined` detects paths that cannot be assigned again.
- `implicit_tables` tracks parents created by dotted keys.
- `inline_tables` enforces inline-table immutability.
- `table_arrays` distinguishes AOTs from static arrays and supports AOT path traversal.
- `tableScopes` associates explicit tables with root or AOT ownership.

These structures encode overlapping facts about the same paths. Their separate update rules make it easy for a validation check to lose the relevant scope when headers are non-contiguous.

## Proposed model

Add a private `PathState` tree. A node represents one decoded key segment and contains its child nodes plus definition metadata. A possible shape is:

```ts
type PathState = {
	kind: 'undefined' | 'implicit' | 'explicit' | 'array' | 'inline';
	defined: boolean;
	children: Map<string, PathState>;
	entries?: PathState[];
};
```

The root is a `PathState`. For an ordinary table, its descendants live under that path. For an AOT, `entries` stores one child-state root per `[[table]]` occurrence. Walking through an AOT path selects its latest entry, matching TOML header semantics even when unrelated tables appear between headers. Nested AOTs repeat the same structure.

The metadata tree is authoritative for validation. The result object remains the destination for values and retains the current behavior of `ensureTable`, `ensureTableArray`, and `toValue`. Use decoded string segments as map keys. Do not use dot-joined strings, since distinct TOML paths can have the same joined representation.

## Rule mapping

Move checks onto `PathState` incrementally:

1. Duplicate values and table redefinitions consult `defined` and `kind` on the target node.
2. Dotted keys mark missing parent nodes `implicit`; later headers cannot redefine those nodes.
3. Explicit-table extension checks inspect the resolved node in the current table or latest AOT entry.
4. AOT traversal checks `kind === 'array'` on intermediate path nodes.
5. Inline-table immutability checks `kind === 'inline'` for the target and its ancestors.

Keep the existing error messages and source pointers. Separate path resolution from rule checks so each rule receives the same resolved node rather than reimplementing scope selection.

## Implementation sequence

1. Add `PathState` and helpers to create, walk, and resolve nodes. Initially keep the old collections and assert that both representations agree in focused tests.
2. Move duplicate and implicit-table checks to the tree. Cover simple tables and dotted keys before changing AOT behavior.
3. Move AOT state into per-entry child roots. Test repeated paths in sibling, nested, and non-contiguous AOT entries, including unrelated headers between them.
4. Move inline-table and array checks. Add cases for static arrays, inline-table immutability, and invalid transitions between table and AOT kinds.
5. Remove the old collections and temporary cross-checks after all rules use the tree.

## Tests and acceptance

Retain the existing tests in `src/__tests__/to-js.test.ts` and add table-driven cases for:

- a dotted key extending an explicit table, both rejected in the same scope and allowed in a separate AOT entry
- a later header returning to an AOT entry after an unrelated table or AOT
- repeated nested AOT keys at two or more levels
- explicit, implicit, and dotted definitions that collide at the same path
- attempts to extend inline tables or traverse through static arrays
- empty-string and literal-dot key segments

For valid documents, assert the complete converted object. For invalid documents, assert the error class and stable message substring. Compare cases with `smol-toml` when the options and supported behavior match. Keep differences between the parsers explicit rather than treating the submodule as the sole oracle.

Run `pnpm run test`, `pnpm run specs`, `pnpm run typecheck`, and `pnpm run lint` at each migration boundary. The refactor is complete when all checks pass, the existing error behavior is preserved, and `toJS` no longer maintains parallel definition sets or separate AOT ownership bookkeeping.

## Scope limits

Do not replace the CST parser, change CST node shapes, or add `smol-toml` as a production dependency. This work changes only semantic validation during CST-to-object conversion. Source parsing, formatting preservation, comments, and patch mutation remain separate responsibilities.