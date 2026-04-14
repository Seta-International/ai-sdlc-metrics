---
module: project-staffing
task: schema-evolution
created: 2026-04-14
priority: high
depends-on: []
---

# Task: Schema Evolution

## Scope

Add new tables and enhance existing ones in the `projects` schema. This is the foundation for all other project-staffing tasks.

1. Add `project_charter` table (1:1 with project)
2. Add `project_member` table (project org chart with self-referential reporting)
3. Add `team_template` + `team_template_slot` tables
4. Enhance `project` table with new columns
5. Enhance `allocation` table with `proposed` status
6. Create Drizzle migration
7. Create domain entities and repository interfaces for new tables

## Roles Covered

- No direct role interaction — infrastructure for all other tasks

## Business Context

The current projects module has 4 tables (account, project, project_role, allocation). This is sufficient for basic staffing but lacks project definition (charter), team structure (org chart), and reusable setup patterns (templates). These tables enable the module to grow from an allocation tool into a project management system.

## Source Reference

- **Files:** `src/core/models/project.py` (legacy project model — reference only)
- **Key logic:** Legacy has no equivalent for charter, project members, or templates. This is entirely new infrastructure.

## Target Location

- **Where:** `apps/api/src/modules/projects/infrastructure/schema/projects.schema.ts`, `packages/db/drizzle/migrations/`
- **Conventions to follow:** UUID v7 PKs, `tenant_id` on every table, camelCase columns, Drizzle `pgTable` definitions

## Data Model

### New table: `project_charter`

```
projects.project_charter
  id                uuid PK (uuidv7)
  tenant_id         uuid NOT NULL
  project_id        uuid NOT NULL UNIQUE   -- 1:1 with project
  objectives        text                   -- what we're trying to achieve
  scope             text                   -- what's in/out
  success_criteria  text                   -- how we measure success
  assumptions       jsonb DEFAULT '[]'     -- [{text, status}]
  constraints       jsonb DEFAULT '[]'     -- [{text, category}]
  business_case     text                   -- justification/background
  approach          text                   -- methodology description
  created_at        timestamptz DEFAULT now()
  updated_at        timestamptz DEFAULT now()
```

### New table: `project_member`

```
projects.project_member
  id                    uuid PK (uuidv7)
  tenant_id             uuid NOT NULL
  project_id            uuid NOT NULL
  actor_id              uuid NOT NULL       -- soft ref to core.actor
  project_role          text NOT NULL       -- 'sponsor' | 'project_manager' | 'delivery_lead' | 'tech_lead' | 'team_lead' | 'member'
  reports_to_member_id  uuid                -- self-ref to project_member.id (NULL = top of project tree)
  joined_at             timestamptz NOT NULL DEFAULT now()
  left_at               timestamptz         -- NULL = still active
  created_at            timestamptz DEFAULT now()
  updated_at            timestamptz DEFAULT now()

  UNIQUE (project_id, actor_id)  -- one membership per person per project
```

### New table: `team_template`

```
projects.team_template
  id              uuid PK (uuidv7)
  tenant_id       uuid NOT NULL
  name            text NOT NULL
  description     text
  delivery_model  text                   -- 'scrum' | 'kanban' | 'waterfall' | 'other'
  is_active       boolean DEFAULT true
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
```

### New table: `team_template_slot`

```
projects.team_template_slot
  id               uuid PK (uuidv7)
  tenant_id        uuid NOT NULL
  template_id      uuid NOT NULL          -- FK to team_template
  role_name        text NOT NULL           -- 'Senior Developer', 'QA Engineer'
  project_role     text                    -- structural role: 'tech_lead' | 'member' | etc.
  headcount        integer DEFAULT 1
  skills_required  text[]
  is_required      boolean DEFAULT true
  display_order    integer DEFAULT 0
  created_at       timestamptz DEFAULT now()
```

### Enhance: `project`

Add columns:

- `sponsor_id uuid` — actor_id of project sponsor
- `project_type text` — 'fixed_price' | 'time_and_materials' | 'retainer' | 'internal'
- `currency text DEFAULT 'VND'` — project currency (ISO 4217)
- `estimated_value numeric(14,2)` — total contract/estimated value
- `priority text` — 'critical' | 'high' | 'medium' | 'low'

### Enhance: `allocation`

Add `proposed` to status enum: `'proposed' | 'tentative' | 'confirmed'`

## Interface Contract

Domain entities:

- `ProjectCharter` entity
- `ProjectMember` entity with factory method `createForProject(projectId, actorId, role)`
- `TeamTemplate` entity
- `TeamTemplateSlot` entity

Repository interfaces:

- `ProjectCharterRepository`: `findByProjectId(projectId)`, `upsert(charter)`, `delete(projectId)`
- `ProjectMemberRepository`: `findByProjectId(projectId)`, `findByActorId(actorId, tenantId)`, `findActiveByProjectId(projectId)`, `insert(member)`, `update(id, data)`, `remove(id)`
- `TeamTemplateRepository`: `findByTenant(tenantId)`, `findById(id)`, `insert(template)`, `update(id, data)`, `delete(id)`
- `TeamTemplateSlotRepository`: `findByTemplateId(templateId)`, `insert(slot)`, `update(id, data)`, `delete(id)`

## Edge Cases

- `project_member` unique constraint: one person can only be a member once per project (but can have different allocation roles)
- `reports_to_member_id` self-reference: must not create cycles. Validate on insert/update.
- `team_template_slot.project_role` is optional — some slots are just demand (e.g., "3 developers") without structural authority
- `project.project_type` affects how finance module calculates revenue — ensure enum values are well-defined

## Acceptance Criteria

- [ ] `project_charter` table created with Drizzle schema and migration
- [ ] `project_member` table created with self-referential FK and unique constraint
- [ ] `team_template` + `team_template_slot` tables created
- [ ] `project` table enhanced with new columns
- [ ] `allocation` status enum extended with `proposed`
- [ ] Domain entities created for all new tables
- [ ] Repository interfaces defined in `domain/repositories/`
- [ ] Drizzle repository implementations in `infrastructure/repositories/`
- [ ] Unit tests for entity factory methods
- [ ] Migration runs cleanly against existing data
