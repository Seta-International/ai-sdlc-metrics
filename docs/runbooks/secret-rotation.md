# Runbook — Secret rotation

> Quarterly: `MS_BOT_SECRET`, OAuth client secrets, API-key DEK.
> Annual: KMS KEK.

## Calendar ownership

On-call rotation owns the quarterly calendar reminder. A skipped quarter is an SLO breach — log it.

## Procedure (per secret)

### `MS_BOT_SECRET` (Bot Framework client secret)

1. In Azure Portal → App registrations → Bot ID → Certificates & secrets → create a new client secret with 13-month expiry.
2. Update the KMS-stored copy.
3. Roll the deployment (env reload).
4. Verify Teams traffic still authenticates (hit `/teams/health` from the bot service).
5. Delete the old secret in Azure.

### OAuth client secrets (Entra, Google)

Same shape as Bot Secret, scoped per provider. Verify a fresh sign-in completes end-to-end.

### API-key DEK (`@seta/auth`)

Run `pnpm tsx tooling/scripts/rotate-dek.ts` (see §4 of the spec).
1. KMS generates a new DEK.
2. Script re-encrypts every row in `oauth_tokens` and `sessions` under the new DEK.
3. Old DEK ciphertext archived for the retention window, then deleted.

### KMS KEK (annual)

Coordinate with cloud team. Re-wrap all DEKs under the new KEK. Old KEK retained for emergency decrypt for one rotation cycle.

## Log

| Date | Secret | Operator | Notes |
|------|--------|----------|-------|
| _stub_ | _stub_ | _stub_ | _stub_ |
