/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // *.spec.ts : tests unitaires (src) ; *.e2e-spec.ts : tests d'intégration HTTP + base réelle (test).
  testRegex: '.*[.](e2e-)?spec[.]ts$',
  transform: {
    '^.+[.](t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
};
