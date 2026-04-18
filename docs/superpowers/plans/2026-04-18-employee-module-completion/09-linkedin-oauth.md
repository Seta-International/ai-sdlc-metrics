# Plan 09 — Task 008 Closure (LinkedIn OAuth)

> Covers spec §5 row "Task 008-linkedin-share-email". Wildcard — spike first.

**Goal:** Replace the `throw NotImplemented` in `initiate-linkedin-auth.handler.ts` with a real OAuth flow. Add `ListShareLinksQuery`.

**Split decision (spec §5.2):** Before writing code, spike the OAuth flow end-to-end (auth URL → callback → token exchange → store). If the spike exceeds 3 days, split into:

- **PR #9a:** OAuth flow + `LinkedInOAuthPort` + adapter + tests
- **PR #9b:** `ListShareLinksQuery` + tRPC

If the spike is ≤ 3 days, single PR.

---

## Spike first (Task 0)

- [ ] **Step 1:** Read the task spec: `docs/clones/ems/modules/employee/tasks/2026-04-14-008-linkedin-share-email.md`. Find the exact OAuth scopes, redirect flow expectations, and token storage requirements.

- [ ] **Step 2:** Register a dev LinkedIn app; capture client ID + secret in `.env.local` (or AWS Secrets Manager if the ops path is that far along).

- [ ] **Step 3:** Build a throwaway end-to-end test:
  - Hit `initiate` endpoint → get redirect URL
  - Manually visit in browser → LinkedIn callback hits `/callback`
  - Exchange code for token → fetch profile
  - Measure total implementation time

- [ ] **Step 4:** Decide: single PR or split. Write the decision into the PR description.

---

## File Map (combined view)

| File                                                                                         | Action | Purpose                                        |
| -------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| `apps/api/src/modules/people/domain/ports/linkedin-oauth.port.ts`                            | Create | Port — this is NOT a repository                |
| `apps/api/src/modules/people/infrastructure/adapters/linkedin-oauth.adapter.ts`              | Create | HTTP adapter (fetch-based, retries)            |
| `apps/api/src/modules/people/infrastructure/adapters/linkedin-oauth.adapter.spec.ts`         | Create | Unit test (HTTP mocked with nock/msw)          |
| `apps/api/src/modules/people/application/commands/initiate-linkedin-auth.handler.ts`         | Modify | Real implementation                            |
| `apps/api/src/modules/people/application/commands/complete-linkedin-auth.handler.ts`         | Create | New handler for callback step                  |
| `apps/api/src/modules/people/application/commands/complete-linkedin-auth.handler.spec.ts`    | Create | Unit test                                      |
| `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`                         | Modify | Add `linkedinOauthToken` table if not present  |
| `packages/db/drizzle/migrations/NNNN_linkedin_oauth_tokens.sql`                              | Create | Migration                                      |
| `apps/api/src/modules/people/domain/repositories/linkedin-oauth-token.repository.ts`         | Create | Token persistence interface                    |
| `apps/api/src/modules/people/infrastructure/repositories/linkedin-oauth-token.repository.ts` | Create | Drizzle adapter                                |
| `apps/api/src/modules/people/application/queries/list-share-links.query.ts`                  | Create | Query DTO                                      |
| `apps/api/src/modules/people/application/queries/list-share-links.handler.ts`                | Create | Handler                                        |
| `apps/api/src/modules/people/application/queries/list-share-links.handler.spec.ts`           | Create | Unit test                                      |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                                | Modify | Expose new procedures                          |
| `apps/api/src/modules/people/people.module.ts`                                               | Modify | Register port + adapter                        |
| AWS Secrets Manager                                                                          | Config | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| `docs/clones/ems/PROGRESS.md`                                                                | Modify | Flip task 008 to `done`                        |

---

## Task 1 — `LinkedInOAuthPort` (in `domain/ports/`, not `domain/repositories/`)

**Files:**

- Create: `domain/ports/linkedin-oauth.port.ts`

**Rationale (CLAUDE.md DDD):** Outbound integration = port. Data persistence (token table) = repository. Two separate files.

- [ ] **Step 1:** Write the port:

```ts
export const LINKEDIN_OAUTH_PORT = Symbol('LinkedInOAuthPort')

export interface LinkedInProfile {
  readonly linkedinId: string
  readonly firstName: string
  readonly lastName: string
  readonly email: string | null
  readonly headline: string | null
  readonly pictureUrl: string | null
}

export interface LinkedInTokens {
  readonly accessToken: string
  readonly refreshToken: string | null
  readonly expiresAt: Date
  readonly scope: string
}

export interface LinkedInOAuthPort {
  buildAuthorizationUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<LinkedInTokens>
  fetchProfile(accessToken: string): Promise<LinkedInProfile>
}
```

- [ ] **Step 2:** Commit.

---

## Task 2 — `LinkedInOAuthAdapter` (TDD)

**Files:**

- Create: adapter + spec

- [ ] **Step 1:** Write adapter. Use `fetch` (Node 20+ has native fetch). Secrets come from `@nestjs/config` via `ConfigService`. Retry on 5xx (up to 3 attempts, exponential backoff).

- [ ] **Step 2:** Spec uses `nock` or `msw` to mock the LinkedIn HTTP endpoints. Cover:
  - Happy path for each method.
  - 4xx from LinkedIn → throws `LinkedInAuthException`.
  - 5xx retries then throws `LinkedInTransientException`.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 3 — `linkedin_oauth_token` table + repo

- [ ] **Step 1:** Schema:

```ts
export const linkedinOauthToken = peopleSchema.table(
  'linkedin_oauth_token',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    profileId: uuid('profile_id').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(), // encrypt at rest
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    expiresAt: timestamp('expires_at').notNull(),
    scope: text('scope').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('linkedin_token_tenant_profile_uidx').on(table.tenantId, table.profileId),
  ],
)
```

- [ ] **Step 2:** Migration. Hand-add RLS.

- [ ] **Step 3:** Repo interface + Drizzle adapter. Integration test (RLS isolation, upsert behavior).

- [ ] **Step 4:** Commit.

---

## Task 4 — `InitiateLinkedInAuthHandler` (replace throw)

- [ ] **Step 1:** Spec. Cover:
  - Generates `state` token (UUID), stores it in a short-lived store (Redis/pg table — check what exists; `linkedin_oauth_state` table may be needed).
  - Returns `{ authorizationUrl, state }` using `LinkedInOAuthPort.buildAuthorizationUrl(state, redirectUri)`.

- [ ] **Step 2:** Implement. No external calls happen here — `buildAuthorizationUrl` is deterministic string construction.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 5 — `CompleteLinkedInAuthHandler` (callback)

- [ ] **Step 1:** Command DTO: `{ tenantId, profileId, code, state }`.

- [ ] **Step 2:** Spec. Cover:
  - `state` must match what was issued in Task 4 — CSRF defense.
  - `exchangeCode` returns tokens → encrypt → persist via repo (upsert on `(tenantId, profileId)`).
  - `fetchProfile` fetches LinkedIn profile info; return it in the response.
  - Expired `state` → throws.
  - 4xx from LinkedIn bubbles up as domain exception.

- [ ] **Step 3:** Implement. All calls sequential.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 6 — `ListShareLinksQuery`

- [ ] **Step 1:** Read `profile-share-link.repository.ts` — method likely already exists (something like `listByProfile`). Confirm.

- [ ] **Step 2:** Query DTO + handler + spec.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 7 — tRPC + PROGRESS.md + PR

- [ ] Expose `linkedin.initiate`, `linkedin.complete`, `shareLink.list` procedures. Router specs.
- [ ] Flip row 008 to `done`.
- [ ] Open PR (or PRs, per split decision).

---

## Acceptance criteria

- `LinkedInOAuthPort` implemented via HTTP adapter with retries.
- Tokens encrypted at rest; RLS isolates per tenant.
- `CompleteLinkedInAuthHandler` validates CSRF state.
- `ListShareLinksQuery` returns profile's active share links.
- PROGRESS task 008 = `done`.
