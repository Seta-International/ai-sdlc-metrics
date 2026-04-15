# Task: CRUD Commands & Permission Keys

> **Task:** 003 — Commands and Permissions
> **Module:** Shared Skill Taxonomy
> **Priority:** High
> **Depends on:** 001 (schema and entities), 002 (facade)
> **Status:** pending

---

## Scope

Create command handlers for CRUD operations on all four taxonomy entities, register permission keys in the RBAC system, and add permission checks to each command.

## Business Context

Tenant admins and HR ops need to manage the skill catalog — add new technologies when the company adopts them, deactivate obsolete skills, adjust seniority levels. These are admin-facing operations, not high-frequency.

## Source Reference

- Legacy CRUD: `staticData.service.ts` → `addTechnology()`, `updateTechnology()`, `deleteTechnology()`, `addLevel()`, `updateLevel()`, `deleteLevel()`
- Existing permission pattern: `apps/api/src/modules/kernel/application/commands/add-role-permission.handler.ts`
- Permission seeding: check existing `role_permission` seed data pattern

## Target Location

- Commands: `apps/api/src/modules/kernel/application/commands/`
  - `create-skill-category.handler.ts`, `update-skill-category.handler.ts`
  - `create-skill.handler.ts`, `update-skill.handler.ts`
  - `create-skill-level.handler.ts`, `update-skill-level.handler.ts`
  - `create-seniority-level.handler.ts`, `update-seniority-level.handler.ts`
- Permission keys: seed in existing permission infrastructure

## Commands

### Skill Category

- `CreateSkillCategoryCommand` { tenantId, name, description?, createdBy } → returns id
- `UpdateSkillCategoryCommand` { id, tenantId, name?, description?, isActive?, updatedBy }

### Skill

- `CreateSkillCommand` { tenantId, categoryId, name, description?, createdBy } → returns id
- `UpdateSkillCommand` { id, tenantId, name?, description?, isActive?, categoryId?, updatedBy }

### Skill Level

- `CreateSkillLevelCommand` { tenantId, name, rank, description?, createdBy } → returns id
- `UpdateSkillLevelCommand` { id, tenantId, name?, rank?, description?, updatedBy }

### Seniority Level

- `CreateSeniorityLevelCommand` { tenantId, name, rank, description?, createdBy } → returns id
- `UpdateSeniorityLevelCommand` { id, tenantId, name?, rank?, description?, isActive?, updatedBy }

## Permission Keys

| Key                             | Granted To           | Locked |
| ------------------------------- | -------------------- | ------ |
| `kernel:skill:read`             | all roles            | yes    |
| `kernel:skill:manage`           | tenant_admin, hr_ops | no     |
| `kernel:seniority-level:manage` | tenant_admin         | no     |

Each command handler checks `KernelQueryFacade.canDo(actorId, permissionKey, context)` before executing.

All create/update commands log audit events via `KernelAuditFacade.recordEvent()`.

## Edge Cases

- Create skill with duplicate name in same category+tenant → throw `SkillAlreadyExistsError`
- Create skill with non-existent categoryId → throw `SkillCategoryNotFoundError`
- Update rank to a value already taken → throw `RankConflictError`
- Deactivate skill_category → should also deactivate all skills in that category (cascade deactivation)
- No hard deletes — only `isActive = false`

## Acceptance Criteria

- [ ] 8 command handlers (create + update for each of 4 entities)
- [ ] Permission keys registered in RBAC (seeded into `role_permission`)
- [ ] `canDo()` check in every command handler
- [ ] Audit event logged for every mutation
- [ ] Duplicate name detection with clear error
- [ ] Cascade deactivation: deactivating a category deactivates its skills
- [ ] Unit tests: happy path + every error path per command
- [ ] Integration test: permission denied for unauthorized role
