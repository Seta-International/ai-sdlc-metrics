# People Module Redesign — Plan Index

> **Spec:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md`
> **Total Plans:** 8 (6 backend + 2 frontend)

## Dependency Graph

```
Plan 01: Foundation & Core Schema
  ├── Plan 02: Employment Lifecycle (depends on 01)
  │     └── Plan 06: Onboarding, Offboarding & Events (depends on 01, 02)
  ├── Plan 03: Multi-Country & Extensibility (depends on 01)
  │     ├── Plan 04: Change Requests & Documents (depends on 01, 03)
  │     └── Plan 05: Directory, Search & Utilities (depends on 01, 03)
  └── (all backend plans must complete before frontend)
        ├── Plan 07: Frontend — Directory, Profile & Self-Service (depends on 01-06)
        └── Plan 08: Frontend — Workflows, Reports & Settings (depends on 01-06)
```

## Plan Files

| #   | File                                           | Status  | Tasks | Description                                                                                                           |
| --- | ---------------------------------------------- | ------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| 01  | `2026-04-15-people-01-foundation.md`           | pending | ~25   | Tear down old schema. Build core tables, entities, repositories, basic CRUD. Establishes all patterns.                |
| 02  | `2026-04-15-people-02-lifecycle.md`            | pending | ~20   | State machine (6 states, 11 transitions), probation, contracts, policies.                                             |
| 03  | `2026-04-15-people-03-multi-country.md`        | pending | ~15   | Country field config, custom fields, field visibility, edit policies.                                                 |
| 04  | `2026-04-15-people-04-change-requests-docs.md` | pending | ~18   | Enhanced change requests (batch, effective dating), documents, compliance, completeness.                              |
| 05  | `2026-04-15-people-05-directory-search.md`     | pending | ~16   | Search index, email generation, share links, bulk operations, CSV import/export.                                      |
| 06  | `2026-04-15-people-06-onboarding-events.md`    | pending | ~14   | Enhanced onboarding/offboarding templates, all event contracts, cross-module integration.                             |
| 07  | `2026-04-15-people-07-frontend-core.md`        | pending | ~20   | Pages P1-P4: Directory, Org Chart, Employee Profile (7 tabs), My Profile.                                             |
| 08  | `2026-04-15-people-08-frontend-workflows.md`   | pending | ~22   | Pages P5-P11: Onboarding, Offboarding, Change Requests, Reports (5 sub), Settings (10 sub), Shared Profile, Bulk Ops. |

## Execution Order

**Phase 1 (Foundation):** Plan 01 — must complete first, establishes all patterns
**Phase 2 (Parallel):** Plans 02, 03 — can run in parallel after 01
**Phase 3 (Parallel):** Plans 04, 05, 06 — can run after their dependencies
**Phase 4 (Frontend):** Plans 07, 08 — after all backend plans

## Conventions (Apply to All Plans)

### File Paths

```
apps/api/src/modules/people/
  domain/
    entities/           → TypeScript interfaces (no classes)
    repositories/       → Repository interface + Symbol token
    value-objects/      → Enums, constants, state machine
    exceptions/         → DomainException subclasses
  application/
    commands/           → Command class + Handler (separate files)
    queries/            → Query class + Handler (separate files)
    facades/            → PeopleQueryFacade (exported)
    event-handlers/     → @EventsHandler classes
    services/           → Domain services (validation, computation)
  infrastructure/
    repositories/       → Drizzle implementations
    schema/             → Drizzle table definitions
    jobs/               → pg-boss job handlers
  interface/
    trpc/               → Router + TrpcService
  people.module.ts      → NestJS module

packages/event-contracts/src/people/  → Event classes

apps/web-people/src/
  app/                  → Next.js pages
  components/           → React components
  lib/                  → Utilities, tRPC client
  navigation.ts         → Sidebar config
```

### Naming Conventions

- Entity: `person-profile.entity.ts` → `interface PersonProfile`
- Repository: `person-profile.repository.ts` → `IPersonProfileRepository` + `PERSON_PROFILE_REPOSITORY` symbol
- Drizzle repo: `drizzle-person-profile.repository.ts` → `DrizzlePersonProfileRepository`
- Command: `activate-employment.command.ts` → `class ActivateEmploymentCommand`
- Handler: `activate-employment.handler.ts` → `class ActivateEmploymentHandler`
- Test: `activate-employment.handler.spec.ts` (co-located)
- Event: `employment-activated.event.ts` → `class EmploymentActivatedEvent`
- Exception: `people.exceptions.ts` (all in one file per module)

### Testing Pattern

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Direct constructor injection — no NestJS test module needed
// Mock all repository interfaces with vi.fn()
// Constants: TENANT_ID, ACTOR_ID, etc. as UUID v7 format
```

### Build Before Test

```bash
bun run --filter "@future/*" build
bun run --filter @future/db test:unit -- --testPathPattern=people
```
