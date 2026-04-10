import boundaries from 'eslint-plugin-boundaries'
import tsPlugin from '@typescript-eslint/eslint-plugin'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    plugins: {
      '@typescript-eslint': tsPlugin,
      boundaries,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          { from: 'infrastructure', allow: ['domain'] },
          { from: 'application',    allow: ['domain'] },
          { from: 'interface',      allow: ['application'] },
        ],
      }],
    },
  },
]
