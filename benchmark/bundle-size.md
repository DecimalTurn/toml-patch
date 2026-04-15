# Bundle Size Comparison: smol-toml vs @decimalturn/toml-patch

## How to generate this report

From the repository root:

1. Build the package (required so `dist/toml-patch.js` exists):
   `pnpm run build`
2. Run the comparison script:
   `node benchmark/bundle-size.mjs`

The script writes this file (`benchmark/bundle-size.md`) directly.

## Results

| Metric | smol-toml | @decimalturn/toml-patch | Difference |
|--------|-----------|-------------------------|------------|
| Minified | ~12.8 kB | ~67.2 kB | +54.4 kB |
| Min + Gzipped | ~5.3 kB | ~20.8 kB | +15.5 kB |
| Dependencies | 0 | 0 | — |

The increase would be around **+54.4 kB minified** / **+15.5 kB gzipped**.

Both libraries have **0** runtime dependencies.
