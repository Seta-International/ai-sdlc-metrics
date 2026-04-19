import nextjs from '@future/eslint-config/nextjs'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...nextjs,
  {
    rules: {
      // Zones use <a> tags for cross-zone navigation (hard reload is intentional)
      '@next/next/no-html-link-for-pages': 'off',
      // Enforce no explicit any (mirrors @future/eslint-config/base)
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Test files legitimately use `any` for mocking and type-unsafe assertions
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
