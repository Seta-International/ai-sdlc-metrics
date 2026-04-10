import prettier from 'eslint-config-prettier'
import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [...base, prettier]
