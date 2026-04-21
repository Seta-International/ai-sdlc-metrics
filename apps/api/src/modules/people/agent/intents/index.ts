/**
 * Barrel — re-exports all people module intent declarations.
 *
 * Convention: add a new file in this directory and re-export it here.
 * agents.module.ts aggregates from this barrel; no changes to agents.module.ts
 * are needed when adding more people intents.
 */

export { viewMyProfileIntent } from './view-my-profile'
