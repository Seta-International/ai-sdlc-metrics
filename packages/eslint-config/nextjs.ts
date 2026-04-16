import reactPlugin from '@eslint-react/eslint-plugin'
import nextPlugin from '@next/eslint-plugin-next'
import prettier from 'eslint-config-prettier'
import tailwindcss from 'eslint-plugin-tailwindcss'
import type { Linter } from 'eslint'
import base from './base.ts'

const config: Linter.Config[] = [
  ...base,
  // React rules — ESLint 10 compatible, replaces eslint-plugin-react + react-hooks
  reactPlugin.configs['recommended-typescript'] as Linter.Config,
  // Next.js-specific rules
  nextPlugin.configs['recommended'] as Linter.Config,
  // Tailwind CSS design system enforcement — bans all arbitrary values
  ...(tailwindcss.configs['flat/recommended'] as Linter.Config[]),
  {
    settings: {
      tailwindcss: {
        // Plugin auto-discovers tailwind.config.ts walking up from eslint config dir
        tailwindVersion: '4',
      },
    },
    rules: {
      'tailwindcss/no-arbitrary-value': 'error',
      // Class ordering handled by Prettier — disable to avoid conflicts
      'tailwindcss/classnames-order': 'off',
      // Crashes on ESLint 10 (uses removed context.getSourceCode() API) — disable until plugin is fixed
      'tailwindcss/enforces-shorthand': 'off',
    },
  },
  prettier,
]

export default config
