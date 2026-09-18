/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src/tests'],
  testMatch: ['<rootDir>/src/tests/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig-tests.json',
      },
    ],
  },
  // Strip the `.js` extension from relative ESM imports so ts-jest resolves the
  // `.ts` source (NodeNext-style specifiers carry `.js`; jest maps back to src).
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
