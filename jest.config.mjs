/**
 * Jest configuration for .mjs integration tests
 */
export default {
  testEnvironment: 'node',
  testRegex: '/__tests__/.*\\.mjs$',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
