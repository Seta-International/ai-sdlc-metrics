# Seta Agent Foundation — Monorepo Setup

Stack picks, repo layout, and copy-paste config files. Scoped to P1 (1 month, 3 AI eng). One pick per slot, one version per pick. Lean + standard OSS only.

> Versions verified against npm on **2026-05-11**. Re-verify before bootstrap if more than ~2 weeks have passed.

---

## 1. Toolchain

| Slot | Pick | Latest | Why |
|---|---|---|---|
| Package manager | pnpm | **11.0.9** | Native workspaces, fastest install, content-addressable store |
| Task runner | Turborepo | **2.9.12** | Remote-cacheable task graph; minimal config |
| TS compiler | TypeScript strict | **6.0.3** | `strict` + `noUncheckedIndexedAccess` |
| Library bundler | tsup (esbuild) | **8.5.1** | Dual ESM/CJS, zero-config |
| Dev runner | tsx | **4.21.0** | TS direct + hot-reload via `tsx watch`. **Coexists with Node 24 native TS** — use `node --experimental-strip-types` for simple scripts (constraint: `erasableSyntaxOnly` — no enums, no namespaces, no parameter properties, no `const enum`). tsx handles everything else + watch mode + path mappings. Multi `--import` works: `node --import tsx --import ./src/instrumentation.ts ./src/main.ts`. |
| Linter + formatter | Biome | **2.4.15** | One tool; built-in import enforcement |
| Tests | Vitest | **4.1.5** | Fast, ESM-native, snapshot + coverage |
| Migrations | drizzle-kit | **0.31.10** | Generates SQL from schema |
| Versioning | changesets | **2.31.0** | Per-package changelogs |
| Git hooks | lefthook | **2.1.6** | YAML config, faster than husky, parallel hooks |
| CI | GitHub Actions | — | Free for private orgs at this scale |

## 2. Runtime & framework

| Slot | Pick | Latest | Why |
|---|---|---|---|
| Node | Node.js LTS | **24 LTS** | Active LTS as of Oct 2025 (Node 22 dropped to Maintenance / security-only). Adds native TS type-stripping (opt-in alternative to tsx for simple files), V8 13.x perf, stable `--import` for OTel preload. |
| HTTP server | Hono | **4.12.18** | Type-safe, Web-Standards req/res, native SSE |
| Hono Node adapter | @hono/node-server | **2.0.2** | Required for Node runtime |
| Schema | Zod | **4.4.3** | Standard Schema v1; major perf gains over v3 |
| OpenAPI gen | @hono/zod-openapi | **1.4.0** | Routes are the spec source. ⚠ Re-exports its own `z` (Zod 4 wrapped with `.openapi()` extension); see §15 import rule. **Verify Zod 4 internal compatibility before P1 close-out** — if it still pins Zod 3, OpenAPI routes use Zod 3 internally and we lose unified schema types. |
| Logger | pino | **10.3.1** | Fastest structured logger |
| Pretty logs (dev) | pino-pretty | **13.1.3** | Dev transport only |
| Env | dotenv + Zod on `process.env` | **dotenv 17.4.2** | Vanilla; KMS-fetched in prod |
| IDs | uuid (v7) | **14.0.0** | RFC 9562 v7 — time-sortable like uuid, but stored in native Postgres `uuid` column (16 bytes binary, smaller indexes than uuid's 26-char text). IETF standard; one dep covers v4/v7. (Switched from `uuid` after Context7 audit.) |

## 3. Data layer

| Slot | Pick | Latest | Why |
|---|---|---|---|
| DB | PostgreSQL + pgvector | **17 (pgvector 0.8.2-pg17)** | Mature, vector + FTS in one store |
| Driver | postgres-js | **3.4.9** | Faster than `pg`; Drizzle's recommended |
| ORM | Drizzle ORM | **0.45.2** | Type-safe, close to SQL, native pgvector |
| Cache | lru-cache | **11.3.6** | In-process only; Redis is P2 |
| Queue | p-queue | **9.2.0** | In-process ingest; no external queue in P1 |
| Tenancy backstop | Postgres RLS | (pg17) | Defense-in-depth — `tenant_id` enforced at the DB even if a query forgets the WHERE clause |
| Backup / PITR | Managed Postgres snapshots + WAL | — | Daily snapshot, 7-day WAL retention; restore drill once per quarter |

**Scaling triggers — when in-process state must move to Redis (or equivalent):**
- The API needs >1 process for HA or throughput.
- Bot Framework outbound token cache must be shared (avoid thundering-herd at MS auth endpoint when scaled).
- Inbound SSO sessions need to survive a restart on a different instance.
- Queue durability becomes a requirement (any ingest you can't replay from source on restart).

Hitting any of these triggers Redis adoption — do not defer past the trigger.

### Multi-tenancy: app-layer + RLS

`tenantContext.getTenantId()` (AsyncLocalStorage) is the *primary* enforcement; RLS is the backstop. **Drizzle 0.36+ ships first-class RLS helpers** (`pgPolicy`, `pgRole`) — define policies in the schema, not as raw SQL. (Verified against `drizzle-team/drizzle-orm-docs` for our pinned 0.45.2.)

```ts
// platform/db/src/schema/threads.ts
import { sql } from "drizzle-orm"
import { pgTable, pgPolicy, pgRole, uuid, text, timestamp } from "drizzle-orm/pg-core"

export const tenantUser = pgRole("tenant_user")          // app role; sets app.tenant_id per request
// NOTE: drizzle-orm 0.45.2's pgRole has no `bypassRls` option (PgRoleConfig
// only supports createDb/createRole/inherit). The BYPASSRLS attribute is
// set at role creation in `infra/postgres/init.sql`:
//   CREATE ROLE platform_admin WITH LOGIN BYPASSRLS …
export const platformAdmin = pgRole("platform_admin") // migrations / ops only — not a tenant identity

export const threads = pgTable("threads", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").notNull(),
  title:     text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  pgPolicy("tenant_isolation_select", {
    as: "permissive", to: tenantUser, for: "select",
    using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
  }),
  pgPolicy("tenant_isolation_modify", {
    as: "permissive", to: tenantUser, for: "all",
    using:     sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
  }),
])
```

`drizzle-kit generate` emits the matching `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` SQL. Apply with `drizzle-kit migrate`.

> **Version note.** `pgTable.withRLS()` (the shorthand that auto-enables RLS without explicit `ALTER TABLE`) is **only in Drizzle 1.0-beta** — not available at our 0.45.2 pin. Until we move to 1.0, enable RLS via the migration that `drizzle-kit generate` produces, or via this raw template at `platform/db/migrations/_template_rls.sql` for ad-hoc tables:
>
> ```sql
> ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
> ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
> ```

### Schema-per-module (DDD)

**Each bounded context owns its own Postgres schema.** Drizzle schema files + migrations live with the owner package, not centralized in `@seta/db`. This is what keeps `modules/connectors/<vendor>/` clean — a new connector adds its own schema without touching shared tables — and it makes ownership unambiguous when boundary lines get tested at PR-review time.

**P1 schemas:**

| Schema | Owner package | Purpose |
|---|---|---|
| `auth` | `@seta/auth` | `users`, `sessions`, `api_keys` |
| `tenant` | `@seta/tenant` | `tenants`, `tenant_connectors` |
| `directory` | `@seta/directory` *(new)* | `external_identities` — canonical user ↔ external-IdP subjects, JIT-populated on OIDC sign-in |
| `oauth` | `@seta/oauth` | `oauth_tokens` (KMS-envelope encrypted), `oauth_state` (CSRF state, 15-min TTL) |
| `audit` | `@seta/audit` *(new)* | `audit_log` — every privileged op + every external API call |
| `connector_ms365_directory` | `@seta/connector-ms365-directory` | `directory_users`, `directory_groups`, `directory_group_members`, `sync_state` — MS Graph directory mirror |
| `connector_ms365_planner` | `@seta/connector-ms365-planner` | `planner_tasks_cache`, `planner_task_details_cache`, `planner_plans_cache`, `planner_buckets_cache`, `sync_watermarks` — MS Graph Planner mirror |
| `agent` | `@seta/agent` (product) | `write_continuations` — HMAC-signed preview→commit tokens; future: conversations, runs, working memory |
| `agent_memory` | `@seta/agent-memory` | `threads`, `messages`, `resources` — durable conversation memory (Mastra-aligned) |
| `agent_workflows` | `@seta/agent-workflows` | `workflow_snapshots`, `workflow_steps` — durable workflow execution state, suspend/resume |

Future connectors (`@seta/connector-trello`, `@seta/connector-google-directory`, `@seta/connector-jira`) land as new `connector_<vendor>_<surface>` schemas alongside.

> Snapshot retention for `agent_workflows` is forward-only in P1. The package exports `pruneCompletedSnapshots()` as an ops surface; wire from cron when storage growth is documented.

**DDD rules — enforced by review, not by tooling (yet):**

- **No cross-schema foreign keys.** References across bounded contexts are by ID only. `tenant_id` (UUID) is the cross-cutting correlation key, present in every tenant-scoped table.
- **Each schema is owned exclusively by its owner package's Drizzle schema file.** No package reads another's tables directly — go through the owner's exported API.
- **Migrations partitioned by schema.** Each owner package has its own `drizzle.config.ts` and `migrations/` directory; see §12 for the per-package shape. A top-level migration runner applies them in dependency order at boot (`auth` → `tenant` → `directory` → `oauth` → `audit` → each `connector_*` → `agent`).
- **Forward-only.** No downgrade migrations.

**What `@seta/db` is for now.** With schema definitions distributed to owner packages, `@seta/db` is the **connection pool + cross-cutting utilities** (`withTenant`, the `tenantUser`/`platformAdmin` role exports, the migration runner, the RLS-policy macro). It owns no application tables.

### `@seta/db` request wrapper — the only correct way to set the GUC

`SET LOCAL` ONLY persists for the duration of a Postgres transaction. Outside a transaction, postgres-js auto-commits each query as its own implicit tx — the GUC is gone before the next query runs and **RLS reads `current_setting('app.tenant_id')` as NULL → tenant sees zero rows**. Worse: using plain `SET` (no `LOCAL`) on a reserved/pooled connection persists across releases, **leaking the previous request's tenant_id into the next request that gets that connection** — silent cross-tenant data exposure.

The wrapper enforces both:

```ts
// platform/db/src/with-tenant.ts
import postgres from "postgres"

export const sql = postgres(env.DATABASE_URL, {
  max:                env.PG_POOL_MAX ?? 20,        // tune to expected concurrency
  idle_timeout:       30,
  max_lifetime:       60 * 30,
  connect_timeout:    10,
  prepare:            false,                        // pgvector ops choke on prepared statements
  connection: { application_name: "seta-api" },
})

// THE only entrypoint for tenant-scoped queries. RLS depends on this.
export function withTenant<T>(tenantId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    // postgres-js parameterizes tagged values, so `SET LOCAL key = ${val}` becomes
    // `SET LOCAL key = $1` which Postgres rejects (no bind params in SET).
    // Use set_config with is_local=true — same tx-scoped semantics, accepts bind params.
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx)
  })
}
```

Usage from a Hono handler:

```ts
const tenantId = tenantContext.getTenantId()       // from AsyncLocalStorage
const threads  = await withTenant(tenantId, (tx) => tx`SELECT * FROM threads`)
```

Anything that does `await sql\`SELECT ...\`` directly on the root client without `withTenant` will have `app.tenant_id` unset — RLS will reject the query. That's the desired failure mode: deny by default. (Verified against porsager/postgres docs.)

> **Pool sizing.** Default `max: 10` is too low for a tenant-per-tx workload. Each in-flight request holds one connection for its whole transaction. Start at `max: 20`; raise if you see `connect_timeout` errors under load. Postgres' own `max_connections` (default 100) is the upstream cap — leave headroom for `platform_admin` migrations.

The bypass role (`platform_admin`) is reserved for migrations and ops scripts; the app connects as `tenant_user`. **Naming note**: `platform_admin` rather than `seta_admin` so the role describes its privilege level (platform-level operator), not a tenant identity — Seta itself is just an ordinary tenant.

## 4. Auth & secrets

Multi-tenant from day 1 — tenantId flows through every layer.

| Slot | Pick | Latest | Why |
|---|---|---|---|
| API key hashing | @node-rs/argon2 | **2.0.2** | Native (Rust binding via napi-rs, NOT the C-based `argon2` package). OWASP 2024 defaults: argon2id, m=64MB, t=3, p=4, hashLength=32. **Verify-path uses `needsRehash` + auto-upgrade** (see §4 pattern below). |
| AES-GCM encryption | node:crypto | (built-in) | Encrypts `oauth_tokens.*_token` and session secrets |
| KMS (AWS) | @aws-sdk/client-kms | **3.1045.0** | Local dev = env DEK |
| KMS (Azure) | @azure/keyvault-keys | **4.10.0** | Pick per cloud |
| Outbound OAuth (Entra: admin consent, OBO, client_credentials, refresh) | @azure/msal-node | **5.2.0** | `ConfidentialClientApplication` covers `acquireTokenByCode` (admin consent), `acquireTokenOnBehalfOf` (Teams SSO → Graph), `acquireTokenByClientCredential` (app-only / sync worker), and the JWKS/JWT plumbing. MS absorbs protocol drift via SDK updates; we don't pay the recurring 300-400 LOC tax. **MSAL is treated as stateless by `@seta/oauth`** — we don't wire its `ICachePlugin`; the encrypted `oauth.oauth_tokens` table is the only SOR, with single-flight refresh via `SELECT … FOR UPDATE`. One CCA instance per tenant id, cached in an LRU. (Verified May 2026 against `@azure/msal-node` 5.2.0 + Microsoft Learn admin-consent docs.) |
| JWT validation (Bot Framework + inbound Entra ID tokens) | jose | **6.2.3** | Web-Crypto-based; tree-shakable. Used for Bot Framework JWKS-based JWT verification and (P2) inbound OIDC ID-token validation. **Not** used for outbound Entra OAuth — MSAL owns that. |
| Microsoft Graph (HTTP) | raw `fetch` + thin typed wrapper in `@seta/ms-graph` | — | `@microsoft/microsoft-graph-client` last published 2022 (dead); `@microsoft/msgraph-sdk` (Kiota) still pre-GA in 2026. Our `@seta/ms-graph` wrapper handles 429 backoff, 5xx retry, ETag passthrough (`If-Match` on PATCH), `$batch` (≤20 ops), audit middleware, and OTel spans. |
| Microsoft Graph types | @microsoft/microsoft-graph-types | **2.43.1** | Types only; safe to depend on even though the SDK is dead. |
| Rate limiting | hono-rate-limiter | **0.x (verify at install)** | Per-tenant + per-IP limits; in-memory store P1, Redis store when scaling triggers hit |
| Secret rotation | Documented runbook | — | `MS_BOT_SECRET`, OAuth client secrets, DEKs — quarterly rotation drill, KMS key rotation annual |
| **Inbound SSO (P2 — user-facing web login)** | Entra ID + Google OIDC via hand-rolled `jose` + PKCE | (built-in + jose) | Same `jose` already used for Bot Framework JWT; no extra SDK; multi-tenant SSO config in `sso_providers` table |
| Inbound session storage (P2) | Postgres `sessions` table + signed cookies | (drizzle + node:crypto) | No Redis in P1/P2; LRU cache for hot lookup |

### MSAL Node — multi-tenant Entra usage pattern (verified against @azure/msal-node 5.2.0 + Microsoft Learn)

`@seta/oauth` exposes a provider-agnostic `OAuthProvider` interface; the Entra implementation wraps `ConfidentialClientApplication`. Three things make the multi-tenant SaaS shape work:

1. **One CCA per tenant id, cached in an LRU.** App-only (`acquireTokenByClientCredential`) requires a tenant-specific authority (`https://login.microsoftonline.com/<tenantId>/v2.0`), so we can't reuse a single CCA across tenants. LRU(256, 60min TTL) keeps the working set bounded; Redis-ready in shape today.

2. **MSAL is stateless from our perspective.** We do not wire `ICachePlugin`. Each call goes through MSAL; we normalize the `AuthenticationResult` to our `TokenBundle` and persist via `TokenVault` (`oauth.oauth_tokens`, KMS-envelope encrypted, see KMS provider abstraction below). Reasons: (a) future providers (Trello/Atlassian, Google) have no MSAL — uniform handling; (b) MSAL's serialized cache format is opaque, our schema stays clean; (c) we own single-flight via `SELECT … FOR UPDATE` on the token row, which MSAL Node does NOT coordinate across instances ([issue #7909](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/7909)).

3. **Admin consent via the dedicated `/adminconsent` endpoint, not `getAuthCodeUrl`.** Only the dedicated endpoint can grant **application** permissions in one click. Build the URL as `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=…&redirect_uri=…&scope=https://graph.microsoft.com/.default&state=…`. The `.default` scope consents to *everything* declared in the App Registration's required-permissions list (delegated + application together); per-connector scope union is then a sanity check, not a URL parameter.

Skeleton:

```ts
// platform/oauth/src/providers/entra.ts
import { ConfidentialClientApplication } from "@azure/msal-node"
import { LRUCache } from "lru-cache"

const ccaCache = new LRUCache<string, ConfidentialClientApplication>({ max: 256, ttl: 60 * 60_000 })

function getCca(tenantId: string) {
  let cca = ccaCache.get(tenantId)
  if (!cca) {
    cca = new ConfidentialClientApplication({
      auth: {
        clientId:     env.ENTRA_CLIENT_ID,
        clientSecret: env.ENTRA_CLIENT_SECRET,   // or certificate in P3
        authority:    `https://login.microsoftonline.com/${tenantId}/v2.0`,
      },
      system: { loggerOptions: { logLevel: 3 /* Warning */ } },
    })
    ccaCache.set(tenantId, cca)
  }
  return cca
}

// app-only — used by the sync worker (Epic 3)
export async function acquireAppOnly(tenantId: string, scopes: string[]) {
  const cca = getCca(tenantId)
  const res = await cca.acquireTokenByClientCredential({ scopes })
  return normalize(res)                          // → TokenBundle stored in oauth.oauth_tokens
}

// OBO — used per user request triggered by Teams SSO assertion
export async function acquireOnBehalfOf(tenantId: string, userAssertion: string, scopes: string[]) {
  const cca = getCca(tenantId)
  const res = await cca.acquireTokenOnBehalfOf({ oboAssertion: userAssertion, scopes })
  return normalize(res)
}
```

Full provider interface, callback handler, scope-union from the connector registry, and revocation-detection path are in `docs/superpowers/specs/2026-05-11-ms365-auth-design.md`.

### API-key verify path with `needsRehash` (verified against argon2 docs)

OWASP defaults shift over time (m=64MB today; m=128MB likely in 2027). To avoid forced password resets / API-key reissue when we tighten parameters, every verify call re-checks the stored hash against current params and rehashes inline:

```ts
// platform/auth/src/api-keys.ts
import { hash, verify, needsRehash, Algorithm } from "@node-rs/argon2"

const PARAMS = {
  algorithm:  Algorithm.Argon2id,
  memoryCost: 64 * 1024,   // KiB → 64 MB
  timeCost:   3,
  parallelism: 4,
  hashLength: 32,
}

export const hashApiKey = (raw: string) => hash(raw, PARAMS)

export async function verifyApiKey(raw: string, stored: string, onUpgrade: (newHash: string) => Promise<void>) {
  if (!(await verify(stored, raw))) return false
  // Upgrade-on-verify: if params have tightened since this hash was created,
  // rehash with current PARAMS and persist. Cheap (~50ms) and amortized.
  if (needsRehash(stored, PARAMS)) {
    const fresh = await hash(raw, PARAMS)
    await onUpgrade(fresh)
  }
  return true
}
```

> **Note on package choice.** We use **`@node-rs/argon2`** (Rust via napi-rs), not the older `argon2` (C via node-gyp). The Rust port avoids native-build pain in CI/Docker, ships pre-built binaries for every platform we care about, and the API is functionally compatible. The `needsRehash`/`verify`/`hash` shape verified above matches both packages.

### KMS provider abstraction

Both AWS and Azure are listed because Seta deploys to both clouds. `@seta/auth` exposes a small interface and picks the impl from `KMS_PROVIDER` env:

```ts
// platform/auth/src/kms/types.ts
export interface KmsProvider {
  generateDataKey(ctx: EncryptionContext): Promise<{ plaintext: Uint8Array; ciphertext: Uint8Array }>
  decryptDataKey(ciphertext: Uint8Array, ctx: EncryptionContext): Promise<Uint8Array>
}

// EncryptionContext is non-secret AAD; KMS denies decrypt if it doesn't match
// the values supplied at encrypt time. Bind every DEK to its tenant — defense
// against an attacker who steals ciphertext + KMS access for a different scope.
export type EncryptionContext = { tenantId: string; purpose: "oauth_token" | "session" | "api_key" }
```

```ts
// platform/auth/src/kms/aws.ts (verified against @aws-sdk/client-kms)
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from "@aws-sdk/client-kms"

export class AwsKmsProvider implements KmsProvider {
  // One long-lived client per process; uses default credential chain (env / IRSA / instance role).
  private client = new KMSClient({ region: env.AWS_REGION })

  async generateDataKey(ctx: EncryptionContext) {
    const out = await this.client.send(new GenerateDataKeyCommand({
      KeyId:             env.KMS_KEY_ARN,         // CMK / KEK
      KeySpec:           "AES_256",
      EncryptionContext: ctx as Record<string, string>,   // bound to tenant + purpose
    }))
    return { plaintext: out.Plaintext!, ciphertext: out.CiphertextBlob! }
  }

  async decryptDataKey(ciphertext: Uint8Array, ctx: EncryptionContext) {
    const out = await this.client.send(new DecryptCommand({
      CiphertextBlob:    ciphertext,
      EncryptionContext: ctx as Record<string, string>,   // MUST match encrypt-time context
    }))
    return out.Plaintext!
  }
}

// impls: AwsKmsProvider, AzureKeyVaultProvider, EnvDekProvider (dev only)
```

Local dev uses `EnvDekProvider` (DEK from `.env.local`, EncryptionContext ignored); prod sets `KMS_PROVIDER=aws|azure` and the appropriate KEK ARN/URI.

> **Why EncryptionContext matters.** Without it, an attacker who exfiltrates encrypted OAuth tokens AND has any access to the KMS key (a compromised IAM role, a stale build secret) can decrypt every tenant's tokens. With `{tenantId, purpose}` bound, decrypt succeeds *only* for the original tenant+purpose pair — even an attacker with KMS Decrypt permission must already know the target tenantId, defeating bulk dump attacks. KMS rejects mismatch with `InvalidCiphertextException`. Cost: zero — EncryptionContext is free metadata.

## 5. LLM & agent kernel

| Slot | Pick | Latest | Why |
|---|---|---|---|
| OpenAI | openai | **6.37.0** | Official SDK |
| Anthropic | @anthropic-ai/sdk | **0.95.1** | Official SDK |
| Tokenizer | js-tiktoken | **1.0.21** | No native deps |
| Streaming | Hono `streamSSE` + `ReadableStream` | — | No socket.io |

### Kernel patterns for OpenAI / Anthropic SDKs (verified against openai-node v6 + anthropic-sdk-typescript)

**Use the SDK's `.stream()` helpers, not raw `create({ stream: true })`.** Both SDKs return a Runner / Stream object with `.on('text'|'content', …)`, `.finalMessage()` / `.finalChatCompletion()`, and `.abort()`. The raw async-iterable form forces us to re-implement event accumulation and abort plumbing. The kernel wraps these into a single `ModelStream<TChunk>` interface so route authors don't see the SDK split.

```ts
// platform/agent/core/src/models/openai.ts
const runner = openai.chat.completions.stream({
  model:    cfg.model,
  messages,
  tools,
  signal:   ctx.signal,                 // wired from streamKernelSSE's onAbort (§5)
})
runner.on("content", (delta) => emit({ type: "text", delta }))
runner.on("tool_calls.function.arguments.delta", (d) => emit({ type: "tool_args", ...d }))
const final = await runner.finalChatCompletion()
```

```ts
// platform/agent/core/src/models/anthropic.ts
const stream = anthropic.messages.stream({
  model:      cfg.model,
  max_tokens: cfg.maxTokens,
  system:     cfg.systemPrompt,         // see prompt-caching note below
  tools,
  messages,
}, { signal: ctx.signal })
stream.on("text", (text) => emit({ type: "text", delta: text }))
const final = await stream.finalMessage()
```

**Do NOT use `runTools()` / `beta.messages.toolRunner()`.** They handle the multi-turn tool loop internally — convenient for one-off scripts, but the kernel is exactly that loop (K4 in our roadmap). Owning the loop lets us enforce per-tool budgets, RLS-aware tool execution, structured cost accounting, and deterministic replay from `__recordings__`.

**Abort wiring is non-negotiable.** Every model call accepts `{ signal }`. The SSE handler's `stream.onAbort()` (§5 streaming notes) MUST trigger `controller.abort()` on the AbortController passed to the model SDK — otherwise a closed client leaves the LLM streaming tokens we'll never deliver, burning quota and money.

### Anthropic prompt caching (5m / 1h ephemeral)

For any agent with a stable system prompt + tool definitions across turns, opt into ephemeral prompt caching by default. Marks the cacheable prefix on the request:

```ts
const stream = anthropic.messages.stream({
  model: cfg.model,
  max_tokens: cfg.maxTokens,
  system: [
    {
      type: "text",
      text: cfg.systemPrompt,
      cache_control: { type: "ephemeral", ttl: "5m" },   // or "1h" for stable agents
    },
  ],
  tools: tools.map((t) => ({
    ...t,
    cache_control: { type: "ephemeral", ttl: "5m" },
  })),
  messages,
})
```

Cost / latency win for any agent that handles >1 message per cache TTL. The kernel exposes `cacheTtl?: "5m" | "1h" | null` on agent config; default `"5m"` for any agent with a `systemPrompt` longer than ~512 tokens. For the OpenAI side, structured-output caching is automatic on supported models — no explicit annotation needed.

### Streaming protocol notes (verified against hono.dev streaming helper)

Three things every stream handler in `@seta/agent-core` must do — easy to forget, painful to debug:

```ts
import { streamSSE } from "hono/streaming"   // NOT from "hono" — separate sub-export

app.get("/threads/:id/stream", (c) =>
  streamSSE(
    c,
    async (stream) => {
      // 1. Wire abort BEFORE the loop. Without this, a closed client leaks
      //    the stream + any LLM connection it owns.
      stream.onAbort(() => { /* cancel LLM call, drop tokens */ })

      // 2. Periodic keep-alive (proxies kill idle SSE around ~30–60s).
      const keepalive = setInterval(() => stream.writeSSE({ event: "ping", data: "" }), 15_000)
      try {
        for await (const chunk of kernelStream) {
          await stream.writeSSE({ event: "chunk", data: JSON.stringify(chunk), id: chunk.id })
        }
      } finally {
        clearInterval(keepalive)
      }
    },
    // 3. Third arg is an error handler. Without it, errors silently log to console.
    (err) => { logger.error({ err }, "sse stream failed") },
  ),
)
```

Codify this in `@seta/agent-core` as a single `streamKernelSSE(c, run)` helper so route authors can't forget any of the three.

## 6. RAG primitives

Split into single-purpose packages (`agent-chunking`, `agent-embeddings`, `agent-vector`, `agent-rag`) so any one is reusable inside the agent platform without dragging the others in.

| Slot | Pick | Latest | Why |
|---|---|---|---|
| Embeddings | OpenAI `text-embedding-3-small` (1536d) | — | Cheap, strong recall |
| Chunker | hand-roll via js-tiktoken | **1.0.21** | LangChain splitters too heavy |
| Vector index | pgvector HNSW | **0.8.2** | Lower latency than IVFFlat |
| FTS | Postgres tsvector + pg_trgm | (pg17) | BM25-ish via `ts_rank_cd` |
| Reranker | none in P1 (Cohere rerank-v3 in P2) | — | RRF fusion suffices |

### Canonical Drizzle pgvector pattern (verified against drizzle-team/drizzle-orm-docs)

When `@seta/agent-vector` lands in P2, the schema and query shape are not negotiable — pgvector + Drizzle has one idiomatic form per opclass. We use cosine because OpenAI embeddings are L2-normalized.

```ts
// platform/agent/vector/src/schema/chunks.ts
import { sql } from "drizzle-orm"
import { pgTable, uuid, text, vector, index } from "drizzle-orm/pg-core"

export const chunks = pgTable("chunks", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").notNull(),
  sourceId:  uuid("source_id").notNull(),
  content:   text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),   // text-embedding-3-small
}, (t) => [
  // HNSW + cosine — lower-latency than IVFFlat at our scale.
  index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  // RLS policy stays per §3 — vector queries are tenant-scoped via withTenant().
])
```

```ts
// top-K nearest neighbour query
import { cosineDistance, desc, gt, sql } from "drizzle-orm"

export async function searchChunks(query: number[], k = 8, minSim = 0.3) {
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, query)})`
  return withTenant(tenantContext.getTenantId(), (tx) =>
    tx.select({ id: chunks.id, content: chunks.content, similarity })
      .from(chunks)
      .where(gt(similarity, minSim))
      .orderBy(desc(similarity))
      .limit(k),
  )
}
```

Three things this gets right by construction: (1) HNSW + `vector_cosine_ops` opclass match — using the wrong opclass silently disables index acceleration; (2) similarity is `1 - cosineDistance` (cosine *distance* is 0–2, similarity is 0–1) — flipping these is the most common pgvector bug; (3) the query goes through `withTenant`, so RLS still applies to vector search.

### HNSW tuning + `iterative_scan` for tenant-filtered search (verified against pgvector ≥ 0.8)

**This is a correctness fix, not just an optimization.** With multi-tenant filtering (`WHERE tenant_id = $1` via RLS), a vanilla HNSW search can return *fewer than `LIMIT k` rows* — pgvector's HNSW prefilter doesn't know about the tenant predicate, so it returns its top-k candidates and Postgres then filters them down, often to <k. **Use `hnsw.iterative_scan` so pgvector keeps probing until it finds k matching rows.**

```ts
// platform/agent/vector/src/search.ts — extends withTenant pattern
export async function searchChunks(query: number[], k = 8, minSim = 0.3) {
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, query)})`
  return withTenant(tenantContext.getTenantId(), async (tx) => {
    // Per-query HNSW tuning. SET LOCAL scopes to the tx; never leaks to other requests.
    await tx`SET LOCAL hnsw.ef_search       = 100`              // recall vs latency
    await tx`SET LOCAL hnsw.iterative_scan  = strict_order`     // 0.8.0+ — fixes filtered-LIMIT bug
    await tx`SET LOCAL hnsw.max_scan_tuples = 20000`            // cap worst-case probe cost

    return tx.select({ id: chunks.id, content: chunks.content, similarity })
      .from(chunks)
      .where(gt(similarity, minSim))
      .orderBy(desc(similarity))
      .limit(k)
  })
}
```

Build-time tuning (in the migration that creates the index):

```sql
CREATE INDEX chunks_embedding_idx ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);   -- defaults are 16/64; bump construction for better recall

-- One-shot: speed up the initial bulk build. SET in a `platform_admin` session.
SET maintenance_work_mem = '8GB';
SET max_parallel_maintenance_workers = 7;
```

**Recommended starting values** (1536-d cosine, ~1M vectors, 95th-percentile recall ≥0.95):
- Build: `m = 16, ef_construction = 128` (~10 min build on 1M rows)
- Query: `hnsw.ef_search = 100` for general search; bump to 200 for low-cardinality tenants
- Always set `iterative_scan = strict_order` for tenant-filtered queries — `relaxed_order` only when ordering accuracy isn't critical

## 7. Teams surface (hand-rolled — no Microsoft SDK)

Bot Framework protocol is REST + JWT + JSON activities. We implement it directly in `modules/teams/`.

> **Maintenance tax (eyes open).** Owning the protocol means owning JWKS rotation, channel auth changes, new activity types, proactive-messaging trust tokens, and Teams-specific quirks (tabs vs chats vs channels). Budget ~1 day/quarter of MS-protocol drift work. We accept this in exchange for zero `botbuilder` / `teams-ai` runtime weight and full request-path visibility. Re-evaluate at P3 if drift exceeds ~2 days/quarter.

### jose JWT verification — patterns required for Bot Framework (verified against panva/jose 6.x)

Three things `modules/channels/teams/src/jwt.ts` must do correctly. Easy to get wrong, dangerous when wrong:

```ts
import * as jose from "jose"

// 1. createRemoteJWKSet takes a URL OBJECT (not string). The function returned
//    is itself the JWKS resolver — pass it to jwtVerify.
const JWKS = jose.createRemoteJWKSet(
  new URL("https://login.botframework.com/v1/.well-known/keys"),
  { cooldownDuration: 30_000 }, // throttle JWKS refetches when an unknown kid arrives
)

// 2. jwtVerify validates aud, iss, exp, nbf, alg, signature in one call.
const { payload } = await jose.jwtVerify(token, JWKS, {
  issuer:    "https://api.botframework.com",
  audience:  env.MS_BOT_ID,
  algorithms: ["RS256"],          // pin allowed algs — avoid "none" / HS confusion
  clockTolerance: 60,             // seconds; Bot Framework clocks drift
})

// 3. During Bot Framework key rotation, two valid keys can match the same kid
//    briefly. Handle the multi-match error explicitly — otherwise valid tokens
//    get rejected for ~minutes after a rotation.
//    See https://github.com/panva/jose docs for ERR_JWKS_MULTIPLE_MATCHING_KEYS.
```

**Stateless deployments** (Lambda, Cloud Run cold starts) must persist the JWKS cache across invocations — otherwise every cold start refetches and you can hit MS rate limits. Use jose's `jwksCache` option backed by Postgres or Redis:

```ts
const cache: jose.JWKSCacheInput = (await readJwksCache()) ?? {}
const JWKS = jose.createRemoteJWKSet(url, { [jose.jwksCache]: cache })
await jose.jwtVerify(token, JWKS)
if (cache.uat !== prevUat) await writeJwksCache(cache)
```

For Entra (inbound SSO P2), repeat with `https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys` and the appropriate `issuer` + `audience`.

### Microsoft Graph Planner — ETag/If-Match (verified against learn.microsoft.com Graph docs)

Every Planner update (`PATCH /planner/tasks/{id}`, `PATCH /planner/plans/{id}`, `PATCH /planner/buckets/{id}`) **requires `If-Match` with the resource's current ETag**. Skip it and Graph returns `412 Precondition Required`. The ETag arrives in the `@odata.etag` field on a prior GET.

`@seta/connector-ms365-planner` bakes the read-then-update flow into every mutating helper (and the agent-product preview/commit tools snapshot the ETag at preview time so concurrency conflicts surface as friendly retry messages, not silent overwrites):

```ts
// modules/connectors/ms365-planner/src/client.ts
export async function updateTaskAssignment(taskId: string, userId: string, orderHint = " !") {
  // 1. Fetch current ETag.
  const cur = await graph.GET(`/planner/tasks/${taskId}`)            // returns { '@odata.etag': '...', ...task }
  // 2. PATCH with If-Match + Prefer: return=representation (saves a re-fetch).
  return graph.PATCH(`/planner/tasks/${taskId}`, {
    headers: {
      "If-Match": cur["@odata.etag"],
      "Prefer":   "return=representation",
    },
    body: {
      assignments: {
        [userId]: { "@odata.type": "#microsoft.graph.plannerAssignment", orderHint },
      },
    },
  })
}
```

> **Required scopes** (delegated, via Teams SSO + OBO): `Tasks.ReadWrite`, `Group.ReadWrite.All`. Read-only flows can use `Group.Read.All`.
>
> **Pagination**: list responses include `@odata.nextLink` — wrap with `for await (const page of graph.paginate(url))` in the Graph client.

| Slot | Pick | Latest | Why |
|---|---|---|---|
| Webhook handler | Hono route | — | Reuses existing server |
| Incoming JWT validation | jose | **6.2.3** | Verify aud/iss/exp/sig against Bot Framework JWKS — see jose patterns below |
| Activity types | Zod schemas (hand-rolled) | — | Strict runtime validation + types |
| Bot token (outbound) | client-credentials → `login.microsoftonline.com/botframework.com/oauth2/v2.0/token` | — | Cached 1h via lru-cache |
| Reply transport | fetch → `serviceUrl/v3/conversations/:id/activities` | — | Async reply (200 immediately, post later) |
| Teams SSO + OBO | `signin/tokenExchange` activity → Entra OBO flow → Graph token (`@seta/oauth`) | — | Reuses our oauth package |
| Adaptive Cards | hand-built JSON + optional `adaptivecards-templating` | **2.3.1** | Optional templating; cards are just JSON |

## 8. Observability

| Slot | Pick | Latest | Why |
|---|---|---|---|
| OTel runtime API | @opentelemetry/api | **1.9.1** | Emit spans/metrics |
| OTel Node SDK | @opentelemetry/sdk-node | **0.217.0** | Auto-init OTel in process |
| Auto-instrumentations | @opentelemetry/auto-instrumentations-node | **0.75.0** | Hono, postgres, fetch out of the box |
| Local collector | otel-collector-contrib | **0.151.0** | Dev only; prod backend is P2 |
| Local trace UI | jaegertracing/all-in-one | **1.76.0** | localhost:16686 |
| Error tracking | @sentry/node | **10.52.0** | Optional. **Must coexist with our OTel SDK** — see §8 Sentry+OTel pattern. |

### `@seta/observability` pino config — redact, OTel correlation, transport (verified against pinojs/pino v10)

Three things production logging must do — without them, you ship token leakage, untraceable logs, and noisy stdout.

```ts
// platform/observability/src/logger.ts
import pino from "pino"
import { trace, context as otelContext } from "@opentelemetry/api"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "seta-api", env: process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),       // "info" not 30, friendlier in cloud log UIs
  },

  // 1. REDACT — without this, OAuth tokens / API keys / Authorization headers
  //    end up in logs and trip every compliance audit. Paths are static; never
  //    accept user input here (per pino docs warning).
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-functions-key"]',
      '*.password', '*.passwordHash',
      '*.access_token', '*.refresh_token', '*.id_token',
      '*.client_secret', '*.api_key', '*.apiKey',
      '*.secret', '*.dek', '*.plaintext',
      'env.MS_BOT_SECRET', 'env.OPENAI_API_KEY', 'env.ANTHROPIC_API_KEY',
    ],
    censor: '[REDACTED]',
  },

  // 2. OTEL CORRELATION — every log line gets the active trace_id / span_id so
  //    Jaeger ↔ logs cross-link works. Without this, debugging a slow request
  //    means grep, not click-through.
  mixin() {
    const span = trace.getActiveSpan()
    if (!span) return {}
    const { traceId, spanId, traceFlags } = span.spanContext()
    return { trace_id: traceId, span_id: spanId, trace_flags: traceFlags }
  },

  // 3. TRANSPORT — OTLP log export in prod, pino-pretty in dev only.
  transport: process.env.NODE_ENV === "production"
    ? {
        target: "pino-opentelemetry-transport",
        options: {
          resourceAttributes: { "service.name": "seta-api" },
        },
      }
    : { target: "pino-pretty", options: { colorize: true } },
})

// Per-request child logger (Hono middleware in @seta/middleware wires this)
export function requestLogger(reqId: string, tenantId?: string) {
  return logger.child({ req_id: reqId, tenant_id: tenantId })
}
```

The `@seta/middleware` request-id middleware injects `requestLogger(...)` into Hono context as `c.var.log` — handlers always use `c.var.log`, never the root `logger`, never `console.log`. (Codified as a Biome `noConsole` rule scoped to `apps/*` and `modules/*`.)

> **Add `pino-opentelemetry-transport` to deps:** `pnpm --filter @seta/observability add pino-opentelemetry-transport`

### OTel init order — the silent footgun (verified against opentelemetry.io)

**The SDK must start before any application code imports.** If `import { Hono } from "hono"` runs first, the auto-instrumentation never patches Hono and you get traces with zero HTTP spans — looks like it's working, isn't.

The fix is Node 22's `--import` flag pointing at a tiny instrumentation file. The instrumentation file lives in the **app**, not the package — `@seta/observability` exports the factory, the app calls it.

```ts
// apps/api/src/instrumentation.ts (must be loaded via --import)
import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"

const sdk = new NodeSDK({
  serviceName: "seta-api",
  traceExporter: new OTLPTraceExporter(),  // defaults to http://localhost:4318/v1/traces
  instrumentations: [getNodeAutoInstrumentations({
    // Disable noisy/expensive instrumentations we don't need:
    "@opentelemetry/instrumentation-fs": { enabled: false },
    "@opentelemetry/instrumentation-dns": { enabled: false },
  })],
})
sdk.start()

// graceful shutdown so spans flush
process.on("SIGTERM", () => sdk.shutdown().finally(() => process.exit(0)))
```

```jsonc
// apps/api/package.json — scripts
{
  "scripts": {
    "dev":   "tsx watch --import ./src/instrumentation.ts src/main.ts",
    "start": "node    --import ./dist/instrumentation.js dist/main.js"
  }
}
```

Configure the OTLP endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT` env (defaults to `http://localhost:4318` which matches the `otel-collector` service in docker-compose).

> **Audit checklist**: after wiring, hit `/agent/health` once, then check Jaeger at `http://localhost:16686` — the request should appear with HTTP + Postgres child spans. If you see only manual spans, the `--import` flag is misconfigured.

### Sentry + OTel coexistence (verified against getsentry/sentry-javascript)

Sentry Node 8+ runs OpenTelemetry internally. If you let it auto-init while we already wire NodeSDK above, you get **two TracerProviders racing**: duplicate spans, broken propagation, and intermittent NodeSDK conflict errors. The fix is `skipOpenTelemetrySetup: true` + manually attach Sentry's processor/propagator/sampler to the NodeSDK we already own.

```ts
// apps/api/src/instrumentation.ts (extends the OTel block above)
import * as Sentry from "@sentry/node"
import {
  SentrySpanProcessor, SentryPropagator, SentrySampler,
} from "@sentry/opentelemetry"

const sentryClient = Sentry.init({
  dsn:                    env.SENTRY_DSN,
  environment:            env.NODE_ENV,
  release:                env.GIT_SHA,           // wired by CI
  skipOpenTelemetrySetup: true,                  // we already have NodeSDK — Sentry must not re-init OTel
  tracesSampleRate:       env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
  // Don't capture noise we already log:
  ignoreErrors: ["AbortError", "ECONNRESET"],
  beforeSend(event, hint) {
    // Drop expected DomainError 4xx — they're not bugs.
    if (event.level === "warning") return null
    return event
  },
})

// Attach Sentry to the NodeSDK created above (sdk.start() must NOT have been called yet).
sdk.addSpanProcessor(new SentrySpanProcessor())
// Override the SDK's sampler & propagator so Sentry sees a coherent trace tree.
// (NodeSDK's constructor accepts a `sampler` and `textMapPropagator` — pass these
//  there if you'd rather configure them up-front instead of after-the-fact.)
```

Then in route code:

```ts
try { ... } catch (err) {
  Sentry.captureException(err, {
    user: { id: tenantContext.getUserId() },
    tags: { tenant_id: tenantContext.getTenantId() },
  })
  throw err
}
```

> **If Sentry is OFF (P1 default).** Skip this section entirely; the OTel block above stands alone. `@sentry/node` is opt-in via `SENTRY_DSN` — absence means no init.

## 9. Open-source publishing strategy

| Slot | Value |
|---|---|
| OSS project name | **Seta OS** |
| GitHub org | **`Seta-International`** |
| Repo | **`https://github.com/Seta-International/seta-os`** |
| npm scope | **`@seta/*`** |
| License | **Apache 2.0** |
| Company site | `https://seta-international.com` |
| Project landing | `https://os.seta-international.com` |
| Docs site | `https://os.seta-international.com/docs` (path-based on same subdomain) |
| Dedicated `.ai` domain | Deferred — acquire once project has standalone OSS gravity |
| One-liner | **Seta OS is Seta's Agent Platform.** |
| Tagline | *Agent-first runtime for the modern SaaS ERP.* |

**Repo opening plan.** The monorepo is private during P1 development. **Before the first npm publish (target: P1 close-out), the monorepo is flipped to public** — Apache-2.0 requires source availability, so we never publish a built artifact while the source is hidden. The pre-flip checklist (security scrub, dep audit, README/CONTRIBUTING, code of conduct, CLA decision) runs in the last week of P1.

Until the flip: monorepo private, no npm publishes. After the flip: monorepo public, **selected packages publish to npm under `@seta/*`** so other teams/repos can build on the kernel.

| Package | Public on npm | Stability | First publish |
|---|---|---|---|
| `@seta/agent-core` | ✅ yes | `0.1.x` pre-stable | P1 close-out |
| `@seta/agent-sdk` | ✅ yes | `0.1.x` pre-stable | P1 close-out |
| `@seta/agent-chunking` | ✅ yes (P2) | `0.1.x` | P2 |
| `@seta/agent-embeddings` | ✅ yes (P2) | `0.1.x` | P2 |
| `@seta/agent-vector` | ✅ yes (P2) | `0.1.x` | P2 |
| `@seta/agent-rag` | ✅ yes (P2) | `0.1.x` | P2 |
| `@seta/oauth` | candidate (P2) | when API stabilizes | P2/P3 |
| `@seta/ms-graph` | candidate (P2) | when API stabilizes | P2/P3 |
| Everything else | private (`"private": true`) | — | never (until refactored) |

**Rule.** Public packages have **zero imports of private `@seta/*` packages**. The publish workflow fails the build if a public package depends on a private one.

### Per-public-package `package.json` additions

```json
{
  "private": false,
  "license": "Apache-2.0",
  "description": "Type-safe, framework-free agent kernel: messages + tools + model router + run loop + streaming.",
  "keywords": ["agent", "llm", "openai", "anthropic", "streaming", "typescript", "seta-os"],
  "homepage": "https://github.com/Seta-International/seta-os#readme",
  "repository": {
    "type": "git",
    "url": "https://github.com/Seta-International/seta-os.git",
    "directory": "platform/agent/core"
  },
  "bugs": "https://github.com/Seta-International/seta-os/issues",
  "publishConfig": { "access": "public" },
  "files": ["dist", "README.md", "LICENSE"]
}
```

Each public package ships its own `README.md` and `LICENSE` (Apache 2.0 copied from root).

### `.github/workflows/release.yml`

```yaml
name: release
on:
  push: { branches: [main] }
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm, registry-url: "https://registry.npmjs.org" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with:
          # `publish` is a script that builds + calls `changeset publish`.
          # 0.x packages publish to the `latest` dist-tag (npm default) — do NOT pass
          # --tag next; that hides them from default `npm install`. Use prerelease mode
          # (changeset pre enter <tag>) only for explicit beta/RC windows. See §9.
          publish: pnpm release
          version: pnpm changeset version
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Decisions captured

| Decision | Choice |
|---|---|
| OSS project + repo name | **Seta OS** at `github.com/Seta-International/seta-os` |
| npm scope | `@seta` (claimed on first publish from the Seta-International npm account) |
| License | **Apache 2.0** (industry standard for OSS agent frameworks; includes patent grant) |
| Repo visibility | Monorepo **private during P1**; **flipped to public before first npm publish** (P1 close-out); selected packages publish to npm via CI |
| Initial version | `0.1.0` for all public packages — bumps to `1.0.0` once kernel API is stable (~3 months of internal use) |
| Pre-1.0 dist-tag | **`latest`** (npm default) — `0.x` IS the pre-stable signal in SemVer; consumers expect to install with `npm install @seta/agent-core` and get the current 0.x. **Do not** publish 0.x to a `next` tag — that hides packages from default `npm install` and breaks discovery. (Verified against changesets docs: `--tag` is for explicit canary/RC overrides, not for routine 0.x.) |
| Beta windows | Use `pnpm changeset pre enter beta` → `pnpm changeset version` → `pnpm changeset publish` → `pnpm changeset pre exit` for explicit beta windows before a major (e.g., `1.0.0-beta.0`). Routine 0.x publishes do **not** use prerelease mode. |
| Pre-1.0 SemVer policy | While `0.x`: **minor bumps may include breaking changes** (npm convention); patch bumps are bugfix-only. Documented in `CONTRIBUTING.md`; changesets PR description must call out breaking changes explicitly. |
| Public ↔ private boundary check | Build fails if a `"private": false` package imports a `"private": true` workspace package |
| npm scope claim | `@seta` claimed on day 1 by publishing `@seta/placeholder@0.0.0` (deprecated immediately) — prevents squatting before the real publish |
| Domains | Use `os.seta-international.com` (landing + `/docs`); standalone `seta-os.ai` deferred until OSS brand momentum justifies it |

---

## 10. Explicit non-picks

| Tool | Why not |
|---|---|
| LangChain / LlamaIndex | Too much surface; defeats kernel-first |
| Prisma | Heavier; weaker pgvector + FTS DX vs Drizzle |
| Vercel AI SDK | Duplicates the kernel we're building |
| `@microsoft/agents-hosting` (M365 Agents SDK) | Heavy, opinionated runtime; we implement Bot Framework REST ourselves |
| `botbuilder` (classic Bot Framework SDK) | Superseded; also too heavy |
| `@microsoft/teams-ai` | Folded into the SDK we're not using |
| Express / Fastify | Hono outperforms; Web-Standards types |
| Redis (P1) | LRU + Postgres covers P1 |
| Qdrant / Weaviate / Pinecone | pgvector handles 1–10M rows |
| NestJS | Adds DI / decorators / second framework; one Hono everywhere |

---

## 11. Repo layout

Three top-level directories — each with one clear role. Pattern matches Strapi (`core/*` + `plugins/*`), Medusa (`core/*` + `modules/*`), Cal.com, Plane.

```
seta/
├── apps/                                   # DEPLOYABLES (Node processes / web builds)
│   ├── api/                                # P1: the only P1 deployable — single Hono server (pure composition)
│   │   └── src/
│   │       ├── routes/                     # /agents/* /threads/* /oauth/* /admin/*
│   │       ├── env.ts
│   │       └── main.ts                     # composition: mount channels + products + platform routes
│   └── studio/                             # (P2) Vite + React web app — uses @seta/ui + @seta/agent-sdk
│
├── modules/                                # MOUNTED CAPABILITIES — channels (transport) + connectors (vendor adapters) + products (business)
│   ├── channels/                           # transport adapters: webhook in → handler out
│   │   └── teams/                          # @seta/teams   ← P1 — generic Bot Framework adapter
│   │       └── src/
│   │           ├── routes.ts               # POST /teams/messages, /teams/health (Hono router factory)
│   │           ├── jwt.ts                  # JWKS + jose JWT validator
│   │           ├── activity.ts             # Zod schemas: Activity, MessageActivity, Invoke, TokenExchange
│   │           ├── bot-token.ts            # outbound client-credentials grant (LRU 1h)
│   │           ├── reply.ts                # POST serviceUrl/v3/conversations/:id/activities
│   │           ├── sso.ts                  # signin/tokenExchange → OBO via @seta/oauth
│   │           ├── handler.ts              # Handler interface { onMessage, onConversationUpdate, onInvoke }
│   │           ├── manifest/               # Teams app manifest + icons
│   │           └── index.ts                # exports { teamsRouter(handler), TeamsHandler }
│   │
│   ├── connectors/                         # vendor adapters — one per external system (each owns its own Postgres schema)
│   │   ├── ms365-planner/                  # @seta/connector-ms365-planner ← P1 — Planner client + cache + ETag/If-Match
│   │   │   └── src/
│   │   │       ├── manifest.ts             # ConnectorDefinition: id, provider=entra, scopes, rationale
│   │   │       ├── client.ts               # Typed Planner endpoints over @seta/ms-graph
│   │   │       ├── schema.ts               # Drizzle: planner_tasks_cache, …, sync_watermarks (schema connector_ms365_planner)
│   │   │       ├── cache.ts                # Cache-first read-through (60s TTL, stale-fallback)
│   │   │       ├── etag.ts                 # ETag store + If-Match wiring
│   │   │       └── index.ts                # exports { plannerConnector, plannerClient, ... }
│   │   │
│   │   └── ms365-directory/                # @seta/connector-ms365-directory ← P1 — Users + Groups from MS Graph
│   │       └── src/
│   │           ├── manifest.ts             # ConnectorDefinition: scopes User.Read.All, Group.Read.All
│   │           ├── jit-mapper.ts           # ID-token claims → auth.users + directory.external_identities
│   │           ├── schema.ts               # Drizzle: directory_users, directory_groups, …, sync_state
│   │           └── index.ts
│   │
│   └── products/                           # business modules — implement channel handlers, expose own routes
│       └── agent/                          # @seta/agent   ← P1 — the Seta Agent product
│           └── src/
│               ├── agent.ts                # definition: name, system prompt, model, tool wiring
│               ├── tools/                  # Planner tools (use @seta/connector-ms365-planner)
│               │   └── planner/
│               │       ├── read/           # list_my_tasks, list_plan_tasks, get_task, list_plans, list_buckets, workload_analysis
│               │       └── write/          # create_tasks.preview/.commit, update_tasks.preview/.commit, … (preview→commit pairs)
│               ├── schema.ts               # Drizzle: agent.write_continuations (HMAC-signed preview→commit tokens)
│               ├── cards/                  # Adaptive Cards specific to this agent
│               │   ├── task-list.ts
│               │   └── text.ts
│               ├── teams-handler.ts        # implements @seta/teams TeamsHandler — parses text, runs agent, builds card
│               └── index.ts                # exports { agent, teamsHandler, routes }
│
├── platform/                               # AGENT RUNTIME + SHARED FRAMEWORK (vendor-neutral)
│   ├── agent/                              # sub-namespace: anything uniquely about the agent runtime/API surface
│   │   │── P1
│   │   ├── core/                           # @seta/agent-core       — kernel (K1–K7), one release unit
│   │   ├── sdk/                            # @seta/agent-sdk        — public TS client + SSE helper
│   │   │── P2
│   │   ├── chunking/                       # @seta/agent-chunking   — token-aware text chunker (RAG)
│   │   ├── embeddings/                     # @seta/agent-embeddings — embedding client (RAG)
│   │   ├── vector/                         # @seta/agent-vector     — pgvector store ops + HNSW
│   │   └── rag/                            # @seta/agent-rag        — composition: chunking + embeddings + vector + RRF
│   │
│   │── P1 packages (non-agent)
│   ├── middleware/                         # @seta/middleware       — auth + tenant + errors + openapi + rate-limit
│   ├── observability/                      # @seta/observability    — pino + OTel SDK init + auto-instrumentations + req-id
│   ├── oauth/                              # @seta/oauth            — OAuthProvider interface + Entra impl (MSAL Node 5.2.0) + TokenVault (KMS envelope) + admin-consent routes
│   ├── connector-registry/                 # @seta/connector-registry — ConnectorDefinition type + runtime registry + scope-union
│   ├── ms-graph/                           # @seta/ms-graph         — Generic Graph HTTP wrapper (429 backoff, ETag, $batch, audit middleware)
│   ├── directory/                          # @seta/directory        — Canonical directory tables (external_identities); JIT mapper interface
│   ├── audit/                              # @seta/audit            — audit_log table + recordAudit() writer (synchronous, OTel-correlated)
│   ├── db/                                 # @seta/db               — pool + withTenant + role exports + migration runner (no app tables; owners hold schemas)
│   ├── auth/                               # @seta/auth             — API keys + AES-GCM + RBAC + KmsProvider
│   ├── tenant/                             # @seta/tenant           — AsyncLocalStorage + guards
│   ├── tsconfig/                           # @seta/tsconfig         — shared TS configs
│   │── (P2) packages
│   ├── sso/                                # @seta/identity              — inbound OIDC (Entra ID + Google) → sessions
│   └── ui/                                 # @seta/ui               — shared design system (studio + future webs)
│
├── tests/                                  # CROSS-PACKAGE TESTS (per-package unit/integration stay co-located)
│   ├── e2e/                                # full app E2E against real apps/api + dockerized pg
│   └── integration/                        # cross-package integration that doesn't fit inside any single package
│
├── docs/                                   # NARRATIVE DOCS (in addition to per-package READMEs)
│   ├── adr/                                # architecture decision records (numbered, immutable)
│   │   ├── 0001-agent-prefix-naming.md
│   │   ├── 0002-hand-rolled-bot-framework.md
│   │   ├── 0003-rls-as-tenancy-backstop.md
│   │   └── 0004-monorepo-public-before-publish.md
│   └── runbooks/                           # operational procedures
│       ├── restore-drill.md
│       ├── secret-rotation.md
│       └── oncall.md
│
├── infra/                                  # DEPLOYMENT + LOCAL-DEV INFRASTRUCTURE
│   ├── otel-collector.yaml                 # referenced by docker-compose.yml
│   └── postgres/
│       └── init.sql                        # pgvector + pg_trgm extensions, RLS bypass role (platform_admin)
│
├── tooling/                                # REPO-WIDE SCRIPTS (not shipped as packages)
│   └── scripts/
│       ├── check-public-private.ts         # build-fail if public package imports private workspace package
│       ├── claim-npm-scope.sh              # publish + deprecate @seta/placeholder
│       ├── rotate-dek.ts                   # KMS DEK rotation helper (calls @seta/auth KmsProvider)
│       └── verify-versions.ts              # diff package.json pins vs `npm view <pkg> version`
│
└── examples/                               # PUBLIC-FACING USAGE EXAMPLES (created at OSS flip)
    ├── agent-core-quickstart/              # minimal app using @seta/agent-core
    └── agent-sdk-browser/                  # SSE streaming from a browser via @seta/agent-sdk
```

**P1 scope locked** = 13 platform packages (2 in `platform/agent/`, 11 non-agent) + 4 modules (`@seta/teams` channel + `@seta/connector-ms365-planner` + `@seta/connector-ms365-directory` connectors + `@seta/agent` product) + 1 app (`apps/api`). **Multi-tenant from day 1** (tenantId on every row + Postgres RLS backstop, `@seta/tenant` context). RAG primitives, shared UI, the studio app, and **inbound SSO web UI (Entra + Google)** land in P2 once the MVP (core agent + Teams + Planner data + MS365 directory sync) ships. P1 user identity rides on Teams SSO (Entra → OBO → Graph) plus JIT provisioning of `auth.users` from the directory connector; standalone web SSO arrives with Studio.

### Module boundary rules (enforced by `tooling/scripts/check-public-private.ts` + Biome import rules)

- `modules/channels/*` = transport adapters (webhook in → handler interface out). **Channels never import products, never import connectors, and never import other channels.**
- `modules/connectors/<vendor>/` = vendor adapters (one external system each: MS365 Planner, MS365 Directory, future Trello/Jira/Google Workspace). **A connector may import `platform/*` and other `modules/connectors/*`; never `modules/products/*` and never `modules/channels/*`.** Each connector owns its own Postgres schema (`connector_<vendor>_<surface>`).
- `modules/products/*` = business modules (own routes + agent definitions + channel-handler implementations). **Products may depend on `modules/channels/*` only to implement that channel's handler interface, and on `modules/connectors/*` to call external systems** — never on another product.
- `platform/*` = primitives and framework, vendor-neutral. Used by everything; depends on nothing in `modules/` or `apps/`.
- `apps/*` = composition only (mount channels + products + platform routes; register connectors; wire env). No business logic.

### Composition example — `apps/api/src/main.ts`

```ts
import { teamsRouter } from "@seta/teams"
import { teamsHandler, agentRoutes } from "@seta/agent"
import { createConnectorRegistry } from "@seta/connector-registry"
import { plannerConnector }   from "@seta/connector-ms365-planner"
import { directoryConnector } from "@seta/connector-ms365-directory"
import { oauthRoutes } from "@seta/oauth"

// 1. Connectors — static registration in the composition root (per "no plugin loaders" rule)
const registry = createConnectorRegistry()
registry.register(plannerConnector)
registry.register(directoryConnector)
// future: registry.register(trelloConnector)

// 2. Platform routes
app.route("/oauth", oauthRoutes(registry))   // POST /oauth/:provider/consent-url, GET /oauth/:provider/callback, …

// 3. Channels
app.route("/teams", teamsRouter(teamsHandler))

// 4. Products
app.route("/agent", agentRoutes(registry))
```

Every module package exports `routes(...) => Hono` and (where applicable) a `connector: ConnectorDefinition` manifest. Mount prefix is owned by `apps/api/src/main.ts`. Future modules (PMO, Timesheet, Finance, Slack channel, Trello connector, voice channel) follow the same shape.

### Graceful shutdown — `apps/api/src/main.ts` tail (verified against @hono/node-server)

K8s/ECS sends SIGTERM 30s before SIGKILL. Without explicit `server.close()` + OTel `sdk.shutdown()`, in-flight requests die mid-write and final spans don't flush. Pattern:

```ts
import { serve } from "@hono/node-server"
import { otelSdk } from "./instrumentation"   // exported from the same file --import loads

const server = serve({ fetch: app.fetch, port: Number(env.PORT ?? 8080) }, (info) => {
  logger.info({ port: info.port }, "api listening")
})

const shutdown = (signal: string) => async () => {
  logger.info({ signal }, "shutting down")
  // 1. Stop accepting new connections, drain in-flight.
  await new Promise<void>((resolve) => server.close(() => resolve()))
  // 2. Flush any buffered telemetry.
  await otelSdk.shutdown().catch((err) => logger.error({ err }, "otel shutdown failed"))
  process.exit(0)
}

process.on("SIGTERM", shutdown("SIGTERM"))
process.on("SIGINT",  shutdown("SIGINT"))
```

Order matters: drain HTTP first (so traces complete), then flush OTel. Reverse order loses the final spans.

**Naming rule.** `agent-` prefix ONLY when the package is uniquely about the agent runtime/API surface (`agent-core`, `agent-sdk`, etc. — all live under `platform/agent/`). Services and infrastructure stay unprefixed — they're reusable across agents AND future ERP modules.

### Dependency direction
```
apps/*                              →  modules/channels/*, modules/connectors/*, modules/products/*,
                                       platform/agent/*, platform/{middleware,observability,oauth,
                                       connector-registry,ms-graph,directory,audit,db,auth,tenant}
modules/channels/*                  →  platform/{middleware,observability,oauth,db,auth,tenant,audit}
modules/connectors/<vendor>         →  platform/{ms-graph,oauth,connector-registry,db,audit,tenant,observability}
                                       (and other modules/connectors/* if a vendor shares plumbing)
modules/products/*                  →  modules/channels/* (handler-impl only),
                                       modules/connectors/*,
                                       platform/agent/*, platform/{middleware,observability,db,auth,tenant,audit}
platform/agent/rag                  →  platform/agent/{chunking, embeddings, vector} + platform/db
platform/agent/vector               →  platform/db
platform/agent/embeddings           →  (no internal deps; pure TS + openai)
platform/agent/chunking             →  (no internal deps; pure TS)
platform/agent/sdk                  →  (no internal deps; types only)
platform/agent/core                 →  (no internal deps; pure TS)
platform/middleware                 →  platform/{auth, tenant, observability}
platform/observability              →  (no internal deps)
platform/connector-registry         →  (no internal deps; types + runtime registry only)
platform/audit                      →  platform/db
platform/directory                  →  platform/db
platform/oauth                      →  platform/{db, audit, connector-registry}
platform/ms-graph                   →  platform/{oauth, audit}
```

**Future connectors / products** drop in under `modules/connectors/<vendor>/` or `modules/products/<domain>/`. Each connector owns its own Postgres schema and registers via the composition root.

---

## 12. Config files

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "modules/channels/*"
  - "modules/connectors/*"
  - "modules/products/*"
  - "platform/*"
  - "platform/agent/*"
  - "examples/*"
```

### `.npmrc`

```ini
# Verified against pnpm/pnpm docs (round 5 audit). Defaults omitted.

# Strictness — match versions installed against `engines`, fail on missing peers.
engine-strict=true
strict-peer-dependencies=true
auto-install-peers=false           # explicit peer management for published kernel packages

# Resolution / install perf
dedupe-peer-dependents=true        # share peer-dep instances across consumers
prefer-offline=true                # fall back to network only on cache miss

# Workspace publishing — `workspace:^` is rewritten to a caret range on publish,
# so consumers get clean SemVer ranges instead of a literal `workspace:*`.
save-workspace-protocol=rolling

# 0.x publishes go to the `latest` dist-tag — npm default; no override needed.
# Use `pnpm changeset pre enter <tag>` for explicit beta windows. See §9.
```

> Removed from earlier draft: `package-import-method=hardlink`, `node-linker=isolated`, `shamefully-hoist=false`, `side-effects-cache=true` — all are pnpm defaults; setting them adds noise without changing behavior.

### Root `package.json`

```json
{
  "name": "seta",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@11.0.9",
  "scripts": {
    "build":            "turbo run build",
    "dev":              "turbo run dev",
    "test":             "vitest run",
    "test:watch":       "vitest",
    "test:unit":        "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:e2e":         "vitest run --project tests/e2e",
    "coverage":         "vitest run --coverage",
    "lint":             "biome check .",
    "lint:fix":         "biome check --write .",
    "format":           "biome format --write .",
    "typecheck":        "turbo run typecheck",
    "migrate":          "pnpm --filter @seta/db exec drizzle-kit migrate",
    "db:up":            "docker compose up -d pg jaeger otel-collector",
    "db:down":          "docker compose down",
    "new:package":      "tsx tooling/scripts/new-package.ts",
    "changeset":        "changeset",
    "release":          "pnpm build && changeset publish"
  },
  "devDependencies": {
    "@biomejs/biome":      "2.4.15",
    "@changesets/cli":     "2.31.0",
    "@vitest/coverage-v8": "4.1.5",
    "lefthook":            "2.1.6",
    "tsx":                 "4.21.0",
    "turbo":               "2.9.12",
    "typescript":          "6.0.3",
    "vitest":              "4.1.5"
  }
}
```

### `turbo.json`

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "remoteCache": { "signature": true },
  // pruneIncludesGlobalFiles ensures turbo prune --docker copies tsconfig.base.json,
  // biome.json, etc. into the build context. Required for the multi-stage Dockerfile in §18.
  "futureFlags": { "pruneIncludesGlobalFiles": true },
  "globalEnv": ["NODE_ENV", "CI"],
  "globalDependencies": [".npmrc", "tsconfig.base.json", "biome.json", "vitest.config.ts"],
  "tasks": {
    // $TURBO_DEFAULT$ EXTENDS the default input set (the package's source +
    // package.json + lockfile slice) instead of replacing it.
    "build": {
      "dependsOn": ["^build"],
      "inputs":  ["$TURBO_DEFAULT$", "tsup.config.ts"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs":  ["$TURBO_DEFAULT$", "tsconfig.json"],
      "outputs": [".tsbuildinfo"]
    },
    "test:unit": {
      "dependsOn": ["^build"],
      "inputs":  ["$TURBO_DEFAULT$", "vitest.config.ts", "__recordings__/**", "__fixtures__/**"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "inputs":  ["$TURBO_DEFAULT$", "vitest.config.ts", "__recordings__/**"],
      "outputs": ["coverage/**"],
      "env":     ["DATABASE_URL"]
    },
    "lint": { "inputs": ["$TURBO_DEFAULT$", "biome.json"] },
    "dev":  { "cache": false, "persistent": true }
  }
}
```

> Full rationale (cache stability, remote cache, signing) lives in §18. **Audit note:** `$TURBO_DEFAULT$` and `pruneIncludesGlobalFiles` are the current Turborepo recommendations (per `turborepo.com` skill best-practice docs) — they were missing in the first draft.

### Per-package `drizzle.config.ts` (schema-per-module pattern)

> Verified against drizzle-team/drizzle-orm-docs for drizzle-kit 0.31.x. Required by `drizzle-kit generate` / `migrate` / `push`.

Per §3 (Schema-per-module DDD), **each owner package has its own `drizzle.config.ts` and `migrations/` directory** — `@seta/auth`, `@seta/tenant`, `@seta/directory`, `@seta/oauth`, `@seta/audit`, each `@seta/connector-*`, and `@seta/agent` (product). `@seta/db` no longer owns any application schema; it provides pool + `withTenant` + role exports + a migration runner.

Shape used by every owner package (only the `schemaFilter` and `out` change):

```ts
// e.g. platform/oauth/drizzle.config.ts
import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect:      "postgresql",
  schema:       "./src/schema.ts",          // tables for THIS bounded context only
  out:          "./migrations",
  schemaFilter: ["oauth"],                  // owner schema name; tells drizzle-kit to introspect only this
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Surface every statement before applying — important for RLS-touching migrations.
  verbose: true,
  strict:  true,
})
```

| Owner package | `schemaFilter` |
|---|---|
| `@seta/auth` | `["auth"]` |
| `@seta/tenant` | `["tenant"]` |
| `@seta/directory` | `["directory"]` |
| `@seta/oauth` | `["oauth"]` |
| `@seta/audit` | `["audit"]` |
| `@seta/connector-ms365-directory` | `["connector_ms365_directory"]` |
| `@seta/connector-ms365-planner` | `["connector_ms365_planner"]` |
| `@seta/agent` (product) | `["agent"]` |

**Migration runner.** `@seta/db` exposes a single `runMigrations({ url, roleName: "platform_admin" })` helper that applies every package's `migrations/` in **dependency order**: `auth` → `tenant` → `directory` → `oauth` → `audit` → each `connector_*` → `agent`. Order is a static list inside the helper (not auto-discovered, per CLAUDE.md "no plugin loaders").

**Per-package script.** `pnpm --filter @seta/<owner> exec drizzle-kit generate` creates SQL under that package's `migrations/`. `pnpm migrate` at the root runs all packages' migrations in order via the runner. **Never use `drizzle-kit push` outside local dev** — it bypasses migration history.

**Naming convention.** Each Drizzle schema file declares `pgSchema("<schema_name>")` once and exports all its tables under that schema:

```ts
// platform/oauth/src/schema.ts
import { pgSchema, uuid, text, bytea, smallint, timestamp, jsonb } from "drizzle-orm/pg-core"

export const oauth = pgSchema("oauth")

export const oauthTokens = oauth.table("oauth_tokens", { /* … */ })
export const oauthState  = oauth.table("oauth_state",  { /* … */ })
```

### Root `vitest.config.ts` (Vitest 3.2+ `projects` API)

> Vitest 3.2 deprecated the standalone `vitest.workspace.ts` file + `defineWorkspace`; Vitest 4 keeps the deprecation. Use `projects` inside the root `vitest.config.ts` instead — same behavior, simpler config, unified global options. (Verified against Vitest 4.0.7 docs.)

```ts
import { defineConfig } from "vitest/config"

// Single Vitest process drives every package in parallel; faster than spawning N
// processes via Turbo and gives unified coverage. See §17 / §18.
export default defineConfig({
  test: {
    pool: "forks",
    isolate: false,                  // packages flip to true if they touch shared DB state
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 80, branches: 70, functions: 80, statements: 80 },
      exclude: ["dist/**", "**/*.test.ts", "**/__recordings__/**", "**/__fixtures__/**"],
    },
    projects: [
      "platform/*",
      "platform/agent/*",
      "modules/channels/*",
      "modules/connectors/*",
      "modules/products/*",
      "apps/*",
      "tests/integration",
      "tests/e2e",
    ],
  },
})
```

### Per-package `vitest.config.ts`

Each leaf package extends the root via Vitest's `extends: true`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "@seta/agent-core",       // override per package
    // inherit pool/coverage/etc from root via projects.extends
  },
})
```

The root `projects` entry can also inline overrides — see Vitest's `projects` docs for `extends: true | false` semantics.

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2024"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "incremental": true,
    "tsBuildInfoFile": "${configDir}/.tsbuildinfo"
  }
}
```

### `biome.json` (Biome 2 schema)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
  "files": { "includes": ["**", "!**/dist", "!**/coverage", "!**/node_modules", "!**/.turbo"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "useImportType": "error", "useNodejsImportProtocol": "error" },
      "correctness": { "noUnusedImports": "error", "noUnusedVariables": "warn" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "asNeeded" } }
}
```

### `lefthook.yml`

```yaml
# Fast checks only on commit; heavier checks on push.
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,js,json}"
      run: pnpm biome check --write {staged_files}
      stage_fixed: true

pre-push:
  parallel: true
  commands:
    typecheck:
      run: pnpm turbo run typecheck --filter='...[origin/main]'
    test:
      run: pnpm turbo run test --filter='...[origin/main]'
```

Install once at bootstrap: `pnpm exec lefthook install`. Pre-push is scoped to packages changed since `origin/main` so it stays fast.

### `platform/middleware/src/errors.ts` — Hono onError + RFC 7807 (verified against hono.dev)

Hono's primitive is `HTTPException` from `hono/http-exception` + a global `app.onError` handler. To produce RFC 7807 `application/problem+json` responses (which §15 mandates), we wrap the response.

```ts
// platform/middleware/src/errors.ts
import { HTTPException } from "hono/http-exception"
import type { ErrorHandler } from "hono"
import { ZodError } from "zod"

export class DomainError extends HTTPException {
  constructor(status: 400 | 401 | 403 | 404 | 409 | 422, message: string, opts?: {
    type?: string                  // RFC 7807 type URI
    detail?: string
    cause?: unknown
  }) {
    super(status, { message, cause: opts?.cause })
    this.problem = {
      type:   opts?.type   ?? `https://os.seta-international.com/errors/${status}`,
      title:  message,
      status,
      detail: opts?.detail,
    }
  }
  problem: { type: string; title: string; status: number; detail?: string }
}

// Subclasses route authors throw:
export class NotFound      extends DomainError { constructor(what: string) { super(404, `${what} not found`) } }
export class Forbidden     extends DomainError { constructor(reason: string) { super(403, "forbidden", { detail: reason }) } }
export class Conflict      extends DomainError { constructor(reason: string) { super(409, "conflict",  { detail: reason }) } }
export class Unprocessable extends DomainError { constructor(detail: string) { super(422, "unprocessable", { detail }) } }

// Mount as the LAST middleware on the root app.
export const onError: ErrorHandler = (err, c) => {
  const log = c.var.log ?? console

  if (err instanceof DomainError) {
    log.warn({ err: err.problem }, "domain error")
    return c.json(
      { ...err.problem, instance: c.req.path },
      err.status,
      { "Content-Type": "application/problem+json" },
    )
  }

  if (err instanceof ZodError) {
    return c.json({
      type:    "https://os.seta-international.com/errors/validation",
      title:   "Validation failed",
      status:  400,
      detail:  "Request did not match schema",
      errors:  err.flatten().fieldErrors,                   // RFC 7807 lets us extend
      instance: c.req.path,
    }, 400, { "Content-Type": "application/problem+json" })
  }

  if (err instanceof HTTPException) {
    return c.json({
      type:   "https://os.seta-international.com/errors/http",
      title:  err.message,
      status: err.status,
      instance: c.req.path,
    }, err.status, { "Content-Type": "application/problem+json" })
  }

  // Unknown — never leak internals.
  log.error({ err }, "unhandled error")
  return c.json({
    type:   "https://os.seta-international.com/errors/internal",
    title:  "Internal Server Error",
    status: 500,
    instance: c.req.path,
  }, 500, { "Content-Type": "application/problem+json" })
}
```

Wired in `apps/api/src/main.ts`:

```ts
import { onError } from "@seta/middleware/errors"
app.onError(onError)
```

Route authors throw `new NotFound("thread")` etc. — never construct `Response` for errors directly. `@hono/zod-openapi` validation failures bubble up as `ZodError` and hit the same handler.

### `apps/api/src/env.ts` (vanilla Zod env validation)

```ts
import "dotenv/config"
import { z } from "zod"

const Env = z.object({
  NODE_ENV:           z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL:       z.string().url(),
  OPENAI_API_KEY:     z.string().min(1),
  ANTHROPIC_API_KEY:  z.string().min(1),
  // Microsoft / Bot Framework
  MS_ENTRA_TENANT_ID: z.string().min(1),
  MS_ENTRA_CLIENT_ID: z.string().min(1),
  MS_BOT_ID:          z.string().min(1),
  MS_BOT_SECRET:      z.string().min(1),
  // Storage
  KMS_KEY_ARN:        z.string().optional(),
})

export const env = Env.parse(process.env)
```

### `docker-compose.yml`

```yaml
services:
  pg:
    image: pgvector/pgvector:0.8.2-pg17-bookworm
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_USER: seta
      POSTGRES_DB: seta
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    command: ["postgres", "-c", "shared_preload_libraries=pg_stat_statements"]

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.151.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes: ["./infra/otel-collector.yaml:/etc/otelcol/config.yaml"]
    ports: ["4318:4318"]

  jaeger:
    image: jaegertracing/all-in-one:1.76.0
    ports: ["16686:16686"]
    environment:
      COLLECTOR_OTLP_ENABLED: "true"

volumes:
  pgdata:
```

### `.github/workflows/ci.yml`

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:

# Same env block reused by every job
env:
  TURBO_TOKEN:    ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM:     ${{ vars.TURBO_TEAM }}
  TURBO_REMOTE_CACHE_SIGNATURE_KEY: ${{ secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY }}

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      pnpm-store: ${{ steps.cfg.outputs.store }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - id: cfg
        run: echo "store=$(pnpm store path)" >> $GITHUB_OUTPUT
      - run: pnpm install --frozen-lockfile --prefer-offline --child-concurrency=10

  lint:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile --prefer-offline
      - run: pnpm lint
      - run: pnpm tooling/scripts/check-public-private.ts
      - run: pnpm tooling/scripts/check-no-manual-pkg-edit.ts  # see §15

  typecheck:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile --prefer-offline
      - run: pnpm turbo run typecheck

  unit:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile --prefer-offline
      - run: pnpm turbo run test:unit

  integration:
    needs: setup
    runs-on: ubuntu-latest
    services:
      pg:
        image: pgvector/pgvector:0.8.2-pg17-bookworm
        env:
          POSTGRES_PASSWORD: dev
          POSTGRES_USER: seta
          POSTGRES_DB: seta_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U seta -d seta_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgres://seta:dev@localhost:5432/seta_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile --prefer-offline
      - run: psql "$DATABASE_URL" -f infra/postgres/init.sql
      - run: pnpm --filter @seta/db exec drizzle-kit migrate
      - run: pnpm turbo run test:integration

  e2e:
    needs: setup
    runs-on: ubuntu-latest
    services:
      pg:
        image: pgvector/pgvector:0.8.2-pg17-bookworm
        env:
          POSTGRES_PASSWORD: dev
          POSTGRES_USER: seta
          POSTGRES_DB: seta_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U seta -d seta_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgres://seta:dev@localhost:5432/seta_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile --prefer-offline
      - run: psql "$DATABASE_URL" -f infra/postgres/init.sql
      - run: pnpm --filter @seta/db exec drizzle-kit migrate
      - run: pnpm turbo run build --filter=@seta/api
      - run: pnpm vitest run --project tests/e2e

  build:
    needs: [lint, typecheck, unit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile --prefer-offline
      - run: pnpm turbo run build
```

### `platform/tsconfig/node.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "types": ["node"],
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "**/__recordings__/**"]
}
```

### Per-package `package.json` template

```json
{
  "name": "@seta/agent-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "files": ["dist"],
  "scripts": {
    "build":     "tsup src/index.ts --format esm --dts --sourcemap",
    "dev":       "tsup src/index.ts --format esm --dts --watch",
    "test":      "vitest run",
    "test:watch":"vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

---

## 13. Per-package dependency seed

Grouped by concern. Run after the workspace is initialized.

### Kernel — `@seta/agent-core`

```bash
pnpm --filter @seta/agent-core add zod@4.4.3 openai@6.37.0 @anthropic-ai/sdk@0.95.1
pnpm --filter @seta/agent-core add -D vitest@4.1.5 tsup@8.5.1 typescript@6.0.3 @types/node@24
```

### Public surface — `@seta/agent-sdk`

```bash
pnpm --filter @seta/agent-sdk add zod@4.4.3
pnpm --filter @seta/agent-sdk add -D vitest@4.1.5 tsup@8.5.1 typescript@6.0.3 @types/node@24
```

### HTTP middleware — `@seta/middleware`

```bash
# Router-level concerns: auth wrapper, tenant wrapper, errors → RFC7807, openapi, rate-limit
pnpm --filter @seta/middleware add hono@4.12.18 @hono/zod-openapi@1.4.0 @hono/node-server@2.0.2 \
  hono-rate-limiter \
  @seta/auth@workspace:* @seta/tenant@workspace:* @seta/observability@workspace:*
pnpm --filter @seta/middleware add -D vitest@4.1.5 tsup@8.5.1 typescript@6.0.3 @types/node@24
```

### Observability — `@seta/observability`

```bash
# Process-level concerns: structured logger, OTel SDK init, request-id, auto-instrumentations
pnpm --filter @seta/observability add pino@10.3.1 pino-pretty@13.1.3 uuid@14.0.0 \
  @opentelemetry/api@1.9.1 @opentelemetry/sdk-node@0.217.0 \
  @opentelemetry/auto-instrumentations-node@0.75.0 \
  @opentelemetry/exporter-trace-otlp-proto
pnpm --filter @seta/observability add -D vitest@4.1.5 tsup@8.5.1 typescript@6.0.3 @types/node@24
```

### Cross-cutting platform primitives — `@seta/connector-registry`, `@seta/directory`, `@seta/audit`

```bash
# Connector registry (runtime + types)
pnpm --filter @seta/connector-registry add zod@4.4.3

# Canonical directory (auth.users ↔ external IdP subjects, JIT mapper interface)
pnpm --filter @seta/directory         add zod@4.4.3 drizzle-orm@0.45.2 \
  @seta/db@workspace:* @seta/audit@workspace:*

# Audit log writer
pnpm --filter @seta/audit             add zod@4.4.3 drizzle-orm@0.45.2 \
  @seta/db@workspace:* @seta/observability@workspace:*
```

### Identity & integrations — `@seta/oauth`, `@seta/ms-graph`

```bash
# OAuthProvider interface + Entra impl (MSAL Node) + KMS-envelope TokenVault + admin-consent routes
pnpm --filter @seta/oauth add \
  @azure/msal-node@5.2.0 \
  @aws-sdk/client-kms@3.1045.0 \
  lru-cache@11.3.6 uuid@14.0.0 zod@4.4.3 \
  drizzle-orm@0.45.2 \
  @seta/db@workspace:* @seta/connector-registry@workspace:* @seta/audit@workspace:*

# Microsoft Graph HTTP wrapper (raw fetch + 429/5xx backoff + ETag + $batch + audit middleware)
pnpm --filter @seta/ms-graph add @microsoft/microsoft-graph-types@2.43.1 zod@4.4.3 \
  @seta/oauth@workspace:* @seta/audit@workspace:*
```

### Connectors — `@seta/connector-ms365-planner`, `@seta/connector-ms365-directory`

```bash
# MS365 Planner connector — typed client + cache schema + cache-first read-through + ETag wiring
pnpm --filter @seta/connector-ms365-planner add zod@4.4.3 drizzle-orm@0.45.2 p-queue@9.2.0 \
  @seta/ms-graph@workspace:* @seta/oauth@workspace:* \
  @seta/connector-registry@workspace:* @seta/db@workspace:* @seta/audit@workspace:*

# MS365 Directory connector — Users/Groups mirror, JIT mapper
pnpm --filter @seta/connector-ms365-directory add zod@4.4.3 drizzle-orm@0.45.2 \
  @seta/ms-graph@workspace:* @seta/oauth@workspace:* \
  @seta/connector-registry@workspace:* @seta/directory@workspace:* \
  @seta/db@workspace:* @seta/audit@workspace:*
```

### Knowledge primitives *(P2 — deferred; install when RAG sub-phase starts)* — `@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`, `@seta/agent-rag`

```bash
pnpm --filter @seta/agent-chunking   add js-tiktoken@1.0.21 zod@4.4.3
pnpm --filter @seta/agent-chunking   add -D fast-check@4.8.0
pnpm --filter @seta/agent-embeddings add openai@6.37.0 zod@4.4.3
pnpm --filter @seta/agent-vector     add zod@4.4.3 @seta/db@workspace:*
pnpm --filter @seta/agent-rag    add zod@4.4.3 \
  @seta/agent-chunking@workspace:* @seta/agent-embeddings@workspace:* @seta/agent-vector@workspace:*
```

### Shared infra — `@seta/db`, `@seta/auth`, `@seta/tenant`

```bash
pnpm --filter @seta/db     add drizzle-orm@0.45.2 postgres@3.4.9 zod@4.4.3
pnpm --filter @seta/db     add -D drizzle-kit@0.31.10

pnpm --filter @seta/auth   add @node-rs/argon2@2.0.2 lru-cache@11.3.6 zod@4.4.3 \
  @seta/db@workspace:*

pnpm --filter @seta/tenant add zod@4.4.3
```

### Module — `@seta/teams` (P1 — generic Bot Framework channel adapter)

```bash
pnpm --filter @seta/teams add hono@4.12.18 jose@6.2.3 zod@4.4.3 lru-cache@11.3.6 \
  @seta/oauth@workspace:* @seta/tenant@workspace:*
pnpm --filter @seta/teams add -D vitest@4.1.5 tsup@8.5.1 typescript@6.0.3 @types/node@24
```

### Module — `@seta/agent` (P1 — Seta Agent product)

```bash
pnpm --filter @seta/agent add zod@4.4.3 adaptivecards-templating@2.3.1 p-queue@9.2.0 uuid@14.0.0 \
  drizzle-orm@0.45.2 \
  @seta/agent-core@workspace:* \
  @seta/connector-ms365-planner@workspace:* @seta/connector-ms365-directory@workspace:* \
  @seta/connector-registry@workspace:* @seta/oauth@workspace:* \
  @seta/teams@workspace:* \
  @seta/auth@workspace:* @seta/tenant@workspace:* @seta/audit@workspace:* @seta/db@workspace:*
pnpm --filter @seta/agent add -D vitest@4.1.5 tsup@8.5.1 typescript@6.0.3 @types/node@24
```

### App — `@seta/api`

```bash
pnpm --filter @seta/api add \
  hono@4.12.18 @hono/node-server@2.0.2 dotenv@17.4.2 zod@4.4.3 \
  @seta/agent-core@workspace:* @seta/middleware@workspace:* @seta/observability@workspace:* \
  @seta/oauth@workspace:* @seta/ms-graph@workspace:* \
  @seta/connector-registry@workspace:* @seta/directory@workspace:* @seta/audit@workspace:* \
  @seta/connector-ms365-planner@workspace:* @seta/connector-ms365-directory@workspace:* \
  @seta/db@workspace:* @seta/auth@workspace:* @seta/tenant@workspace:* \
  @seta/teams@workspace:* @seta/agent@workspace:*
```

(`@seta/teams` owns the Bot Framework deps including `jose`; `apps/api` only composes.)

(RAG packages added to `@seta/api` only when P2 introduces Q&A.)

---

## 14. Bootstrap script (from empty directory)

> **CLI-only convention (see §15).** The script below uses `pnpm init` + `pnpm add` exclusively — no hand-edits of `package.json`. Once `pnpm new:package` is in place (steps 1–2), use it for every subsequent package; the explicit `mkdir`/`pnpm init` lines below stay only because the scaffolder doesn't exist yet during bootstrap.

```bash
# 0. prerequisites:  Node 24 LTS, pnpm 11, Docker
mkdir seta && cd seta
git init && pnpm init

# 1. workspace + root tooling
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - "apps/*"
  - "modules/channels/*"
  - "modules/connectors/*"
  - "modules/products/*"
  - "platform/*"
  - "platform/agent/*"
  - "examples/*"
EOF
# paste root package.json, turbo.json, tsconfig.base.json, biome.json,
#   .npmrc, docker-compose.yml from §12
pnpm install
pnpm exec lefthook install
# write lefthook.yml from §12

# 1b. cross-cutting directories (committed empty with .gitkeep)
mkdir -p tests/{e2e,integration}
mkdir -p docs/{adr,runbooks}
mkdir -p infra/postgres
mkdir -p tooling/scripts
mkdir -p examples
# Drop initial ADRs:
#   docs/adr/0001-agent-prefix-naming.md
#   docs/adr/0002-hand-rolled-bot-framework.md
#   docs/adr/0003-rls-as-tenancy-backstop.md
#   docs/adr/0004-monorepo-public-before-publish.md
# Drop runbook stubs:
#   docs/runbooks/{restore-drill,secret-rotation,oncall}.md
# Drop infra files:
#   infra/otel-collector.yaml
#   infra/postgres/init.sql  (pgvector + pg_trgm + platform_admin RLS-bypass role)
# Drop tooling scripts:
#   tooling/scripts/new-package.ts            (§15 — package scaffolder; `pnpm new:package`)
#   tooling/scripts/check-public-private.ts   (§15 — boundary CI guard)
#   tooling/scripts/check-no-manual-pkg-edit.ts (§15 — CLI-only deps CI guard)
#   tooling/scripts/claim-npm-scope.sh        (§9  — placeholder publish + deprecate)
#   tooling/scripts/rotate-dek.ts             (§4  — KMS DEK rotation)
#   tooling/scripts/verify-versions.ts        (§1  — diff pins vs `npm view`)
#   tooling/scripts/seed-test-data.ts         (§17 — idempotent test seed)
#   tooling/scripts/measure-ci.ts             (§18 — CI timing tracker)

# 2. shared tsconfig package
mkdir -p platform/tsconfig
# paste platform/tsconfig/node.json
# create platform/tsconfig/package.json with name "@seta/tsconfig"

# 3. kernel (foundation; build first) — lives under platform/agent/ sub-namespace
mkdir -p platform/agent/core/src/{messages,tools,models,runloop,streaming,testkit}
cd platform/agent/core && pnpm init && cd ../../..
pnpm --filter @seta/agent-core add zod@4.4.3 openai@6.37.0 @anthropic-ai/sdk@0.95.1
pnpm --filter @seta/agent-core add -D vitest@4.1.5 tsup@8.5.1 typescript@6.0.3 @types/node@24

# 4. shared infra (non-agent platform packages)
for p in db auth tenant; do
  mkdir -p platform/$p/src && cd platform/$p && pnpm init && cd ../..
done
mkdir -p platform/agent/sdk/src && cd platform/agent/sdk && pnpm init && cd ../../..
pnpm --filter @seta/db     add drizzle-orm@0.45.2 postgres@3.4.9 zod@4.4.3
pnpm --filter @seta/db     add -D drizzle-kit@0.31.10
pnpm --filter @seta/auth   add @node-rs/argon2@2.0.2 lru-cache@11.3.6 zod@4.4.3 @seta/db@workspace:*
pnpm --filter @seta/tenant add zod@4.4.3
pnpm --filter @seta/agent-sdk add zod@4.4.3

# 5a. observability — pino + OTel + req-id (process-level)
mkdir -p platform/observability/src && cd platform/observability && pnpm init && cd ../..
pnpm --filter @seta/observability add pino@10.3.1 pino-pretty@13.1.3 uuid@14.0.0 \
  @opentelemetry/api@1.9.1 @opentelemetry/sdk-node@0.217.0 \
  @opentelemetry/auto-instrumentations-node@0.75.0 \
  @opentelemetry/exporter-trace-otlp-proto

# 5b. http middleware — auth/tenant wrappers, errors, openapi, rate-limit (router-level)
mkdir -p platform/middleware/src/{middleware,errors,openapi} && cd platform/middleware && pnpm init && cd ../..
pnpm --filter @seta/middleware add hono@4.12.18 @hono/zod-openapi@1.4.0 @hono/node-server@2.0.2 \
  hono-rate-limiter \
  @seta/auth@workspace:* @seta/tenant@workspace:* @seta/observability@workspace:*

# 6. cross-cutting platform primitives (registry, directory, audit)
for p in connector-registry directory audit; do
  mkdir -p platform/$p/src && cd platform/$p && pnpm init && cd ../..
done
pnpm --filter @seta/connector-registry add zod@4.4.3
pnpm --filter @seta/audit              add zod@4.4.3 drizzle-orm@0.45.2 \
  @seta/db@workspace:* @seta/observability@workspace:*
pnpm --filter @seta/directory          add zod@4.4.3 drizzle-orm@0.45.2 \
  @seta/db@workspace:* @seta/audit@workspace:*

# 7. identity & MS Graph
for p in oauth ms-graph; do
  mkdir -p platform/$p/src && cd platform/$p && pnpm init && cd ../..
done
pnpm --filter @seta/oauth    add \
  @azure/msal-node@5.2.0 @aws-sdk/client-kms@3.1045.0 \
  lru-cache@11.3.6 uuid@14.0.0 zod@4.4.3 drizzle-orm@0.45.2 \
  @seta/db@workspace:* @seta/connector-registry@workspace:* @seta/audit@workspace:*
pnpm --filter @seta/ms-graph add @microsoft/microsoft-graph-types@2.43.1 zod@4.4.3 \
  @seta/oauth@workspace:* @seta/audit@workspace:*

# 8. (P2) knowledge primitives — defer until RAG sub-phase starts
# for p in chunking embeddings vector rag; do
#   mkdir -p platform/agent/$p/src && cd platform/agent/$p && pnpm init && cd ../../..
# done
# pnpm --filter @seta/agent-chunking   add js-tiktoken@1.0.21 zod@4.4.3
# pnpm --filter @seta/agent-embeddings add openai@6.37.0 zod@4.4.3
# pnpm --filter @seta/agent-vector     add zod@4.4.3 @seta/db@workspace:*
# pnpm --filter @seta/agent-rag        add zod@4.4.3 @seta/agent-chunking@workspace:* @seta/agent-embeddings@workspace:* @seta/agent-vector@workspace:*

# 9. modules/channels/teams (P1 — generic Bot Framework channel adapter)
mkdir -p modules/channels/teams/src/manifest
cd modules/channels/teams && pnpm init && cd ../../..
pnpm --filter @seta/teams add hono@4.12.18 jose@6.2.3 zod@4.4.3 lru-cache@11.3.6 \
  @seta/oauth@workspace:* @seta/tenant@workspace:* @seta/audit@workspace:*

# 10. modules/connectors — vendor adapters (each owns its own Postgres schema)
mkdir -p modules/connectors/ms365-planner/src
cd modules/connectors/ms365-planner && pnpm init && cd ../../..
pnpm --filter @seta/connector-ms365-planner add zod@4.4.3 drizzle-orm@0.45.2 p-queue@9.2.0 \
  @seta/ms-graph@workspace:* @seta/oauth@workspace:* \
  @seta/connector-registry@workspace:* @seta/db@workspace:* @seta/audit@workspace:*

mkdir -p modules/connectors/ms365-directory/src
cd modules/connectors/ms365-directory && pnpm init && cd ../../..
pnpm --filter @seta/connector-ms365-directory add zod@4.4.3 drizzle-orm@0.45.2 \
  @seta/ms-graph@workspace:* @seta/oauth@workspace:* \
  @seta/connector-registry@workspace:* @seta/directory@workspace:* \
  @seta/db@workspace:* @seta/audit@workspace:*

# 11. modules/products/agent (P1 — Seta Agent product)
mkdir -p modules/products/agent/src/{tools/planner/read,tools/planner/write,cards}
cd modules/products/agent && pnpm init && cd ../../..
pnpm --filter @seta/agent add zod@4.4.3 adaptivecards-templating@2.3.1 p-queue@9.2.0 uuid@14.0.0 \
  drizzle-orm@0.45.2 \
  @seta/agent-core@workspace:* \
  @seta/connector-ms365-planner@workspace:* @seta/connector-ms365-directory@workspace:* \
  @seta/connector-registry@workspace:* @seta/oauth@workspace:* \
  @seta/teams@workspace:* \
  @seta/auth@workspace:* @seta/tenant@workspace:* @seta/audit@workspace:* @seta/db@workspace:*

# 12. apps/api (the deployable — pure composition; mounts modules)
mkdir -p apps/api/src/routes
cd apps/api && pnpm init && cd ../..
pnpm --filter @seta/api add hono@4.12.18 @hono/node-server@2.0.2 dotenv@17.4.2 zod@4.4.3 \
  @seta/agent-core@workspace:* @seta/middleware@workspace:* @seta/observability@workspace:* \
  @seta/oauth@workspace:* @seta/ms-graph@workspace:* \
  @seta/connector-registry@workspace:* @seta/directory@workspace:* @seta/audit@workspace:* \
  @seta/connector-ms365-planner@workspace:* @seta/connector-ms365-directory@workspace:* \
  @seta/db@workspace:* @seta/auth@workspace:* @seta/tenant@workspace:* \
  @seta/teams@workspace:* @seta/agent@workspace:*

# 13. local services
docker compose up -d pg jaeger otel-collector

# 14. claim npm scope (run once per org, then deprecate placeholder)
#   npm login --scope=@seta
#   mkdir -p /tmp/seta-placeholder && cd /tmp/seta-placeholder
#   npm init -y --scope=@seta
#   npm pkg set name=@seta/placeholder version=0.0.0 license=Apache-2.0
#   npm publish --access public
#   npm deprecate @seta/placeholder@0.0.0 "Reserved scope; see github.com/Seta-International/seta-os"

# 15. ready to start on K1.1 (message types)
pnpm --filter @seta/agent-core dev
```

---

## 15. Operating conventions

| Topic | Convention |
|---|---|
| Module system | ESM only across the monorepo (`"type": "module"`); no CJS |
| Imports | Always `import type` for type-only imports; Biome enforces |
| Paths | No TS path aliases; use workspace package names (`@seta/agent-core`) |
| Tests | Co-located `*.test.ts`; integration tests in `tests/integration/*.test.ts` |
| LLM recordings | `__recordings__/` per package; checked into git |
| Migrations | Per owner package: `<owner>/migrations/*.sql` generated by `drizzle-kit generate` (schema-per-module — see §3 + §12). Top-level `pnpm migrate` applies all owners in dependency order via `@seta/db`'s runner. |
| Secrets in dev | `.env.local` (gitignored); production via KMS at startup |
| Logging | `logger` from `@seta/middleware`; never `console.log` outside CLI |
| Errors | `DomainError` subclasses from `@seta/middleware/errors`; mapped to RFC7807 |
| Tenant id | Never a function param; read from `tenantContext.getTenantId()` |
| Streaming | K5 chunk protocol only; never invent ad-hoc shapes |
| `agent-` prefix | Reserved for packages uniquely about the agent runtime/API (`agent-core`, `agent-sdk`) |
| **`z` import for OpenAPI routes** | In any file using `@hono/zod-openapi`, **import `z` from `@hono/zod-openapi`** — not from `zod`. The package re-exports a wrapped Zod whose schemas have a `.openapi(...)` extension method; importing `z` from `zod` directly silently drops that method (TS will accept it, runtime breaks at `app.openapi(route, …)` doc generation). Biome rule + ADR 0005 enforce this. |
| **OTel init order** | `apps/api` MUST start with `node --import ./instrumentation.ts …` (or `tsx watch --import` in dev). NodeSDK + auto-instrumentations register hooks; if any module imports BEFORE the SDK starts, that module is invisible to traces. Never call `sdk.start()` from inside `main.ts`. See §8 for the canonical pattern. |
| **OpenAPI route paths** | `@hono/zod-openapi` uses OpenAPI-style `/users/{id}`, NOT Hono native `/users/:id`. Routes registered via `OpenAPIHono.openapi()` follow OpenAPI; routes registered via `app.get("/users/:id", …)` follow Hono. Don't mix in one router. |
| **Adding a package** | **CLI only** — `pnpm new:package` (wraps `tooling/scripts/new-package.ts`). Never `mkdir` + hand-write `package.json`. Scaffolder enforces correct path (`platform/agent/*` vs `platform/*` vs `modules/channels/*` vs `modules/connectors/*` vs `modules/products/*`), tsconfig extends, scripts block, and registers in `pnpm-workspace.yaml` if needed. |
| **Installing / removing deps** | **CLI only** — `pnpm --filter <pkg> add <dep>` / `pnpm --filter <pkg> remove <dep>` / `pnpm --filter <pkg> add -D <dep>`. **Never** hand-edit `dependencies` / `devDependencies` / `peerDependencies` blocks. Reason: pnpm resolves the version, updates the lockfile, and runs install hooks atomically — manual edits drift from the lockfile and cause silent install failures. |
| **Renaming / moving a package** | `pnpm pkg set name=@seta/<new>` + `git mv` for the directory + `pnpm install` to refresh the lockfile. Don't hand-edit `package.json`. |
| **Bumping versions** | `pnpm changeset` → `pnpm changeset version` → commit. Never hand-edit `version` fields. |
| **Workspace deps** | `pnpm --filter <pkg> add @seta/<other>@workspace:*` — the `workspace:*` protocol is required so changesets can rewrite it on publish. |
| CI guard | `tooling/scripts/check-no-manual-pkg-edit.ts` runs in the `lint` job: any PR that modifies `package.json` without a corresponding `pnpm-lock.yaml` change fails the build. Catches hand-edits before review. |

### `tooling/scripts/new-package.ts` — package scaffolder

The single entry point for creating any new workspace package. Prompts (or accepts flags) for kind, name, and description, then runs the right `pnpm` commands so nothing is hand-written.

```
$ pnpm new:package
? What kind of package?
  › platform-agent       (under platform/agent/<name> — agent runtime/API)
    platform             (under platform/<name> — shared infra/framework)
    channel              (under modules/channels/<name> — transport adapter)
    connector            (under modules/connectors/<name> — vendor adapter, owns its Postgres schema)
    product              (under modules/products/<name> — business module)
    app                  (under apps/<name> — deployable)
    example              (under examples/<name> — public-facing usage example)
? Package short name (no @seta/ prefix): trello
? One-line description: Trello connector — boards, lists, cards

→ mkdir -p modules/connectors/trello/src
→ cd <path> && pnpm init
→ pnpm pkg set name=@seta/connector-trello version=0.1.0 type=module private=true
→ pnpm pkg set main=./dist/index.js types=./dist/index.d.ts
→ pnpm pkg set scripts.build="tsup src/index.ts --format esm --dts --sourcemap"
→ pnpm pkg set scripts.dev="tsup src/index.ts --format esm --dts --watch"
→ pnpm pkg set scripts.test:unit="vitest run --project ."
→ pnpm pkg set scripts.typecheck="tsc --noEmit -p tsconfig.json"
→ write tsconfig.json (extends platform/tsconfig/node.json)
→ write vitest.config.ts (extends tooling/vitest.base.ts)
→ write drizzle.config.ts (schemaFilter: ["connector_trello"])
→ write src/{manifest.ts,client.ts,schema.ts,index.ts}
→ pnpm install   (registers in pnpm-workspace.yaml glob)
✓ @seta/connector-trello created at modules/connectors/trello. Next: pnpm --filter @seta/connector-trello add <deps>
```

Refusal cases the scaffolder enforces:
- Naming: `agent-` prefix only allowed for `platform-agent` kind; `connector-` prefix auto-prepended for `connector` kind.
- Paths: a `channel` kind cannot land under `modules/products/` or `modules/connectors/`; a `connector` kind cannot land under `platform/`.
- Public packages (`platform-agent core/sdk` only at P1) get the §9 `package.json` additions automatically.

### `tooling/scripts/check-no-manual-pkg-edit.ts` — CI guard

```ts
// Pseudocode. Real version: ~40 LOC.
// 1. List package.json files changed in this PR (vs base ref).
// 2. If any changed, require pnpm-lock.yaml is also in the diff.
// 3. Exception: pure metadata fields (description, keywords, homepage) — allow.
// 4. Exception: version field (changesets owns it) — allow.
// 5. Anything else → fail with: "package.json edited without lockfile update.
//    Run `pnpm install` or use `pnpm <add|remove|pkg set>` instead."
```
| Module HTTP surface | Every `modules/*` package exports `routes(handler?: Handler) => Hono` and (where applicable) `Handler` interface. `apps/api/src/main.ts` mounts each at a known prefix (`/teams`, `/agent`, …). No module wires DB or env directly — composition stays in the app. |
| Backup / DR | Postgres = system of record (rows, vectors, FTS, encrypted tokens, sessions). Daily snapshot + 7-day WAL retention; **restore drill once per quarter**, dated entry in `docs/runbooks/restore-drill.md`. |
| Secret rotation | Quarterly rotation: `MS_BOT_SECRET`, OAuth client secrets, API-key DEK. Annual: KMS KEK. Runbook: `docs/runbooks/secret-rotation.md`. Calendar reminder owned by on-call. |
| Rate limiting | All public routes wrap with `hono-rate-limiter` keyed by `(tenantId, ip)`. Defaults set in `@seta/middleware`; per-route override allowed. |

---

## 16. First-day checklist

1. §14 bootstrap script runs clean on a fresh clone
2. `pnpm install` completes; `pnpm typecheck` green
3. `docker compose up -d` brings up pg + jaeger; `infra/postgres/init.sql` applies pgvector + pg_trgm + `platform_admin` role
4. `pnpm migrate` (top-level) runs every owner package's migrations in dependency order: `auth` → `tenant` → `directory` → `oauth` → `audit` → each `connector_*` → `agent`. RLS template (`platform/db/migrations/_template_rls.sql`) committed.
5. `pnpm --filter @seta/agent-core test` runs (empty pass)
6. CI green on first PR (Postgres service container reachable; integration tests run, not skipped)
7. `tooling/scripts/check-public-private.ts` wired into CI — fails build if a `"private": false` package imports a `"private": true` workspace package
8. `@seta/placeholder` published + deprecated → `@seta` scope locked on npm
9. ADR stubs committed: `docs/adr/0001…0004` and runbook stubs `docs/runbooks/{restore-drill,secret-rotation,oncall}.md`
10. Pre-push hook (`pnpm exec lefthook install`) verified — typecheck + test run on `git push`, not on every commit
11. `pnpm new:package` scaffolder works end-to-end (creates a throwaway package, pnpm install completes, lockfile updates, scaffold deleted before commit)
12. CI guard `check-no-manual-pkg-edit.ts` fails a deliberate test PR that hand-edits a `package.json`
13. Turbo remote cache enabled — `TURBO_TOKEN` + `TURBO_TEAM` set in repo secrets / vars; second CI run shows cache hits
14. Root `vitest.config.ts` `projects` array resolves all packages — `pnpm test` runs once and reports unified coverage (Vitest 3.2+ API; old `vitest.workspace.ts` not used)
15. Start K1.1 — message types

---

## 17. Testing strategy

Three layers, each with a separate gate. Same test runner (Vitest) across all layers — no Jest, no Mocha, no Playwright until P2 Studio.

| Layer | Lives in | Runs against | When it runs | Owns |
|---|---|---|---|---|
| **Unit** | `<pkg>/src/**/*.test.ts` (co-located) | Pure functions; no DB, no network, no LLM | Pre-push + every CI job | Per-package authors |
| **Integration** | `<pkg>/tests/integration/**/*.test.ts` | Real Postgres (dockerized / CI service); recorded LLM responses; recorded MS Graph (msw) | CI `integration` job + nightly | Per-package authors |
| **E2E** | `/tests/e2e/**/*.test.ts` (top-level) | Full `apps/api` subprocess + real pg + recorded LLM + simulated Bot Framework webhooks | CI `e2e` job + nightly | Platform team |
| **Contract** | `<pkg>/tests/contract/**/*.test.ts` | Outbound contracts (Graph, BotFramework, OAuth endpoints) via msw recordings — verifies our request shapes against the real wire format | CI `integration` job | Per-package authors |
| **Browser E2E** *(P2)* | `/tests/e2e-browser/**/*.spec.ts` | Studio + apps/api stack; Playwright | CI on Studio PRs only | Studio team |

### Per-layer rules

**Unit (the bulk).**
- Vitest, in-process, parallel, target <100ms per file.
- No mocks of internal `@seta/*` modules — if you need a mock, your seam is wrong.
- External SDKs (`openai`, `@anthropic-ai/sdk`, `@node-rs/argon2`) are stubbed only via the kernel's `testkit` (`platform/agent/core/src/testkit/`), never with `vi.mock`.

**Integration.**
- Hits **real Postgres**. RLS policies are evaluated. **No mocking the DB** — prior incident: mocked tests passed while a migration broke prod.
- Each test wraps in `BEGIN; … ROLLBACK;` for isolation, or uses a freshly-named schema per worker.
- Outbound HTTP (Graph, BotFramework auth, OpenAI/Anthropic) intercepted by **msw** with recorded fixtures under `__recordings__/`.

**E2E.**
- Boots `apps/api` as a subprocess (`tsx apps/api/src/main.ts`) against the CI Postgres service.
- Drives it with `fetch` (no SDK), exercising real routes — including a synthetic Bot Framework `messages` activity with a forged-but-valid JWT signed by a test JWKS that `@seta/teams` is pointed at via `BOT_JWKS_URL` env override.
- Asserts on (a) HTTP response, (b) outbound reply captured by msw, (c) DB state.
- Target: full suite <2 min. Beyond that, split into a nightly tier.

**Contract.**
- For every outbound API we call, one test snapshots the exact request we'd send against a recorded "known-good" example. Catches MS Graph / Bot Framework drift before it hits prod.

### LLM recordings

`__recordings__/` per package, checked into git. The kernel `testkit` wraps the model client:

```ts
// platform/agent/core/src/testkit/recorded.ts
export function recordedClient(fixture: string) {
  const file = path.join("__recordings__", `${fixture}.json`)
  if (process.env.RECORD === "1") return recordingClient(file)
  return replayClient(file) // throws on cache miss
}
```

Rules: `RECORD=1 pnpm test -t <name>` to (re)record; commit the fixture; PR review includes the fixture diff. **Never** call live model APIs in CI.

### Coverage

- `@vitest/coverage-v8` everywhere; tsup-built `dist/` excluded.
- Global threshold: **lines 80% / branches 70%** for `platform/agent/*` and `platform/{auth,oauth,db,tenant,middleware,observability}`. Other platform packages: **lines 60%**. Modules + apps: no threshold (covered by E2E).
- Threshold enforced in CI `unit` and `integration` jobs.

### Mock policy (short version)

| Thing | Default | Exception |
|---|---|---|
| Internal `@seta/*` modules | Never mock | — |
| Postgres | Never mock | Pure-unit tests that don't touch a DB layer at all |
| LLM SDKs | Always via `testkit` recordings | — |
| External HTTP (Graph, Bot Framework, OAuth) | Always via `msw` recordings | — |
| `node:crypto`, `Date`, `Math.random` | Inject as deps; never patch globals | — |
| `process.env` | Inject `env` object; never read inside functions | — |

### Test data

- `tests/fixtures/` (top-level) for cross-package fixtures (tenant seed, sample activities, sample Graph responses).
- Per-package `__fixtures__/` for fixtures only that package uses.
- Seed script: `tooling/scripts/seed-test-data.ts` — idempotent, runs against `DATABASE_URL`.

### Flake policy

A test that flakes more than once per week is **disabled** (skip with reason) and an issue opened. No retries in CI — retries hide real bugs.

---

## 18. Build / lint / format optimization

Stack is fast by default (esbuild, Biome, Vitest). The goal of this section: keep it that way as the repo grows past ~50 packages.

### Targets (P1, measured on CI cold cache)

| Operation | Cold | Warm (turbo cache hit) |
|---|---|---|
| `pnpm install` | <60s | <15s |
| `pnpm lint` | <10s | <5s |
| `pnpm typecheck` (full) | <45s | <5s |
| `pnpm test` (unit) | <30s | <5s |
| `pnpm build` (all) | <60s | <10s |
| Full CI pipeline | <4 min | <90s |

If any target regresses by >25% in a PR, the PR is blocked until investigated.

### Turborepo remote cache

Use Vercel's free-tier remote cache (zero ops). CI sets `TURBO_TOKEN` + `TURBO_TEAM`; local devs opt in via `npx turbo login` once.

See the full `turbo.json` in §12. Key bits:

- `remoteCache.signature: true` — prevents remote-cache poisoning.
- `globalDependencies: [".npmrc", "tsconfig.base.json", "biome.json", "vitest.config.ts"]` — invalidates every task's cache when shared config changes.
- Per-task `inputs: ["$TURBO_DEFAULT$", …extras]` — `$TURBO_DEFAULT$` extends Turborepo's default input set (package source + `package.json` + lockfile slice) instead of replacing it. Replacing is the single most common cause of "cache stale" bugs.
- `futureFlags.pruneIncludesGlobalFiles: true` — makes `turbo prune --docker` copy `tsconfig.base.json` etc. into the build context (required for the Dockerfile below).

### Vitest projects (one process, parallel projects)

Beats `turbo run test` spawning N Vitest processes — single Vitest with N project workers shares a Node, hits its module cache once, and gives unified coverage. Vitest 3.2 deprecated `vitest.workspace.ts`; the current API is `projects` inside the root `vitest.config.ts` (full config in §12).

```ts
// vitest.config.ts (root) — excerpt
import { defineConfig } from "vitest/config"
export default defineConfig({
  test: {
    projects: ["platform/*", "platform/agent/*", "modules/channels/*",
               "modules/connectors/*", "modules/products/*", "apps/*",
               "tests/integration", "tests/e2e"],
    // global pool / coverage / thresholds defined here, inherited by projects
  },
})
```

Each leaf has a minimal `vitest.config.ts` that overrides only `test.name`.

### tsc incremental + project refs

For typecheck speed at scale, enable composite + incremental in `tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": "${configDir}/.tsbuildinfo",
    "composite": false  // flip to true and add project refs once we hit ~30 packages
  }
}
```

Action: revisit project refs at package #30 — until then, `tsc --noEmit` per package via Turbo is fast enough and the `.tsbuildinfo` is cached by Turbo `outputs`.

### Biome (already fast — keep it that way)

- Pre-commit: `biome check --write {staged_files}` only — no full-repo scan.
- CI: `biome check .` once at root — single command, no per-package overhead.
- **Don't** add ESLint / Prettier / `lint-staged`. Biome already does both jobs.
- `.biomeignore` mirrors `files.includes` — keep them in sync (single source: `biome.json`).

### tsup build tuning

```ts
// tooling/tsup.base.ts — verified against egoist/tsup docs
import { defineConfig } from "tsup"
import pkg from "../package.json" with { type: "json" }

export default defineConfig({
  entry:    ["src/index.ts"],
  format:   ["esm"],            // ESM-only across the monorepo (matches §15)
  target:   "node24",
  outDir:   "dist",
  sourcemap: true,
  // dts.resolve = true bundles re-exported third-party types into our .d.ts so
  // consumers don't need to install transitive type packages (e.g. @types/node).
  dts:       { resolve: true },
  clean:     true,
  treeshake: true,
  splitting: false,             // libraries: single bundle is friendlier to consumers
  minify:    process.env.MINIFY === "1",
  // Apache-2.0 banner on every published file (per §9 OSS publishing).
  banner:    { js: `/*! ${pkg.name} v${pkg.version} — Apache-2.0 — github.com/Seta-International/seta-os */` },
})
```

Set `MINIFY=1` only in the `release` workflow and the Docker `builder` stage. Local + CI builds skip minification (saves ~30% build time and keeps stack traces readable). The `dts.resolve` flag matters specifically for `@seta/agent-core` (re-exports model SDK types) and `@seta/agent-sdk` (public TS client); private packages can override to `dts: true` for a marginal speedup.

### pnpm install tuning

The full `.npmrc` lives in §12; only `prefer-offline`, `dedupe-peer-dependents`, and `save-workspace-protocol=rolling` are install-perf related — everything else there is correctness/strictness. CI uses `pnpm install --frozen-lockfile --prefer-offline --child-concurrency=10`.

### Docker image builds (P2 deploy)

Use `turbo prune` to ship a minimal context per service:

```dockerfile
# Dockerfile.api (multi-stage) — verified against vercel/turborepo prune docs + pnpm deploy
FROM node:24-alpine AS pruner
WORKDIR /repo
RUN corepack enable
COPY . .
# turbo.json's `pruneIncludesGlobalFiles: true` (§12) ensures tsconfig.base.json,
# biome.json, vitest.config.ts land in both out/json and out/full.
RUN npx turbo@2.9.12 prune @seta/api --docker

FROM node:24-alpine AS builder
WORKDIR /repo
RUN corepack enable
# Step 1: install only the deps for the pruned subset (cached unless lockfile changes).
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile --prefer-offline
# Step 2: copy source + build (cached unless source changes).
COPY --from=pruner /repo/out/full/ .
# Remote cache hits during Docker builds — wire TURBO_TOKEN as a build arg.
ARG TURBO_TOKEN
ARG TURBO_TEAM
ENV TURBO_TOKEN=$TURBO_TOKEN  TURBO_TEAM=$TURBO_TEAM
RUN MINIFY=1 pnpm turbo run build --filter=@seta/api...
# Step 3: produce a self-contained, hoisted node_modules for production.
# `pnpm deploy` flattens symlinks so the runner stage doesn't need pnpm or the workspace.
RUN pnpm --filter=@seta/api deploy --prod /app

FROM node:24-alpine AS runner
WORKDIR /app
RUN addgroup -S seta && adduser -S seta -G seta
USER seta
COPY --from=builder --chown=seta:seta /app ./
# OTel --import preload — see §8 / §15.
CMD ["node", "--import", "./dist/instrumentation.js", "dist/main.js"]
```

`turbo prune` ships only the workspace files `@seta/api` actually depends on; `pnpm deploy --prod` flattens the pruned workspace into a self-contained `node_modules` (no symlinks, no pnpm needed at runtime). Image stays under ~150 MB.

> **Why `pnpm deploy` and not just `cp -r node_modules`?** With pnpm's default `node-linker=isolated`, `node_modules/` is a forest of symlinks into `node_modules/.pnpm/`. Copying it across stages breaks the symlinks. `pnpm deploy` was built for exactly this case. Build the image once, run `docker run --rm <image> ls -la node_modules` to confirm — should be a flat tree, not symlinks.

### CI parallelism

Replace the single `build` job with a fan-out (see updated §12 `ci.yml`). `lint`, `typecheck`, `unit`, `integration`, `e2e`, `build` run in parallel. Each restores Turbo remote cache. Total wall-clock < slowest job (typically `e2e`).

### Watching what regresses

`tooling/scripts/measure-ci.ts` parses GitHub Actions timing JSON nightly and posts a 7-day rolling chart per job to a Slack channel. Catches "tests went from 30s → 90s last week" before it becomes normal.
