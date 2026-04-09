/**
 * Jest configuration for .mjs integration tests
 */
export default {
  testEnvironment: 'node',
  testRegex: '/__tests__/.*\\.mjs$',  testPathIgnorePatterns: ['<rootDir>/worktrees/'],  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
