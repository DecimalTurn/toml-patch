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
| Minified | ~148.0 kB | ~40.8 kB | -107.2 kB |
| Min + Gzipped | ~45.5 kB | ~12.3 kB | -33.1 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-107.2 kB minified** / **-33.1 kB gzipped** versus patch.
