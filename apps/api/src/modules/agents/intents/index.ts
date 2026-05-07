/**
 * Barrel — re-exports all agents module intent declarations.
 *
 * Convention: add a new file in this directory and re-export it here.
 * agents.module.ts aggregates from this barrel; no changes to agents.module.ts
 * are needed when adding more agents-owned intents.
 */

export { unclassifiedIntent } from './unclassified'
export { kbRetrieveIntent } from './kb-retrieve'
