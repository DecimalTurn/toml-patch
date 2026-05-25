# Bundle Size Comparison: smol-toml vs @decimalturn/toml-patch

## How to generate this report

From the repository root:

1. Build the package (required so `dist/index.js` exists):
   `pnpm run build`
2. Run the comparison script:
   `node benchmark/bundle-size.mjs`

The script writes this file (`benchmark/bundle-size.md`) directly.

## Results

| Metric | smol-toml | @decimalturn/toml-patch | Difference |
|--------|-----------|-------------------------|------------|
| Minified | ~16.3 kB | ~157.0 kB | +140.7 kB |
| Min + Gzipped | ~6.5 kB | ~48.0 kB | +41.5 kB |
| Dependencies | 0 | 0 | — |

The increase would be around **+140.7 kB minified** / **+41.5 kB gzipped**.

Both libraries have **0** runtime dependencies.
