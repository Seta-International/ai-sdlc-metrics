import prettier from 'eslint-config-prettier'
import type { Linter } from 'eslint'
import base from './base.ts'

const config: Linter.Config[] = [...base, prettier]

export default config
