/** Pure-logic unit tests only (no RN component rendering in this slice). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.spec.ts', '**/modules/**/*.test.ts'],
  roots: ['<rootDir>/src', '<rootDir>/modules'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
