import boundaries from 'eslint-plugin-boundaries'
import prettier from 'eslint-config-prettier'
import type { Linter } from 'eslint'
import base from './base.ts'

const config: Linter.Config[] = [
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
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: { type: 'domain' }, allow: [] },
            { from: { type: 'application' }, allow: [{ to: { type: 'domain' } }] },
            { from: { type: 'infrastructure' }, allow: [{ to: { type: 'domain' } }] },
            { from: { type: 'interface' }, allow: [{ to: { type: 'application' } }] },
          ],
        },
      ],
    },
  },
  prettier,
]

export default config
