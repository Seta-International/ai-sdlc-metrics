/**
 * Barrel — re-exports all projects module intent declarations.
 *
 * Convention: add a new file in this directory and re-export it here.
 * agents.module.ts aggregates from this barrel; no changes to agents.module.ts
 * are needed when adding more projects intents.
 */

export { listMyAssignmentsIntent } from './list-my-assignments'
