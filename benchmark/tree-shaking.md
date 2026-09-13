# Tree-Shaking: how much is saved when only `patch` is needed

## How to generate this report

From the repository root:

1. Build the package (required so `dist/toml-patch.js` and `dist/dev/*` exist):
   `pnpm run build`
2. Run the benchmark:
   `node benchmark/tree-shake-size.mjs`

The script writes this file (`benchmark/tree-shaking.md`) directly.

All scenarios are bundled with the same esbuild settings (`--bundle --format=esm --minify --target=esnext`) with every dependency inlined, so the numbers are directly comparable. `prod bundle` means the published `dist/toml-patch.js` (a bundler has to eliminate the unused code inside that single file); `dev build` means the unbundled `~3.1.0-dev` build in `dist/dev/` (a bundler can drop whole modules).

## Results

| Entry point | Minified | Gzipped | Brotli | vs full package (same build) |
|---|---|---|---|---|
| full package (all exports), prod bundle | 151.62 kB | 46.59 kB | 40.24 kB | — |
| `patch` only, prod bundle | 148.01 kB | 45.35 kB | 39.29 kB | −3.61 kB (2.4%) |
| full package (all exports), dev build | 152.94 kB | 46.97 kB | 40.55 kB | — |
| `patch` only, dev build | 149.32 kB | 45.71 kB | 39.56 kB | −3.62 kB (2.4%) |
| `parse` only, dev build | 34.45 kB | 10.35 kB | 9.26 kB | −118.49 kB (77.5%) |
| `stringify` only, dev build | 69.17 kB | 21.21 kB | 18.82 kB | −83.77 kB (54.8%) |
| `LocalDate` only, dev build | 0.56 kB | 0.31 kB | 0.26 kB | −152.38 kB (99.6%) |

**Tree-shaking away everything except `patch` saves 3.61 kB minified (2.4%) and 1.24 kB gzipped (2.7%).** That result holds for both builds: the unbundled dev build saves 3.62 kB minified (2.4%) over the full dev build.

## Why the saving is small

`patch` is the heaviest entry point: it needs the tokenizer, the parser, the writer, the generator, the formatter and the comment-handling machinery. Out of 33 dev modules a `patch`-only bundle keeps 30, dropping only `toml-document.js`, `toml-patch.js`, `truncate.js`.

That dropped chain is the `TomlDocument` API (`toml-document.js` → `truncate.js`) plus the entry barrel's own code, which only declares the `parse`/`stringify`/`parseDocument` wrappers.

The other entry points reuse the same internals, so for them tree-shaking pays off a lot: `parse` alone is 34.45 kB, 77.5% smaller than the full package.

## Takeaway

- A consumer that needs `patch` should not expect meaningful savings from tree-shaking: 3.61 kB minified, 1.24 kB gzipped.
- The unbundled `dev` build is not faster for `patch`-only consumers; both builds land within ~1 kB of each other.
- Tree-shaking matters for consumers who use `parse`, `stringify` or the individual date classes without `patch`.
