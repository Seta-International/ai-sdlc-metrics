# Mock Data CSV Generator — Branch Documentation

Companion doc for the `feat/mockdata-seta` branch. The two source documents remain canonical:

- Schema and intent → [`docs/superpowers/specs/2026-05-20-mock-data-schema-design.md`](../specs/2026-05-20-mock-data-schema-design.md)
- Step-by-step build → [`docs/superpowers/plans/2026-05-20-mock-data-csv-generator.md`](../plans/2026-05-20-mock-data-csv-generator.md)

This page is for someone *consuming* the CSVs — what fields exist, what they mean, which queries the dataset is shaped to support, and which corner cases it deliberately exercises. The shorter back half covers how to (re)generate the files.

**Reference date.** Every "today" in the dataset is `2026-05-20`. All availability and overdue logic is relative to that date.

---

## 1. Files produced

Running the generator emits six UTF-8 CSV files into `mock/` at the repo root. Row counts are deterministic for a given seed; the ranges below are the spec's volume floors/ceilings.

| File                 | Rows           | Primary key            | What it carries                                     |
|----------------------|----------------|------------------------|-----------------------------------------------------|
| `users.csv`          | ~300           | `user_id`              | Employees: name, project, role, comma-skill list    |
| `plans.csv`          | ~50            | `plan_id`              | Plans with title, description, tags, single `owner` |
| `plan_members.csv`   | ~1,500–2,500   | (`plan_id`,`member_id`)| Plan ↔ user N:M membership                          |
| `buckets.csv`        | ~150–200       | `bucket_id`            | Kanban columns within a plan (3–4 per plan)         |
| `tasks.csv`          | ~600           | `task_id`              | The task body — assignees, status, due, JSON extras |
| `timesheet.csv`      | ~400           | `leave_id`             | Approved / pending / rejected leave windows         |

`mock/` is gitignored. The named cast (`u001`–`u015`, `p001`–`p006`, `b001`–`b012`, `t001`–`t020`, `lv001`–`lv011`) is always present verbatim; volume fill is generated around it.

---

## 2. Conventions consumers must know

### IDs
Short prefixed, zero-padded — no UUIDs.

| Prefix | Entity      | Example  |
|--------|-------------|----------|
| `u`    | user        | `u001`   |
| `p`    | plan        | `p001`   |
| `b`    | bucket      | `b001`   |
| `t`    | task        | `t001`   |
| `lv`   | leave entry | `lv001`  |

### Delimited-string fields
Comma-separated, **no spaces around the comma**, no trailing comma.

| Field                 | Example                          |
|-----------------------|----------------------------------|
| `users.skills`        | `AWS,Kubernetes,Terraform`       |
| `plans.tags`          | `infrastructure,cloud,review`    |
| `tasks.tags`          | `infrastructure,aws,review`      |
| `tasks.assignee_ids`  | `u003,u007` (empty if unassigned)|

Split on `","`. Empty string `""` means "none" — never treat a stray empty token as a value.

### JSON-string fields
Three `tasks` columns hold JSON-encoded values inside a single CSV cell, RFC-4180 escaped (wrapped in `"…"` with inner `"` doubled to `""`):

```jsonc
// tasks.checklist
[{"text":"Audit EC2 instances","done":false}]

// tasks.comments
[{"by":"u003","at":"2026-05-12","text":"Started cost audit"}]

// tasks.attachments
[{"name":"aws-cost-report.pdf","url":"https://example.com/…","type":"pdf"}]
```

Empty composites are `[]`, never `""`. The current generator emits `[]` for the entire fill set — the named cast may carry richer values in future iterations.

### Dates
`YYYY-MM-DD`. Empty string `""` means "not set" — applies to `tasks.due_date`. Treat `due_date < today` as **overdue, not unscheduled** (see edge E14).

### Status vs. bucket
Orthogonal:

- **`task.status`** — lifecycle (`todo` · `in progress` · `done`).
- **`task.bucket_id`** — the kanban column (e.g. `To Do`, `Sprint 1`, `Done`). Plan-specific, free-form per plan.

A task can be `status=todo` while sitting in `bucket=Sprint 2`. Never infer status from bucket name (or vice versa).

### Encoding & newlines
UTF-8, Vietnamese diacritics included. `\n` line endings. Header row required.

---

## 3. Schema reference

The authoritative column-by-column spec lives in [`2026-05-20-mock-data-schema-design.md` §2](../specs/2026-05-20-mock-data-schema-design.md#2-tables). Quick lookup:

### `users.csv`

| Column    | Required | Notes                                                              |
|-----------|----------|--------------------------------------------------------------------|
| `user_id` | yes      | `u001`-form                                                        |
| `name`    | yes      | Full name; Vietnamese diacritics                                   |
| `project` | no       | Free-text project label; empty allowed (~10% of fill)              |
| `role`    | no       | Free-text; recommended values are the 11 roles from `SCHEMA.md`    |
| `skills`  | no       | Comma-separated. Empty allowed (~5% of fill) — that user is never a candidate (E9) |

### `plans.csv`

| Column        | Required | Notes                                                          |
|---------------|----------|----------------------------------------------------------------|
| `plan_id`     | yes      | `p001`-form                                                    |
| `title`       | yes      | Plan name                                                      |
| `description` | no       | Empty common (~30%)                                            |
| `tags`        | no       | Empty common (~40%)                                            |
| `owner`       | yes      | Must reference an existing `users.user_id`                     |

### `plan_members.csv`

| Column      | Required | Notes                                          |
|-------------|----------|------------------------------------------------|
| `plan_id`   | yes      | References `plans.plan_id`                     |
| `member_id` | yes      | References `users.user_id`                     |

Composite PK. `p006` deliberately has no rows (edge E18).

### `buckets.csv`

| Column      | Required | Notes                                                 |
|-------------|----------|-------------------------------------------------------|
| `bucket_id` | yes      | `b001`-form                                           |
| `plan_id`   | yes      | References `plans.plan_id`                            |
| `name`      | yes      | Free-form column label, e.g. `To Do`, `Sprint 1`      |

### `tasks.csv`

| Column         | Required | Notes                                                                                                |
|----------------|----------|------------------------------------------------------------------------------------------------------|
| `task_id`      | yes      | `t001`-form                                                                                          |
| `plan_id`      | yes      | References `plans.plan_id`                                                                           |
| `bucket_id`    | yes      | Must belong to the same plan as `plan_id`                                                            |
| `assignee_ids` | no       | Comma list of `user_id`s, all of which must be members of the task's plan. Empty `""` = unassigned   |
| `title`        | no       | May be empty, short, or full-sentence — see E19, E23                                                 |
| `description`  | yes      | One paragraph; the fallback scope signal when title/tags are sparse                                  |
| `status`       | yes      | `todo` · `in progress` · `done`                                                                      |
| `priority`     | yes      | Integer; the generator emits `1` (urgent) · `3` (important) · `5` (medium) · `9` (low)               |
| `due_date`     | no       | `YYYY-MM-DD` or empty                                                                                |
| `tags`         | no       | Comma list. **Empty is the common case (~60%).** Never required as input to a matching step          |
| `checklist`    | yes      | JSON array; `[]` if none                                                                             |
| `comments`     | yes      | JSON array; `[]` if none                                                                             |
| `attachments`  | yes      | JSON array; `[]` if none                                                                             |

### `timesheet.csv`

| Column         | Required | Notes                                                          |
|----------------|----------|----------------------------------------------------------------|
| `leave_id`     | yes      | `lv001`-form                                                   |
| `employee_id`  | yes      | References `users.user_id`                                     |
| `start_date`   | yes      | Inclusive                                                      |
| `end_date`     | yes      | Inclusive                                                      |
| `type`         | yes      | `annual` · `sick` · `personal` · `unpaid`                      |
| `status`       | yes      | `approved` · `pending` · `rejected`                            |

**Only `approved` filters availability.** `pending` and `rejected` rows are present (E24, E25) and ignored by the rule.

---

## 4. The use case the dataset serves

> *"List the infrastructure tasks that need reviewing, and for each suggest available employees whose skills match, so the user can assign them."*

The data is shaped end-to-end so this single sentence drives every column. The query fans out as follows (full walkthrough in [spec §3](../specs/2026-05-20-mock-data-schema-design.md#3-use-case-walkthrough)):

```
1. Listing the in-scope tasks
   tasks WHERE status='todo' AND infra-scope inferred from title/description/tags

2. For each in-scope task T:
   2a. Required skills  ← deduced from T.tags + keywords in T.title / T.description
   2b. Candidate pool   ← plan_members WHERE plan_id=T.plan_id, MINUS T.assignee_ids
   2c. Skill match      ← keep users whose skills intersect the required set; rank by count
   2d. Availability     ← drop users with approved leave overlapping [today, T.due_date]
   2e. Result           ← ranked list per task
```

### Availability rule (verbatim)

An employee is **available** for a task if **no `approved` leave entry overlaps** `[today, task.due_date]`.

```
overlap = start_date <= task.due_date AND end_date >= today
```

If `task.due_date` is empty *or* in the past (overdue), the upper bound collapses to today — availability becomes "no approved leave covering today" (E14).

### Tie-breakers

Not in the data — query-side contracts the dataset exercises naturally:

- Candidates with equal skill-match count → **ascending `user_id`** (E11).
- Tasks with equal priority + due_date → **ascending `task_id`** (E12).

A reference TypeScript implementation lives at `tooling/scripts/mock-data-generator/src/scenarios.ts` (function `suggestForTask`) — read it as a worked example of the full rule.

---

## 5. Scenarios the data must satisfy

Five happy-path scenarios anchor the dataset. The generator's integration tests verify each against the produced CSVs every run. Each row below lists the **input task**, what the use-case query should **deduce**, the **filtering** the query applies, and the **expected output** — read top-to-bottom as a derivation.

### S1 — Strong infra match with availability filter (anchor `t001`)

| Step                  | Value                                                                                                  |
|-----------------------|--------------------------------------------------------------------------------------------------------|
| Input task            | `t001` "Review AWS infrastructure architecture and resource allocation" · `status=todo` · `priority=1` · `due_date=2026-06-02` · `assignee_ids=""` |
| In-scope?             | Yes — `status=todo` + tags `infrastructure,aws,cost,review`                                            |
| Deduced skills        | `AWS`, `Linux`, `Monitoring`, `Security`                                                               |
| Candidate pool (p001) | `u001, u002, u003, u004, u005` (members; `u008` is intentionally **not** a member)                     |
| Skill overlap         | `u002` → 4 · `u003` → 2 · `u005` → 2 · `u001` → 1 · `u004` → 0 (drop)                                   |
| Availability window   | `[2026-05-20, 2026-06-02]`                                                                              |
| Availability outcome  | `u001` blocked by `lv004` (today) · `u002` blocked by `lv001` (2026-05-25 → 2026-06-10) · `u003` blocked by `lv005` (2026-06-02, the boundary day) · `u005` available |
| Expected (full data)  | **`u005`** alone (Section-4-only baseline was `u003, u005`; `lv005` from §5 drops `u003` — see E1)       |
| What it proves        | Skill ranking, availability cutoff, "skilled-but-unavailable" filtering, inclusive upper bound (E1)     |

### S2 — Already-assigned + legitimate empty result (anchor `t002`)

| Step                  | Value                                                                                                  |
|-----------------------|--------------------------------------------------------------------------------------------------------|
| Input task            | `t002` "Audit Kubernetes cluster security and RBAC policies" · `status=todo` · `priority=3` · `due_date=2026-06-15` · `assignee_ids="u003"` |
| In-scope?             | Yes — todo + infra tags                                                                                |
| Deduced skills        | `Kubernetes`, `Security`                                                                               |
| Candidate pool        | `{u001, u002, u004, u005}` — p001 members **minus** `u003`                                              |
| Skill overlap         | `u002` → 2 · `u001`/`u004`/`u005` → 0 (drop)                                                            |
| Availability window   | `[2026-05-20, 2026-06-15]`                                                                              |
| Availability outcome  | `u002` blocked by `lv001`                                                                              |
| Expected (literal)    | **Empty** — current assignee excluded; only matching candidate is on leave                              |
| Expected (alias on)   | `u015` after `k8s → Kubernetes` normalization (see E22)                                                |
| What it proves        | Current-assignee exclusion, legitimate empty result, opt-in alias-map cross-check                       |

### S3 — No due_date → today-only availability (anchor `t003`)

| Step                  | Value                                                                                                  |
|-----------------------|--------------------------------------------------------------------------------------------------------|
| Input task            | `t003` "Plan Q3 capacity model" · `status=todo` · `priority=5` · `due_date=""` · `assignee_ids=""`      |
| In-scope?             | Yes                                                                                                    |
| Deduced skills        | Loose — `infrastructure`, planning context (no narrow skill required)                                  |
| Candidate pool        | All p001 members                                                                                       |
| Availability window   | Collapses to **today only** (`due_date` empty)                                                          |
| Availability outcome  | `u001` blocked by `lv004` (covers 2026-05-20) · others available (their leaves don't cover today)       |
| Expected              | Loose ranking with `u001` filtered out                                                                  |
| What it proves        | `due_date IS NULL` fallback branch of the availability rule                                            |

### S4 — Highly-skilled non-member must NOT be suggested (anchor `t001`)

| Step                  | Value                                                                                                  |
|-----------------------|--------------------------------------------------------------------------------------------------------|
| Input task            | Same as S1 (`t001` in `p001`)                                                                          |
| Trap                  | `u008` has skills `AWS,Kubernetes,Terraform,Security` — near-perfect for an AWS infra audit             |
| The catch             | `u008` has **no row** in `plan_members.csv` for `p001`                                                  |
| Expected              | `u008` **must not** appear in any `p001` suggestion, regardless of skill or availability                |
| What it proves        | Candidate pool is gated by plan membership, not by skill. "Invite non-member to plan" is a separate workflow, out of scope here |

### S5 — Non-todo and non-infra tasks excluded from the input list

| Task   | Status        | Tags / scope                  | Included in input list?                                        |
|--------|---------------|-------------------------------|----------------------------------------------------------------|
| `t001` | `todo`        | `infrastructure,aws,…`        | **Yes**                                                        |
| `t002` | `todo`        | `infrastructure,kubernetes,…` | **Yes**                                                        |
| `t003` | `todo`        | `infrastructure,planning`     | **Yes**                                                        |
| `t004` | `done`        | `infrastructure,terraform`    | No — not "needs reviewing"                                     |
| `t005` | `in progress` | `infrastructure,monitoring`   | No — already underway                                          |
| `t006` | `todo`        | `frontend,design-system`      | No — todo, but title/description/tags are frontend-only        |

**What it proves.** The two filters at the head of the use-case query: `status='todo'` **and** infra-scope by title/description/tags. Both must pass; either alone is insufficient.

Worked prose with full per-step arithmetic lives in [spec §4](../specs/2026-05-20-mock-data-schema-design.md#4-happy-path-scenarios). Note that S1 and S2 each pair with a Section-5 cross-check — E1 reshapes S1's expected list via `lv005`, and E22 reshapes S2 when the alias map is applied.

---

## 6. Edge cases the data exercises

26 named edges grouped by theme. Each row below names the **anchor data** (the row or deliberate omission in the dataset), the **trigger** (the condition that makes this an edge), and the **expected behavior** a correct consumer must produce. The dataset bakes these in — they are not random, and they are not optional. Full prose in [spec §5](../specs/2026-05-20-mock-data-schema-design.md#5-edge-cases--behavioral).

### 6.1 Availability boundaries (E1–E3)

| Edge | Anchor data                                      | Trigger                                                              | Expected behavior                                                                                   |
|------|--------------------------------------------------|----------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| E1   | `lv005` (u003, 2026-06-02 → 2026-06-02, approved) | Leave's `end_date` equals task's `due_date` (`t001.due_date=2026-06-02`) | Overlap is **inclusive** on the upper bound → `u003` unavailable for `t001`. Reshapes S1 to `u005` alone. |
| E2   | `lv006` (u011, 2026-05-20 → 2026-05-22, approved) | Leave's `start_date` equals today (`2026-05-20`)                       | Overlap is **inclusive** on the lower bound → `u011` unavailable for any task with `due_date ≥ today`. |
| E3   | `lv001` (approved) + `lv007` (pending) — both on u002 | Approved and pending leaves cover the same window                  | Only `lv001` filters. Removing `lv001` would make `u002` available even with `lv007` still present.   |

### 6.2 Saturation (E4–E6)

| Edge | Anchor data                                        | Trigger                                                               | Expected behavior                                                                                  |
|------|----------------------------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| E4   | `p003` has exactly one member (`u010`, also owner) | Candidate pool size = 1                                               | Single-suggestion-or-empty is a valid shape. If `u010` lacks the skill or is on leave → empty.      |
| E5   | `t012.assignee_ids = u001,u002,u003,u004,u005`     | All originally-skilled p001 members already assigned                  | Empty suggestion list even though `status=todo`. Empty-reason = **saturation**, not capability.     |
| E6   | `t013` requires Kubernetes; only u002 / u003 have it; both on leave for window | All capable members unavailable                          | Empty list. Empty-reason = **availability**, not capability (contrast E10). Consumer should distinguish. |

### 6.3 Skill-deduction surface (E7–E10)

| Edge | Anchor data                                                  | Trigger                                                          | Expected behavior                                                                                       |
|------|--------------------------------------------------------------|------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| E7   | `t007` title `"Update operational runbook"`, tags `documentation,operations`; description names IAM + Kubernetes + AWS production cluster | Infra signal lives in **description only** | Scope deduction must read the description; skills `AWS, Kubernetes, Security` deduced from it.            |
| E8   | `t008` tags `infrastructure,frontend,review`; title mentions CDN cache + SPA deploys | Mixed-world task                              | Task must appear in the infra input list; required-skill set spans both worlds; ranking dominated by whichever world has more matching members. |
| E9   | `u009.skills = ""`; member of `p001`                          | User has zero skill tokens                                       | Never appears in any suggestion list, regardless of availability. Membership alone is not enough.       |
| E10  | `t014` "Modernize legacy mainframe COBOL batch jobs" — no user anywhere has this skill | No skill overlap in the entire org             | Empty list. Empty-reason = **capability**, not availability or saturation. Distinct from E5 / E6 empties. |

### 6.4 Determinism / tie-breaking (E11–E12)

| Edge | Source row | Trigger                                       | Expected behavior                                  |
|------|------------|-----------------------------------------------|----------------------------------------------------|
| E11  | S1 itself — `u003` and `u005` both 2 matches, both available | Tied candidates                  | Order by **ascending `user_id`** → `u003` before `u005`.   |
| E12  | The "needs review" listing query produces ties at `priority=5` and matching `due_date` | Tied input tasks      | Order by **ascending `task_id`**.                                  |

### 6.5 Due-date corners (E13–E14)

| Edge | Anchor data                          | Trigger                                                | Expected behavior                                                                                |
|------|--------------------------------------|--------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| E13  | `t011.due_date = 2026-05-20` (today) | Window collapses to `[today, today]`                   | Only leaves covering today filter. `u001` (`lv004`) and `u011` (`lv006`) blocked. `u002` is available (lv001 starts 2026-05-25); sole suggestion for Security. |
| E14  | `t009.due_date = 2026-05-10` (past)  | Window `[2026-05-20, 2026-05-10]` is inverted/empty    | Fall back to **today-only** availability (same branch as E14 / S3 / empty `due_date`). Task is still listed; overdue indication is a UI concern, not the schema. |

### 6.6 Sparse / missing fields (E15–E20)

| Edge | Anchor data                              | Trigger                                  | Expected behavior                                                                                                       |
|------|------------------------------------------|------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| E15  | `u012.project = ""`                       | Empty informational field on user        | Must not break joins or render paths; field is never read by the matching query.                                        |
| E16  | `u013.role = ""`                          | Empty informational field on user        | Same as E15 — informational only.                                                                                       |
| E17  | `p004.description = ""` and `tags = ""`   | Plan-level scope hints absent            | Scope deduction for tasks inside `p004` must rely entirely on task-level signals (title, description, task tags).        |
| E18  | `p006` has **no rows** in `plan_members`  | Plan with zero members                   | Empty candidate pool *before* skill or availability filters apply. Empty-reason = **no members**, distinct from E5/E6/E10. |
| E19  | `t015.title = ""` and `t015.tags = ""`    | Title + tags absent on a task            | `description` ("Check AWS production cluster cost report…") is the only scope signal. Scope deduction must never depend solely on `title`. |
| E20  | ~60% of fill tasks have `tags = ""`       | Empty tags is the **common case**        | Tags must be treated as a hint, never a contract. Any matching step that requires non-empty tags is wrong.              |

### 6.7 Skill vocabulary variance (E21–E22)

| Edge | Anchor data                                            | Trigger                                              | Expected behavior                                                                                                            |
|------|--------------------------------------------------------|------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| E21  | `u013.skills = "DevOps,AI"` (broad) vs `u014.skills = "ML,NLP,Spark,Kafka"` (narrow) | Same concept at different granularities | Default matching is **literal token comparison after case-folding**. "DevOps" does **not** expand to "Kubernetes"; "AI" does **not** match "ML". Hierarchical expansion is opt-in. For `t018`: literal → empty (3-match `u014` on leave, 0-match `u013` available); with `AI → ML` expansion → `u013` becomes a 1-match available candidate. |
| E22  | `u015.skills = "k8s,ts,postgres,OOP"`                  | Alias-form spellings                                 | Alias normalization is consumer-owned. Recommended map below. Applying it adds `u015` to S2's suggestion list as a 1-match candidate; without it, S2 stays empty. |

**Recommended alias map** (the reference implementation in `src/aliases.ts`; case-insensitive on the alias side, idempotent, deduplicates after normalization):

| Alias              | Canonical    |
|--------------------|--------------|
| `k8s`              | `Kubernetes` |
| `ts`               | `TypeScript` |
| `postgres` / `pg`  | `PostgreSQL` |
| `js`               | `JavaScript` |
| `node`             | `Node.js`    |

### 6.8 Title length variance (E23)

| Bracket  | Example                                                                                                                                                              | What it tests                                                                                                                                          |
|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Empty    | `t015.title = ""`                                                                                                                                                    | Scope deduction must not depend on title alone (see E19).                                                                                              |
| Short    | `t017.title = "Setup k8s monitoring stack"` (4 words)                                                                                                                | Few-token titles still surface a clear signal.                                                                                                         |
| Medium   | Most tasks `t001`–`t014`                                                                                                                                             | The mainline case.                                                                                                                                     |
| Long     | `t016.title` — 35+ words: *"Investigate and document the root cause of the intermittent 502 errors observed during the morning peak traffic window…"*                | Keyword extraction must scale without truncation; matching rules don't change.                                                                         |

Notable: `t016`'s title surfaces non-canonical phrases (`production`, `payment gateway`, `load balancing`) — the infra signal actually comes from its tags (`infrastructure,reliability`). Title-only deduction would underweight this task.

### 6.9 Timesheet status mix (E24–E26)

| Edge | Anchor data                                                       | Trigger                                                              | Expected behavior                                                                                          |
|------|-------------------------------------------------------------------|----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| E24  | `lv008` (u005, 2026-05-22 → 2026-05-23, **pending**)               | Pending leave overlaps an active window                              | Does **not** filter `u005`. Consumer must gate on `status='approved'` **before** applying the overlap test. |
| E25  | `lv011` (u013, 2026-07-01 → 2026-07-05, **rejected**)              | Rejected leave present in the dataset                                | Ignored by the availability rule. Less common in practice, still a valid third status.                     |
| E26  | `lv010` (u012, 2026-05-10 → 2026-05-15, **approved**, fully past)  | Approved leave entirely before today                                 | Does **not** filter — `end_date >= today` fails (`2026-05-15 < 2026-05-20`). Status `approved` alone is not the gate; the temporal overlap is. |

---

## 7. Volume guarantees

For the default seed (`20260520`) and counts (300 users, 50 plans, 600 tasks, 400 leaves), the dataset satisfies:

- **Named cast survives verbatim** — every row from spec §4 + §5 is present unchanged.
- **≥ 80 infra-scoped `todo` tasks** beyond the named cast — exercises the input-list step at scale.
- **~60% of tasks** have empty `tags` — tags are a *hint*, never a contract.
- **~30%** of plan descriptions empty; **~40%** of plan tags empty.
- **~15%** of users have at least one of `project` / `role` empty.
- **~5%** of users have empty skills (never candidates).
- **~10%** of users use at least one alias-form skill so the alias map is exercised broadly, not only by `u015`.
- **`lv009`** approved, overlapping `[2026-05-20, 2026-06-30]` → exercises availability filtering at scale.
- **`p006`** has zero `plan_members` rows.

Full numbers: [spec §6](../specs/2026-05-20-mock-data-schema-design.md#6-mock-data-volume-guidelines).

---

## 8. Query patterns

### Listing in-scope tasks (step 1)

The infra-scope check is *semantic* — title, description, *and* tags can supply the signal. A reasonable conservative form:

```sql
-- shape only; CSV consumers will use a script or DataFrame
SELECT task_id
FROM tasks
WHERE status = 'todo'
  AND (
    tags LIKE '%infrastructure%'
    OR title    ILIKE '%infrastructure%' OR title    ILIKE '%kubernetes%' OR title    ILIKE '%aws%'
    OR description ILIKE '%infrastructure%' OR description ILIKE '%kubernetes%' OR description ILIKE '%aws%'
  );
```

In practice the deduction will be richer (LLM, keyword set, embeddings). Tasks like `t007` (signal only in description) and `t015` (signal only in description, no title or tags) deliberately defeat a tag-only filter.

### Computing a suggestion list (steps 2a–2e)

See `tooling/scripts/mock-data-generator/src/scenarios.ts` for the reference 50-line implementation. It is annotated against this doc and is what the integration tests use to verify scenarios and edges.

### Loading CSVs

UTF-8, RFC-4180 quoting, `\n` line endings. The JSON columns on `tasks` are valid JSON strings — parse with `JSON.parse` after CSV cell-unescaping. Most parsers (Python `csv.DictReader`, Node `csv-parse`, DuckDB `read_csv_auto`) handle the escaping natively.

---

## 9. Running the generator

The README at `tooling/scripts/mock-data-generator/README.md` is the operational source of truth — this section is a pointer.

```sh
# Default seed + default output dir (mock/ at repo root)
pnpm --filter @seta/tooling gen-mock

# Custom seed / output
pnpm --filter @seta/tooling gen-mock -- --seed 123 --out tmp-mock
```

- `--seed <int>` defaults to `20260520`. Same seed = byte-identical output across machines.
- `--out <path>` defaults to `mock`, resolved against the repo root. Absolute paths are honored.

### Test suite

```sh
pnpm vitest run --project mock-data-generator
```

Coverage:

- Per-generator unit tests (sparsity ratios, ID uniqueness, deterministic output for a fixed seed).
- `integration.test.ts` — cross-table referential integrity, named-cast survival, volume floors.
- `scenarios.test.ts` — every spec scenario S1–S5 evaluated against the generated dataset.
- `edges.test.ts` — direct assertions on the named edges (E4, E5, E9, E13, E18, E20, E24, E26).
- `write-csv.test.ts` + `csv.test.ts` — RFC-4180 escaping, JSON-in-cell round-trip.

### Determinism contract

A single seed flows through every generator. Each table generator is a pure function `(rng, …inputs) => Row[]`. As long as the call order in `cli.ts` is preserved and the variety pools in `pools.ts` are unchanged, the output is byte-stable. Adding a new pool entry or reordering pool entries is a deliberate breaking change to the dataset — bump the default seed if you need a clean cut.

---

## 10. Where the code lives

Generator package at `tooling/scripts/mock-data-generator/`:

```
src/
  types.ts                 # User / Plan / PlanMember / Bucket / Task / LeaveEntry / Dataset
  rng.ts                   # Seeded mulberry32 + pick/sample/chance/intRange helpers
  csv.ts                   # RFC-4180 cell escaping + toCsvRow
  write-csv.ts             # Header + escaped rows + JSON serialization
  aliases.ts               # ALIAS_MAP + normalizeSkill / normalizeSkillsCsv
  pools.ts                 # Vietnamese name parts, roles, projects, skill catalog, tag pools, title/description templates, ROLE_SKILL_PROFILE
  cast.ts                  # u001-u015, p001-p006, b001-b012, t001-t020, lv001-lv011 verbatim from spec
  gen-users.ts             # Named cast + fill to ~300
  gen-plans.ts             # Named cast + fill to ~50 with ≥3 infra-tagged plans
  gen-plan-members.ts      # Named rows + 25–50 members per non-orphan plan; p006 stays empty
  gen-buckets.ts           # Named rows + 3-bucket fill set per remaining plan
  gen-tasks.ts             # Named cast + fill to ~600 with ≥80 infra-todo tasks; tags ~60% empty
  gen-timesheet.ts         # Named rows + fill to ~400 with 70/25/5 approved/pending/rejected
  scenarios.ts             # Reference suggestForTask — read this as the worked example
  cli.ts                   # pnpm gen-mock entry — parses --seed / --out, writes 6 files
  __tests__/               # See "Test suite" above
README.md
vitest.config.ts
```

The named cast in `cast.ts` is the **single source of truth in code** for the spec's scenario anchors. Touching that file should always come with a corresponding spec update in the same PR.

---

## 11. Relationship to other docs

| Doc | What it answers |
|---|---|
| This page | "I have CSVs in `mock/`. How do I use them and what's guaranteed?" |
| [Schema spec](../specs/2026-05-20-mock-data-schema-design.md) | "What is each column for, and which scenarios + edges does the dataset prove?" Canonical for field semantics. |
| [Build plan](../plans/2026-05-20-mock-data-csv-generator.md) | "Task-by-task, how was the generator built?" — TDD checkboxes, commit per task. |
| [Generator README](../../../tooling/scripts/mock-data-generator/README.md) | "What command do I run, what flags exist, where does output land?" |
| [`SCHEMA.md`](../specs/SCHEMA.md) (companion to the spec) | The Graph-shaped source-of-truth schema. Use that for connector work; use this dataset for prompt/UI prototyping. Mapping in [spec §8](../specs/2026-05-20-mock-data-schema-design.md#8-relationship-to-schemamd). |

---

## 12. What this branch is *not*

Explicitly out of scope:

- Multi-tenant columns (`tenant_id`) — single implicit tenant.
- Soft-delete / sync / audit columns — one consistent snapshot.
- Comment threads beyond a flat list — no replies, no reactions.
- Real file hosting for attachments — `url` field is illustrative.
- Assignment history — only the current `assignee_ids` is stored.
- A loader into Postgres — the CSVs are the artifact; importing into a database is a downstream consumer's job.
