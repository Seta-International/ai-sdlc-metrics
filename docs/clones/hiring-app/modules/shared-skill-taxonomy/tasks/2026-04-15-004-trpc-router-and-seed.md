# Task: tRPC Router & Seed Data

> **Task:** 004 — tRPC Router and Seed Data
> **Module:** Shared Skill Taxonomy
> **Priority:** High
> **Depends on:** 002 (facade), 003 (commands)
> **Status:** pending

---

## Scope

Add skill taxonomy procedures to the Kernel tRPC router (or a dedicated sub-router), and create seed data for default skill categories, skills, proficiency levels, and seniority levels.

## Business Context

Admin UI and all frontend zones need tRPC procedures to read and manage the taxonomy. Seed data ensures new tenants start with a useful default catalog they can customize.

## Source Reference

- Legacy endpoints: `GET/POST /static/technology/*`, `GET/POST /static/level/*`
- Existing tRPC pattern: `apps/api/src/modules/kernel/interface/trpc/` (check existing router structure)
- Legacy seed data: Flyway V002 migration (4 technologies, 5 levels)

## Target Location

- Router: `apps/api/src/modules/kernel/interface/trpc/skill-taxonomy.router.ts` (sub-router merged into kernel router)
- Seed script: `packages/db/seed/skill-taxonomy.seed.ts` (or follow existing seed pattern)

## tRPC Procedures

### Read (public to all authenticated users)

- `skillTaxonomy.listCategories` — input: `{ activeOnly?: boolean }` → SkillCategory[]
- `skillTaxonomy.listSkills` — input: `{ categoryId?: string, activeOnly?: boolean }` → Skill[]
- `skillTaxonomy.listSkillLevels` — input: `{}` → SkillLevel[]
- `skillTaxonomy.listSeniorityLevels` — input: `{ activeOnly?: boolean }` → SeniorityLevel[]
- `skillTaxonomy.getSkill` — input: `{ id: string }` → Skill | null
- `skillTaxonomy.getSeniorityLevel` — input: `{ id: string }` → SeniorityLevel | null

### Write (permission-gated)

- `skillTaxonomy.createCategory` — input: `{ name, description? }` → `{ id }`
- `skillTaxonomy.updateCategory` — input: `{ id, name?, description?, isActive? }`
- `skillTaxonomy.createSkill` — input: `{ categoryId, name, description? }` → `{ id }`
- `skillTaxonomy.updateSkill` — input: `{ id, name?, description?, isActive?, categoryId? }`
- `skillTaxonomy.createSkillLevel` — input: `{ name, rank, description? }` → `{ id }`
- `skillTaxonomy.updateSkillLevel` — input: `{ id, name?, rank?, description? }`
- `skillTaxonomy.createSeniorityLevel` — input: `{ name, rank, description? }` → `{ id }`
- `skillTaxonomy.updateSeniorityLevel` — input: `{ id, name?, rank?, description?, isActive? }`

All inputs validated with Zod schemas. `tenantId` and `actorId` extracted from session context (not passed by client).

## Seed Data

### Seniority Levels

| Rank | Name      | Description                    |
| ---- | --------- | ------------------------------ |
| 1    | Intern    | Student / university placement |
| 2    | Fresher   | Less than 1 year experience    |
| 3    | Junior    | 1–2 years experience           |
| 4    | Mid       | 2–4 years experience           |
| 5    | Senior    | 4+ years experience            |
| 6    | Lead      | Team/tech lead                 |
| 7    | Principal | Principal / staff level        |

### Skill Proficiency Levels

| Rank | Name         | Description                               |
| ---- | ------------ | ----------------------------------------- |
| 1    | Beginner     | Basic understanding, needs guidance       |
| 2    | Intermediate | Can work independently on standard tasks  |
| 3    | Advanced     | Deep knowledge, can mentor others         |
| 4    | Expert       | Industry-level mastery, defines standards |

### Skill Categories + Skills

| Category               | Skills                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| Programming Languages  | Java, PHP, C#, JavaScript, TypeScript, Python, Go, Rust, Swift, Kotlin    |
| Frontend Frameworks    | React, Angular, Vue.js, Svelte, Next.js                                   |
| Backend Frameworks     | NestJS, Spring Boot, Express, Django, FastAPI, .NET                       |
| Cloud & Infrastructure | AWS, Azure, GCP, Docker, Kubernetes, Terraform                            |
| Databases              | PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch                          |
| Mobile                 | React Native, Flutter, iOS (Swift), Android (Kotlin)                      |
| DevOps & Tools         | Git, CI/CD, Jenkins, GitHub Actions, Linux                                |
| Soft Skills            | Leadership, Communication, Problem Solving, Project Management, Mentoring |

Seed data is idempotent — safe to re-run. Uses `ON CONFLICT DO NOTHING` or check-before-insert pattern.

## Edge Cases

- Seed script runs against tenant that already customized their catalog → don't overwrite, only insert missing defaults
- tRPC error responses: map domain errors (SkillAlreadyExistsError, etc.) to tRPC error codes (CONFLICT, NOT_FOUND)

## Acceptance Criteria

- [ ] tRPC sub-router with 14 procedures (6 read + 8 write)
- [ ] Zod validation schemas for all inputs
- [ ] Read procedures accessible to all authenticated users
- [ ] Write procedures check permissions via `canDo()`
- [ ] Seed script with all default data
- [ ] Seed is idempotent (safe to re-run)
- [ ] Integration tests: full round-trip (create via tRPC → read via tRPC)
- [ ] Error mapping: domain errors → tRPC error codes
