export default {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {},
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  collectCoverageFrom: [
    '*.js',
    '!index.js',
    '!jest.config.js',
    '!jest.setup.js'
  ],
  coverageThreshold: {
    global: {
      branches: 48,
      functions: 52,
      lines: 39,
      statements: 39
    }
  }
};
