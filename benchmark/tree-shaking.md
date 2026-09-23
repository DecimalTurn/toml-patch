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
| full package (all exports), prod bundle | 157.02 kB | 47.95 kB | 41.33 kB | — |
| `patch` only, prod bundle | 148.97 kB | 45.60 kB | 39.48 kB | −8.05 kB (5.1%) |
| full package (all exports), dev build | 158.38 kB | 48.30 kB | 41.69 kB | — |
| `patch` only, dev build | 150.30 kB | 45.94 kB | 39.81 kB | −8.07 kB (5.1%) |
| `parse` only, dev build | 37.82 kB | 11.48 kB | 10.31 kB | −120.56 kB (76.1%) |
| `stringify` only, dev build | 73.33 kB | 22.23 kB | 19.72 kB | −85.04 kB (53.7%) |
| `LocalDate` only, dev build | 31.52 kB | 9.65 kB | 8.65 kB | −126.86 kB (80.1%) |

**Tree-shaking away everything except `patch` saves 8.05 kB minified (5.1%) and 2.35 kB gzipped (4.9%).** That result holds for both builds: the unbundled dev build saves 8.07 kB minified (5.1%) over the full dev build.

## Why the saving is small

`patch` is the heaviest entry point: it needs the tokenizer, the parser, the writer, the generator, the formatter and the comment-handling machinery, so almost every module is reachable from it. Out of 33 dev modules a `patch`-only bundle keeps 31, dropping only `toml-document.js`, `truncate.js`.

The other entry points reuse the same internals, so for them tree-shaking pays off far more: `parse` alone is 37.82 kB (76.1% smaller than the full package) and `LocalDate` alone is 31.52 kB (80.1% smaller).

## Takeaway

- A consumer that needs `patch` only gets a small saving from tree-shaking: 8.05 kB minified, 2.35 kB gzipped.
- The unbundled `dev` build is not significantly smaller for `patch`-only consumers; both builds land within a couple of kB of each other.
- Tree-shaking matters most for consumers who use `parse`, `stringify` or the individual date classes without `patch`.
