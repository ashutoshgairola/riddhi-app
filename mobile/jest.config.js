/**
 * Pure-logic unit tests (`*.spec.ts`) plus lightweight component smoke tests
 * (`*.spec.tsx`). The latter never import the real `react-native` package
 * (it ships Flow syntax our ts-jest transform can't parse, and there's no
 * react-native/testing-library renderer installed here) — they `jest.mock`
 * `react-native` with plain host-tag stand-ins and render via
 * `react-dom/server`'s `renderToStaticMarkup` instead of a real RN renderer.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.spec.ts', '**/src/**/*.spec.tsx', '**/modules/**/*.test.ts'],
  roots: ['<rootDir>/src', '<rootDir>/modules'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '^react-native-reanimated$': '<rootDir>/jest/mocks/react-native-reanimated.js',
  },
};
