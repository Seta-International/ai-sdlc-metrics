# Runbook — Secret rotation

> **Cadence:** quarterly for application secrets; annual for KMS KEK and DEK.
> **Owner:** on-call rotation. A skipped quarter is an SLO breach — log it in
> the rotation log table at the bottom of this runbook.
> **Companion runbook:** `docs/runbooks/restore-drill.md` (same owner; do not
> rotate during a restore drill).

## Calendar ownership

setup.md §15 "Operating conventions" Secret-rotation row
(`docs/setup.md:2127`) pins the calendar: "Quarterly rotation: `MS_BOT_SECRET`,
OAuth client secrets, API-key DEK. Annual: KMS KEK. Runbook:
`docs/runbooks/secret-rotation.md`. Calendar reminder owned by on-call."

- **Quarterly slots:** end of Q1 / Q2 / Q3 / Q4. Calendar reminder set by
  on-call; pre-rotation review (this runbook + previous quarter's log) seven
  days ahead.
- **Annual slot:** end of Q4 — combine the annual KEK rotation with the
  quarterly secret rotation so the KEK rotation happens in a window when an
  engineer is already paged on secrets.
- **Skipped quarter = SLO breach.** Log it in the table at the bottom with
  `Secret: SKIPPED`, an operator name, the SLO breach reason, and a follow-up
  date. CLAUDE.md "Operating conventions" + setup.md §15 line 2127 are the
  contract.
- **No rotation during incident windows.** If an active incident is rotating a
  different secret, defer the scheduled rotation by up to 14 days. Document
  the deferral in the same row that records the eventual rotation.

## Secret inventory

Every named secret in the platform appears in this table. Anything that runs
through `apps/api/src/env.ts` (setup.md §3 / CLAUDE.md "Schema-driven —
`process.env` → typed `env`") and is not commit-safe lives here. Anything
encrypted at rest by KMS appears here too (setup.md §4 lines 277-326).

| Secret | Purpose | Cadence | Owner | Stored | How rotated |
|---|---|---|---|---|---|
| `MS_BOT_SECRET` | Bot Framework outbound auth from `modules/channels/teams` (`@seta/teams`) — used by the bot-token cache (setup.md §11 `bot-token.ts` description `docs/setup.md:914`). | Quarterly | On-call | Env var loaded at boot via `apps/api/src/env.ts` (setup.md §3 / CLAUDE.md). In prod the env value is sourced from the cloud-native secrets store and never committed. | Azure AD App Registration → Certificates & secrets → new client secret with 13-month expiry. Stage new secret in the secret store, dual-publish to the deployment, cut over, revoke old. **See "Procedure (per secret)" below.** |
| `ENTRA_CLIENT_SECRET` (per-tenant OAuth client secret for the Seta multi-tenant Entra app) | Used by `@seta/oauth` `EntraProvider.ConfidentialClientApplication` (setup.md §4 lines 193-244; `platform/oauth/SCOPE.md` § "Owns" and § "Patterns to follow"). One client secret per Seta-owned multi-tenant App Registration; not per customer tenant. | Quarterly | On-call | Env var via `apps/api/src/env.ts`. | Azure AD App Registration → Certificates & secrets. Same procedure as `MS_BOT_SECRET`. P3 plan: migrate to certificate auth (setup.md §4 line 218 comment "or certificate in P3"). |
| Future per-connector OAuth client secrets (Google, Trello, …) | Same shape as Entra; each future connector under `modules/connectors/<vendor>/` declares its own client secret. | Quarterly | On-call | Env var via `apps/api/src/env.ts`. | Provider-specific console → secret rotation; same dual-publish-then-cut-over procedure. |
| `oauth.oauth_tokens.access_token` / `.refresh_token` (per-tenant per-user OAuth tokens issued by MS Entra) | Outbound Graph access. AES-256-GCM encrypted at rest with a KMS-wrapped DEK per row, AAD bound to `tenantId\|providerId\|partitionKey\|envelopeVersion` (setup.md §4 lines 277-326; `platform/oauth/SCOPE.md` § "Owns" / § "Patterns to follow"). | **Continuous — automatic refresh.** Manual rotation only on suspected compromise. | `@seta/oauth.TokenAcquirer` (automatic); on-call (manual on compromise). | `oauth.oauth_tokens` table (Postgres). | Automatic: `@seta/oauth.createTokenAcquirer` single-flight refresh via `SELECT … FOR UPDATE` (`platform/oauth/SCOPE.md` § "Owns" `createTokenAcquirer`; setup.md §4 line 199; CLAUDE.md "MSAL is stateless — `oauth.oauth_tokens` is the only SOR; single-flight refresh via `SELECT … FOR UPDATE`"). Manual on compromise: force-revoke (Azure AD revoke session) then delete rows — `@seta/oauth` will refetch on next request. **See "Compromise procedure" below.** |
| DEK (data encryption key) wrapping `oauth.oauth_tokens` ciphertext | One DEK per `oauth_tokens` row, wrapped under the KMS KEK with `EncryptionContext = { tenantId, purpose: 'oauth_token' }` (setup.md §4 lines 277-326). | Annual | On-call (coordinated with cloud team) | KMS-wrapped ciphertext stored alongside the row in `oauth.oauth_tokens`. Plaintext DEK is zeroed in `finally` after each use (`platform/oauth/SCOPE.md` § "Patterns to follow" — `vault.ts:120-126,180-184`; setup.md §4 line 318 implicit). | `pnpm tsx tooling/scripts/rotate-dek.ts` (setup.md §11 `tooling/scripts/` `docs/setup.md:1004`). Re-encrypts every `oauth_tokens` row under a freshly-generated DEK. `EncryptionContext` is unchanged (still `{ tenantId, purpose: 'oauth_token' }`) so KMS-decrypt still validates. **See "DEK rotation procedure" below.** |
| KMS KEK (key encryption key — the cloud-provider-managed CMK) | Wraps every DEK. Production uses `AwsKmsProvider` (AWS KMS CMK) or `AzureKeyVaultProvider` (Key Vault key) per `KMS_PROVIDER` env (setup.md §4 lines 277-326; `platform/auth/SCOPE.md` § "Patterns to follow"; `platform/oauth/SCOPE.md` § "Owns" — transitional location). | Annual | On-call (coordinated with cloud team) | AWS KMS / Azure Key Vault. Identified by `env.KMS_KEY_ARN` (AWS) or Key Vault URI (Azure). | **AWS:** enable automatic key rotation (`aws kms enable-key-rotation`) — AWS rotates the backing key material annually; the CMK ARN is stable, no client-side action. **Azure:** `az keyvault key rotate` triggers the rotation policy; key URI version increments. **See "KEK rotation procedure" below.** |
| API-key argon2 hash params (`auth.api_keys.hashed_key`) | OWASP 2024 params pinned in `@seta/auth` (`m=64MB, t=3, p=4, hashLength=32`) per setup.md §4 lines 245-275 and `platform/auth/SCOPE.md` § "Patterns to follow". | **Passive (upgrade-on-verify).** No manual rotation. | N/A — verify path. | Embedded in each `hashed_key` Argon2 string. | `verifyApiKey` runs `needsRehash(stored, PARAMS)` on every successful verify; if PARAMS have tightened, `hash(raw, PARAMS)` runs once and `onUpgrade(newHash)` persists the upgraded hash (setup.md §4 lines 263-272). **Action required only when global PARAMS bump:** edit the `PARAMS` constant in `@seta/auth/src/api-keys.ts`, ship, then every subsequent verify amortises the upgrade. CLAUDE.md "no compat shims" — when the constant changes, every existing caller upgrades automatically; no `legacyVerify` path is added. |
| `EnvDekProvider.DEV_DEK_BASE64` | Local-dev DEK substitute (setup.md §4 line 320; `platform/oauth/SCOPE.md` § "Patterns to avoid" — "Do not let `EnvDekProvider` run in production"). | Never (dev only) | Each developer | `.env.local`, gitignored. | Rotate at developer discretion; never expected in production. **Production deployment guards must prevent `KMS_PROVIDER=env`.** |

> **Not in this inventory because they are not secrets:**
> `app.tenant_id` Postgres GUC — a per-transaction identity setting, not a
> credential (setup.md §3 lines 130-168). It changes per request. Listed here
> only to forestall the question.

## Procedure (per secret) — generic template

Every named application secret in the inventory follows this template. The
DEK and KEK have their own dedicated procedures below because they touch
ciphertext at scale.

The template is built around **stage → dual-window → cut over → revoke →
audit-log → calendar**:

1. **Stage the new secret.** Generate it in the provider's console (Azure
   AD, AWS KMS, Google Cloud, etc.) or via the platform's secret generator
   (`openssl rand` / `aws kms generate-data-key` etc.). **Never paste the new
   secret into chat, an issue, or a doc** — it lives only in the secret store
   and the operator's terminal session.
2. **Verify the dual-window applies.** Identify whether the secret supports
   simultaneous validity for both old and new values:
   - `MS_BOT_SECRET`, OAuth client secrets: **yes** — Azure AD can hold two
     active client secrets at once. Use the dual-window.
   - DEK: **yes by design** — each row carries its own wrapped DEK, so old
     rows decrypt under the old DEK while new writes use the new one until
     the re-encrypt pass completes.
   - KEK (AWS auto-rotation): **yes** — AWS retains every previous key
     version and chooses the right one by ciphertext-blob metadata.
3. **Dual-publish to the deployment.** For env-var secrets: push the new
   value to the secret store under a versioned key (`MS_BOT_SECRET_V2`).
   Deploy a config change that reads both old and new (the env validator at
   `apps/api/src/env.ts` must accept either while you're in the window). For
   DB-backed secrets: insert the new alongside the old.
4. **Cut over.** Switch the primary code path to read the new value.
   `apps/api` redeploy is the cut-over event. Run an end-to-end smoke
   against the freshly-deployed instance (channel-specific — see
   "Per-secret smoke tests" below).
5. **Revoke the old.** In the provider's console, delete or disable the old
   secret. For DB-backed secrets, run the "delete old" path.
6. **Audit-log the rotation event.** Use `@seta/audit.recordAudit`
   (`platform/audit/SCOPE.md` § "Owns"). One row per rotation:
   ```ts
   await recordAudit(sql, {
     tenantId: '<seta-tenant>',                  // Seta operator tenant
     actor:    { type: 'user', userId: '<operator-user-id>' },
     operation: 'secret.rotated',
     resource:  { type: 'secret', ids: ['MS_BOT_SECRET'] },
     result:    'ok',
     metadata:  { from_version: 'v1', to_version: 'v2', reason: 'quarterly' },
   })
   ```
   `metadata` MUST NOT contain the secret itself — `platform/audit/SCOPE.md`
   § "Patterns to avoid" — "Do not put secrets in `metadata`."
7. **Update the rotation log table.** Add a row at the bottom of this
   runbook in the same PR as any configuration changes.
8. **Update the calendar reminder.** Shift the next reminder forward 90
   days. If the rotation slipped past its scheduled date, the reminder still
   resets from the actual rotation date, not the missed slot — and the slip
   gets logged in the row's "Notes" column.

### Per-secret smoke tests after cut-over

| Secret | Smoke test |
|---|---|
| `MS_BOT_SECRET` | POST to `/teams/health` from the bot service (setup.md §11 `routes.ts` `docs/setup.md:911`). Expect 200 + a fresh outbound token in the bot-token cache (`platform/observability` traces show a successful client-credentials grant). |
| `ENTRA_CLIENT_SECRET` | Trigger an admin-consent end-to-end against a non-prod tenant: hit `/oauth/entra/consent-url` → manually complete in Azure → assert `/oauth/entra/callback` writes a row and the next `/agent/health`-driven Graph call succeeds. `platform/oauth/SCOPE.md` § "Owns" + setup.md §4 line 201. |
| Future per-connector OAuth client secrets | Same shape; provider-specific consent-url + callback assertion. |
| `oauth.oauth_tokens.*` (manual revoke on compromise) | Force a sign-out of the affected user; assert next user request triggers a fresh OBO or client-credentials flow (`platform/oauth/SCOPE.md` § "Owns" — `acquireOnBehalfOf` / `acquireAppOnly`). |
| DEK | See "DEK rotation procedure" below — its own validation. |
| KEK | See "KEK rotation procedure" below — its own validation. |

## DEK rotation procedure (annual, special)

DEK rotation is mechanically different from env-var secrets because it touches
every encrypted row. The procedure re-encrypts every `oauth.oauth_tokens`
ciphertext under a freshly-generated DEK while the KMS `EncryptionContext`
(`{ tenantId, purpose: 'oauth_token' }`) stays the same — that's the load-bearing
detail: KMS-decrypt continues to validate against the same context, so the
DEK rotation is invisible to every consumer.

References: setup.md §4 lines 277-326 (KMS provider abstraction + DEK
pattern + `EncryptionContext` rationale at line 325); setup.md §11
`tooling/scripts/rotate-dek.ts` (`docs/setup.md:1004`); `platform/oauth/SCOPE.md`
§ "Owns" — `TokenVault` / `createTokenVault` / `KmsAuthTagInvalid`.

1. **Pre-flight.** Run a restore drill (companion runbook) within the last
   30 days. DEK rotation without a working backup is a single point of
   failure.
2. **Pre-flight ciphertext sample.** Decrypt three sample rows
   (different tenants) with the current DEK to confirm the KMS path is
   healthy. Capture the plaintext hash (not the plaintext) for post-rotation
   comparison.
3. **Run the script.** `pnpm tsx tooling/scripts/rotate-dek.ts`. The script
   (per setup.md §11 line 1004) iterates every `oauth.oauth_tokens` row,
   calls `KmsProvider.generateDataKey({tenantId, purpose: 'oauth_token'})`
   to mint a fresh DEK, decrypts the existing ciphertext, re-encrypts under
   the new DEK, and writes the row back in a per-tenant transaction (so RLS
   `SET LOCAL app.tenant_id` is respected per `platform/oauth/SCOPE.md`
   § "Patterns to follow" — `withTenantTx`). The script MUST stream rows
   rather than load all of them into memory; the plaintext DEK is zeroed in
   `finally` after each row (`platform/oauth/SCOPE.md` § "Patterns to follow"
   — `vault.ts:120-126,180-184`).
4. **Post-rotation validation.** Decrypt the same three sample rows; their
   plaintext hashes must match the pre-rotation captures.
5. **Audit-log.** One `secret.rotated` event with
   `metadata: { secret: 'oauth_tokens_dek', rows_rotated: <count> }`.
6. **No "old DEK retention".** Each row carries its own wrapped DEK; once a
   row is rewritten under a new DEK, the old wrapped DEK ceases to exist
   (it was per-row, in the same column that the script overwrote). There is
   no central old-DEK archive.

> **`EncryptionContext` stays the same** — that is the load-bearing
> invariant. setup.md §4 line 325: "With `{tenantId, purpose}` bound, decrypt
> succeeds only for the original tenant+purpose pair." Re-keying preserves
> that pair; cross-tenant attacks remain blocked.

## KEK rotation procedure (annual, special)

KEK rotation is whatever the cloud provider supports — Seta does not roll its
own KEK lifecycle.

References: setup.md §4 lines 277-326; `platform/auth/SCOPE.md` § "Patterns
to follow"; `platform/oauth/SCOPE.md` § "Patterns to follow" — `AwsKmsClient`.

- **AWS KMS:** `aws kms enable-key-rotation --key-id <KMS_KEY_ARN>` once;
  thereafter AWS rotates the backing material annually. The CMK ARN is
  stable. Wrapped DEK blobs carry the key-version metadata; AWS picks the
  right version on decrypt. No client-side action.
- **Azure Key Vault:** `az keyvault key rotate --vault-name <name> --name
  <key>` triggers the rotation policy. The key version URI increments. The
  `AzureKeyVaultProvider` (setup.md §4 row 183; `platform/auth/SCOPE.md`
  § "Owns") accepts the unversioned key URI; Azure Key Vault routes to the
  current version on encrypt and to the matching version on decrypt
  (versioned blob metadata).
- **Post-rotation validation.** Decrypt three sample `oauth.oauth_tokens`
  rows (different tenants). KMS auto-resolves the old wrapping version;
  decrypt must succeed. If it fails (`KmsAuthTagInvalid` from
  `platform/oauth/src/vault.ts` per `platform/oauth/SCOPE.md` § "Owns"),
  the rotation policy is mis-configured and the previous key version must
  be re-enabled while platform engineering investigates.
- **Audit-log.** One `secret.rotated` event with
  `metadata: { secret: 'kms_kek', new_key_version: '<version>' }`.

## Compromise procedure

If a secret is leaked, suspected leaked, or accidentally committed:

1. **Rotate immediately.** Follow the standard rotation procedure for that
   secret. Do **not** wait for the next scheduled slot.
2. **Force-revoke downstream tokens / sessions.**
   - `MS_BOT_SECRET` leak → no downstream tokens; the bot's outbound
     `acquireTokenByClientCredential` cache (setup.md §11 `bot-token.ts`)
     is in-memory and dies on redeploy.
   - `ENTRA_CLIENT_SECRET` leak → revoke every `oauth.oauth_tokens` row for
     every tenant. `@seta/oauth.refresh` (`platform/oauth/SCOPE.md` § "Owns")
     will re-acquire on next request, signed by the new secret.
   - `oauth_tokens.access_token` / `.refresh_token` leak (per-user) →
     revoke the affected user's MSAL session in Azure AD; delete the row.
     The next request triggers a fresh OBO grant.
   - DEK leak (a row's wrapped DEK escapes) → re-run `rotate-dek.ts` on the
     affected row scope. The leaked DEK is useless without a working KMS
     Decrypt grant **and** the matching `EncryptionContext` (setup.md §4
     line 325) — but rotate anyway.
   - KEK leak (a CMK is exfiltrated) → disable the CMK; provision a new
     CMK; re-wrap every DEK by running `rotate-dek.ts` against the new
     CMK. This is a P0 incident — sponsor + cloud team paged.
3. **Audit-log the breach.** `recordAudit` with
   `operation: 'secret.compromised'`, `result: 'failure'`, and free-form
   `metadata: { secret: '<name>', detected_at: '2026-MM-DDT…', reporter:
   '<who>' }`. Subsequent rotation events thread the same incident id in
   `metadata`.
4. **Notify the sponsor + the customer tenant if downstream tokens were
   affected.** Notification path is owned by the security incident
   playbook (separate doc; not in this runbook's scope).
5. **Write an ADR** if the compromise reveals a structural weakness
   (CLAUDE.md "ADRs for non-reversible decisions").

## Rotation log

| Date | Secret | Operator | Old id | New id | Verified-in-prod-by | Notes |
|---|---|---|---|---|---|---|
| 2026-Q3 (2026-09-30) | `MS_BOT_SECRET` | TBD | TBD | TBD | TBD | TBD |
| 2026-Q3 (2026-09-30) | `ENTRA_CLIENT_SECRET` | TBD | TBD | TBD | TBD | TBD |
| 2026-Q4 (2026-12-30) | `MS_BOT_SECRET` | TBD | TBD | TBD | TBD | TBD |
| 2026-Q4 (2026-12-30) | `ENTRA_CLIENT_SECRET` | TBD | TBD | TBD | TBD | TBD |
| 2026-Q4 (2026-12-30) | DEK (annual) | TBD | TBD | TBD | TBD | TBD |
| 2026-Q4 (2026-12-30) | KEK (annual) | TBD | TBD | TBD | TBD | TBD |
| 2027-Q1 (2027-03-30) | `MS_BOT_SECRET` | TBD | TBD | TBD | TBD | TBD |
| 2027-Q1 (2027-03-30) | `ENTRA_CLIENT_SECRET` | TBD | TBD | TBD | TBD | TBD |
| 2027-Q2 (2027-06-30) | `MS_BOT_SECRET` | TBD | TBD | TBD | TBD | TBD |
| 2027-Q2 (2027-06-30) | `ENTRA_CLIENT_SECRET` | TBD | TBD | TBD | TBD | TBD |

> **Old id / New id** is the provider's secret id (Azure AD secret display id,
> AWS KMS key version arn, etc.). Never the secret value. CLAUDE.md "no
> compat shims" + `platform/audit/SCOPE.md` § "Patterns to avoid" — "Do not
> put secrets in `metadata`".

## Open questions

1. **Automated rotation tooling.** Today every rotation is hand-driven from
   the cloud-provider console plus a CLI invocation. Terraform's `azuread`
   and `aws` providers can manage these end-to-end, and HashiCorp Vault
   offers dynamic secrets for the Entra app credential. CLAUDE.md "Build for
   now" gates that work until the operational pain justifies it. Recommend
   re-evaluating after two consecutive on-call rotations report > 1h
   manual time per quarter.
2. **Rotation during an incident window.** This runbook defers scheduled
   rotations during an active incident on the same secret class. Multi-class
   incidents (e.g., an Entra outage during a quarterly slot for
   `MS_BOT_SECRET`, which is independent) is not addressed. Recommend
   deferring only when the rotation would touch the impacted system;
   independent rotations proceed.
3. **Certificate-based Entra auth (P3).** setup.md §4 line 218 comments
   "or certificate in P3". When that lands, this runbook adds a "certificate
   rotation" row (one-year cert lifetime; rotate at 11 months; revoke at 12).
4. **API-key DEK separate from `oauth_tokens` DEK.** setup.md §4 line 291
   declares `purpose: 'oauth_token' | 'session' | 'api_key'` on
   `EncryptionContext`. P1 ships only `oauth_token`; the `session` and
   `api_key` purposes are scaffolded for when those secrets land. The
   inventory table above will gain rows when they do.
5. **`platform/oauth/SCOPE.md` Open Question 1: KMS location.** The
   `KmsProvider` / `AwsKmsProvider` / `EnvDekProvider` interface lives in
   `@seta/oauth/src/kms.ts` today (setup.md §4 places it in `@seta/auth`).
   When the move lands (CLAUDE.md "no compat shims" — single PR), update the
   "How rotated" column entries for DEK + KEK to point at the new module
   path.
6. **KMS key alias vs versioned ARN in env.** Today `env.KMS_KEY_ARN` is the
   versioned ARN. AWS key-version-aware decrypt works either way, but an
   alias (`alias/seta-prod-kek`) survives manual key rotation more
   gracefully than a pinned ARN. Recommend migrating to an alias before the
   first KEK rotation; document in a follow-up ADR.
