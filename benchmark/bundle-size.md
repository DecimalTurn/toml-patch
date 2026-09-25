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
| Minified | ~16.3 kB | ~162.1 kB | +145.8 kB |
| Min + Gzipped | ~6.5 kB | ~50.0 kB | +43.5 kB |
| Dependencies | 0 | 0 | — |

The increase would be around **+145.8 kB minified** / **+43.5 kB gzipped**.

Both libraries have **0** runtime dependencies.
