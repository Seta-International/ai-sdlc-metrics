import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      // Next.js zones use <a> tags for cross-zone navigation — not <Link>
      // (intentional — subdomain routing requires hard reload between zones)
      // Suppress Next.js plugin false positive for intentional cross-zone <a> usage
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
]
