import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.mjs'],
    exclude: ['node_modules/**', 'worktrees/**', 'submodules/**'],
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
