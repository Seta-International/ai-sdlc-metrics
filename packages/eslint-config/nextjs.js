import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      // Next.js zones use <a> tags for cross-zone navigation — not <Link>
      // (intentional — subdomain routing requires hard reload between zones)
    },
  },
]
