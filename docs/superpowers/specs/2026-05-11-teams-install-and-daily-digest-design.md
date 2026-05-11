# Design — Teams App Installation, Onboarding & Daily Digest (Epic 4)

**Status**: Draft for review · approved-section-by-section in brainstorm
**Author**: Canh Ta (with Claude)
**Date**: 2026-05-11
**Source brainstorm**: `docs/plans/MS365 Epics Brainstorm.md` — Epic 4 (incl. daily-digest supplement)
**Depends on**:
  - Epic 1 (`2026-05-11-ms365-auth-design.md`) — `TokenVault`, `OAuthProvider.acquireOnBehalfOf`, audit, `tenant_connectors`
  - Epic 2 (`2026-05-11-ms365-planner-crud-design.md`) — `agent.invokeTool` entry, commit tools accept `{token}`, cache reads
  - Epic 3 (`2026-05-11-ms365-background-sync-design.md`) — `Scheduler.register`, `AlertSink` interface

---

## 1. Goal

A customer IT admin can install the Seta agent in their Microsoft Teams tenant via the standard Teams Admin Center → Manage apps → Upload flow. End users in that tenant can `@SetaAgent` in any chat or channel where the bot is added. First-time @-mention shows a friendly welcome card. Clicking **Confirm** on a Planner-write Adaptive Card sends a Bot Framework `invoke` activity that dispatches the matching `*.commit` tool with the continuation token. The bot delivers a templated daily digest at 8 AM tenant-primary-timezone to users with recent agent activity. Operations alerts (sync failures, etc.) are posted proactively to a `#seta-os-ops` channel.

## 2. Non-goals

- Public Teams marketplace submission (sideload only in P1; marketplace deferred to P2/P3).
- Tab UI inside Teams (chat-only in P1).
- Outlook email delivery of the digest (defers `Mail.Send` scope to P2).
- Per-user timezone, per-user digest filters (P2).
- Channel-scope proactive messages (P1 supports personal-scope proactive; channel-scope proactive lands in P2).
- Voice/phone surfaces, Slack channel (future).

## 3. Packages & schemas

### 3.1 Package additions on top of Epic 1-3

```
modules/channels/teams/
  src/
    manifest/                              NEW — manifest authoring
      manifest.json.tmpl                   {{vars}} substituted at build time
      icons/color.png                      192×192 from Seta brand asset
      icons/outline.png                    32×32 transparent
      validate.ts                          @microsoft/teams-manifest wrapper

    routes.ts                              POST /teams/messages, GET /teams/health
    jwt.ts                                 jose JWKS validator (Bot Framework)
    activity.ts                            Zod schemas: Message, Invoke, ConversationUpdate, AdaptiveCardInvoke
    bot-token.ts                           Outbound client_credentials (LRU 1h)
    reply.ts                               POST serviceUrl/v3/conversations/:id/activities
    sso.ts                                 signin/tokenExchange → @seta/oauth.acquireOnBehalfOf
    handler.ts                             Handler interface

    welcome.ts                      NEW    First-mention welcome card
    install-lifecycle.ts            NEW    installationUpdate.add/remove + audit
    action-execute.ts               NEW    Adaptive Card Action.Execute → agent.invokeTool
    proactive.ts                    NEW    sendProactive(reference, activity)
    conv-ref-store.ts               NEW    Reference + opt-out persistence helpers
    alert-sink.ts                   NEW    TeamsChannelAlertSink implements @seta/observability.AlertSink
    schema.ts                       NEW    Drizzle: 4 channel_teams tables
    digest.ts                       NEW    dailyDigestJob: Job

modules/products/agent/
  src/digest/                       NEW
    template.ts                            Templated Markdown → Adaptive Card

apps/api/src/main.ts                       Mounts /teams routes
apps/worker/src/main.ts                    Registers dailyDigestJob; wires TeamsChannelAlertSink
```

### 3.2 Schemas — `channel_teams` (owned by `@seta/teams`)

```
channel_teams.installations
  tenant_id                  uuid pk
  teams_tenant_id            text                   -- Microsoft Teams tenant GUID
  installed_by_user_id       uuid                   -- auth.users.id (no FK; cross-schema)
  manifest_version           text
  installed_at               timestamptz
  uninstalled_at             timestamptz
  status                     text                   -- 'installed' | 'uninstalled'

channel_teams.conversation_references
  id                         uuid pk
  tenant_id                  uuid
  user_id                    uuid                   -- auth.users.id
  entra_object_id            text
  conversation_id            text
  channel_id                 text                   -- 'msteams'
  service_url                text                   -- per-tenant Bot Framework endpoint
  scope                      text                   -- 'personal' | 'channel' | 'groupChat' | 'ops_channel'
  reference                  jsonb                  -- full ConversationReference
  last_seen_at               timestamptz
  status                     text                   -- 'active' | 'stale' (after 403)
  UNIQUE (tenant_id, user_id, conversation_id, scope)

channel_teams.proactive_optout
  tenant_id                  uuid
  user_id                    uuid
  kind                       text                   -- 'daily_digest' | 'alerts'
  opted_out_at               timestamptz
  PRIMARY KEY (tenant_id, user_id, kind)

channel_teams.welcome_shown
  tenant_id                  uuid
  user_id                    uuid
  conversation_id            text
  shown_at                   timestamptz
  PRIMARY KEY (tenant_id, user_id, conversation_id)
```

All RLS-enforced on `tenant_id`. Per-package drizzle config with `schemaFilter: ["channel_teams"]`.

## 4. Teams app manifest + sideload artifact

### 4.1 Build

CI generates `seta-agent-<version>.zip` on every tag — manifest + icons + version substitution:

```
.github/workflows/release.yml step:
  - run: pnpm --filter @seta/teams build:manifest
  - run: pnpm --filter @seta/teams validate:manifest
  - uses: actions/upload-artifact@v4
    with:
      name: seta-agent-${{ github.ref_name }}
      path: modules/channels/teams/dist/seta-agent.zip
```

### 4.2 Validator (`validate:manifest`)

Wraps `@microsoft/teams-manifest` (pin verified at install time). Checks: schema validity, icon dimensions (192×192 color, 32×32 outline transparent), reachable URLs (privacy, ToS, valid-domains), monotonic version vs last main. Runs as pre-commit hook on `modules/channels/teams/src/manifest/**` glob (lefthook) and in CI lint job.

### 4.3 Icons

Seta brand asset rasterized to required sizes (per brainstorm Q-5 resolution: use Seta's existing brand asset). Designer fallback only if brand asset isn't suitable for Teams dimensions.

## 5. Channel adapter — webhook routing

The `/teams/messages` webhook is the integration root.

```ts
// modules/channels/teams/src/routes.ts
export function teamsRouter(handler: Handler): Hono {
  const app = new Hono()

  app.post('/messages', async (c) => {
    // 1. JWT verify (jose) against Bot Framework JWKS (cached, multi-key tolerant)
    await verifyBotFrameworkJwt(c.req.header('authorization'), env.MS_BOT_ID)

    const activity = ActivitySchema.parse(await c.req.json())

    // 2. Resolve tenant_id from activity.channelData.tenant.id; set RLS context
    const tenantId = await resolveTenant(activity)
    await tenantContext.run(tenantId, async () => {

      // 3. Persist/update conversation reference (every inbound activity refreshes proactive trust)
      await convRefStore.upsert(extractConversationReference(activity), tenantId)

      // 4. Route
      switch (activity.type) {
        case 'message':            return handleMessage(activity, handler)
        case 'invoke':             return handleInvoke(activity, handler)
        case 'conversationUpdate': return handleConvUpdate(activity, handler)
        default:                   return c.body(null, 200)
      }
    })
  })

  app.get('/health', (c) => c.json({ ok: true }))
  return app
}
```

### 5.1 `Action.Execute` dispatch (connective tissue for Epic 2 preview/commit)

```ts
// modules/channels/teams/src/action-execute.ts
async function handleInvoke(activity: InvokeActivity, handler: Handler) {
  if (activity.name !== 'adaptiveCard/action') return handler.onInvoke(activity)

  const { verb, data } = activity.value.action      // verb='planner.update_tasks.commit', data={token}

  // 1. Ensure user OBO bundle exists (Epic 1 §6 — Teams SSO → OBO)
  await ensureUserObo(activity.from.aadObjectId, activity.channelData.tenant.id)

  // 2. Dispatch to the agent's tool entry; commit tools verify HMAC token (Epic 2 §7.3)
  const result = await agent.invokeTool({
    toolId: verb,
    input: data,
    actor: { type: 'user', userId: resolveUserId(activity.from.aadObjectId, tenantId) },
  })

  // 3. Return Adaptive Card refresh response
  return c.json({
    statusCode: 200,
    type: 'application/vnd.microsoft.activity.message',
    value: cardForToolResult(result),
  })
}
```

**Why this lives in the channel, not the agent:** the channel knows Teams' invoke semantics; the agent knows tools. The channel translates `verb → toolId`. Clean separation.

### 5.2 Install / uninstall lifecycle

```ts
// modules/channels/teams/src/install-lifecycle.ts
async function handleConvUpdate(activity, handler) {
  if (activity.eventType === 'installationUpdate') {
    if (activity.action === 'add') {
      await db.execute(sql`
        INSERT INTO channel_teams.installations(tenant_id, teams_tenant_id, installed_by_user_id,
                                                 manifest_version, installed_at, status)
        VALUES (...) ON CONFLICT (tenant_id) DO UPDATE
          SET status='installed', uninstalled_at=NULL, manifest_version=excluded.manifest_version
      `)
      await audit.recordAudit({ tenantId, actor, op:'teams.install', result:'ok',
        metadata:{ manifest_version } })
    } else if (activity.action === 'remove') {
      // Per brainstorm AC-6: clean cleanup
      await markUninstalled(tenantId)
      await vault.deleteAll(tenantId)
      await db.execute(sql`UPDATE tenant.tenant_connectors SET status='revoked' WHERE tenant_id=$1`)
      await audit.recordAudit({ tenantId, op:'teams.uninstall', result:'ok' })
    }
  }
}
```

### 5.3 Reconciliation for missed `remove` events (brainstorm R-5)

Daily job — registered with Epic 3's scheduler:

```ts
export const reconcileTeamsInstallsJob: Job = {
  id: 'reconcile.teams-installs',
  scope: 'global',
  schedule: { kind: 'cron', expr: '0 3 * * *' },
  async run(ctx) {
    // For each tenant in installations.status='installed':
    //   GET /v1.0/teams/{teams_tenant_id}/installedApps?$filter=teamsAppId eq '<our app id>'
    //   If empty → markUninstalled(tenantId); audit op='teams.uninstall_reconciled'
  },
}
```

### 5.4 First-mention welcome card

```ts
async function handleMessage(activity, handler) {
  // … mention check, agent invocation, etc. …

  const shown = await db.query(sql`
    SELECT 1 FROM channel_teams.welcome_shown
     WHERE tenant_id=$1 AND user_id=$2 AND conversation_id=$3
  `)
  if (!shown) {
    await reply(activity, buildWelcomeCard(user.displayName))
    await db.execute(sql`INSERT INTO channel_teams.welcome_shown(...) VALUES (...)`)
  }
  return handler.onMessage(activity)
}
```

Welcome card links to `os.seta-international.com/docs/user/quickstart`.

## 6. Proactive trust + conversation references

**Bot Framework rule:** proactive messaging requires a stored `ConversationReference` from a prior user-initiated message. Every inbound activity (§5 step 3) calls `convRefStore.upsert()`.

```ts
// modules/channels/teams/src/proactive.ts
export async function sendProactive(input: {
  tenantId: string
  userId: string
  scope?: 'personal'                     // P1 only — channel-scope proactive in P2
  activity: Partial<Activity>
}): Promise<{ ok: boolean; reason?: 'no_trust' | 'opted_out' | 'failed' }> {
  if (await convRefStore.isOptedOut(input.tenantId, input.userId, 'daily_digest')) {
    return { ok: false, reason: 'opted_out' }
  }

  const ref = await convRefStore.findLatest(input.tenantId, input.userId, input.scope ?? 'personal')
  if (!ref) return { ok: false, reason: 'no_trust' }

  const token = await botToken.acquire()
  const res = await fetch(`${ref.service_url}/v3/conversations/${ref.conversation_id}/activities`, {
    method: 'POST',
    headers: { authorization:`Bearer ${token}`, 'content-type':'application/json' },
    body: JSON.stringify({ ...input.activity, conversation:{ id: ref.conversation_id } }),
  })

  if (!res.ok) {
    if (res.status === 403) await convRefStore.markStale(ref.id)
    return { ok: false, reason: 'failed' }
  }
  return { ok: true }
}
```

**Trust scoping (R-D1):** targets users with **prior agent activity**. New users receive digests starting day 2 after first @-mention.

## 7. Daily digest (resolves brainstorm Q-4)

### 7.1 Cron job registered with Epic 3's scheduler

```ts
// modules/channels/teams/src/digest.ts
export const dailyDigestJob: Job = {
  id: 'digest.daily',
  scope: 'per-tenant',
  schedule: { kind: 'cron', expr: '0 8 * * *', tz: 'tenant' },
  concurrency: 10,
  async run(ctx) {
    const targets = await db.execute(sql`
      SELECT u.id, u.display_name, u.email
        FROM auth.users u
        JOIN channel_teams.conversation_references cr
             ON cr.user_id = u.id AND cr.scope = 'personal' AND cr.status = 'active'
       WHERE cr.tenant_id = ${ctx.tenantId}
         AND cr.last_seen_at > now() - interval '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM channel_teams.proactive_optout po
            WHERE po.tenant_id = ${ctx.tenantId} AND po.user_id = u.id AND po.kind = 'daily_digest'
         )
       GROUP BY u.id
    `)

    for (const user of targets) {
      const data = await buildDigestData(ctx.tenantId, user.id)  // pulls from planner cache
      if (data.empty) continue

      const card = buildDigestCard(user, data)                   // templated, no LLM
      const result = await sendProactive({
        tenantId: ctx.tenantId,
        userId: user.id,
        scope: 'personal',
        activity: { type:'message', attachments:[{
          contentType:'application/vnd.microsoft.card.adaptive', content: card }] },
      })

      if (!result.ok && result.reason === 'failed') {
        await alertSink.alert({ severity:'warning',
          summary:`Digest delivery failed for tenant ${ctx.tenantId}`,
          tenantId: ctx.tenantId, details:{ user_id: user.id } })
      }
    }
    return { itemsProcessed: targets.length }
  }
}
```

**Templated content** (no LLM, deterministic — per brainstorm scope decision): `modules/products/agent/src/digest/template.ts` consumes the same `planner.list_my_tasks` cache reads + `planner.workload_analysis` output that read tools use. Same data, simpler path.

### 7.2 Opt-out command (`@SetaAgent stop daily digest`)

```ts
// modules/products/agent/src/teams-handler.ts — pre-LLM message routing
const STOP_DIGEST  = /^@?SetaAgent\s+stop\s+daily\s+digest/i
const START_DIGEST = /^@?SetaAgent\s+start\s+daily\s+digest/i

if (STOP_DIGEST.test(text)) {
  await db.execute(sql`
    INSERT INTO channel_teams.proactive_optout(tenant_id, user_id, kind, opted_out_at)
    VALUES (${tenantId}, ${userId}, 'daily_digest', now())
    ON CONFLICT DO NOTHING
  `)
  await audit.recordAudit({ tenantId, op:'digest.optout', actor, result:'ok' })
  return replyText("Daily digest disabled. Send `@SetaAgent start daily digest` to re-enable.")
}
```

Per AC-11: opt-out persists across restart; effective within 60s (next digest run respects the row).

### 7.3 Timezone resolution

`tz: 'tenant'` makes the scheduler resolve `tenant.tenants.metadata.primary_tz`. P1 default: UTC if unset. Per-user tz lands in P2. Standard cron lib (`croner` — verify pin at install).

## 8. `TeamsChannelAlertSink` (Epic 3's deferred sink)

```ts
// modules/channels/teams/src/alert-sink.ts
export class TeamsChannelAlertSink implements AlertSink {
  constructor(private opts: { tenantId: string; conversationId: string }) {}

  async alert(input) {
    const card = buildOpsAlertCard({
      severity: input.severity,
      summary:  input.summary,
      details:  input.details,
      tenantId: input.tenantId,
    })
    await sendProactive({
      tenantId: this.opts.tenantId,            // Seta's own tenant
      userId:   /* the ops bot's bound conversation user */,
      scope:    'channel',                     // 'ops_channel' specifically — see §8.1
      activity: { type:'message', attachments:[{
        contentType:'application/vnd.microsoft.card.adaptive', content: card }] },
    })
  }
}
```

### 8.1 Ops channel binding

The bot is installed in Seta's own Teams tenant in a dedicated `#seta-os-ops` channel. The reference is captured on first @-mention there; bootstrap script `tooling/scripts/bind-ops-channel.ts` writes a `kind='ops_channel'`-scoped row to `conversation_references` so the alert sink can find it.

If proactive trust to ops channel is missing/fails, **`CloudWatchAlertSink`** (in the `MultiSink` per Epic 3 §7) remains as redundant fallback.

### 8.2 Wiring into worker composition

```ts
// apps/worker/src/main.ts
const opsRef = await convRefStore.findOpsChannelRef()
const sinks: AlertSink[] = [new CloudWatchAlertSink(...)]
if (opsRef) sinks.push(new TeamsChannelAlertSink({ tenantId: opsRef.tenant_id, conversationId: opsRef.conversation_id }))

const scheduler = createScheduler({ alertSink: new MultiSink(sinks) })
scheduler.register(plannerSyncJob)
scheduler.register(directorySyncJob)
scheduler.register(dailyDigestJob)
scheduler.register(reconcileTeamsInstallsJob)
```

## 9. Cross-client validation

Manual gate, not CI-automated. Runbook at `docs/runbooks/teams-cross-client-validation.md`:

```
Per release with manifest or card changes:
  1. Desktop (macOS + Windows): "Show my open tasks" → card renders; no truncation; deep-links work.
  2. Web (teams.microsoft.com): same.
  3. iOS: same; assert FactSet wrap; bar chart degrades to table if image unsupported.
  4. Android: same.
  5. Daily digest: trigger manual via tooling/scripts/trigger-digest.ts; assert receipt on desktop + one mobile.
  6. Confirmation flow: trigger update_tasks.preview; click Confirm on each client; assert commit completes.
```

Owned by QA; tracked in the Q5 milestone gate.

**Defensive card design** (so cross-client works by construction):
- All cards Adaptive Card v1.5.
- Charts return both chart-data AND fallback text/table.
- Use `Action.Execute` (Universal Action Model), not `Action.Submit`.
- Icons pre-rasterized at exact dimensions.

## 10. Manifest validator in CI

```yaml
# .github/workflows/ci.yml — lint job adds
  - run: pnpm --filter @seta/teams validate:manifest

# lefthook.yml — pre-commit
pre-commit:
  commands:
    teams-manifest:
      glob: "modules/channels/teams/src/manifest/**"
      run: pnpm --filter @seta/teams validate:manifest
```

## 11. Error model (Epic 4 additions)

| Class | HTTP/use | Trigger |
|---|---|---|
| `BotFrameworkJwtInvalid` | 401 | JWT verify failure |
| `BotFrameworkTenantUnresolved` | 400 | `channelData.tenant.id` unknown |
| `ProactiveTrustMissing` | internal | No conversation reference for (tenant, user, scope) |
| `ProactiveDeliveryFailed` | internal | Outbound POST failed; markStale on 403 |
| `ManifestValidationFailed` | CI-only | `validate:manifest` blocks build |

## 12. Observability

**Spans:** `teams.activity.<type>`, `teams.invoke.<name>`, `teams.proactive.<scope>`, `teams.action_execute.<verb>` (attrs `tool_id`, `result`).

**Metrics:**
- `teams_activities_total{type,result}`
- `teams_invokes_total{name,result}`
- `teams_action_execute_total{verb,result}`
- `teams_proactive_total{scope,result}` — result ∈ ok | no_trust | opted_out | failed
- `teams_install_lifecycle_total{action}` — action ∈ add | remove | reconciled
- `digest_runs_total{result}`
- `digest_users_targeted` histogram per tenant

## 13. Testing strategy

### 13.1 Unit

| Package | Tests |
|---|---|
| `modules/channels/teams/jwt` | JWKS verify; multi-matching-kid handling; rotation tolerance |
| `modules/channels/teams/activity` | Zod parse for all 4 activity types |
| `modules/channels/teams/welcome` | once-per-(tenant, user, conversation); recovery if row missing |
| `modules/channels/teams/install-lifecycle` | add → install row + audit; remove → cleanup full chain |
| `modules/channels/teams/action-execute` | verb + token → `agent.invokeTool` shape; card response shape |
| `modules/channels/teams/proactive` | success; 403 → markStale; opt-out short-circuit |
| `modules/channels/teams/digest` | eligibility query correctness; templated card; tz cron computation |
| `modules/channels/teams/alert-sink` | sink converts AlertSink.alert input to card; MultiSink retains CloudWatch when Teams fails |
| `modules/channels/teams/conv-ref-store` | upsert/last-seen; markStale; findLatest; opt-out helpers |
| `modules/products/agent/digest/template` | Markdown → AC card; "no items" returns empty; sample-task selection |

### 13.2 Integration

- Real Postgres; msw-recorded Bot Framework JWKS + outbound `/v3/conversations/.../activities`.
- Full webhook → JWT → tenant resolve → activity route → reply (the Teams round-trip gate).
- `Action.Execute` round-trip: agent commit tool stub → response card asserted.
- Install/uninstall E2E: simulate add then remove; assert state machine in 3 tables.
- Daily digest E2E: bootstrap a tenant with cached tasks + a conversation reference; `dailyDigestJob.run()`; assert `sendProactive` called with templated card.

### 13.3 E2E

- Sideload `seta-agent-<version>.zip` into dev tenant; @-mention from each client; assert response.
- AC-1: manifest validator zero errors on current zip.
- AC-2: sideload time stopwatch < 2 min (manual gate).
- AC-9: install audit row present.

## 14. Acceptance criteria mapping

| AC (brainstorm Epic 4) | Where |
|---|---|
| AC-1: manifest zero errors | §4.2, §10 |
| AC-2: ≤2 min sideload | §9 runbook |
| AC-3: customer admin via Admin Center | §4.1 zip + Epic 6 docs |
| AC-4: first-mention welcome | §5.4 |
| AC-5: cross-client parity | §9 |
| AC-6: uninstall clean cleanup | §5.2 |
| AC-7: meets Teams app guidelines | manifest content + Legal sign-off (H2) |
| AC-8: channel-scope respect | §5 + §6 scope separation |
| AC-9: install audit | §5.2 |
| AC-10: digest at 8 AM tenant tz | §7.1 |
| AC-11: opt-out within 60s | §7.2 |
| AC-12: failed digest alert + degraded | §7.1 |

## 15. Deferrals

P2:
- Outlook email digest (defers `Mail.Send` scope).
- Per-user timezone + per-user digest filters.
- Marketplace submission.
- Tab UI.
- Channel-scope proactive.

P3:
- Public marketplace presence with all required artifacts.

## 16. Kernel paper-contract dependencies (additions)

- `@seta/agent-core`: `agent.invokeTool({toolId, input, actor})` entry.
- Epic 2 agent product: commit tools accept `{token}` + return response cards; `start|stop daily digest` command handlers in `teams-handler.ts`.
- Epic 3 scheduler: registration target for `dailyDigestJob` + `reconcileTeamsInstallsJob`.

## 17. CLAUDE.md changes implied

None beyond Epic 1-3 — operates within established boundaries.

## 18. References

- Epic 1-3 design docs (same dir).
- Bot Framework — [Adaptive Cards Universal Action Model](https://learn.microsoft.com/en-us/adaptive-cards/authoring-cards/universal-action-model)
- Microsoft Learn — [Teams app manifest schema](https://learn.microsoft.com/en-us/microsoftteams/platform/resources/schema/manifest-schema)
- Microsoft Learn — [Proactive messages in Bot Framework](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-howto-proactive-message)
- Microsoft Learn — [installedApps for a team](https://learn.microsoft.com/en-us/graph/api/team-list-installedapps)
