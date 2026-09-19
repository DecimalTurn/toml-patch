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
| Minified | ~149.9 kB | ~40.9 kB | -109.0 kB |
| Min + Gzipped | ~46.4 kB | ~12.4 kB | -34.1 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-109.0 kB minified** / **-34.1 kB gzipped** versus patch.
