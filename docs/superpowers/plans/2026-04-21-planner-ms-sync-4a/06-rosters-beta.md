# Plan 4.6 — Rosters (Beta, Flag-Gated)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support standalone plans via MS Graph's Planner Rosters (beta API). Admin can link an existing Roster by ID or mint a new Roster from Future. Roster members are planner-owned (identity doesn't track rosters). Feature-flag gated because the `/beta/planner/rosters` API is not yet GA.

**Architecture:** New `ms_linked_roster` + `roster_member` tables. `msSync.rosters.*` tRPC surface. Extended `MsGraphClient` with `useBeta: true` flag (already supported from Plan 4.2). `PollTenantHandler` (Plan 4.3) gains a roster loop. `ContainerPicker` (Plan 4.2) gains a Rosters section.

**Tech Stack:** Same as prior plans.

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §6 (Q6 decision), §8.3, §10.2 (Plan 4.6).

**Depends on:** Plan 4.4 complete. Parallelizable with Plan 4.5.

---

## Task 1: Feature flag + schema migrations

**Files:**

- Modify: feature-flag seed — add `planner.ms_sync.rosters.enabled` default `false`.
- Modify: `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`
- Generate: migration

- [ ] **Step 1: Schema — `ms_linked_roster`, `roster_member`**

```typescript
export const msLinkedRoster = plannerSchema.table(
  'ms_linked_roster',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    msRosterId: text('ms_roster_id').notNull(),
    displayName: text('display_name').notNull(),
    linkedByActorId: uuid('linked_by_actor_id').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    mintedByFutureAt: timestamp('minted_by_future_at', { withTimezone: true }),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
  },
  (t) => ({
    uniqueRoster: uniqueIndex('uniq_ms_linked_roster_tenant_msroster').on(t.tenantId, t.msRosterId),
  }),
)

export const rosterMember = plannerSchema.table(
  'roster_member',
  {
    tenantId: uuid('tenant_id').notNull(),
    msRosterId: text('ms_roster_id').notNull(),
    actorId: uuid('actor_id'), // nullable until identity resolves
    ssoSubject: text('sso_subject').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.msRosterId, t.ssoSubject] }),
    lookup: index('idx_roster_member_lookup').on(t.tenantId, t.msRosterId),
  }),
)
```

- [ ] **Step 2: Generate + add RLS**

Standard tenant-isolation policies on both tables.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): ms_linked_roster + roster_member tables + flag"
```

---

## Task 2: Entities + repositories

**Files:**

- Create: `apps/api/src/modules/planner/domain/entities/ms-linked-roster.entity.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/domain/entities/roster-member.entity.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/domain/repositories/ms-linked-roster.repository.ts`
- Create: `apps/api/src/modules/planner/domain/repositories/roster-member.repository.ts`
- Create: Drizzle adapters + integration specs for both

Patterns match Plan 4.2's `ms_linked_group` / `ms_plan_sync_state` repositories.

- [ ] **Step 1: `MsLinkedRosterEntity`** — same shape as MsLinkedGroupEntity with `mintedByFutureAt` added. Methods: `markMinted()`, `unlink()`.

- [ ] **Step 2: `RosterMemberEntity`** — `tenantId`, `msRosterId`, `actorId | null`, `ssoSubject`, `syncedAt`. No complex methods.

- [ ] **Step 3: `IMsLinkedRosterRepository`** — `findByTenantAndRoster`, `listForTenant`, `upsert`, `remove`.

- [ ] **Step 4: `IRosterMemberRepository`** — `replaceForRoster({ tenantId, msRosterId, ssoSubjects })`, `listMembers({ tenantId, msRosterId })`, `listUnresolved(tenantId)`, `resolveMember(tenantId, msRosterId, ssoSubject, actorId)`.

- [ ] **Step 5: Drizzle adapters + integration tests**

- [ ] **Step 6: Register with module**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(planner): roster entities + repositories"
```

---

## Task 3: `MintMsRosterCommand` — create standalone roster + plan from Future

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/mint-ms-roster.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/mint-ms-roster.handler.ts` (+ `.spec.ts`)

- [ ] **Step 1: Command**

```typescript
export class MintMsRosterCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly displayName: string,
    public readonly initialMemberActorIds: string[],
  ) {}
}
```

- [ ] **Step 2: Handler test**

```typescript
describe('MintMsRosterHandler', () => {
  it('rejects when actor cannot be resolved to AAD OID (roster owner must exist in MS)', async () => {
    identityFacade.getExternalUserId.mockResolvedValue(null)
    await expect(handler.execute(new MintMsRosterCommand('t1', 'a1', 'X', []))).rejects.toThrow(
      /AAD/,
    )
  })

  it('POSTs /beta/planner/rosters with owner as initial member', async () => {
    identityFacade.getExternalUserId.mockResolvedValue('aad-owner')
    graph.post.mockResolvedValue({ status: 201, body: { id: 'roster-1' }, etag: null })
    await handler.execute(new MintMsRosterCommand('t1', 'a1', 'My Roster', []))
    expect(graph.post).toHaveBeenCalledWith(
      't1',
      '/planner/rosters',
      expect.objectContaining({ '@odata.type': '#microsoft.graph.plannerRoster' }),
      expect.objectContaining({ useBeta: true }),
    )
  })

  it('adds initial members via POST /rosters/{id}/members for each resolved actor', async () => {
    /* ... */
  })
  it('upserts ms_linked_roster with mintedByFutureAt set', async () => {
    /* ... */
  })
})
```

- [ ] **Step 3: Handler implementation**

```typescript
@CommandHandler(MintMsRosterCommand)
export class MintMsRosterHandler implements ICommandHandler<MintMsRosterCommand> {
  constructor(
    private readonly graph: MsGraphClient,
    @Inject(MS_LINKED_ROSTER_REPOSITORY) private readonly rosterRepo: IMsLinkedRosterRepository,
    @Inject(ROSTER_MEMBER_REPOSITORY) private readonly memberRepo: IRosterMemberRepository,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: MintMsRosterCommand): Promise<{ msRosterId: string; localId: string }> {
    // Resolve owner AAD OID
    const ownerAadId = await this.identityFacade.getExternalUserId(cmd.actorId, cmd.tenantId)
    if (!ownerAadId) {
      throw new Error(`Cannot mint roster: actor ${cmd.actorId} has no AAD user`)
    }

    // Resolve additional member AAD OIDs (skip unresolvable — don't block minting)
    const memberAadIds: string[] = [ownerAadId]
    for (const memberActorId of cmd.initialMemberActorIds) {
      if (memberActorId === cmd.actorId) continue
      const aadId = await this.identityFacade.getExternalUserId(memberActorId, cmd.tenantId)
      if (aadId) memberAadIds.push(aadId)
    }

    // POST /beta/planner/rosters (Microsoft requires no body; roster has no writable properties)
    const rosterRes = await this.graph.post<any>(
      cmd.tenantId,
      '/planner/rosters',
      { '@odata.type': '#microsoft.graph.plannerRoster' },
      { useBeta: true, preferReturnRepresentation: true },
    )
    if (!rosterRes.body?.id) throw new Error('plannerRoster POST did not return id')
    const msRosterId = rosterRes.body.id as string

    // Add additional members
    for (const aadId of memberAadIds.slice(1)) {
      await this.graph.post(
        cmd.tenantId,
        `/planner/rosters/${encodeURIComponent(msRosterId)}/members`,
        { userId: aadId },
        { useBeta: true },
      )
    }

    // Upsert local row
    const entity = MsLinkedRosterEntity.create({
      tenantId: cmd.tenantId,
      msRosterId,
      displayName: cmd.displayName,
      linkedByActorId: cmd.actorId,
      mintedByFutureAt: new Date(),
    })
    await this.rosterRepo.upsert(entity)

    // Seed roster_member locally so the creator sees the plans immediately
    await this.memberRepo.replaceForRoster({
      tenantId: cmd.tenantId,
      msRosterId,
      ssoSubjects: memberAadIds,
    })

    this.eventBus.publish({
      type: 'planner.ms_sync.roster_minted',
      tenantId: cmd.tenantId,
      actorId: cmd.actorId,
      msRosterId,
      occurredAt: new Date().toISOString(),
    } as any)

    return { msRosterId, localId: entity.id }
  }
}
```

- [ ] **Step 4: Roster-minted event contract + container options**

Create `packages/event-contracts/src/planner/ms-sync/ms-roster-minted.event.ts` (following Plan 4.1 patterns).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): MintMsRosterCommand — mint beta roster + seed members"
```

---

## Task 4: `LinkExistingRosterCommand` — paste-an-ID flow

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/link-existing-roster.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/link-existing-roster.handler.ts` (+ `.spec.ts`)

Rosters aren't enumerable by tenant — only the caller's owned/membered rosters are returnable via `/me/planner/rosters` which doesn't work under app-only auth. So the link flow is paste-an-ID.

- [ ] **Step 1: Handler**

```typescript
@CommandHandler(LinkExistingRosterCommand)
export class LinkExistingRosterHandler implements ICommandHandler<LinkExistingRosterCommand> {
  async execute(cmd: LinkExistingRosterCommand): Promise<void> {
    // Validate roster exists + we have access
    const rosterRes = await this.graph.get<any>(
      cmd.tenantId,
      `/planner/rosters/${encodeURIComponent(cmd.msRosterId)}`,
      { useBeta: true },
    )
    if (!rosterRes.body) throw new Error('Roster not found')

    // Upsert linked roster
    const entity = MsLinkedRosterEntity.create({
      tenantId: cmd.tenantId,
      msRosterId: cmd.msRosterId,
      displayName: cmd.displayName ?? 'Roster',
      linkedByActorId: cmd.actorId,
      // No mintedByFutureAt — this is linking an existing
    })
    await this.rosterRepo.upsert(entity)

    // Enqueue backfill for this roster's plan (each roster has exactly 1 plan)
    await this.boss.send('ms-sync-backfill-roster', {
      tenantId: cmd.tenantId,
      msRosterId: cmd.msRosterId,
      linkedRosterId: entity.id,
    })
  }
}
```

- [ ] **Step 2: `ms-sync-backfill-roster` pg-boss worker**

Smaller sibling of Plan 4.2's `backfill-group.worker.ts`. Reuses `PlanIngestor` for the single plan. Also fetches initial `/planner/rosters/{id}/members` and seeds `roster_member`.

- [ ] **Step 3: Tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): link existing roster + backfill"
```

---

## Task 5: Extend `PollTenantHandler` with roster loop (Plan 4.3)

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/ms-sync/poll-tenant.handler.ts`

- [ ] **Step 1: Add roster iteration after group iteration**

```typescript
if (await this.featureFlags.isEnabled('planner.ms_sync.rosters.enabled', command.tenantId)) {
  const rosters = await this.rosterRepo.listActiveForTenant(command.tenantId)
  for (const roster of rosters) {
    try {
      await this.pollRoster(command.tenantId, roster)
    } catch (e) {
      await this.handleRosterPollError(command.tenantId, roster, e as Error)
    }
  }
}
```

- [ ] **Step 2: `pollRoster` method**

```typescript
private async pollRoster(tenantId: string, roster: MsLinkedRosterEntity): Promise<void> {
  // Rosters have exactly one plan
  const plans = await this.graph.getAllPages<any>(
    tenantId,
    `/planner/rosters/${encodeURIComponent(roster.msRosterId)}/plans`,
    { useBeta: true },
  )
  for (const p of plans) {
    await this.ingestor.ingestPlan({ tenantId, msPlanId: p.id, origin: 'ms-sync-pull' })
  }

  // Sync members
  const membersRes = await this.graph.getAllPages<any>(
    tenantId,
    `/planner/rosters/${encodeURIComponent(roster.msRosterId)}/members`,
    { useBeta: true },
  )
  await this.memberRepo.replaceForRoster({
    tenantId,
    msRosterId: roster.msRosterId,
    ssoSubjects: membersRes.map((m) => m.userId as string),
  })
}
```

- [ ] **Step 3: `handleRosterPollError`**

One special case: if the beta endpoint returns 410 / 501 / "service disabled" indicating MS turned off rosters globally, set a tenant-level notice so the UI shows the yellow banner. Route other errors through the existing `handlePollError` pattern.

- [ ] **Step 4: Tests**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): poll-tenant iterates linked rosters when flag on"
```

---

## Task 6: Roster-member resolution — pending OIDs → actorIds

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/ms-sync/resolve-pending-assignments.handler.ts` (from Plan 4.3)

- [ ] **Step 1: Extend handler**

After the existing task-level loop, add roster-member resolution:

```typescript
const unresolvedMembers = await this.memberRepo.listUnresolved(cmd.tenantId)
for (const member of unresolvedMembers) {
  const actorId = await this.identityFacade.getActorIdByExternalUserId(
    member.ssoSubject,
    cmd.tenantId,
  )
  if (actorId) {
    await this.memberRepo.resolveMember(cmd.tenantId, member.msRosterId, member.ssoSubject, actorId)
  }
}
```

- [ ] **Step 2: Tests**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): resolve-pending extends to roster members"
```

---

## Task 7: tRPC — `msSync.rosters.*`

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts`

- [ ] **Step 1: Add sub-router**

```typescript
rosters: router({
  listLinked: tenantAdminProcedure.query(async ({ ctx }) => {
    return ctx.queryBus.execute(new ListLinkedRostersQuery(ctx.tenantId))
  }),
  mint: tenantAdminProcedure
    .input(z.object({
      displayName: z.string().min(1),
      initialMemberActorIds: z.array(z.string().uuid()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      return ctx.commandBus.execute(
        new MintMsRosterCommand(ctx.tenantId, ctx.actorId, input.displayName, input.initialMemberActorIds),
      )
    }),
  linkExisting: tenantAdminProcedure
    .input(z.object({ msRosterId: z.string().min(1), displayName: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.commandBus.execute(
        new LinkExistingRosterCommand(ctx.tenantId, ctx.actorId, input.msRosterId, input.displayName ?? null),
      )
    }),
  unlink: tenantAdminProcedure
    .input(z.object({ msRosterId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.commandBus.execute(
        new UnlinkRosterCommand(ctx.tenantId, ctx.actorId, input.msRosterId),
      )
    }),
}),
```

- [ ] **Step 2: Integration tests**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): msSync.rosters tRPC procedures"
```

---

## Task 8: web-admin — Rosters tab

**Files:**

- Create: `apps/web-admin/src/app/integrations/microsoft/rosters/page.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/rosters/mint-roster-form.tsx` (+ `.spec.tsx`)
- Create: `apps/web-admin/src/app/integrations/microsoft/rosters/link-existing-roster-form.tsx` (+ `.spec.tsx`)
- Modify: `apps/web-admin/src/app/integrations/microsoft/page.tsx` — add Rosters tab link

- [ ] **Step 1: Rosters tab page** — shows table of `ms_linked_roster` rows with Status dot, Plan count (1 per roster), Mint/Link buttons.

- [ ] **Step 2: `MintRosterForm`** — name input + actor picker for initial members. On success, auto-opens backfill progress slideover.

- [ ] **Step 3: `LinkExistingRosterForm`** — roster ID input (paste) + optional display name.

- [ ] **Step 4: Flag visibility** — tab only renders when `planner.ms_sync.rosters.enabled` is on. Show yellow banner if last poll returned `rosters-globally-disabled` marker.

- [ ] **Step 5: Tests + style pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web-admin): rosters tab with mint + link-existing forms"
```

---

## Task 9: web-planner — container picker Rosters section

**Files:**

- Modify: `apps/web-planner/src/components/new-plan-form/container-picker.tsx` (from Plan 4.2)

- [ ] **Step 1: Add Rosters section**

Fetch `msSync.rosters.listLinked`. Render section below Groups when the flag is on and rosters exist. Each roster becomes a selectable option.

- [ ] **Step 2: "+ New Roster" inline option**

Clicking it opens a small modal (same component as `MintRosterForm` but web-planner-sized). After mint, the new roster is auto-selected as the container for the plan about to be created.

- [ ] **Step 3: Tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web-planner): container picker rosters section + inline mint"
```

---

## Task 10: Coverage + PR

- [ ] **Step 1: Coverage ≥ 70%**

- [ ] **Step 2: Smoke test**

1. Flip `planner.ms_sync.rosters.enabled` on for SETA internal.
2. In web-admin, mint a new roster "Test Roster". Confirm it appears in MS Planner web UI.
3. In web-planner, create a new plan with container=Test Roster. Add a task.
4. Within ~5 s, task appears in MS Planner (push engine from 4.4 handles it).
5. Within ~3 min, changes made in MS show in Future.

- [ ] **Step 3: PR** — `feat/planner-ms-sync-rosters`

## Completion criteria

- `ms_linked_roster` + `roster_member` tables with RLS.
- `MintMsRosterCommand` + `LinkExistingRosterCommand` + `UnlinkRosterCommand`.
- `msSync.rosters.*` tRPC surface.
- Poll-tenant iterates rosters when flag on; member sync populates `roster_member`.
- Pending-member resolution wired.
- web-admin Rosters tab + forms.
- web-planner container picker shows Rosters section.
- Flag `planner.ms_sync.rosters.enabled` gates everything.
- Yellow banner when MS disables rosters globally.
- Coverage ≥ 70%.
