/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 44,
      functions: 54,
      lines: 49,
      statements: 50,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  // Mock the logger module automatically
  moduleNameMapper: {
    '^@/utils/logger$': '<rootDir>/src/utils/__mocks__/logger.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Force exit after tests complete (prevents hanging from Kubernetes client connections)
  forceExit: true,
};
