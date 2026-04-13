// Re-export from @future/core — kernel no longer owns DomainException.
// This re-export exists for backward compatibility during migration.
// New modules should import directly from '@future/core'.
export { DomainException } from '@future/core'
