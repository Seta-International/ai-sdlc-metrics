# Phase 2 — Full-Stack Premium Features (Index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement each sub-plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the five premium features from the MS Planner Premium parity spec — custom fields, task dependencies, subtasks, sprint assignment, and task history — end-to-end (NestJS backend + React frontend).

**Architecture:** All new features add NestJS CQRS commands/queries, Drizzle repositories, tRPC procedures, and React components. The Phase 1 tabbed panel is the integration point; new sections render inside the Details tab and the task history slide-in panel. A single migration file (`0000_initial.sql`) is regenerated at the end.

**Tech Stack:** NestJS CQRS, Drizzle ORM, PostgreSQL, tRPC, React Query, `@future/ui`, vitest

**Prereq:** Phase 1 merged on `feat/planner-task-detail-ui-ux`.

---

## Sub-plans

| #   | File                                                         | What it delivers                                                                                     |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | [1-schema-and-events.md](phase-2/1-schema-and-events.md)     | 5 new Drizzle tables, 4 domain events, 4 repository interfaces, migration procedure                  |
| 2   | [2-custom-fields.md](phase-2/2-custom-fields.md)             | Custom field def CRUD + SetCustomFieldValue + `CustomFieldsSection` frontend                         |
| 3   | [3-dependencies.md](phase-2/3-dependencies.md)               | AddDependency (DFS cycle guard) + RemoveDependency + `DependenciesSection` + `TaskSearchPicker`      |
| 4   | [4-subtasks-and-sprint.md](phase-2/4-subtasks-and-sprint.md) | CreateSubtask + GetSubtasks + 4 Sprint commands + `SubtasksSection` + `SprintField`                  |
| 5   | [5-task-history.md](phase-2/5-task-history.md)               | TaskHistoryRecorder + GetTaskHistory (paginated) + `TaskHistoryPane` + Clock icon wired + Phase 2 PR |

---

## Full Phase 2 Exit Criteria

- [ ] Five new Drizzle tables exist and migration applied successfully
- [ ] `DefineCustomField`, `UpdateCustomFieldDef`, `DeleteCustomFieldDef`, `SetCustomFieldValue` handlers pass unit tests
- [ ] `AddDependency` (with DFS cycle detection), `RemoveDependency` handlers pass unit tests
- [ ] `CreateSubtask`, `GetSubtasks`, `CreateSprint`, `CompleteSprint`, `AssignTaskToSprint`, `UnassignTaskFromSprint` handlers pass unit tests
- [ ] `TaskHistoryRecorder` listens to all 11 events; unit test covers each
- [ ] `GetTaskHistory` paginated query passes unit tests
- [ ] All four Drizzle repositories have integration tests against a real DB
- [ ] All tRPC procedures wired into `plannerRouter`
- [ ] All new handlers registered in `planner.module.ts`
- [ ] `CustomFieldsSection` renders in Details tab; values update on blur/change
- [ ] `DependenciesSection` renders predecessors/successors; cycle is rejected in UI
- [ ] `TaskSearchPicker` filters tasks; selecting calls add mutation
- [ ] `SubtasksSection` renders subtask list; Enter creates subtask
- [ ] `SprintField` + `SprintPicker` lists plan sprints; selecting assigns task
- [ ] `TaskHistoryPane` slide-in panel with infinite scroll; Clock icon opens it
- [ ] `bun run test --filter @future/api --coverage` — Lines/Functions/Branches ≥70%
- [ ] `bun run test --filter @future/web-planner --coverage` — Lines/Functions/Branches ≥70%
- [ ] `npx tsc --noEmit -p apps/web-planner/tsconfig.json` — no errors
- [ ] `bun run --filter @future/web-planner lint` — no errors
- [ ] PR opened on `feat/planner-task-detail-ui-ux`
