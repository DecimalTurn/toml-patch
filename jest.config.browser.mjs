/**
 * Jest configuration for browser environment tests.
 * Runs the JS integration tests against the dist bundle using jsdom to simulate a browser context,
 * catching any accidental usage of Node.js-only APIs.
 */
export default {
  testEnvironment: 'jest-environment-jsdom',
  testRegex: '/__tests__/.*\\.mjs$',  testPathIgnorePatterns: ['<rootDir>/worktrees/'],  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
