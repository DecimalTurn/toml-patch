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
| Minified | ~73.4 kB | ~60.6 kB | -12.8 kB |
| Min + Gzipped | ~22.5 kB | ~18.7 kB | -3.8 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-12.8 kB minified** / **-3.8 kB gzipped** versus patch.
