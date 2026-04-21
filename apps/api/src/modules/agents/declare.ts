/**
 * Public declaration API for sub-agent authoring (Plan 02).
 *
 * Other modules import `defineSubAgent` from here — NOT from domain/.
 * This indirection keeps the DDD boundary checker happy: the `domain/`
 * path is never imported cross-module; only this top-level re-export is.
 *
 * Usage (from any module):
 *   import { defineSubAgent } from '../../agents/declare'
 */

export { defineSubAgent } from './domain/services/sub-agent-factory'
export type { ValidatedSubAgentConfig } from './domain/services/sub-agent-factory'
export type { IntentDescriptor } from './domain/value-objects/intent-descriptor'
export type { WindowedSummaries } from './domain/value-objects/windowed-summaries'
