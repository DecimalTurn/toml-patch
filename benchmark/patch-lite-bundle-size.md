# Bundle Size Comparison: toml-patch vs patch-lite

## How to generate this report

From the repository root:

1. Build the package (required so `dist/toml-patch.js` and `dist/patch-lite.js` exist):
   `pnpm run build`
2. Run the comparison script:
   `node benchmark/patch-lite-bundle-size.mjs`

The script writes this file (`benchmark/patch-lite-bundle-size.md`) directly.

## Results

| Metric | toml-patch | patch-lite | Difference |
|--------|------------|------------|------------|
| Minified | ~162.1 kB | ~43.3 kB | -118.8 kB |
| Min + Gzipped | ~50.0 kB | ~13.2 kB | -36.8 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-118.8 kB minified** / **-36.8 kB gzipped** versus toml-patch.
