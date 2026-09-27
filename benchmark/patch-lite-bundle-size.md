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
| Minified | ~164.9 kB | ~45.2 kB | -119.7 kB |
| Min + Gzipped | ~50.6 kB | ~13.9 kB | -36.7 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-119.7 kB minified** / **-36.7 kB gzipped** versus toml-patch.
