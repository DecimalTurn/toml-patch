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
| Minified | ~13.4 kB | ~151.6 kB | +138.2 kB |
| Min + Gzipped | ~5.3 kB | ~46.6 kB | +41.3 kB |
| Dependencies | 0 | 0 | — |

The increase would be around **+138.2 kB minified** / **+41.3 kB gzipped**.

Both libraries have **0** runtime dependencies.
