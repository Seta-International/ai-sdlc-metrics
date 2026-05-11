#!/usr/bin/env tsx
// TODO: idempotent test data seed against DATABASE_URL. Spec §17.
// Implement once @seta/db schema lands. Should create:
//   - 2 tenants
//   - 1 user per tenant
//   - 1 thread per tenant with a sample message
//   - 1 OAuth token row per tenant (encrypted, dev DEK)
console.error('seed-test-data: not yet implemented')
process.exit(1)
