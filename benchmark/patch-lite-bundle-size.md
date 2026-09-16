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
| Minified | ~148.1 kB | ~76.0 kB | -72.1 kB |
| Min + Gzipped | ~45.4 kB | ~23.6 kB | -21.8 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-72.1 kB minified** / **-21.8 kB gzipped** versus patch.
