/*
 * Copyright (c) 2021-2025 Red Hat, Inc.
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
  root: true,
  env: {
    es2020: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  ignorePatterns: [
    '.github/',
    '.vscode/',
    'assets/',
    'coverage/',
    'lib/',
    'dist/',
    'build/',
    '*.js',
    'header-check.js',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'notice', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    'no-tabs': 'error',
    'linebreak-style': ['error', 'unix'],
    semi: ['error', 'always'],
    'no-multiple-empty-lines': [
      'error',
      {
        max: 1,
        maxEOF: 1,
      },
    ],
    // Disabled: We use header-check.js script instead of eslint-plugin-notice
    // Run: yarn header:check or yarn header:fix
    'notice/notice': 'off',
    'spaced-comment': 'error',
    'no-warning-comments': [
      'warn',
      {
        terms: ['todo'],
        location: 'start',
      },
    ],

    // disabled to avoid conflicts with prettier
    quotes: 'off',

    // TODO enable rules below and fix errors
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
