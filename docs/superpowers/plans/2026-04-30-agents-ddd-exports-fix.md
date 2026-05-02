# Agents Module Exports DDD Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Trim `apps/api/src/modules/agents/agents.module.ts` `exports:` array to facades only. Per CLAUDE.md DDD rules, modules export `*QueryFacade` / `*AuditFacade` / write-facade classes — never raw repository tokens or internal services.

**Architecture:** Single-file mechanical change + cross-module typecheck to catch any consumer that imported a removed token. If a consumer breaks, route it through a facade (existing or new).

**Tech Stack:** TypeScript / NestJS.

**Audit reference:** 2026-04-30 audit DDD-2: 10 non-facade entries currently exported from `agents.module.ts:809-813`.

---

## Symbols to remove from `exports`

```
CONVERSATION_REPOSITORY
CONVERSATION_MESSAGE_REPOSITORY
L3_PREFERENCE_REPOSITORY
SCRATCHPAD_REPOSITORY
SEMANTIC_INDEX_REPOSITORY
SaveQueue
L3PreferenceService
WINDOW_BUILDER
SUMMARIZER
GDPR_ERASURE_PIPELINE
```

These should remain registered as `providers:` (so they're internally usable) but must not leak across the module boundary.

---

## Tasks

### Task 1: Pre-flight baseline

- [ ] **Step 1: Confirm green baseline**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit
```

Expected: both pass.

- [ ] **Step 2: Identify consumers**

For each symbol, find every file in `apps/api/src/modules/` (outside `agents/`) that imports it:

```bash
rg --files-with-matches -t ts \
  -e 'CONVERSATION_REPOSITORY' \
  -e 'CONVERSATION_MESSAGE_REPOSITORY' \
  -e 'L3_PREFERENCE_REPOSITORY' \
  -e 'SCRATCHPAD_REPOSITORY' \
  -e 'SEMANTIC_INDEX_REPOSITORY' \
  -e 'SaveQueue' \
  -e 'L3PreferenceService' \
  -e 'WINDOW_BUILDER' \
  -e 'SUMMARIZER' \
  -e 'GDPR_ERASURE_PIPELINE' \
  apps/api/src/modules/ \
  | grep -v 'apps/api/src/modules/agents/'
```

Save the output. If empty: no cross-module consumers exist, removal is purely cosmetic and safe (proceed to Task 2). If non-empty: list the consumers and proceed to Task 3 first to add facades, then Task 2.

- [ ] **Step 3: Create branch**

```bash
git checkout -b refactor/agents-ddd-exports-trim
```

---

### Task 2: Remove non-facade exports (assumes Task 1 step 2 returned empty)

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts:809-813`

- [ ] **Step 1: Read the current `exports:` array**

```bash
sed -n '800,820p' apps/api/src/modules/agents/agents.module.ts
```

Note the exact lines for each of the 10 symbols.

- [ ] **Step 2: Edit the array**

Remove the 10 listed symbols. Keep `AgentsQueryFacade` and any other `*Facade` entries.

- [ ] **Step 3: Verify whole-repo typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: pass. If FAIL with "Cannot find name X" or "X is not exported from agents.module" — that means a cross-module consumer exists. Stop and go to Task 3 instead.

- [ ] **Step 4: Run all unit tests**

```bash
bun run typecheck
bun run --filter @future/api test:unit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/agents.module.ts
git commit -m "refactor(agents): trim module exports to facades only"
```

---

### Task 3: Add facades for legitimate cross-module needs (only if Task 1 step 2 found consumers)

For each consumer of a removed symbol, the fix is one of:

**Option A — consumer should not be reading agents internals.** Identify the actual data needed; add a method to `AgentsQueryFacade` or create a new `AgentsAuditFacade` that exposes that data behind a stable contract. Update consumer to call the facade.

**Option B — the symbol is genuinely shared infrastructure (e.g. `SaveQueue`).** Move it to a workspace package (`packages/...`) and have both `agents` and the consumer import from there. Module-export hygiene preserved.

For each consumer found, write a sub-task here listing:

- Consumer file
- Symbol it imports
- Chosen option (A or B)
- New facade method name OR new package path

(Sub-tasks intentionally left as a per-consumer fill-in. Run Task 1 step 2 before deciding which apply. If the audit's expectation holds — no current consumers — Task 3 is unused.)

- [ ] **Step 1: Implement each chosen option** (one commit per consumer)
- [ ] **Step 2: Re-run Task 2 with the consumer base now using facades**

---

### Task 4: PR

- [ ] **Step 1: Push & open PR**

```bash
git push -u origin refactor/agents-ddd-exports-trim
gh pr create --title "refactor(agents): trim module exports to facades only" --body "$(cat <<'EOF'
## Summary

Per CLAUDE.md DDD rules ("Each module exports facades only"), remove non-facade entries from `agents.module.ts` `exports:`:

- 5 raw repository tokens (CONVERSATION_REPOSITORY, CONVERSATION_MESSAGE_REPOSITORY, L3_PREFERENCE_REPOSITORY, SCRATCHPAD_REPOSITORY, SEMANTIC_INDEX_REPOSITORY)
- 5 internal services (SaveQueue, L3PreferenceService, WINDOW_BUILDER, SUMMARIZER, GDPR_ERASURE_PIPELINE)

These remain in `providers:` (internally usable). Closes audit finding DDD-2 (2026-04-30).

## Test plan
- [ ] Whole-repo typecheck green
- [ ] Unit tests green
- [ ] If facades were added: integration tests for the new facade methods

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
