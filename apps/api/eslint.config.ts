import nestjs from '@future/eslint-config/nestjs'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [...nestjs]

export default config
