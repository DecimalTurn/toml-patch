# Bundle Size Comparison: patch vs patch-lite

## How to generate this report

From the repository root:

1. Build the package (required so `dist/patch.js` and `dist/patch-lite.js` exist):
   `pnpm run build`
2. Run the comparison script:
   `node benchmark/patch-lite-bundle-size.mjs`

The script writes this file (`benchmark/patch-lite-bundle-size.md`) directly.

## Results

| Metric | patch | patch-lite | Difference |
|--------|-------|------------|------------|
| Minified | ~73.4 kB | ~61.1 kB | -12.3 kB |
| Min + Gzipped | ~22.5 kB | ~18.8 kB | -3.7 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-12.3 kB minified** / **-3.7 kB gzipped** versus patch.
