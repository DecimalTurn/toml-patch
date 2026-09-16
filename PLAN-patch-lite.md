 # Patch-lite distribution plan

 ## Goal

 Add a small distribution for applications that only need to update existing TOML values, such as changing a package version or another generated string.

 The lite distribution must not include the full patch feature set. It should reject every change except an edit to an existing value and should preserve all source text outside the edited value.

 The existing `patch()` API and full distribution remain unchanged.

 ## Proposed API

 Publish the lite distribution as a separate package subpath:

 ```ts
 import patchLite from '@decimalturn/toml-patch/lite';

 const updated = patchLite(existingToml, updatedObject);
 ```

 Use the same `(existing, updated)` signature as `patch()` for the first version. This lets callers prepare the updated object with the existing parser or their own data model while keeping the lite behavior easy to understand.

 Do not re-export `patchLite` from the root entrypoint. A root export could pull the lite code into the main bundle and weaken the size separation.

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

 ### 1. Add an edit-only diff

 Create `src/diff-lite.ts` instead of importing the full `src/diff.ts`.

 Recursively compare the existing and updated JavaScript values:

 - identical primitive values produce no change
 - different supported leaf values produce `{ type: 'Edit', path }`
 - objects must have the same keys
 - arrays must have the same length and element positions
 - containers must retain their original type
 - any structural difference throws

 Do not modify the public `Change` union or the behavior of the full diff implementation.

 ### 2. Add a dedicated patch-lite engine

 Create `src/patch-lite.ts` as the public entrypoint.

 The implementation should:

 1. Strip and remember a leading BOM.
 2. Parse the existing TOML into enough CST information to locate value spans.
 3. Convert the existing TOML into JavaScript values for comparison.
 4. Run the edit-only diff and validate every edit.
 5. Resolve every edit path to an existing CST value.
 6. Encode each replacement value with a small value encoder.
 7. Convert CST line and column locations to source offsets.
 8. Apply replacements from the end of the source toward the beginning.
 9. Restore the BOM.

 Avoid importing the full patch pipeline where possible. In particular, the lite entrypoint should not depend on:

 - `src/patch.ts`
 - `src/diff.ts`
 - `src/parse-js.ts`
 - `src/formatter.ts`
 - `src/comment-ownership.ts`
 - `src/comment-alignment.ts`
 - the structural mutation and offset machinery in the full writer pipeline

 The first prototype may reuse the TOML parser and `toJS()` if that gives better correctness. Measure the resulting bundle before deciding whether a smaller scanner or value parser is needed.

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

 Update `tsdown.config.ts` with a second production entry:

 ```ts
 entry: {
	 'toml-patch': 'src/index.ts',
	 'patch-lite': 'src/patch-lite.ts',
 }
 ```

 Add a matching declaration and import entry to `package.json`:

 ```json
 "./lite": {
	 "types": "./dist/patch-lite.d.ts",
	 "import": "./dist/patch-lite.js",
	 "default": "./dist/patch-lite.js"
 }
 ```

 Include `dist/patch-lite.*` in the published package while preserving the current root export.

 Add a browser import example using the generated `dist/patch-lite.js` file if the package documents direct browser imports.

 ## Tests

 Add `src/__tests__/patch-lite.test.ts` with focused coverage for:

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

 Keep the existing full patch tests unchanged. Add tests for shared parser or encoder helpers only when the helpers are public or independently reusable.

 ## Size measurement

 Extend the bundle-size check to report both `dist/toml-patch.js` and `dist/patch-lite.js`.

 Report at least:

 - minified byte count
 - gzip byte count
 - percentage of the full bundle

 Establish a measured baseline after the first implementation and set a hard lite budget in CI. The budget should be based on the actual use case rather than an arbitrary percentage. Any new dependency imported by `patch-lite.ts` should be reviewed against that budget.

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

 1. Record the current production bundle sizes.
 2. Define the supported value types and error contract.
 3. Implement `diff-lite.ts` and its unit tests.
 4. Implement the small value encoder and its unit tests.
 5. Implement `patch-lite.ts` using the existing parser and CST locations.
 6. Add the focused patch-lite behavior tests.
 7. Add the production build entry and package export.
 8. Build and measure raw and gzip sizes.
 9. Remove unnecessary imports or replace shared helpers if the size budget is not met.
 10. Run the full existing test suite, typecheck, lint, and package/export smoke tests.
 11. Update the README and API documentation with the final behavior and measured size.

 ## Acceptance criteria

 - `@decimalturn/toml-patch/lite` imports successfully in Node and browser-oriented ESM builds.
 - The lite function changes only existing values.
 - Every unsupported structural change throws before output is returned.
 - Existing comments, whitespace, line endings, and BOM handling pass the focused tests.
 - The root `patch()` behavior and bundle remain unchanged.
 - The lite bundle meets the agreed minified and gzip size budgets.
 - Type declarations expose only the lite entrypoint API.
