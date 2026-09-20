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
| Minified | ~13.4 kB | ~153.5 kB | +140.1 kB |
| Min + Gzipped | ~5.3 kB | ~47.5 kB | +42.2 kB |
| Dependencies | 0 | 0 | — |

The increase would be around **+140.1 kB minified** / **+42.2 kB gzipped**.

Both libraries have **0** runtime dependencies.
