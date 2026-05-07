# People Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.2 + §13 D14.
**MVP scope:** PEOPLE-1 (Profiles + exact-subject facade) only. PEOPLE-2 → `Sprint: Backlog`.
**Tickets:** 2 Epics, 3 MVP Stories + 4 Backlog Stories.

**Personas served:**

- Tenant administrator — manages employment profiles via web-admin (ADMIN-1) host shell.
- Owner of another module (programmatic) — calls `PeopleQueryFacade.resolveByExactSubject()`.
- End user (data subject) — GDPR right-to-erasure (Backlog).

---

## [EPIC] PEOPLE-1 Profiles & exact-subject facade

ID: PEOPLE-1
Status: Backlog
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 10
Rank: 100
Jira Key:
Confluence Link:

### Summary

Deliver a tenant-scoped employment profile CRUD surface and a published `PeopleQueryFacade.resolveByExactSubject()` contract so that every persisted assignment in Planner resolves through a stable SSO subject and survives directory mutations.

### Goal

By S3 close, every persisted assignment in Planner resolves through `PeopleQueryFacade.resolveByExactSubject()` and the facade contract is available for Agents track mocking.

### Scope

- Employment profile CRUD (employee record, status: active/inactive) hosted in web-admin shell (ADMIN-1)
- `PeopleQueryFacade` interface published in `packages/event-contracts` on S3 day-1
- `resolveByExactSubject(sub: string): Promise<UserProfile | null>` implementation
- RLS on `people.employment_profile` table per `tenant_id`
- Kernel `audit_event` emission on every domain write (same-transaction rollback on audit failure per §13 T1-2)

### Out of Scope

- Placements, offboarding, GDPR, fuzzy resolution → PEOPLE-2

### SRS Coverage

- n/a (no people-srs); derived from Planner FR-PL-010, FR-PL-033, UN-PL-04 + Agents DP-03

### Acceptance Criteria

- [ ] `PeopleQueryFacade.resolveByExactSubject()` is callable from Planner and Agents modules in production.
- [ ] Profile CRUD UI is accessible from the web-admin shell (ADMIN-1.S1).
- [ ] RLS dual-tenant probe passes against `people.employment_profile`.
- [ ] Kernel `audit_event` row written in the same DB transaction as every domain mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] Contract published by S3 day-1 (2026-05-07) so parallel tracks can mock against it.

### Child Tickets

- PEOPLE-1.S1 Employment profile CRUD (Story)
- PEOPLE-1.S2 PeopleQueryFacade contract publication (Story)
- PEOPLE-1.S3 Exact-subject resolver implementation (Story)

### Definition of Done

- All child Stories `Status: Done`.
- `PeopleQueryFacade.resolveByExactSubject()` is callable from Planner + Agents in production.

---

### [STORY] PEOPLE-1.S1 Employment profile CRUD

ID: PEOPLE-1.S1
Status: Backlog
Epic: PEOPLE-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 3
Rank: 110
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to create / read / update / soft-delete employment profiles, so that the platform has a tenant-scoped directory of users.

#### Acceptance Criteria

- [ ] CRUD UI hosted in web-admin shell (ADMIN-1.S1 cross-link).
- [ ] Drizzle schema `people.employment_profile` with RLS policy keyed to `tenant_id` (cross-link FOUND-2.T5).
- [ ] Kernel `audit_event` row written in same DB transaction as the domain mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] Soft-delete preserves audit trail.
- [ ] **E2E** — Tenant admin creates a profile via web-admin; refreshes; sees the profile listed; soft-deletes; refreshes; profile no longer in active list but visible in audit query.

#### AI Execution Notes

Schema lives at `apps/api/src/modules/people/infrastructure/`. UI lives at `apps/web-admin/src/app/people/`. Use existing `RlsMiddleware` + `DB_TOKEN` patterns from FOUND-2.T5.

#### Testing Notes

- Unit: profile entity + repository (Drizzle adapter).
- Integration: against real Postgres with RLS.
- E2E: Playwright in `apps/e2e/` covering create + soft-delete flow.
- Permission: only Tenant administrator role can call; audit row asserts initiator role.

#### Dependencies

- Blocked by: FOUND-2.T5 (RLS middleware), ADMIN-1.S1 (web-admin shell)
- Blocks: PEOPLE-1.S3 (resolver reads from this schema)

#### Definition of Done

- Inherits project DoD.
- RLS dual-tenant probe passes against `people.employment_profile`.
- Audit assertion test added in `people.handler.spec.ts`.

---

### [STORY] PEOPLE-1.S2 PeopleQueryFacade contract publication

ID: PEOPLE-1.S2
Status: Backlog
Epic: PEOPLE-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 2
Rank: 120
Jira Key:
Confluence Link:

#### Summary

As an engineer working on the Planner or Agents track, I want a published `PeopleQueryFacade` interface in `packages/event-contracts`, so that I can mock against it during parallel development.

#### Acceptance Criteria

- [ ] Type definition `PeopleQueryFacade` published in `packages/event-contracts/src/people.ts`.
- [ ] Method `resolveByExactSubject(sub: string): Promise<UserProfile | null>` declared.
- [ ] Both Planner and Agents tracks can `import { PeopleQueryFacade } from '@future/event-contracts'` and mock against it.
- [ ] Contract is published by S3 day-1 (Wednesday 2026-05-07) per spec §3 + §13 T1-3.
- [ ] **E2E** — A Planner Story written against this contract typechecks against the published interface without runtime errors.

#### AI Execution Notes

Add `packages/event-contracts/src/people.ts` with the `PeopleQueryFacade` interface and `UserProfile` type. Export from the package `index.ts`. Run `bun run --filter @future/event-contracts build` after adding the file.

#### Testing Notes

- Unit: typecheck test — import the contract and mock it in a consumer file; confirm the mock satisfies the interface.
- No integration test required for a type-only artefact.
- Permission: n/a — this is a TypeScript interface, not a runtime endpoint.

#### Dependencies

- Blocked by: none
- Blocks: PEOPLE-1.S3 (implementation must satisfy the declared interface), PLAN-1.S3 (assignee resolution consumer), AGN-2.S2 (Agents NL writes consumer)

#### Definition of Done

- Inherits project DoD.
- `bun run --filter @future/event-contracts build` completes without errors.
- At least one Planner + one Agents file imports and mocks `PeopleQueryFacade` against the published type.

---

### [STORY] PEOPLE-1.S3 Exact-subject resolver implementation

ID: PEOPLE-1.S3
Status: Backlog
Epic: PEOPLE-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 130
Jira Key:
Confluence Link:

#### Summary

As an owner of another module (programmatic caller), I want `resolveByExactSubject(sub)` to return a user profile or null, so that I can persist assignments by stable SSO subject and survive directory mutations.

#### Acceptance Criteria

- [ ] `resolveByExactSubject` returns the `UserProfile` for a given SSO `sub` claim.
- [ ] Returns `null` if the subject is unknown (no throw, no 404 — caller decides how to handle).
- [ ] Survives directory mutations to display name and email — the resolved record updates when the profile is edited (per Planner FR-PL-033 cross-link).
- [ ] `PeopleQueryFacade` is exported from `PeopleModule` and wired via NestJS DI; no cross-module `infrastructure/` imports (per DDD boundary rules).
- [ ] Kernel `audit_event` row written for every facade call in the same DB transaction; tx rolls back if audit write fails (per §13 T1-2).
- [ ] **E2E** — A Planner task created with assignee resolved through this facade survives a directory rename in the SSO IdP (verified in integration test: profile display name updated → re-resolve → same `sub` returns updated name).

#### AI Execution Notes

Implementation lives at `apps/api/src/modules/people/application/`. `PeopleQueryFacade` is the NestJS injectable that satisfies the `PeopleQueryFacade` interface from `packages/event-contracts`. Register it in `people.module.ts` and export via `exports: [PeopleQueryFacade]`.

#### Testing Notes

- Unit: resolver returns profile on match, null on miss; audit row assert.
- Integration: against real Postgres — profile upsert + resolve; display-name mutation + re-resolve.
- E2E: Playwright or integration harness simulating a Planner assignment round-trip through the facade.
- Permission: facade callable by any module that has imported `PeopleModule`; call is audited with initiator context.

#### Dependencies

- Blocked by: PEOPLE-1.S1 (schema must exist), PEOPLE-1.S2 (interface contract must be published)
- Blocks: PLAN-1.S3 (assignee resolution consumer)

#### Definition of Done

- Inherits project DoD.
- Facade satisfies the `PeopleQueryFacade` interface declared in `packages/event-contracts`.
- Audit assertion test in `people.handler.spec.ts` covers the facade call path.

---

## [EPIC] PEOPLE-2 Placements, offboarding, GDPR, fuzzy facade

ID: PEOPLE-2
Status: Backlog
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 26
Rank: 200
Jira Key:
Confluence Link:

### Summary

Extend the People module with org placements (manager/reportee, teams, departments), an offboarding lifecycle, a GDPR right-to-erasure pipeline, and a fuzzy `searchByDisplayName` method on `PeopleQueryFacade`. All deferred from MVP per §13 D14.

### Goal

By the Phase-1 GA date (set by user), the People module is fully operational — org structure supports Agents role-scoped reads (FR-063) and GDPR erasure is gated before any external-tenant rollout.

### Scope

- Org placements: manager/reportee links, team and department membership, placement history
- Offboarding lifecycle: deactivation flows, assignment transfers
- GDPR right-to-erasure pipeline: audit-preserving anonymisation across People, Planner, and Agents
- `PeopleQueryFacade.searchByDisplayName(query, scope)` with confidence-ranked results

### Out of Scope

- Profile CRUD → PEOPLE-1 (MVP, Done)
- `resolveByExactSubject` → PEOPLE-1 (MVP, Done)

### SRS Coverage

- n/a (no people-srs); derived from Planner UN-PL-05, UN-PL-10 + Agents FR-063, NFR-017 + §13 D14, D15

### Acceptance Criteria

- [ ] Org placements surface manager/reportee and team/dept membership readable by Agents role-scoped read tools.
- [ ] Offboarding deactivates a user and transfers their open assignments without data loss.
- [ ] GDPR erasure pipeline anonymises all PII across People, Planner, and Agents while preserving audit trail integrity (per Planner UN-PL-10 + Agents NFR-017).
- [ ] `searchByDisplayName` returns ranked candidates; auto-resolves at confidence ≥ 0.9 (per §13 T1-3).

### Child Tickets

- PEOPLE-2.S1 Org placements (Story)
- PEOPLE-2.S2 Offboarding lifecycle (Story)
- PEOPLE-2.S3 GDPR right-to-erasure pipeline (Story)
- PEOPLE-2.S4 PeopleQueryFacade fuzzy `searchByDisplayName` (Story)

### Definition of Done

- All child Stories `Status: Done`.
- GDPR erasure runbook reviewed by legal/compliance before external-tenant rollout.

---

### [STORY] PEOPLE-2.S1 Org placements

ID: PEOPLE-2.S1
Status: Backlog
Epic: PEOPLE-2
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 8
Rank: 210
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to define org placements (manager/reportee relationships, team and department membership, placement history), so that the platform has a structured org chart that Agents can query for role-scoped workload analysis.

#### Acceptance Criteria

- [ ] `people.org_placement` table tracks manager/reportee pairs, team and department assignments, and effective-date history with `tenant_id` RLS.
- [ ] CRUD UI hosted in web-admin shell for managing placements.
- [ ] Kernel `audit_event` row written in same DB transaction as every placement mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] `PeopleQueryFacade` exposes org-structure read methods consumable by Agents for FR-063 team/dept/manager workload analysis.
- [ ] **E2E** — Tenant admin assigns a user to a team; Agents role-scoped read returns that user's tasks within the team scope.

#### AI Execution Notes

**Backlog reason:** Cascade from MVP cut on People scope per design §13 D14. Required for Agents role-scoped reads (FR-063) and Planner manager-as-verifier inference (UN-PL-05). Artefact paths deferred pending sprint assignment.

#### Testing Notes

- Unit: placement entity, repository.
- Integration: placement history across effective dates; RLS dual-tenant probe.
- E2E: Playwright covering placement CRUD + Agents read call.
- Permission: only Tenant administrator can mutate placements; facade read is cross-module.

#### Dependencies

- Blocked by: PEOPLE-1.S1 (profile schema must exist)
- Blocks: AGN-2 role-scoped read stories (Backlog)

#### Definition of Done

- Inherits project DoD.
- RLS dual-tenant probe passes against `people.org_placement`.
- Agents FR-063 integration test passes against real placement data.

---

### [STORY] PEOPLE-2.S2 Offboarding lifecycle

ID: PEOPLE-2.S2
Status: Backlog
Epic: PEOPLE-2
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 5
Rank: 220
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to initiate an offboarding flow that deactivates a user and transfers their open task assignments, so that departing employees leave no orphaned work items across Planner and Agents.

#### Acceptance Criteria

- [ ] Offboarding command marks the profile `status: inactive` and emits a domain event consumed by Planner (assignment transfer) and Agents (session termination).
- [ ] Transfer target is specified by the initiating administrator; unresolved assignments surface in the admin UI as a pending action.
- [ ] Delegation grants for the departing user are auto-revoked on deactivation (per §13 T1-4).
- [ ] Kernel `audit_event` row written for every step; tx rolls back if audit write fails (per §13 T1-2).
- [ ] **E2E** — Tenant admin offboards a user; all open tasks previously assigned to that user appear reassigned to the transfer target; the user can no longer authenticate.

#### AI Execution Notes

**Backlog reason:** Cascade from MVP cut on People scope per design §13 D14. Artefact paths deferred pending sprint assignment.

#### Testing Notes

- Unit: offboarding command handler, domain events.
- Integration: cross-module event propagation (Planner assignment transfer, Agents session revocation).
- E2E: Playwright covering full offboarding + transfer flow.
- Permission: only Tenant administrator can initiate offboarding.

#### Dependencies

- Blocked by: PEOPLE-1.S1 (profile schema), PEOPLE-2.S1 (placement data for transfer context)
- Blocks: none (consumed by Planner + Agents via domain events)

#### Definition of Done

- Inherits project DoD.
- Cross-module integration test confirms assignment transfer and session revocation on deactivation.

---

### [STORY] PEOPLE-2.S3 GDPR right-to-erasure pipeline

ID: PEOPLE-2.S3
Status: Backlog
Epic: PEOPLE-2
Sprint: Backlog
Release: phase-1
Priority: P1
Story Point: 8
Rank: 230
Jira Key:
Confluence Link:

#### Summary

As an end user (data subject), I want to submit a right-to-erasure request, so that my personal data is anonymised across the platform while audit records remain legally valid.

#### Acceptance Criteria

- [ ] Erasure request UI in web-admin (or direct API) accepts a `sub` claim and initiates the anonymisation pipeline.
- [ ] Profile PII (name, email, photo) replaced with a stable anonymous token; `sub` is salted-hashed and decoupled from the original.
- [ ] Planner tasks and evidence records referencing the erased user are anonymised in-place — task history audit trail preserved with anonymous token (per Planner UN-PL-10).
- [ ] Agents session messages referencing the erased user are anonymised; no personal data remains in the conversation store (per Agents NFR-017).
- [ ] Kernel `audit_event` rows are NOT deleted — anonymised token replaces PII in the payload.
- [ ] Erasure completion event emitted; all consuming modules confirm anonymisation within the same pipeline run.
- [ ] **E2E** — Data subject triggers erasure; after pipeline completes, a search by original email returns no results; audit log entries for that subject are present but contain only the anonymous token.

#### AI Execution Notes

**Backlog reason:** Cascade from MVP cut on People scope per design §13 D14. Phase-1 GA gate; required before external-tenant rollout. Artefact paths deferred. Runbook template at `docs/runbooks/gdpr-erasure.md` (DOC-1 deliverable).

#### Testing Notes

- Unit: anonymisation command, token generation, cross-module event fan-out.
- Integration: end-to-end pipeline against real DB — verify no PII survives in People, Planner, Agents tables.
- E2E: Playwright covering erasure request → confirmation → audit log inspection.
- Permission: data subject (self) or Tenant administrator can initiate; platform admin can audit.

#### Dependencies

- Blocked by: PEOPLE-1.S1, PEOPLE-2.S1, PEOPLE-2.S2 (full profile + placement + offboarding data in place before erasure is safe)
- Blocks: external-tenant rollout (Phase-1 GA gate)

#### Definition of Done

- Inherits project DoD.
- Data-flow audit reviewed and signed off before external-tenant rollout.
- GDPR erasure runbook (DOC-1) completed and linked from this ticket.

---

### [STORY] PEOPLE-2.S4 PeopleQueryFacade fuzzy searchByDisplayName

ID: PEOPLE-2.S4
Status: Backlog
Epic: PEOPLE-2
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 5
Rank: 240
Jira Key:
Confluence Link:

#### Summary

As an owner of another module (Agents NL resolution consumer), I want `searchByDisplayName(query, scope)` to return confidence-ranked profile candidates, so that natural-language task assignments can resolve ambiguous names without requiring an exact SSO subject.

#### Acceptance Criteria

- [ ] `searchByDisplayName(query: string, scope?: OrgScope): Promise<UserProfileMatch[]>` declared in `packages/event-contracts/src/people.ts` alongside the existing facade interface.
- [ ] `UserProfileMatch` includes `profile: UserProfile` and `confidence: number` (0–1).
- [ ] Confidence ≥ 0.9 → method auto-resolves (returns a single-element array); confidence < 0.9 → method returns up to 5 ranked candidates for the caller to surface (per §13 T1-3).
- [ ] Scope parameter filters by team or department when `PEOPLE-2.S1` placements are available; falls back to tenant-wide search if scope is absent.
- [ ] Kernel `audit_event` row written for every facade call; tx rolls back if audit write fails (per §13 T1-2).
- [ ] **E2E** — Agents NL write "assign to Anh" resolves to a single profile when exactly one active user matches at confidence ≥ 0.9; surfaces candidates when multiple users match.

#### AI Execution Notes

**Backlog reason:** Cascade from MVP cut on People scope per design §13 D14. AGN-2 NL writes are constrained to current-task assignees + exact-email resolution until this story lands. Artefact paths deferred pending sprint assignment.

#### Testing Notes

- Unit: confidence scoring logic, threshold branching, scope filter.
- Integration: fuzzy search against real Postgres full-text or pg_trgm index.
- E2E: Agents NL resolution round-trip.
- Permission: facade callable by any module that has imported `PeopleModule`; call is audited.

#### Dependencies

- Blocked by: PEOPLE-1.S1 (profile data), PEOPLE-1.S2 (facade interface — extension of existing contract), PEOPLE-2.S1 (scope filter requires placements)
- Blocks: AGN-2 fuzzy NL write stories (Backlog)

#### Definition of Done

- Inherits project DoD.
- `searchByDisplayName` satisfies the extended `PeopleQueryFacade` interface in `packages/event-contracts`.
- Confidence threshold integration test covers auto-resolve (≥ 0.9) and candidate-surface (< 0.9) branches.
