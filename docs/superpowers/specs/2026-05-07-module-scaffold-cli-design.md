# Module Scaffold CLI — Design Spec

**Date:** 2026-05-07
**Status:** Draft, pending implementation plan
**Owner:** TBD

## Problem

New engineers joining the Future monorepo face a steep ramp before they can ship their first module. The codebase enforces a strict Hexagonal/DDD layout per module (`domain/application/infrastructure/interface`), facade-only exports, schema-per-module Drizzle, RLS-aware repositories, per-zone tRPC router registration, and a per-zone `navigation.ts` for the sidebar. Reproducing this shape by hand — even by copy-pasting from `preferences/` or `web-people/` — is tedious, error-prone, and easy to do partially. `CLAUDE.md` already references `turbo gen workspace` as the canonical entry point, but no Turbo Generators have been built. This spec defines them.

## Goals

- One command (`turbo gen module <name> --with-zone`) produces a fully runnable vertical slice: API DDD module with CRUD on a sample entity, plus a Next.js zone with a working list+detail page hitting real tRPC.
- Sub-generators (`command`, `query`, `entity`) let developers add building blocks to existing modules.
- Every generator supports `--dry-run`, validates inputs and repo state, and previews all changes (creates, edits, deletes, TODOs) before any disk write.
- `turbo gen remove` cleanly undoes a generated module or zone, including AST-level removal of import lines and registry entries in shared files.
- Templates stay in sync with the real reference modules automatically (CI nags on drift).

## Non-goals

- The CLI never runs database migrations. Per `CLAUDE.md`'s "0000_initial.sql only" rule during the dev phase, the squash-and-rebuild dance is a human decision; generators print TODOs.
- No auto-rollback after a successful create whose post-write typecheck fails. The CLI prints an explicit `git restore` command instead — silent rollback hides real problems.
- No prompting for permissions/RBAC. The new module's tRPC router is registered without permission wrapping; permission setup is a follow-up that requires judgment.
- No global install or npx distribution. Generators live in the repo and run via `turbo gen` from any workspace member.
- No telemetry.

## User experience

```
$ turbo gen module
? Module name (kebab-case): billing
? Entity name (PascalCase) [Billing]: ↵
? Include integration test for tRPC router? (Y/n): ↵
? Also generate web zone? (Y/n): ↵

✔ Plan:
  CREATE  apps/api/src/modules/billing/billing.module.ts
  CREATE  apps/api/src/modules/billing/domain/entities/billing.entity.ts
  CREATE  apps/api/src/modules/billing/domain/repositories/billing.repository.ts
  CREATE  apps/api/src/modules/billing/application/commands/{create,update,delete}-billing.command.ts (+ .spec.ts)
  CREATE  apps/api/src/modules/billing/application/queries/{get,list}-billing.query.ts (+ .spec.ts)
  CREATE  apps/api/src/modules/billing/application/facades/billing-query.facade.ts
  CREATE  apps/api/src/modules/billing/infrastructure/schema/billing.schema.ts
  CREATE  apps/api/src/modules/billing/infrastructure/repositories/drizzle-billing.repository.ts
  CREATE  apps/api/src/modules/billing/interface/trpc/billing.router.ts (+ .integration.spec.ts)
  CREATE  apps/web-billing/...                      (Next.js zone, list + detail page)
  EDIT    apps/api/src/app.module.ts                (add BillingModule import + imports[] entry)
  EDIT    apps/api/src/common/trpc/app-router.ts    (add billingRouter import + register on root)
  EDIT    packages/db/src/schema/index.ts           (add billing schema re-export, if barrel exists)
  TODO    Run `bun run db:generate --name initial && bun run db:down -v && bun run db:up && bun run db:migrate`
  TODO    Run `bun install` (new zone added)
  TODO    Add billing to PermissionContext if you want this gated by role

Continue? (Y/n)
```

After confirmation, the CLI flushes the buffered virtual filesystem to disk, runs `bun run --filter=api typecheck` and `bun run --filter=@future/web-billing typecheck`, runs lint with `--fix`, and prints the final next-steps checklist. The user can then run `bun run dev` and visit `/billing` to see the new zone's list page rendering an empty state from a real tRPC call.

`--dry-run` short-circuits the flush and exits zero after printing the plan.

## Generator surface

Six generators total. Five forward generators plus one cleanup generator.

| Generator | Args / prompts                                                                                    | Effect                                                                                                                                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module`  | `name` (kebab), `entity` (auto-derived PascalCase), `withIntegrationTest` (Y/n), `withZone` (Y/n) | Full DDD slice + CRUD on the entity. Edits `app.module.ts`, `app-router.ts`, optional `packages/db/src/schema/index.ts`. When `--with-zone`, composes `zone` after itself.                                                                                                                                                   |
| `zone`    | `name` (kebab), `port` (auto-picked next free), `withSidebar` (Y/n)                               | New `apps/web-<name>/` cloned from the canonical zone template (modeled on `web-people/`). Creates the zone's own `src/navigation.ts`. **Does not** edit `web-shell/next.config.ts` — cross-zone routing is handled at the infrastructure layer.                                                                             |
| `command` | `module`, `name` (kebab verb-noun, e.g. `approve-invoice`)                                        | Creates `application/commands/<name>.command.ts` + `.spec.ts` (failing TDD stub). Registers handler in module providers.                                                                                                                                                                                                     |
| `query`   | `module`, `name`                                                                                  | Same shape as `command`, under `application/queries/`.                                                                                                                                                                                                                                                                       |
| `entity`  | `module`, `name` (PascalCase)                                                                     | Creates `domain/entities/<name>.entity.ts` + `domain/repositories/<name>.repository.ts` interface + `infrastructure/repositories/drizzle-<name>.repository.ts` impl. Appends a new `pgTable` declaration for the entity to `infrastructure/schema/<module>.schema.ts` (with `tenant_id` per `CLAUDE.md`'s every-table rule). |
| `remove`  | `--kind module\|zone\|command\|query\|entity`, `--name`, optional `--with-zone`                   | Reverse of the create flow. Same plan-preview UX, default confirm is **No**.                                                                                                                                                                                                                                                 |

**Composition.** `module.gen.ts` ends by invoking `entity` once, `command` × 3 (create/update/delete), `query` × 2 (get/list), then a router-add step. Sub-generators don't know whether they're called directly or composed — they just push into the shared Tree.

**Out of scope:** standalone `repository` and `router` generators (always created with `entity` and `module` respectively); `delete-module` / `delete-zone` as separate generators (handled by `remove`); nested-module generators (the monorepo is flat).

## Architecture

```
turbo/
  generators/
    config.ts                       # PlopGeneratorConfig — registers all 6 generators
    generators/
      module.gen.ts
      zone.gen.ts
      command.gen.ts
      query.gen.ts
      entity.gen.ts
      remove.gen.ts
    lib/
      tree.ts                       # Buffered virtual FS (PendingChange[])
      flush.ts                      # Atomic flush to disk; no-op in --dry-run
      preview.ts                    # Pretty-print the Plan: block (CREATE/EDIT/DELETE/TODO)
      validate.ts                   # Input + repo-state validators
      ast/
        ts-morph.ts                 # Project loader, save-to-tree adapter
        edit-app-module.ts          # Add/remove NestJS imports[]
        edit-app-router.ts          # Add/remove tRPC root router entries
        edit-schema-index.ts        # Add/remove db schema re-exports
        edit-module-providers.ts    # Add/remove handler registrations in <module>.module.ts
      naming.ts                     # kebab/camel/Pascal/plural helpers (Handlebars + TS)
      git.ts                        # `git status --porcelain` filtered by paths
      postwrite.ts                  # typecheck + lint runners
      compose.ts                    # invoke one generator from another (Nx-style)
    templates/
      module/                       # all .hbs files for `module` (preferences-shaped)
      zone/                         # all .hbs files for `zone` (web-people-shaped)
      command/
      query/
      entity/
    scripts/
      check-template-drift.ts       # CI: diff templates against reference modules
      sync-templates.ts             # Re-clone templates from reference modules
    package.json                    # ts-morph, @plop/types — isolated from root
```

### Key design choices

- **Buffered Tree, single flush.** Every action — `add`, `edit`, `delete` — pushes a `PendingChange` into one shared buffer. `flush.ts` writes to disk only after `validate()` passes for every change. In `--dry-run`, `flush` is a no-op and `preview` prints the buffer. This is the Nx pattern adapted to Plop, and it's what makes dry-run honest and create/remove atomic.

- **All AST edits go through `lib/ast/*` modules.** No regex inside generator files. Each AST module exports `addX(tree, name)` and `removeX(tree, name)`, so the same module powers both create and `remove`.

- **Templates mirror real reference modules.** `templates/module/` is a stripped-down clone of `apps/api/src/modules/preferences/` (smallest current module). `templates/zone/` clones `apps/web-people/` (verified to have `navigation.ts` and tRPC client wiring). When the reference modules drift, we re-clone via `sync-templates.ts`, not hand-patch.

- **Composition (`compose.ts`).** Generators call other generators by pushing their actions into the same Tree:

  ```ts
  await compose(tree, 'entity', { module: name, name: pascalCase(name) })
  await compose(tree, 'command', { module: name, name: `create-${name}` })
  // ...
  ```

- **Bun runtime.** Generator deps live in `turbo/generators/package.json`, isolated from the root. Plop is bun-compatible; no special handling needed.

- **No global state.** Each `turbo gen` invocation creates a fresh Tree, a fresh ts-morph `Project`, runs validation, flushes, and exits.

## Validation

Every generator runs `validate()` against the buffered Tree before any disk write. If any rule fails, the CLI prints the failures and exits non-zero — no files written, ever.

**Input validation:**

- `name` must match `^[a-z][a-z0-9-]*[a-z0-9]$` (kebab-case, no leading/trailing hyphen).
- `name` must not be in a reserved-word denylist (`api`, `web`, `shell`, `core`, `kernel`, `db`, `ui`, `node`, `default`, `class`, `function`, `import`, etc.).
- `name` must not collide with an existing module (parsed live from `apps/api/src/modules/`) or zone (parsed from `apps/web-*`).
- For `command` / `query`: `--module` must point at an existing module; `--name` must not collide with a sibling.

**Repo-state validation:**

- Refuse if `git status --porcelain` shows uncommitted changes touching the target paths (`apps/api/src/modules/<name>/`, `apps/web-<name>/`, and the shared edit files). Override: `--allow-dirty`. Rationale: makes cleanup safe to undo if the user changes their mind.
- Refuse if the active Bun version doesn't match `package.json#packageManager`.

**Post-write validation (only when not in `--dry-run`):**

1. Typecheck the touched packages — `bun run --filter=api typecheck` and (if zone created) `bun run --filter=@future/web-<name> typecheck`. Failure prints the typecheck output and exits non-zero. **No auto-rollback** — the CLI prints the exact `git restore` / `git clean` command to undo.
2. Lint with `--fix` on the new files only.
3. Print the next-step checklist (`db:generate`, `bun install`, `bun run dev`).

## Cleanup — `turbo gen remove`

Mirror image of the create flow, with destructive defaults reversed.

```
turbo gen remove --kind module --name billing --with-zone [--dry-run] [--allow-dirty]
```

1. **Validate:** target exists; no uncommitted changes inside the target paths (override `--allow-dirty`).
2. **Plan preview** lists DELETEs and EDITs (with the inverse AST operation: remove import line, remove `imports[]` entry, remove tRPC registration). Default confirm is **No** for cleanup vs. Yes for create.
3. **Execute** in a buffered Tree so a failure mid-cleanup leaves the repo intact.
4. **Post-cleanup validation:** typecheck `api` (and `web-shell` if a zone was removed). Confirms no orphan imports.
5. **Print** the `db:generate` reminder so the user knows the schema squash is on them.

`turbo gen remove --kind command --module billing --name approve-invoice` works the same way for sub-pieces.

**Out of scope for cleanup:** removing migrations, scrubbing committed git history, undoing tRPC type changes published in `@future/api-client`. The user handles these out of band.

## Testing

Per `CLAUDE.md` TDD rules, ≥70% coverage, tests co-located.

**Unit (`turbo/generators/lib/**/\*.spec.ts`):\*\*

- `tree.spec.ts` — buffer semantics, no double-writes, idempotent operations.
- One spec per `lib/ast/edit-*.ts` — given a fixture file, asserting the AST mutation produces the expected output and that add → remove → add is a no-op on the buffer.
- `validate.spec.ts` — every input rule has both a passing and a failing case.
- `naming.spec.ts` — kebab/camel/Pascal/plural edge cases (`db`, `series`, `category`, multi-word).

**Integration (`turbo/generators/__integration__/`):**

> Note: this is the one place we use an `__integration__/` directory rather than co-locating; the directory holds fixture monorepos and generator-runner harnesses that don't belong next to the generators themselves. The `CLAUDE.md` ban on `__tests__/` is specifically about Jest's auto-discovery convention; this directory is a Vitest fixture root, not a test-discovery directory.

- `module-generates-compilable-code.spec.ts` — runs `module` against a temp-cloned fixture monorepo, then runs `tsc --noEmit` against the result. **Fails the suite if generated code doesn't typecheck.** Drift canary.
- `zone-generates-compilable-code.spec.ts` — same shape for `zone`.
- `dry-run-writes-nothing.spec.ts` — invoke each generator with `--dry-run`, assert temp dir is unchanged via `git status`.
- `cleanup-is-reverse-of-create.spec.ts` — for each generator: create, snapshot, remove, snapshot; assert the second snapshot equals the pre-create state.
- `validation-blocks-bad-input.spec.ts` — table-driven cases for every validation rule, asserts non-zero exit + no Tree mutations.

**E2E (gated, runs nightly + on PRs touching `turbo/generators/`):**

- `e2e-full-flow.spec.ts` — fresh worktree: `turbo gen module e2e-test --with-zone`, then `bun install && bun run db:generate --name initial && bun run db:migrate && bun run --filter=api typecheck && bun run --filter=@future/web-e2e-test typecheck && bun run --filter=api test:unit && turbo gen remove --kind module --name e2e-test --with-zone`. Asserts `git diff --exit-code`. Proves create→cleanup is a true round-trip.

## Drift protection

`turbo/generators/scripts/check-template-drift.ts` walks `templates/module/` and `apps/api/src/modules/preferences/` in parallel, normalizes Handlebars placeholders back to `preferences`-equivalent literals, and `diff`s. CI runs this on every PR. Failure mode: _"The `preferences` reference module changed. Re-clone the `module` template by running `bun run turbo/generators/scripts/sync-templates.ts`."_

`sync-templates.ts` does the inverse: clones `preferences/` → templates, re-applies the placeholder substitutions, prints the diff for review. Same pattern for `zone` ↔ `web-people`.

This bargain — templates stay accurate automatically because CI nags on drift — is why it's safe to use real reference modules as templates rather than hand-curated minimal versions.

## Documentation

Two docs. Both short.

- **`turbo/generators/README.md`** — operator-facing. Lists every generator, its flags, an example invocation, the cleanup command. ~80 lines.
- **`docs/superpowers/scaffolding.md`** — onboarding-facing. Two paragraphs: _"To start a new module, run `turbo gen module <name> --with-zone`. To remove it, run `turbo gen remove --kind module --name <name> --with-zone`. Pass `--dry-run` first to preview."_

`CLAUDE.md` update: revise the existing line _"New workspace: `turbo gen workspace`. Never create manually."_ to point at the new generators by name. The current text is aspirational; after this work, it will be accurate.

## Open questions

- Should the post-write typecheck step be skippable via `--no-verify`? (Currently no — the value of the typecheck is mostly when the dev would otherwise discover the failure later. But it adds 10–30s to every generation. Default to on; revisit if it becomes friction.)
- Should `remove` offer to also delete co-located test files in adjacent packages that import the removed module's tRPC types? (Currently no — type-only imports of a deleted module surface in the post-cleanup typecheck, and the user fixes them by hand. Adding cross-package import scrubbing is high-risk for low value.)

## References

- `apps/api/src/modules/preferences/` — reference module for `templates/module/`.
- `apps/web-people/` — reference zone for `templates/zone/`. Has `src/navigation.ts` (per-zone sidebar config), tRPC client wiring.
- `apps/api/src/common/trpc/app-router.ts` — root tRPC router; uses a mutable-reference + setter pattern for permission-wrapped routers. The `module` generator uses the simple direct registration path; permission wrapping is a follow-up.
- `apps/api/src/app.module.ts` — NestJS root module; new modules are added to `imports[]`.
- `CLAUDE.md` — DDD module boundary rules, TDD requirements, "no `__tests__/` directories" convention, migration-squash dev-phase rule.
- Nx generators (research) — `Tree` virtual filesystem, composable generators, `ts-morph` AST edits, `--dry-run` as a first-class concept. This design ports those patterns into Plop via custom actions.
