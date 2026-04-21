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
                '.*[/\\\\]planner[/\\\\](domain|infrastructure|application[/\\\\](commands|queries|event-handlers|services))(/.*)?$',
              message:
                'Do not import planner internals from outside the planner module. Only import from planner.module or application/facades/planner-query.facade.',
            },
          ],
        },
      ],
    },
  },
  // Agents module DI boundary (R-01.6): the agents module must only cross module
  // boundaries via QueryFacade / write-facade / module symbol.  It must never
  // inject or import domain entities, application services, command/query handlers,
  // event-handlers, or infrastructure internals from other modules.
  //
  // Allowed cross-module imports from within agents/**:
  //   - **/modules/<module>/application/facades/**   (canonical public surface)
  //   - **/modules/<module>/<module>.module.ts        (NestJS imports array)
  //
  // Explicitly BANNED (one pattern per import kind).
  // Regex matches both:
  //   - relative paths:  ../kernel/domain/...  or  ../../../kernel/domain/...
  //   - absolute-style:  .../modules/kernel/domain/...
  // Negative lookahead (?!agents/) ensures own-module paths are NOT caught.
  {
    files: ['**/modules/agents/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // Ban: domain internals from any non-agents module
            {
              regex: '.*[/\\\\](?!agents[/\\\\])[a-z][a-z0-9-]*[/\\\\]domain[/\\\\].*',
              message:
                'The agents module must not inject or import domain services, handlers, or internals from other modules. Cross-module reads go through QueryFacade; writes go through dedicated write/audit facades. (R-01.6)',
            },
            // Ban: infrastructure internals from any non-agents module
            {
              regex: '.*[/\\\\](?!agents[/\\\\])[a-z][a-z0-9-]*[/\\\\]infrastructure[/\\\\].*',
              message:
                'The agents module must not inject or import domain services, handlers, or internals from other modules. Cross-module reads go through QueryFacade; writes go through dedicated write/audit facades. (R-01.6)',
            },
            // Ban: application/commands from any non-agents module
            {
              regex:
                '.*[/\\\\](?!agents[/\\\\])[a-z][a-z0-9-]*[/\\\\]application[/\\\\]commands[/\\\\].*',
              message:
                'The agents module must not inject or import domain services, handlers, or internals from other modules. Cross-module reads go through QueryFacade; writes go through dedicated write/audit facades. (R-01.6)',
            },
            // Ban: application/queries from any non-agents module
            {
              regex:
                '.*[/\\\\](?!agents[/\\\\])[a-z][a-z0-9-]*[/\\\\]application[/\\\\]queries[/\\\\].*',
              message:
                'The agents module must not inject or import domain services, handlers, or internals from other modules. Cross-module reads go through QueryFacade; writes go through dedicated write/audit facades. (R-01.6)',
            },
            // Ban: application/services from any non-agents module
            {
              regex:
                '.*[/\\\\](?!agents[/\\\\])[a-z][a-z0-9-]*[/\\\\]application[/\\\\]services[/\\\\].*',
              message:
                'The agents module must not inject or import domain services, handlers, or internals from other modules. Cross-module reads go through QueryFacade; writes go through dedicated write/audit facades. (R-01.6)',
            },
            // Ban: application/event-handlers from any non-agents module
            {
              regex:
                '.*[/\\\\](?!agents[/\\\\])[a-z][a-z0-9-]*[/\\\\]application[/\\\\]event-handlers[/\\\\].*',
              message:
                'The agents module must not inject or import domain services, handlers, or internals from other modules. Cross-module reads go through QueryFacade; writes go through dedicated write/audit facades. (R-01.6)',
            },
          ],
        },
      ],
    },
  },
  prettier,
]

export default config
