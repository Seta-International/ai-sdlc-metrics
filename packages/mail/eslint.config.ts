import base from '@future/eslint-config/base'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
