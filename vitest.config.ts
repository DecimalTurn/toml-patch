import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.mjs',
      'specs/**/*.test.ts',
    ],
    exclude: ['node_modules', 'worktrees', 'submodules'],
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
  },
});
