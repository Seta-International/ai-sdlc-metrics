---
module: project-staffing
task: charter-setup
created: 2026-04-14
priority: high
depends-on: [001]
---

# Task: Project Charter + Enhanced Setup

## Scope

Implement project charter CRUD and enhance project creation with new fields (type, priority, currency, estimated value, sponsor). The charter gives projects structured definition beyond name/dates.

## Roles Covered

- **PROJECT_MANAGER:** Create/update charter for own project
- **ACCOUNT_MANAGER:** Create/update charter for projects in their account
- **HR / SUPER_ADMIN:** Create/update charter for any project
- **EXECUTIVE / EMPLOYEE:** View charter (read-only)

## Business Context

Projects in consulting/IT services firms need structured definition: what are we trying to achieve, what's in/out of scope, what are the success criteria. Without this, projects are just names with dates — no one knows the "why." Every PSA (Kantata, Certinia, Productive.io) captures this at project setup.

The charter is a lightweight project brief, not a full PMI project charter. It captures the essential context that team members and stakeholders need.

## Source Reference

- **Files:** No legacy equivalent — projects in legacy have only name, description, dates, status, delivery model
- **Key logic:** N/A — new feature

## Target Location

- **Where:** `apps/api/src/modules/projects/application/commands/`, `apps/api/src/modules/projects/application/queries/`
- **Conventions to follow:** Existing CQRS pattern, tRPC procedures with Zod schemas

## Data Model

Uses `project_charter` table and enhanced `project` columns from task 001.

## Interface Contract

Commands:

- `UpsertProjectCharterCommand { projectId, tenantId, objectives?, scope?, successCriteria?, assumptions?, constraints?, businessCase?, approach? }`
- Enhanced `CreateProjectCommand` — add `sponsorId`, `projectType`, `currency`, `estimatedValue`, `priority`
- Enhanced `UpdateProjectCommand` — add same fields

Queries:

- `GetProjectCharterQuery { projectId, tenantId }` — returns charter or null
- Enhanced `GetProjectQuery` — include charter in response when fetching project detail

tRPC procedures:

- `projects.upsertCharter` (mutation)
- `projects.getCharter` (query)
- Enhanced `projects.createProject` and `projects.updateProject` with new fields

## Edge Cases

- Charter is optional — projects can exist without one
- Charter is 1:1 — upsert pattern (create if not exists, update if exists)
- `project_type` affects finance module behavior — `fixed_price` enables milestone billing, `time_and_materials` enables hourly billing. Document this contract clearly.
- `estimated_value` is informational for the projects module — finance module uses it for budget tracking
- `sponsor_id` is a soft reference to `core.actor` — validate actor exists via People facade or accept without validation (soft ref pattern)

## Acceptance Criteria

- [ ] Upsert charter command handler
- [ ] Enhanced create/update project with new fields
- [ ] Get charter query handler
- [ ] Project detail response includes charter when present
- [ ] Project list response includes project_type and priority for filtering
- [ ] tRPC procedures for charter and enhanced project operations
- [ ] Unit tests for charter upsert (create and update paths)
- [ ] Unit tests for enhanced project creation with all new fields
- [ ] Integration test for full flow: create project with type → add charter → get project with charter
