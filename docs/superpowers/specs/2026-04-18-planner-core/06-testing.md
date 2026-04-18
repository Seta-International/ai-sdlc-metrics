# 06 — Testing Strategy

Per CLAUDE.md: TDD, ≥70% coverage (lines/functions/branches), co-located specs, no `__tests__/`.

## Pyramid

| Layer           | Runner                         | Est. count | Scope                                                                        |
| --------------- | ------------------------------ | ---------- | ---------------------------------------------------------------------------- |
| Unit — domain   | Jest                           | ~120       | Entities, VOs, invariants, order-hint math                                   |
| Unit — handlers | Jest + in-memory repo fakes    | ~80        | Every command handler: happy + each error + auth-reject                      |
| Integration     | Jest + Testcontainers Postgres | ~40        | Real DB with RLS, real tRPC router, fakes for identity/people/kernel facades |
| E2E             | Playwright                     | 8 flows    | Full browser against ephemeral stack                                         |

## Domain unit specs

For each aggregate: every invariant throws the right exception; every state transition; order-hint round-trip against MS Graph-documented examples; VO exhaustive coverage.

## Handler unit specs (template)

```
describe('CreateTaskHandler', () => {
  it('creates task at top of bucket with computed orderHint')
  it('rejects when title empty / > 255')
  it('rejects when description > 32 000')
  it('rejects when actor lacks auth')
  it('rejects when bucketId does not belong to planId')
  it('rejects when plan soft-deleted')
  it('rejects when applying label slot not defined on plan')
  it('emits TaskCreatedEvent to outbox')
  it('writes pending_ms_assignments as empty array')
})
```

## Integration specs

- RLS isolation: tenant A cannot read tenant B's rows via any procedure.
- Permissions end-to-end: viewer update → 403; non-member read → 404 (no existence leak).
- `tasks.getBoard`: 50 tasks, 6 buckets, 12 labels → shape, ordering, no N+1 (query counter asserts ≤3 queries).
- Optimistic concurrency: two concurrent updates with same `expectedVersion`; one succeeds, one 409.
- Cascades: plan delete cascades buckets, tasks, children; soft-delete hides from listings.
- Outbox emission for each command.
- Order-hint stress: 1 000 sequential inserts at same position; hint length stays under documented ceiling.
- Checklist counter denormalization: add/toggle/remove concurrent; counters remain accurate.

## Performance budgets (test-enforced)

- `tasks.getBoard` with 200 tasks + 10 buckets: p95 < 150 ms on CI box.
- Drag-drop round trip: p95 < 200 ms.

Regressions fail the PR.

## E2E flows (Playwright)

1. Create plan → bucket → task → Board renders.
2. Drag task between buckets (persisted across refresh).
3. Toggle task completion via card checkmark → moves to bottom of bucket, strike-through applied.
4. Open detail, edit description, autosave, refresh, persisted.
5. Assign teammate → notification email fired.
6. Add checklist item, check it → card counter updates.
7. Upload file → appears → set-as-cover → card shows image.
8. Submit evidence with caption → appears in evidence section.

Against docker-compose ephemeral stack: Postgres, Redis, api, web-planner.

## Frontend component tests (Vitest + RTL)

- `TaskCard`: badges, overdue styling, cover image.
- `BoardColumn` + `@dnd-kit`: keyboard drag → correct mutation call.
- `TaskDetailPanel`: autosave-on-blur payload; 409 conflict toast.
- `LabelPicker`: 25 slots, apply/remove.
- `MsOrderHint.between`: golden fixture parity with api domain.

## Fixtures

```
apps/api/src/modules/planner/testing/
  build-plan.ts       (withLabels, withMembers, withBuckets)
  build-task.ts       (withAssignees, withChecklist, withLabels, overdue, ...)
  with-tenant.ts      (seeds tenant + platform admin + member actors)
```

Shared across unit + integration.

## CI gates

- Specs pass.
- Coverage ≥70% on new code (planner module; not diluted).
- ESLint module-boundary rules.
- Type check (NodeNext + CJS, no `.js` relative-import suffixes).
- Integration + E2E run on PRs touching `modules/planner/**` or `apps/web-planner/**`.

## Not tested (on purpose)

- MS Graph adapter (not written yet; Phase 4).
- Third-party UI library internals.
- Drizzle migrations beyond "applies cleanly + RLS active."
