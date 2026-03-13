import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@auth/(.*)$': '<rootDir>/auth/$1',
    '^@users/(.*)$': '<rootDir>/users/$1',
    '^@agents/(.*)$': '<rootDir>/agents/$1',
    '^@knowledge/(.*)$': '<rootDir>/knowledge/$1',
    '^@documents/(.*)$': '<rootDir>/documents/$1',
    '^@retrieval/(.*)$': '<rootDir>/retrieval/$1',
    '^@tools/(.*)$': '<rootDir>/tools/$1',
    '^@resources/(.*)$': '<rootDir>/resources/$1',
    '^@jobs/(.*)$': '<rootDir>/jobs/$1',
    '^@gateway/(.*)$': '<rootDir>/gateway/$1',
  },
};

export default config;
