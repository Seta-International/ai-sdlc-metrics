# Agents Comments Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete ~715 redundant comments in `apps/api/src/modules/agents/` per CLAUDE.md "default to writing no comments" rule.

**Architecture:** Pure deletion across many files. File edits are independent → dispatch parallel `Edit`-capable subagents, one per file, each constrained to a strict per-file rubric. Single PR.

**Tech Stack:** TypeScript / NestJS / Bun.

**Categories targeted (audit 2026-04-30):**

- CMT-2 task/plan refs (~21): `// Plan 06 — Streaming`, `// Added for plan 12`, `// Task 6`, etc.
- CMT-4 ASCII section banners (~593): `// ── <name> ──...`, `// === ...`, `// ---- ...`
- CMT-5 "Step N" narrations (~100): `// Step 1 — query tenant budget`, etc.

**Out of scope:** TODO/FIXME markers (handled in stub-remediation plan); legitimate WHY comments; public-API JSDoc.

---

## Per-file rubric (every subagent receives this verbatim)

**DELETE if the comment is any of:**

- `// Plan NN —` / `// plan NN` / `// Task N` / `// PR N` / similar plan/task/PR references
- `// Added for ...` / `// Used by ...` / `// Per @user ...` / `// See PROJ-...`
- `// Removed: ...` / `// Was: ...` / `// Previously ...`
- ASCII banners: `// ── <name> ──...`, `// === ...`, `// ---- ...`, `// ****`
- `// Step N — <description>` lines that narrate what the next 1–3 lines do
- JSDoc `/** Foo handler. */` that only restates the class/function name with no params/returns/why

**KEEP if the comment is any of:**

- Explains WHY a non-obvious choice was made (constraint, invariant, bug workaround, perf note)
- `// eslint-disable-next-line <rule>` with reason
- Inside complex regex / SQL / math
- Public-API JSDoc on exported facades/types with substantive description
- TODO / FIXME (out of scope this PR)

---

## Tasks

### Task 1: Pre-flight baseline

**Files:** none

- [ ] **Step 1: Verify green baseline**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit
```

Expected: both pass.

- [ ] **Step 2: Snapshot baseline counts**

```bash
rg -c '// (Plan|plan|Task |PR \d|Added for|Used by|Removed:|Was:|Step \d|──|====|----)' apps/api/src/modules/agents/ | sort -t: -k2 -nr > /tmp/agents-comments-baseline.txt
wc -l /tmp/agents-comments-baseline.txt
```

Save the file count and total match count for the verification gate.

- [ ] **Step 3: Create branch**

```bash
git checkout -b refactor/agents-redundant-comments
```

---

### Task 2: `agents.module.ts` cleanup (high-risk single file)

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts`

This file is the largest target (35 banners + 21 task refs + 17 step narrations in `onModuleInit:904-1034`). It also defines all DI wiring — extra care required.

- [ ] **Step 1: Read the file end-to-end**

Read the entire file before editing. Note the structure of `imports:`, `providers:`, `exports:`, and `onModuleInit`.

- [ ] **Step 2: Apply the rubric**

Delete every comment matching the DELETE rubric. **Do NOT touch:**

- Any actual code line
- Provider entries (`{ provide: X, useClass: Y }` etc.)
- Import statements
- The contents of `exports:` array
- Any decorator argument

- [ ] **Step 3: Typecheck the file's package**

```bash
bun run --filter @future/api typecheck
```

Expected: pass.

- [ ] **Step 4: Run unit tests**

```bash
bun run --filter @future/api test:unit
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/modules/agents/agents.module.ts
git commit -m "refactor(agents): remove redundant comments from agents.module.ts"
```

---

### Task 3: Group B — banner-heavy files (parallel)

**Files (9 in parallel, one subagent per file):**

- `apps/api/src/modules/agents/application/services/extensibility-invariant-audit.ts`
- `apps/api/src/modules/agents/interface/trpc/schedule-ui-facade.ts`
- `apps/api/src/modules/agents/application/pipeline/pipeline-steps.ts`
- `apps/api/src/modules/agents/interface/trpc/rollout.router.ts`
- `apps/api/src/modules/agents/application/services/schedule-repository.ts`
- `apps/api/src/modules/agents/application/services/router-session-orchestrator.ts`
- `apps/api/src/modules/agents/application/services/router-test-harness.ts`
- `apps/api/src/modules/agents/application/services/delegation-lifecycle.ts`
- `apps/api/src/modules/agents/application/services/scheduled-turn-service.ts`

- [ ] **Step 1: Dispatch 9 subagents in parallel** (single message, 9 `Agent` calls)

Each subagent prompt template:

```
Apply this rubric to <file>:

DELETE: <full DELETE list from rubric>
KEEP: <full KEEP list from rubric>

Use Edit (not Write). Touch only comments — never code, never imports, never decorators. After editing, return the count of lines deleted and any KEEP-comments you preserved.
```

- [ ] **Step 2: Verify package still typechecks**

```bash
bun run --filter @future/api typecheck && bun run --filter @future/api test:unit
```

- [ ] **Step 3: Commit Task 3**

```bash
git add apps/api/src/modules/agents/
git commit -m "refactor(agents): remove banner comments from group B files"
```

---

### Task 4: Group C — step-narration files (parallel)

**Files (7 in parallel):**

- `apps/api/src/modules/agents/application/services/budget-checker.ts`
- `apps/api/src/modules/agents/application/services/scheduled-turn-spawner.ts`
- `apps/api/src/modules/agents/application/services/permission-narrative-builder.ts`
- `apps/api/src/modules/agents/application/services/auto-rollback-orchestrator.ts`
- `apps/api/src/modules/agents/application/services/regression-signal-monitor.ts`
- `apps/api/src/modules/agents/application/services/tool-gateway.ts`
- `apps/api/src/modules/agents/application/services/phase-executor-contracts.ts`

`tool-gateway.ts` is ~1100 lines — its subagent gets explicit instructions to read in chunks and apply the rubric carefully. The other 6 are smaller.

- [ ] **Step 1: Dispatch 7 subagents in parallel** (same prompt template as Task 3, swap file path)

- [ ] **Step 2: Verify**

```bash
bun run --filter @future/api typecheck && bun run --filter @future/api test:unit
```

- [ ] **Step 3: Commit Task 4**

```bash
git add apps/api/src/modules/agents/
git commit -m "refactor(agents): remove step-narration comments"
```

---

### Task 5: Group D — tail sweep

**Files:** every remaining file under `apps/api/src/modules/agents/` that still matches the rubric grep.

- [ ] **Step 1: List remaining offenders**

```bash
rg --files-with-matches '// (Plan |plan |Task |PR \d|Added for|Used by|Removed:|Was:|Step \d|──|====|----)' apps/api/src/modules/agents/ \
  | grep -v -e agents.module.ts -e extensibility-invariant-audit.ts -e schedule-ui-facade.ts -e pipeline-steps.ts -e rollout.router.ts -e schedule-repository.ts -e router-session-orchestrator.ts -e router-test-harness.ts -e delegation-lifecycle.ts -e scheduled-turn-service.ts -e budget-checker.ts -e scheduled-turn-spawner.ts -e permission-narrative-builder.ts -e auto-rollback-orchestrator.ts -e regression-signal-monitor.ts -e tool-gateway.ts -e phase-executor-contracts.ts
```

- [ ] **Step 2: Dispatch one subagent per remaining file** (parallel where possible, max 10 at a time)

Same rubric. Skip files inside `fixtures/` and `*.spec.ts` / `*.type-test.ts` (rubric should already be lenient on these but tail sweep should not touch them).

- [ ] **Step 3: Commit Task 5**

```bash
git add apps/api/src/modules/agents/
git commit -m "refactor(agents): tail sweep — remove remaining redundant comments"
```

---

### Task 6: Verification gate

- [ ] **Step 1: Full verify**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit
bun run --filter @future/api lint
```

Expected: all pass.

- [ ] **Step 2: Diff sanity check**

```bash
git diff main --stat apps/api/src/modules/agents/ | tail -5
git diff main apps/api/src/modules/agents/ | grep -c '^+[^+]' # additions
git diff main apps/api/src/modules/agents/ | grep -c '^-[^-]' # deletions
```

Expected: deletions ≫ additions; the only `+` lines should be tiny edits where deleting a banner left dangling whitespace.

- [ ] **Step 3: Confirm count drop**

```bash
rg -c '// (Plan|plan|Task |PR \d|Added for|Used by|Removed:|Was:|Step \d|──|====|----)' apps/api/src/modules/agents/ | sort -t: -k2 -nr > /tmp/agents-comments-after.txt
diff /tmp/agents-comments-baseline.txt /tmp/agents-comments-after.txt | head -50
```

Expected: total count near zero. A handful of legitimate "Step N" inside Zod descriptions or docstrings are acceptable.

---

### Task 7: PR

- [ ] **Step 1: Push & open PR**

```bash
git push -u origin refactor/agents-redundant-comments
gh pr create --title "refactor(agents): remove ~715 redundant comments" --body "$(cat <<'EOF'
## Summary

Per CLAUDE.md "default to writing no comments" rule, delete redundant comments from `apps/api/src/modules/agents/`:

- CMT-2 task/plan refs (~21)
- CMT-4 ASCII section banners (~593)
- CMT-5 "Step N" narrations (~100)

Pure deletion. Zero behavior change. Typecheck, unit tests, lint all green.

## Test plan
- [ ] CI green
- [ ] Spot-check `agents.module.ts` DI wiring unchanged
- [ ] Confirm no public-API JSDoc was removed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
