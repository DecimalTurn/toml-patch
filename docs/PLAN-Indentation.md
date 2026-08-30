# Plan: style-aware indentation

## Goal

When `patch()` creates or relocates multiline TOML content, it should preserve the indentation style that the document already uses. A document using two spaces and a document using four spaces should produce different, predictable output. Tabs should remain tabs, and value content inside multiline strings must never be treated as structural indentation.

The main rule is:

> Use the nearest surviving sibling as the strongest evidence. Use document-level formatting only when the local container has no surviving row from which to infer its style.

This keeps local formatting intact without forcing every container in a mixed-style document into one global layout.

## Current behavior

The writer already handles the common case well:

- A new first row in a multiline array or inline table copies the column of the next surviving row.
- Existing rows keep their own columns when they are edited or moved.
- `useTabsForIndentation` is auto-detected.
- The empty-container fallback now uses `TomlFormat.indentWidth`.

The current implementation adds a document-level `indentWidth` with a default of two columns and detects a smallest observed space indentation. This is a useful first step, but the detector and propagation rules need the cases below before the option should be considered complete.

## Where `indentWidth` is used

`patch()` resolves the format against the format detected from the existing document. An explicit `indentWidth` wins over detection. The resolved value is stored as internal metadata on the patch root and is available to the writer when it inserts generated nodes.

For multiline inline arrays and inline tables, the writer checks indentation in this order:

1. If a following row exists, copy that row's absolute column.
2. If the container has a surviving row, use the container's existing local row style for additions.
3. If the container is empty and has no row to copy, calculate a starting column from the closing delimiter and the resolved `indentWidth`.

This means `indentWidth` controls generated rows only when local row evidence is unavailable. It does not reindent existing rows, moved value-content lines, or leading whitespace inside multiline strings. A removed row can also leave its column as local evidence when the same container is populated again in the same patch.

Generated nested inline containers follow the same rule. If a sibling container provides a row template, its relative row indentation wins. If the generated container has no template row, `indentWidth` supplies the indentation step. The setting is therefore most visible when populating an empty multiline array or inline table, including an empty nested container.

Block table and array-of-tables insertion uses line and sibling positions rather than the inline-container fallback above. Their new rows should inherit the surrounding block row style; `indentWidth` should not be described as a global reformatter for those rows.

## Design principles

1. **Preserve local evidence first.** A sibling row, an adjacent comment row, or an enclosing container's established row style outranks the global default.
2. **Separate structure from value text.** Leading spaces in multiline basic/literal string content are data, not indentation.
3. **Treat tabs as a style, not as four or eight spaces.** Structural tab indentation should be copied as tabs. A tab-width setting must not be invented unless the API has a clear need for it.
4. **Do not normalize unrelated formatting.** A patch should not rewrite all indentation merely because one new row was added.
5. **Keep semantic validity independent from presentation.** Every indentation decision must still round-trip through `parse()`.
6. **Make ambiguity conservative.** If the document has conflicting indentation evidence, use the nearest applicable evidence and fall back to the documented default when no local evidence exists.
7. **Keep public API growth deliberate.** `indentWidth` is useful for generated content and explicit caller control, but it should not become a promise that every existing indentation style can be represented by one global number.

## Where indentation matters

### 1. Multiline inline arrays

Cover all of these forms:

- scalar rows:

  ```toml
  values = [
    1,
    2,
  ]
  ```

- arrays nested inside arrays;
- inline tables as array elements;
- multiline strings as array elements;
- arrays whose closing bracket shares the final row;
- arrays whose first row shares the opening-bracket line;
- empty arrays that are later populated;
- removing the first row and moving a survivor into its slot;
- prepending, appending, and inserting in the middle;
- replacing an entire array with a differently sized or differently shaped array.

The first-row path is especially important because it has no previous sibling. If there is a following row, copy its column. If the array is empty, infer the row column from the closing bracket, the enclosing row, and the detected indentation unit.

### 2. Multiline inline tables

Cover:

- ordinary key-value rows;
- dotted keys inside the table;
- nested inline tables;
- nested multiline arrays;
- comments before, after, and between rows;
- trailing commas and no trailing commas;
- braces sharing the first or last row;
- empty tables repopulated after deletion;
- replacing a dotted key or multiline array with an inline table;
- replacing every row in a table while preserving the table's row indentation.

Inline-table rows often live inside a `KeyValue` and may be wrapped in `InlineItem`, so indentation inference must not assume that the immediate CST parent is a block container.

### 3. Table and array-of-tables bodies

Block table rows are not inline-container rows, but new rows still need style preservation:

- `[table]` bodies;
- `[[array]]` bodies;
- nested tables and array-of-tables;
- empty table headers that are later populated;
- new rows after removing all old rows;
- rows added while a sibling section is being removed or reordered;
- comments owned by the row or header;
- dotted key rows inside a table body.

The existing block insertion code uses line positions and leading-line counts. The indentation plan should keep those concerns separate from inline-container column positioning, then add a shared local-indentation helper only where both paths need it.

### 4. Dotted keys and structural replacements

Structural edits are where generated nodes lose the original row context. Cover:

- dotted key to scalar;
- dotted key to array;
- dotted key to inline table;
- dotted key to nested object;
- implicit table to scalar or array;
- array-of-tables to scalar, array, or object;
- replacements under an existing `[table]` or `[[array]]`;
- replacements where the old value was multiline and the new value is single-line;
- replacements where the new value is multiline and the old value was single-line.

Generated replacement values should inherit the indentation context of the row they replace. If the replacement expands into multiple rows, the first row should use the replaced row's column and subsequent rows should use the replacement container's local indentation policy.

### 5. Comments

Comments affect both physical positions and ownership:

- comments inside multiline arrays/tables may be hoisted into the enclosing container;
- a comment may be the only remaining item near an empty container;
- comments can sit on the opening or closing delimiter line;
- a blank line severs ownership but not necessarily indentation style;
- reordering must move comments with their owned rows without changing their columns;
- a new row must not use a comment's column as its row indentation unless the comment is clearly a same-container structural row.

Comment columns are evidence only when the comment is structurally associated with the container. Pinned prose comments must not determine the indentation width.

### 6. Tabs and mixed styles

Support these cases explicitly:

- all structural rows use tabs;
- tabs are used for outer levels and spaces for an inner inline container;
- spaces are used for outer levels and tabs for an inner container;
- a document contains both tabs and spaces because it was assembled from different sources;
- multiline string content begins with tabs or spaces that are part of the value;
- `useTabsForIndentation: true` is explicitly supplied;
- `useTabsForIndentation: false` is explicitly supplied against a tab-indented source.

When the caller explicitly supplies `useTabsForIndentation`, it controls newly generated structural indentation. Existing untouched and relocated value-content lines remain unchanged. When the option is not supplied, local source style should win over the auto-detected document default.

### 7. Multiline strings

Multiline string lines are never structural rows. Tests must prove that indentation detection and tab conversion do not change:

- leading spaces in `"""` content;
- leading tabs in `'''` content;
- blank content lines;
- closing delimiter indentation;
- line-continuation backslash formatting;
- strings nested inside arrays and inline tables.

The detector should inspect CST node types and source locations rather than scanning every indented source line indiscriminately.

## Proposed model

### Document-level format

Keep these format properties distinct:

- `useTabsForIndentation`: whether generated structural indentation uses tabs;
- `indentWidth`: the number of spaces per structural level when spaces are used;
- `newLine`, `trailingNewline`, `trailingComma`, and `bracketSpacing`: independent formatting choices.

`indentWidth` should:

- default to `2`;
- accept a positive integer when supplied explicitly;
- be auto-detected only when the caller did not supply it;
- be passed through `resolveTomlFormat()` without changing existing constructor argument behavior;
- be documented as affecting generated multiline structure, not string content.

Avoid adding `tabWidth` unless a real output requirement appears. Tabs are structural characters and should be copied as tabs rather than converted through a visual tab-stop calculation.

### Detection

Detection should operate on CST-backed structural rows:

1. Walk multiline `InlineArray`, `InlineTable`, `Table`, and `TableArray` containers.
2. For each child row that starts on a later source line, read only the source line's leading structural whitespace.
3. Exclude multiline string content and delimiter-only lines from the sample set.
4. For spaces, collect positive indentation deltas between a container row and its child rows.
5. Choose the smallest repeated positive delta as the document indentation unit.
6. For tabs, record tab style separately and use a logical width of one level.
7. If evidence is absent or contradictory, use the default width of two spaces.

The detector should not simply take the minimum absolute leading-space count. A document may contain a top-level table body at four spaces and an inline table nested beneath a four-space row at eight spaces. The useful value is the repeated delta between structural levels, not the smallest absolute column.

### Local context

Introduce a small internal context object rather than passing several independent values through writer calls. It should eventually carry:

- indentation token or style (`spaces` or `tabs`);
- indentation unit (`indentWidth` for spaces, one logical level for tabs);
- enclosing container start column;
- known sibling row column;
- whether the current row is structural or string content.

The context should be attached to the patch root or passed explicitly to generated-node helpers. WeakMap root metadata is acceptable for the current writer architecture, but it should remain an internal implementation detail.

## Operation matrix

Every operation below needs at least one two-space, four-space, and tab fixture where the operation creates a new row:

| Operation | Array | Inline table | Table body | AOT body | Comments | Structural replacement |
|---|---:|---:|---:|---:|---:|---:|
| edit existing value | yes | yes | yes | yes | yes | no |
| prepend | yes | yes | yes | yes | yes | no |
| append | yes | yes | yes | yes | yes | no |
| middle insert | yes | yes | yes | yes | yes | no |
| remove first | yes | yes | yes | yes | yes | no |
| remove middle | yes | yes | yes | yes | yes | no |
| remove all then add | yes | yes | yes | yes | yes | no |
| move/reorder | yes | yes | yes | yes | yes | no |
| replace whole value | yes | yes | yes | yes | yes | yes |
| truncate dotted key | no | yes | yes | yes | yes | yes |
| expand dotted key | no | yes | yes | yes | yes | yes |

## Testing plan

### Unit tests

Add focused tests for:

- `TomlFormat` defaults and validation;
- two-space, four-space, six-space, and tab detection;
- no indentation evidence;
- nested indentation where the smallest absolute indent is not the unit;
- conflicting indentation styles;
- explicit `indentWidth` override;
- explicit tab override;
- CST reuse in auto-detection;
- malformed input fallback.

### Writer tests

Test `calculateInlinePositioning()` through public writer operations for:

- empty multiline array;
- empty multiline inline table;
- first-row insertion with a following row;
- first-row insertion with only comments remaining;
- closing delimiter on its own line;
- closing delimiter sharing the last row;
- bracket-line first item;
- nested containers.

### Patch regressions

Keep full-output assertions and parse round trips for the fuzz cases that motivated this work:

- seed 30330 and its alternatives;
- seed 61827 and its alternatives;
- empty multiline arrays;
- structural dotted-key replacements;
- multiline arrays containing multiline strings;
- comments hoisted from inline containers;
- `updateOrder: true` combined with structural replacement.

### Property and fuzz checks

Extend the fuzz comparison to normalize only the known line-ending behavior. Indentation must remain part of the exact-output comparison for style-preservation cases. Every generated patch should satisfy:

```ts
expect(parse(patch(source, updated, format))).toEqual(updated);
```

For style-aware cases, also compare the expected structural indentation token and level rather than only checking that the output parses.

## Implementation phases

### Phase 1: stabilize the format contract

- Document `indentWidth` and its default.
- Validate explicit values.
- Preserve constructor and partial-format compatibility.
- Add detection and fallback tests.

### Phase 2: centralize local inference

- Extract sibling-row and delimiter-column inference into one internal helper.
- Make arrays and inline tables use the same helper.
- Keep comments and multiline string content out of the inference sample.
- Add nested-container and mixed-style tests.

### Phase 3: propagate context through generated nodes

- Attach the resolved indentation context to patch and parseJS roots.
- Ensure `regenerateValue()` receives the same context as the replaced row.
- Ensure generated nested tables, arrays, and inline tables inherit the correct parent context.
- Verify structural replacements do not revert to the global default.

### Phase 4: audit block insertion and reordering

- Review `insertOnNewLine()` separately from `insertInline()`.
- Check table and AOT additions after removals.
- Check `updateOrder` moves with comments and multiline children.
- Ensure horizontal shifts never touch multiline string content.

### Phase 5: fuzz and compatibility sweep

- Run the full fuzz corpus and targeted seeds.
- Run TOML spec tests and browser tests.
- Check generated declaration output.
- Review bundle size and public API documentation.
- Decide whether `indentWidth` should remain public or become an internal auto-detected field after observing real callers.

## Open questions

1. Should a single global `indentWidth` remain the public model, or should only the auto-detected document default be public while local container styles stay internal?
2. When a document intentionally mixes two-space table bodies and four-space inline tables, should new empty containers inherit the nearest container delta rather than the document-wide minimum?
3. Should explicit `indentWidth` override only generated rows, or also reindent moved existing rows? The safer default is generated rows only.
4. Should inconsistent source indentation produce a warning, or should patch remain silent and choose the nearest stable evidence?
5. Do callers need an explicit indentation token such as `indent: '  '` for unusual styles, or is a width plus tab mode enough?

## Completion criteria

This plan is complete when:

- all operation-matrix cases preserve local indentation;
- two-space, four-space, and tab documents pass exact-output regressions;
- multiline string content is byte-for-byte preserved unless its value changes;
- structural replacements inherit the replaced row's style;
- ambiguous documents have documented fallback behavior;
- `parse(patch(...))` round-trips all supported cases;
- the public format contract and generated declarations are tested;
- no unrelated formatting is rewritten by a patch.