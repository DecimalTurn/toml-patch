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
| Minified | ~153.5 kB | ~41.5 kB | -112.1 kB |
| Min + Gzipped | ~47.5 kB | ~12.5 kB | -35.0 kB |
| Dependencies | 0 | 0 | - |

patch-lite difference is **-112.1 kB minified** / **-35.0 kB gzipped** versus toml-patch.
