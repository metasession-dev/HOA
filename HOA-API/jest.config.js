/**
 * Unit tests live in `test/` (not colocated in `src/`) so `nest build`, which
 * compiles `src/**`, never ships spec files into `dist/`.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/test/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  // Specs mutate process.env (NODE_ENV, PAYSTACK_SECRET_KEY); restoreMocks
  // keeps jest.spyOn stubs from leaking between tests.
  restoreMocks: true,
};
