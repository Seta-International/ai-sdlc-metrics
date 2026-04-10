// Root ESLint config for monorepo — used when ESLint runs from the workspace root
// (e.g. pre-commit hook). Each app/package has its own eslint.config.ts.
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  {
    // Ignore everything — each workspace runs its own eslint.config.ts
    ignores: ['**/*'],
  },
]

export default config
