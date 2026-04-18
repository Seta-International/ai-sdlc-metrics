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
  // Planner module boundary: prevent external code from accessing planner internals.
  // The planner's public surface is limited to planner.module.ts and
  // application/facades/planner-query.facade.ts.
  {
    files: ['**/modules/**/*.ts'],
    ignores: ['**/modules/planner/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '.*[/\\\\]planner[/\\\\](domain|infrastructure|application[/\\\\](commands|queries|event-handlers|services))[/\\\\].*',
              message:
                'Do not import planner internals from outside the planner module. Only import from planner.module or application/facades/planner-query.facade.',
            },
          ],
        },
      ],
    },
  },
  prettier,
]

export default config
