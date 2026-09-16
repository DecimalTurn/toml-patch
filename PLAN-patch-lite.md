 # Patch-lite distribution plan

 ## Decision

 The dedicated edit-only design is the better choice for the byte-size goal. The current implementation is a useful prototype, but it still imports the full `diff`, `parseJS`, `toTOML`, writer, generate, and structural change machinery. Reusing those modules keeps code duplication low but leaves too much code in the lite bundle.

 Current measured baseline:

 - `patch`: about 148.1 kB minified and 45.4 kB gzipped
 - `patch-lite`: about 76.0 kB minified and 23.6 kB gzipped

 The baseline is roughly half the full patch entry, but it is not yet small enough for the intended version-bump and string-edit use case. The final implementation should use a separate edit-only engine, even if that means duplicating a small amount of parsing or serialization logic.

 ## Current implementation

 The branch currently provides:

 - `src/patch-toml-lite.ts` as the implementation
 - `src/patch-lite-entry.ts` as the `patch-lite` build entry
 - `./patch-lite` as a package export
 - `patchLite(existing, existingJs, updated)` as the current prototype API
 - `patchCstLite()` as an additional exported low-level helper
 - two focused tests in `src/__tests__/patch-lite.test.ts`
 - `pnpm run bench:patch-lite` for bundle comparison

 The current implementation still accepts the full diff change categories internally and uses the full structural application path. Treat it as an intermediate implementation, not the final lite architecture.

 ## Goal

 Add a small distribution for applications that only need to update existing TOML values, such as changing a package version or another generated string.

 The lite distribution must not include the full patch feature set. It should reject every change except an edit to an existing value and should preserve all source text outside the edited value.

 The existing `patch()` API and full distribution remain unchanged.

 ## Proposed API

 Publish the final lite distribution as a separate package subpath:

 ```ts
 import patchLite from '@decimalturn/toml-patch/patch-lite';

 const updated = patchLite(existingToml, updatedObject);
 ```

 The target public signature is `(existing, updated)`, matching `patch()`. The current three-argument `(existing, existingJs, updated)` form is an implementation prototype and should not become the published contract unless measuring proves that avoiding the existing-value parse is worth the API cost.

 Do not re-export `patchLite` from the root entrypoint. The current root index does so, which pulls lite code into the main package graph and weakens the size separation. Keep the API available through `./patch-lite` only.

 ## Supported behavior

 The lite function supports:

 - edits to existing scalar values
 - nested value edits
 - edits to existing array elements without changing array length or order
 - multiple edits in one call
 - strings, booleans, numbers, and bigints
 - existing line endings and BOMs
 - comments and whitespace outside replaced value spans
 - no-op updates, which return the original string

 The first implementation should reject container replacement. An edit must not replace a scalar with an array, table, or inline table, or replace a container with a scalar.

 Date and time values should be supported only if they can be encoded without importing the full formatting pipeline. Otherwise reject them with a clear error and document the restriction.

 ## Rejected behavior

 Validate the complete update before changing the source. If validation fails, the function must throw and must not return a partially modified TOML string.

 Reject:

 - added keys
 - removed keys
 - added or removed array elements
 - array reordering
 - object-key reordering
 - key renames
 - scalar/container type changes
 - edits to paths that do not exist in the source
 - unsupported value types

 Errors should identify the unsupported operation and, where possible, the affected path. Keep the error messages stable enough for callers to test them without depending on internal parser details.

 ## Architecture

 ### 1. Replace the full diff with an edit-only comparator

 Create `src/diff-lite.ts` or an equivalent private comparator instead of importing `src/diff.ts`.

 Recursively compare the existing and updated JavaScript values:

 - identical primitive values produce no change
 - different supported leaf values produce `{ type: 'Edit', path }`
 - objects must have the same keys
 - arrays must have the same length and element positions
 - containers must retain their original type
 - any structural difference throws

 Do not modify the public `Change` union or the behavior of the full diff implementation.

 ### 2. Replace the prototype with a dedicated patch-lite engine

 Keep `src/patch-lite-entry.ts` as the public build entry, but move the implementation toward a small `patch-lite` module that does not import the full patch pipeline.

 The implementation should:

 1. Strip and remember a leading BOM.
 2. Parse or scan the existing TOML into enough information to locate existing value spans.
 3. Compare the existing values with the updated values using only the edit-only comparator.
 4. Reject every Add, Remove, Move, Rename, missing path, container change, and array shape change before editing.
 5. Resolve each accepted edit path to one existing value span.
 6. Encode each replacement value with a small value encoder.
 7. Convert value locations to source offsets.
 8. Apply replacements from the end of the source toward the beginning.
 9. Restore the BOM and original line-ending convention.

 Avoid importing the full patch pipeline where possible. In particular, the lite entrypoint should not depend on:

 - `src/patch.ts`
 - `src/diff.ts`
 - `src/parse-js.ts`
 - `src/formatter.ts`
 - `src/comment-ownership.ts`
 - `src/comment-alignment.ts`
 - the structural mutation and offset machinery in the full writer pipeline

 The current prototype reuses the full parser, `parseJS`, `toTOML`, writer, and generator. The next implementation should first remove the full diff and structural handlers, then measure again. If the result is still too large, replace CST-to-JavaScript conversion with a purpose-built path/value scanner. Do not preserve a large shared dependency graph merely to avoid a small amount of duplicated code.

 ### 3. Encode replacement values

 Add a small encoder for the supported leaf types. It must produce valid TOML and must not depend on full document formatting options.

 Define the rules before implementation for:

 - basic string escaping
 - booleans
 - decimal integers and bigints
 - finite floats
 - non-finite values if the existing package supports them
 - date/time values, if supported

 The encoder should replace only the value span. It must not regenerate the key, equals sign, inline comment, surrounding spaces, or neighboring values.

 ## Build and package changes

 The current production entries in `tsdown.config.ts` are:

 ```ts
 entry: {
	 'toml-patch': 'src/toml-patch.ts',
	 patch: 'src/patch-entry.ts',
	 'patch-lite': 'src/patch-lite-entry.ts',
	 format: 'src/format-entry.ts',
 }
 ```

 Add a matching declaration and import entry to `package.json`:

 ```json
 "./patch-lite": {
	 "types": "./dist/patch-lite.d.ts",
	 "import": "./dist/patch-lite.js",
	 "default": "./dist/patch-lite.js"
 }
 ```

 The package currently publishes `dist/toml-patch.*`, `dist/patch.*`, `dist/patch-lite.*`, and `dist/format.*`. Keep the lite entry out of the root export and verify that the root bundle does not pull it in.

 Add a browser import example using the generated `dist/patch-lite.js` file if the package documents direct browser imports.

 ## Tests

 Expand `src/__tests__/patch-lite.test.ts`, which currently has only two tests, with focused coverage for:

 - top-level string edits
 - version-like string edits
 - numbers, booleans, and bigints
 - nested table values
 - existing array element edits
 - multiple edits
 - multiline input
 - LF and CRLF input
 - input with a leading BOM
 - inline comments and surrounding whitespace remaining byte-for-byte unchanged
 - no-op updates returning the original string
 - added keys throwing
 - removed keys throwing
 - array length changes throwing
 - array reordering throwing
 - key renames throwing
 - scalar/container changes throwing
 - missing paths throwing
 - unsupported value types throwing
 - no output being produced after a validation failure
 - the public `(existing, updated)` signature
 - rejection of every non-Edit change before source mutation

 Keep the existing full patch tests unchanged. Add tests for shared parser or encoder helpers only when the helpers are public or independently reusable.

 ## Size measurement

 The repository now has `benchmark/patch-lite-bundle-size.mjs`, exposed as `pnpm run bench:patch-lite`. It compares bundled minified and gzip sizes for `dist/patch.js` and `dist/patch-lite.js` and writes `benchmark/patch-lite-bundle-size.md`.

 Report at least:

 - minified byte count
 - gzip byte count
 - percentage of the full bundle

 The current baseline is about 76.0 kB minified and 23.6 kB gzipped for patch-lite. Set a hard lower budget after the dedicated edit-only prototype is measured. The budget should reflect the intended small version-bump tool, not merely a percentage reduction from the full patch bundle.

 The size check must confirm that importing the lite subpath does not include the full add, remove, move, rename, formatting, or comment-alignment implementation.

 ## Documentation

 Add a short README and API documentation section that explains:

 - how to import the lite distribution
 - that it edits existing values only
 - which structural changes throw
 - that comments and formatting outside edited values remain untouched
 - that the full `patch()` API is required for additions, removals, moves, renames, and advanced formatting

 Include one version-bump example.

 ## Implementation order

 1. Keep the current benchmark as the baseline.
 2. Freeze the supported value types and error contract.
 3. Add rejection tests proving that only Edit changes are accepted.
 4. Implement the edit-only comparator without importing `src/diff.ts`.
 5. Implement the small value encoder and its tests.
 6. Replace the prototype's structural application path with direct existing-value replacements.
 7. Remove `patchLite` from the root export and keep `./patch-lite` as the only public lite entry.
 8. Build and measure the new entry with `pnpm run bench:patch-lite`.
 9. If it remains too large, replace full CST-to-JS conversion with a small scanner rather than adding more tree-shaking exceptions.
 10. Run typecheck, focused tests, full regression tests, lint, and package/export smoke tests.
 11. Update the README and API documentation with the final signature, restrictions, and measured size.

 ## Acceptance criteria

 - `@decimalturn/toml-patch/patch-lite` imports successfully in Node and browser-oriented ESM builds.
 - The public lite function uses the same two-argument shape as `patch()`.
 - The lite function changes only existing values.
 - Every unsupported structural change throws before output is returned.
 - Existing comments, whitespace, line endings, and BOM handling pass the focused tests.
 - The root `patch()` behavior and bundle remain unchanged.
 - The lite bundle is materially smaller than the current 76.0 kB / 23.6 kB baseline and meets the agreed minified and gzip size budgets.
 - Type declarations expose only the lite entrypoint API.
