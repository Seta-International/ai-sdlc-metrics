import prettier from 'eslint-config-prettier'
import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      // Next.js zones use <a> for cross-zone navigation — hard reloads are intentional.
      // This rule would fire on every <a href> pointing to another zone.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  prettier,
]
