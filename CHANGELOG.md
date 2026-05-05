# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-05-05

### Fixed

- Patching: Correctly append to nested AOT (array of tables) ([#176]).
- Patching: Fixed `findByPath` scanning in AOT scope to continue looking at sibling entries after a partial prefix match fails ([#176]).
- Patching: Support replacement of a entire table section with a scalar value ([#176]).

## [1.2.0] - 2026-04-29

### Added

- Patching: Preserve trailing comments alignement when element of a row changes width ([#165]).

### Fixed

- Patching: New root-level key-values are now inserted at the top within the implicit root table scope (before the first `[table]` or `[[array]]` header) instead of being appended at the end of the document ([#171]).
- Patching: Ensure deleting last key of inline-table is done cleanly ([#164]).
- Patching: Preserving trailing comments on inline tables when deleting keys ([#164]).
- Patching: Support nested multiline inline-table patching inside arrays ([#164]).

## [1.1.1] - 2026-04-20

### Fixed

- Patching: Preserve inline comment alignment when patching existing TOML date values with regular JavaScript `Date` objects.

## [1.1.0] - 2026-04-15

### Added
- Patching: Preserve preferred escape sequence representation in basic strings ([#131])
- Parsing: Add support for raw UTF-8 bytes (`Uint8Array`/`Buffer`) as input for `parse()` and `TomlDocument` ([#153]).
- Parsing: Add parsing options for `integersAsBigInt` modes (`'asNeeded'`, `true`, `false`) with `'asNeeded'` as default ([#153]).
- Formatting: Add `minimumDecimals` option to `TomlFormat` to control float decimal padding during serialization ([#153]).
- Parsing: Add support for rejection of invalid UTF-8 encoding as specified in `toml-test` ([#153]).

### Fixed
- Patching: Editing a multiline basic string that uses a line ending backslash now preserves the original line-break structure and indentation. When the new value cannot be faithfully represented with a line ending backslash (e.g., values with leading or trailing whitespace), the format falls back to a regular multiline basic string to preserve content integrity ([#131]).
- Parsing: Preserve full integer precision by returning `BigInt` for values outside the JS safe integer range. Fallback to `Number` when integer cannot be parsed as a `BigInt` ([#153] & [#158]).
- Patching: Fixed mixed line endings bugs ([#131]).
- Date formatting: Ensure UTC year output is zero-padded to 4 digits for RFC3339 compliance ([#153]).
- Encoding: Fix encoding issue with DEL control character ([#153] & [#131]).

## [1.0.7] - 2026-04-08

### Fixed
- Stringifying: `undefined` values in objects are now silently ignored, matching `JSON.stringify` behavior ([#148]).
- Patching: Setting a key to `undefined` now correctly removes it, including in nested tables and inline tables ([#148]).
- Patching: Deleting a key from an inline table nested inside an inline array (e.g. `items = [{ name = "x", color = "y" }]`) now works correctly ([#148]).

## [1.0.6] - 2026-04-06

### Fixed
- Patching: Support patching multiline inline tables ([#127]).
- Styling: Respect `inlineTableStart` inside Table Arrays (ie. Array of Tables) ([#144]).

## [1.0.5] - 2026-03-17

### Fixed
- Patching: Adding keys to nested inline tables (e.g. `config = { server = { host = "localhost" } }`) now works correctly

### Changed
- Remove circular dependency between `toml-format` and `generate` modules ([#118])
- Reduce bundle size by deduplicating internal parsing and date-formatting helpers, implementing schema-based validation and shortening error messages ([#122])
- Improve internal representation handling for faster write performance (~3–4% speedup in benchmarks) by fixing inconsistencies in how positions are tracked internally ([#125])

## [1.0.2] - 2026-02-14

### Changed
- Improve stringification performance ([#106])

## [1.0.1] - 2026-02-14

### Changed
- Improve parsing and conversion performance ([#105])
- Better benchmarking ([#104])
  - Migrate benchmarks from CommonJS to ESM modules
  - Improve benchmark output with colored tables and formatted results
  - Support benchmarking multiple package versions with automatic caching (`--versions`)
  - Add CLI filters for benchmarks (`--package`, `--file`, `--example`)

### Added
- Profiling support via `npm run profile` ([#105])

## [1.0.0] - 2026-02-12

### Changed
- **BREAKING**: Migrate to ESM-only distribution, removing CommonJS and UMD builds ([#100])
  - Package.json now declares `"type": "module"` and uses a modern `exports` field
  - Single ESM build: `dist/toml-patch.js`
  - Removed: `dist/toml-patch.cjs.min.js`, `dist/toml-patch.umd.min.js`, and all source maps
  - Package size reduced by 90%
  - Node.js 22.12.0+/23.3.0+ can directly `require()` this ESM package
  - Users on older Node.js versions should use dynamic `import()` or stay on v0.x


## [0.7.0] - 2026-02-08

### Fixed
- Per official [toml-test](https://github.com/toml-lang/toml-test), return error for invalid TOML inputs (keys, strings, inline tables, tables, date/time, control characters, and newline handling) except for encoding issues ([#94]).

## [0.6.0] - 2026-02-01

### Added
- TOML v1.1 support

## [0.5.2] - 2026-01-19

### Fixed 
- Remove circular reference warning ([#90])

## [0.5.1] - 2026-01-18

### Added
- Add CHANGELOG.md

### Fixed
- Fix multiline string handling when patching ([#87])
- Fix LocalTime timezone parsing issue (2dea07ffd8377ad2aa30678e7025dcbe6753a8e9)

## [0.5.0] - 2025-12-26

### Added
- Add `truncateZeroTimeInDates` formatting option for date serialization ([#86])

### Changed
- Update dependency dedent to v1.7.1

## [0.4.1] - 2025-12-25

### Added
- Introduce `TomlDocument` class ([#66])
- Add `TomlFormat` class ([#77])
- Better Inline vs Multiline Tables formatting ([#79])
- Handle TOML date formats when patching ([#82])

### Fixed
- Dates will now preserve their formatting when patched

### Changed
- Updated submodules/toml-test digest to b54f9ff
- Update actions/checkout action to v6
- Update actions/upload-artifact action to v6
- Updated Node.js to v24
- Updated glob to v13
- Updated rimraf to v6.1.2
- Updated js-yaml to v4.1.1
- Updated ts-jest to v29.4.6
- Updated rollup-plugin-dts to v6.3.0
- Skipped rollup v4.53.0 due to upstream issues

## [0.3.8] - 2025-10-25

### Fixed
- Add roundtrip tests and fix related issues ([#64])
  - Ensure trailing end-of-line (EOL) preservation at the end-of-file (ie. if the original TOML doesn't have any EOL at EOF, don't add one and if there's more than one include them)
  - Fix issues with float values (`Infinity`, `-Infinity`, `NaN`, `-0`)
  - Fix the regular expression for bare TOML keys ensuring correct quoted keys interpretation (`"tater.man"` != `tater.man`)
  - Fix nested inline tables issues
  - Fix ghost offset when TOML has no top-level key/value pairs
- Fix regex for newline matching

### Security
- Add Socket Free Firewall ([#53])

### Changed
- Updated submodules/toml-test digest to 1d35870
- Update actions/upload-artifact action to v5
- Updated rollup to versions up to v4.52.5
- Updated TypeScript to v5.9.3
- Updated ts-jest to v29.4.5
- Updated jest monorepo to v30
- Updated dedent to v1.7.0
- Updated js-yaml to v4
- Updated @rollup/plugin-typescript to v12.3.0
- Updated actions/setup-node to v6
- Updated socketdev/action to v1.2.0

### Other
- Expand benchmarks ([#61])

## [0.3.7] - 2025-08-20

### Added
- Package is now available on jsr.io: https://jsr.io/@decimalturn/toml-patch

### Changed
- Documentation and package description update

## [0.3.3] - 2025-05-10

### Fixed
- Handle key-value vs inline-item mixup ([#4])

## [0.3.2] - 2025-04-13

### Fixed
- Fix replacement from Inline-Table to String Value ([#3])

## [0.3.1] - 2025-04-12

### Fixed
- Fix inline-table element deletion ([#1])
- Fix inline-table edition ([#2])

## [0.3.0] - 2025-04-12

This first forked version from [timhall/toml-patch](https://github.com/timhall/toml-patch):

### Added
- Now available from npm: https://www.npmjs.com/package/@decimalturn/toml-patch

### Fixed
- Fix [timhall/toml-patch#27](https://github.com/timhall/toml-patch/issues/27)
- Fix [timhall/toml-patch#25](https://github.com/timhall/toml-patch/issues/25)
- Fix [timhall/toml-patch#10](https://github.com/timhall/toml-patch/issues/10)

### Changed
- Updates dependencies
- Ensures all latest spec tests from https://github.com/iarna/toml-spec-tests are passing (1880b1a)


[#1]: https://github.com/DecimalTurn/toml-patch/pull/1
[#2]: https://github.com/DecimalTurn/toml-patch/pull/2
[#3]: https://github.com/DecimalTurn/toml-patch/pull/3
[#4]: https://github.com/DecimalTurn/toml-patch/pull/4
[#53]: https://github.com/DecimalTurn/toml-patch/pull/53
[#61]: https://github.com/DecimalTurn/toml-patch/pull/61
[#64]: https://github.com/DecimalTurn/toml-patch/pull/64
[#66]: https://github.com/DecimalTurn/toml-patch/pull/66
[#77]: https://github.com/DecimalTurn/toml-patch/pull/77
[#79]: https://github.com/DecimalTurn/toml-patch/pull/79
[#82]: https://github.com/DecimalTurn/toml-patch/pull/82
[#86]: https://github.com/DecimalTurn/toml-patch/pull/86
[#87]: https://github.com/DecimalTurn/toml-patch/pull/87
[#90]: https://github.com/DecimalTurn/toml-patch/pull/90
[#94]: https://github.com/DecimalTurn/toml-patch/pull/94
[#100]: https://github.com/DecimalTurn/toml-patch/pull/100
[#104]: https://github.com/DecimalTurn/toml-patch/pull/104
[#105]: https://github.com/DecimalTurn/toml-patch/pull/105
[#106]: https://github.com/DecimalTurn/toml-patch/pull/106
[#118]: https://github.com/DecimalTurn/toml-patch/pull/118
[#122]: https://github.com/DecimalTurn/toml-patch/pull/122
[#125]: https://github.com/DecimalTurn/toml-patch/pull/125
[#127]: https://github.com/DecimalTurn/toml-patch/pull/127
[#131]: https://github.com/DecimalTurn/toml-patch/pull/131
[#144]: https://github.com/DecimalTurn/toml-patch/pull/144
[#148]: https://github.com/DecimalTurn/toml-patch/pull/148
[#153]: https://github.com/DecimalTurn/toml-patch/pull/153
[#158]: https://github.com/DecimalTurn/toml-patch/pull/158
[#164]: https://github.com/DecimalTurn/toml-patch/pull/164
[#165]: https://github.com/DecimalTurn/toml-patch/pull/165
