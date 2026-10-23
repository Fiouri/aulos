/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // The first render in a cold worker loads React Native and the router, which can take
  // several seconds on a busy machine.
  testTimeout: 20000,
};
