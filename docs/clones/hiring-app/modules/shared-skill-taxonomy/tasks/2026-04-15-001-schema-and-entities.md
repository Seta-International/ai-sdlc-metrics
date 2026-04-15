# Task: Schema, Entities & Repositories

> **Task:** 001 — Schema and Entities
> **Module:** Shared Skill Taxonomy
> **Priority:** High
> **Depends on:** None
> **Status:** pending

---

## Scope

Create the Drizzle schema definitions, domain entities, repository interfaces, and Drizzle repository implementations for the four taxonomy tables: `skill_category`, `skill`, `skill_level`, `seniority_level`.

## Business Context

This is the foundational data layer for the shared skill taxonomy. Every other task in this module and the hiring module depends on these tables existing.

## Source Reference

- Legacy `technologies` table: `/Users/canh/Projects/Seta/legacy/hiring-app-api-nest/flyway/db/migrations/V001_20231221033654__create_table_static_data.sql`
- Legacy `level` table: same file
- Legacy service (CRUD patterns): `/Users/canh/Projects/Seta/legacy/hiring-app-api-nest/libs/staticData/src/lib/staticData.service.ts`

## Target Location

- Schema: `apps/api/src/modules/kernel/infrastructure/schema/skill-taxonomy.schema.ts`
- Schema index: update `apps/api/src/modules/kernel/infrastructure/schema/index.ts`
- Entities: `apps/api/src/modules/kernel/domain/entities/skill-category.entity.ts`, `skill.entity.ts`, `skill-level.entity.ts`, `seniority-level.entity.ts`
- Repository interfaces: `apps/api/src/modules/kernel/domain/repositories/skill-category.repository.ts`, `skill.repository.ts`, `skill-level.repository.ts`, `seniority-level.repository.ts`
- Drizzle repos: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-skill-category.repository.ts`, etc.

## Data Model

Four tables in `core` schema as defined in the module brief. Key constraints:

- `skill.name` UNIQUE per (tenant_id, category_id)
- `skill_category.name` UNIQUE per tenant_id
- `skill_level.rank` UNIQUE per tenant_id
- `seniority_level.rank` UNIQUE per tenant_id
- `skill.category_id` FK → `skill_category.id`
- All tables have `tenant_id` NOT NULL

## Interface Contract

Repository interfaces (in `domain/repositories/`):

```typescript
// SkillCategoryRepository
findById(id: string, tenantId: string): Promise<SkillCategory | null>
findByTenant(tenantId: string, activeOnly?: boolean): Promise<SkillCategory[]>
insert(data: CreateSkillCategory): Promise<string>
update(id: string, tenantId: string, data: Partial<SkillCategory>): Promise<void>

// SkillRepository
findById(id: string, tenantId: string): Promise<Skill | null>
findByIds(ids: string[], tenantId: string): Promise<Skill[]>
findByTenant(tenantId: string, categoryId?: string, activeOnly?: boolean): Promise<Skill[]>
findByName(name: string, categoryId: string, tenantId: string): Promise<Skill | null>
insert(data: CreateSkill): Promise<string>
update(id: string, tenantId: string, data: Partial<Skill>): Promise<void>

// SkillLevelRepository
findByTenant(tenantId: string): Promise<SkillLevel[]>
insert(data: CreateSkillLevel): Promise<string>
update(id: string, tenantId: string, data: Partial<SkillLevel>): Promise<void>

// SeniorityLevelRepository
findById(id: string, tenantId: string): Promise<SeniorityLevel | null>
findByTenant(tenantId: string, activeOnly?: boolean): Promise<SeniorityLevel[]>
insert(data: CreateSeniorityLevel): Promise<string>
update(id: string, tenantId: string, data: Partial<SeniorityLevel>): Promise<void>
```

## Edge Cases

- Unique constraint violation on name → return clear error, not DB crash
- Deactivation of a skill that's referenced by hiring/people junction tables (future) → allow deactivation, don't delete. Consumers filter `isActive` on read.
- Empty tenant (new signup) → seed data task handles this separately

## Acceptance Criteria

- [ ] Drizzle schema for 4 tables in `core` schema with all constraints
- [ ] Schema exported from kernel infrastructure index
- [ ] Domain entities (plain TS interfaces, zero NestJS deps) for all 4 types
- [ ] Repository interfaces in `domain/repositories/`
- [ ] Drizzle repository implementations in `infrastructure/repositories/`
- [ ] Repository tokens defined and provided in Kernel module
- [ ] DB migration generated (`bunx drizzle-kit generate`)
- [ ] Unit tests for each repository (happy path + unique constraint violation)
