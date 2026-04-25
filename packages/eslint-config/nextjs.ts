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
  // Tailwind CSS design system enforcement — bans all arbitrary values.
  // eslint-plugin-tailwindcss@3.18.3 bug: flat/recommended registers only 2/8 rules in its
  // plugin object. Patch by replacing that entry's plugin registration with the full export.
  ...(() => {
    const flat = tailwindcss.configs['flat/recommended'] as Linter.Config[]
    return [
      {
        ...flat[0],
        plugins: {
          tailwindcss: tailwindcss as unknown as NonNullable<Linter.Config['plugins']>[string],
        },
      },
      ...flat.slice(1),
    ]
  })(),
  {
    settings: {
      tailwindcss: {
        // eslint-plugin-tailwindcss uses tailwindcss/lib/util/resolveConfigPath to
        // auto-discover the config, but that module doesn't exist in Tailwind v4.
        // Setting config: {} passes an already-resolved object to the plugin,
        // which skips both the console.warn and the broken v4 config loader.
        config: {},
      },
    },
    rules: {
      'tailwindcss/no-arbitrary-value': 'error',
      // Class ordering handled by Prettier — disable to avoid conflicts
      'tailwindcss/classnames-order': 'off',
      // Crashes on ESLint 10 (uses removed context.getSourceCode() API) — disable until plugin is fixed
      'tailwindcss/enforces-shorthand': 'off',
      // Tailwind v4 uses CSS-based @theme config — plugin cannot read it, so all design tokens
      // are flagged as unknown. Disable until eslint-plugin-tailwindcss adds v4 CSS config support.
      'tailwindcss/no-custom-classname': 'off',
      // Not relevant in Tailwind v4 (negative values use different syntax)
      'tailwindcss/enforces-negative-arbitrary-values': 'off',
    },
  },
  prettier,
]

export default config
