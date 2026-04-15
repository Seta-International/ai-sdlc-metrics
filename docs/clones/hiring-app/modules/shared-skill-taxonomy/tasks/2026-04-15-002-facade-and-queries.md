# Task: KernelSkillFacade & Query Handlers

> **Task:** 002 — Facade and Queries
> **Module:** Shared Skill Taxonomy
> **Priority:** High
> **Depends on:** 001 (schema and entities)
> **Status:** pending

---

## Scope

Create `KernelSkillFacade` with read-only query methods, plus the query handlers that power them. This facade is the cross-module interface — other modules (hiring, people, projects) inject this to read skill data.

## Business Context

Every consuming module needs to look up skills, categories, levels, and seniority levels. The facade is the single entry point, following Kernel's established pattern (KernelQueryFacade, KernelAuditFacade, etc.).

## Source Reference

- Existing facade pattern: `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`
- Legacy read operations: `staticData.service.ts` → `findTechnology()`, `searchTechnology()`, `findLevel()`, `searchLevel()`

## Target Location

- Facade: `apps/api/src/modules/kernel/application/facades/kernel-skill.facade.ts`
- Query handlers: `apps/api/src/modules/kernel/application/queries/list-skill-categories.handler.ts`, `list-skills.handler.ts`, `list-skill-levels.handler.ts`, `list-seniority-levels.handler.ts`, `get-skill-by-id.handler.ts`, `get-skills-by-ids.handler.ts`, `get-seniority-level-by-id.handler.ts`
- Export facade from: `apps/api/src/modules/kernel/kernel.module.ts`

## Interface Contract

```typescript
@Injectable()
export class KernelSkillFacade {
  listSkillCategories(tenantId: string, activeOnly?: boolean): Promise<SkillCategory[]>
  listSkills(tenantId: string, categoryId?: string, activeOnly?: boolean): Promise<Skill[]>
  listSkillLevels(tenantId: string): Promise<SkillLevel[]>
  listSeniorityLevels(tenantId: string, activeOnly?: boolean): Promise<SeniorityLevel[]>
  getSkillById(skillId: string, tenantId: string): Promise<Skill | null>
  getSkillsByIds(skillIds: string[], tenantId: string): Promise<Skill[]>
  getSeniorityLevelById(levelId: string, tenantId: string): Promise<SeniorityLevel | null>
}
```

## Edge Cases

- `getSkillsByIds` with non-existent IDs → return only found skills, no error for missing ones (let caller decide)
- `listSkills` with invalid `categoryId` → return empty array
- `activeOnly=true` (default for most consumers) filters out deactivated records

## Acceptance Criteria

- [ ] `KernelSkillFacade` class with all 7 methods
- [ ] Query handlers for each method, injecting repositories
- [ ] Facade exported from `kernel.module.ts` (add to `exports` array)
- [ ] Unit tests for facade methods (mock repositories)
- [ ] Integration test: facade returns correct data from seeded DB
