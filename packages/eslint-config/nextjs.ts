import reactPlugin from '@eslint-react/eslint-plugin'
import nextPlugin from '@next/eslint-plugin-next'
import prettier from 'eslint-config-prettier'
import type { Linter } from 'eslint'
import base from './base.ts'

const config: Linter.Config[] = [
  ...base,
  // React rules — ESLint 10 compatible, replaces eslint-plugin-react + react-hooks
  reactPlugin.configs['recommended-typescript'] as Linter.Config,
  // Next.js-specific rules
  nextPlugin.configs['recommended'] as Linter.Config,
  prettier,
]

export default config
