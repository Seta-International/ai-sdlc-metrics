import coreWebVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...coreWebVitals,
  // @next/next plugin is now loaded — safe to reference its rules
  {
    rules: {
      // Zones use <a> tags for cross-zone navigation (hard reload is intentional)
      '@next/next/no-html-link-for-pages': 'off',
      // Enforce no explicit any (mirrors @future/eslint-config/base)
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettier,
]

export default config
