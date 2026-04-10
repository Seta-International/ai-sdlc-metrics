import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'
import tsParser from '@typescript-eslint/parser'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...tseslint.configs.recommended,
  {
    plugins: {
      boundaries,
    },
    languageOptions: {
      parser: tsParser,
    },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: '**/domain/**' },
        { type: 'application', pattern: '**/application/**' },
        { type: 'infrastructure', pattern: '**/infrastructure/**' },
        { type: 'interface', pattern: '**/interface/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'infrastructure', allow: ['domain'] },
            { from: 'application', allow: ['domain'] },
            { from: 'interface', allow: ['application'] },
          ],
        },
      ],
    },
  },
]
