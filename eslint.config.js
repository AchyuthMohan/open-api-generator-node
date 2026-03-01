// @ts-check
const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const globals = require('globals');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // ── Files to ignore ────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'src/*.dto.ts',       // auto-generated DTO output files
      '*.dto.ts',
    ],
  },

  // ── JavaScript files (CommonJS: generate-glint-dtos.js, etc.) ─────────
  {
    files: ['**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console':         'off',   // CLI scripts intentionally use console
      'no-process-exit':    'off',   // CLI scripts intentionally call process.exit
      'no-unused-vars':     ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'eqeqeq':             ['error', 'always'],
      'curly':              ['error', 'all'],
      'no-var':             'error',
      'prefer-const':       'error',
    },
  },

  // ── TypeScript source files ────────────────────────────────────────────
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // ── Inherit recommended TS rules ─────────────────────────────────
      ...tsPlugin.configs['recommended'].rules,

      // ── Relax rules that conflict with this project's patterns ───────
      '@typescript-eslint/no-explicit-any':        'warn',  // schema traversal needs any
      '@typescript-eslint/no-non-null-assertion':  'warn',  // used in $ref parsing
      'no-console':                                'off',   // CLI scripts use console
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // ── Style & correctness ───────────────────────────────────────────
      'eqeqeq':                                          ['error', 'always'],
      'curly':                                           ['error', 'all'],
      'no-var':                                          'error',
      'prefer-const':                                    'error',
      '@typescript-eslint/explicit-function-return-type': 'off',  // inferred types are fine
      '@typescript-eslint/consistent-type-imports':       ['warn', { prefer: 'type-imports' }],
    },
  },

  // ── Test files (relax some rules that are noisy in test code) ─────────
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any':        'off',  // tests freely cast to any
      '@typescript-eslint/no-non-null-assertion':  'off',
      '@typescript-eslint/no-require-imports':     'off',  // tests use require() for CJS modules
    },
  },
];