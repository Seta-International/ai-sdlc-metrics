#!/usr/bin/env tsx
// TODO: KMS DEK rotation. Spec §4 ("Secret rotation" + KmsProvider).
// Calls @seta/auth KmsProvider to generate a new DEK and re-encrypt all
// rows in oauth_tokens and sessions. Implement once @seta/auth is wired.
console.error('rotate-dek: not yet implemented')
process.exit(1)
