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
| Minified | ~149.9 kB | ~41.5 kB | -108.4 kB |
| Min + Gzipped | ~46.3 kB | ~12.5 kB | -33.8 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-108.4 kB minified** / **-33.8 kB gzipped** versus patch.
