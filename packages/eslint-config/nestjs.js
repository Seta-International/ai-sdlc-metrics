import boundaries from 'eslint-plugin-boundaries'
import prettier from 'eslint-config-prettier'
import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: '**/modules/*/domain/**' },
        { type: 'application', pattern: '**/modules/*/application/**' },
        { type: 'infrastructure', pattern: '**/modules/*/infrastructure/**' },
        { type: 'interface', pattern: '**/modules/*/interface/**' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'application', allow: ['domain'] },
            { from: 'infrastructure', allow: ['domain'] },
            { from: 'interface', allow: ['application'] },
          ],
        },
      ],
    },
  },
  prettier,
]
