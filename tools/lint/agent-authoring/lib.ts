// lib.ts — shared helpers for agent-authoring lint rules.

import { lintConfig } from './config'

// Pre-compiles the action-verb regex for reuse
const _actionVerbRegex = new RegExp(`\\b(${lintConfig.actionVerbs.join('|')})\\b`, 'i')

export function hasActionVerb(text: string): boolean {
  return _actionVerbRegex.test(text)
}
