# Mock Data Schema — Task Assignment Use Case

**Purpose.** Mock data for the use case: *"List tasks that need reviewing about infrastructure, and for each suggest available employees whose skills match, so the user can assign."*

This is a simplified, denormalized view intended for prompt-engineering and assignment exploration. It is **not** a replacement for [`SCHEMA.md`](./SCHEMA.md), which models the MS Graph–shaped source-of-truth schema. Both can coexist.

**Reference date used throughout the mock data:** `2026-05-20`.

---

## 1. Conventions

### File layout
Six CSV files, one per table:

```
mock/
  users.csv
  plans.csv
  plan_members.csv
  buckets.csv
  tasks.csv
  timesheet.csv
```

### IDs
Short, readable, prefixed and zero-padded — no UUIDs.

| Prefix | Entity      | Example  |
|--------|-------------|----------|
| `u`    | user        | `u001`   |
| `p`    | plan        | `p001`   |
| `b`    | bucket      | `b001`   |
| `t`    | task        | `t001`   |
| `lv`   | leave entry | `lv001`  |

### Delimited-string fields
Comma-separated, **no spaces around the comma**. Used for flat lists:

| Field                 | Example                          |
|-----------------------|----------------------------------|
| `users.skills`        | `AWS,Kubernetes,Terraform`       |
| `plans.tags`          | `infrastructure,cloud,review`    |
| `tasks.tags`          | `infrastructure,aws,review`      |
| `tasks.assignee_ids`  | `u003,u007` (empty if unassigned)|

### JSON-string fields
Valid JSON written inside a single CSV cell. CSV-escaped per RFC 4180 — wrap in `"…"`, double inner quotes (`""`). Used for nested data on `tasks`:

```jsonc
// tasks.checklist
[{"text":"Audit EC2 instances","done":false},{"text":"Review IAM policies","done":true}]

// tasks.comments
[{"by":"u003","at":"2026-05-12","text":"Started cost audit"}]

// tasks.attachments
[{"name":"aws-cost-report.pdf","url":"https://example.com/aws-cost-report.pdf","type":"pdf"}]
```

Empty composite fields use `[]`, never empty string.

### Status vs. bucket
Orthogonal concepts:

- **`task.status`** — lifecycle state: `todo` · `in progress` · `done`.
- **`task.bucket_id`** — current column on the plan's kanban board (e.g., `Backlog`, `Sprint 1`, `Done`). Plan-specific, free-form per plan.

A task can be `status=todo` while sitting in bucket `Sprint 2`.

### Dates
ISO date format `YYYY-MM-DD`. Empty string means "not set".

### Encoding
UTF-8 (Vietnamese names supported). Newlines `\n`. Header row required.

---

## 2. Tables

### 2.1 `users.csv` — employees

One row per employee.

| Column    | Type | Required | Description                                                       |
|-----------|------|----------|-------------------------------------------------------------------|
| `user_id` | text PK | yes   | e.g. `u001`                                                       |
| `name`    | text | yes      | Full name, e.g. `Nguyễn Văn Nam`                                  |
| `project` | text | yes      | Free-text project assignment, e.g. `SETA Internal`, `Client Atlas`|
| `role`    | text | yes      | Free-text role title, e.g. `Backend Developer`, `IT Engineer`     |
| `skills`  | text | yes      | Comma-separated skill list, e.g. `AWS,Kubernetes,Terraform`       |

**Notes**

- `skills` is the primary signal for capability matching. Use the canonical skill names already defined in `SCHEMA.md` (AWS, Kubernetes, Terraform, Linux, Monitoring, Security, React, Node.js, PostgreSQL, Docker, etc.) so vocabulary stays stable across docs.
- `role` is free-text — use the same 11 roles from `SCHEMA.md` (CEO, CTO, CDO, IC Executive, PM, PMO, Frontend Developer, Backend Developer, Fullstack Developer, Talent Acquisition, IT) for consistency, but the field itself is not constrained.

---

### 2.2 `plans.csv` — plans

One row per plan.

| Column        | Type | Required | Description                                                  |
|---------------|------|----------|--------------------------------------------------------------|
| `plan_id`     | text PK | yes   | e.g. `p001`                                                  |
| `title`       | text | yes      | Plan name, e.g. `Infrastructure Review Q2 2026`              |
| `description` | text | yes      | One-paragraph plan summary                                   |
| `tags`        | text | yes      | Comma-separated, e.g. `infrastructure,cloud,review`          |
| `owner`       | text | yes      | `user_id` of the plan owner — must exist in `users.csv`      |

---

### 2.3 `plan_members.csv` — plan membership

One row per (plan, member) pair. Normalized (not a delimited string on `plans`) because membership is the most-joined-against table in the matching query.

| Column      | Type | Required | Description                                                |
|-------------|------|----------|------------------------------------------------------------|
| `plan_id`   | text | yes      | References `plans.plan_id`                                 |
| `member_id` | text | yes      | References `users.user_id`                                 |

Composite PK: (`plan_id`, `member_id`).

---

### 2.4 `buckets.csv` — kanban columns

One row per bucket. Each plan has its own buckets; bucket names are not standardized.

| Column      | Type | Required | Description                                                |
|-------------|------|----------|------------------------------------------------------------|
| `bucket_id` | text PK | yes   | e.g. `b001`                                                |
| `plan_id`   | text | yes      | References `plans.plan_id`                                 |
| `name`      | text | yes      | Free-form column name, e.g. `To Do`, `Sprint 1`, `Done`    |

---

### 2.5 `tasks.csv` — tasks

One row per task. Carries everything needed for the assignment use case.

| Column         | Type    | Required | Description                                                                              |
|----------------|---------|----------|------------------------------------------------------------------------------------------|
| `task_id`      | text PK | yes      | e.g. `t001`                                                                              |
| `plan_id`      | text    | yes      | References `plans.plan_id`                                                               |
| `bucket_id`    | text    | yes      | References `buckets.bucket_id`; must belong to the same `plan_id`                        |
| `assignee_ids` | text    | no       | Comma-separated `user_id`s; empty string `""` if unassigned                              |
| `title`        | text    | yes      | Task title — must be infrastructure-evocative for in-scope tasks                         |
| `description`  | text    | yes      | One-paragraph task description; added beyond the original request because the use case (infrastructure-scope deduction) reads this field |
| `status`       | text    | yes      | One of `todo` · `in progress` · `done`                                                   |
| `priority`     | int     | yes      | `1` (urgent) — `9` (low). `1`/`3`/`5`/`9` are the common values (urgent/important/medium/low) |
| `due_date`     | date    | no       | ISO date; empty if not set                                                               |
| `tags`         | text    | no       | Comma-separated; empty `""` if none                                                      |
| `checklist`    | json    | yes      | `[{"text":"…","done":bool}, …]` — empty `[]` if none                                     |
| `comments`     | json    | yes      | `[{"by":"u003","at":"YYYY-MM-DD","text":"…"}, …]` — empty `[]` if none                   |
| `attachments`  | json    | yes      | `[{"name":"…","url":"…","type":"pdf\|png\|docx\|xlsx\|md"}, …]` — empty `[]` if none     |

**Constraints (mock data must respect)**

- Every `user_id` in `assignee_ids` exists in `users.csv` **and** is a member of the task's plan (i.e. row exists in `plan_members.csv`).
- `bucket_id` belongs to the same `plan_id`.
- `status='todo'` is the canonical signal for "needs reviewing/needs assignment" — these are the rows the use case lists.
- `assignee_ids` may be empty for `status='todo'` tasks (the assignment workflow exists *because* they need assignees).

---

### 2.6 `timesheet.csv` — leave / availability

One row per leave entry. Multiple entries per employee are expected.

| Column         | Type   | Required | Description                                                |
|----------------|--------|----------|------------------------------------------------------------|
| `leave_id`     | text PK| yes      | e.g. `lv001`                                               |
| `employee_id`  | text   | yes      | References `users.user_id`                                 |
| `start_date`   | date   | yes      | First day of leave, inclusive                              |
| `end_date`     | date   | yes      | Last day of leave, inclusive                               |
| `type`         | text   | yes      | One of `annual` · `sick` · `personal` · `unpaid`           |
| `status`       | text   | yes      | One of `approved` · `pending` · `rejected`                 |

**Availability rule used by the use case**

> An employee is **available** for a given task if no `approved` leave entry overlaps the window `[today, task.due_date]`.
>
> Overlap = `start_date <= task.due_date AND end_date >= today`.
>
> `pending` and `rejected` entries do **not** affect availability.

If `task.due_date` is empty, treat availability as "no `approved` leave covering today".

---

## 3. Use-Case Walkthrough

The driver query — *"infrastructure tasks needing review, with suggested assignees"* — fans out across the schema as follows:

```
1. tasks
     WHERE status = 'todo'
       AND (title OR description OR tags semantically matches "infrastructure")
     → list of in-scope tasks

2. For each in-scope task T:

   a. Required skills for T
      ← derived from T.tags + keywords in T.title / T.description
        (e.g. tag "aws" → skill "AWS"; description mentions "Kubernetes" → "Kubernetes")

   b. Candidate pool
      ← plan_members.member_id WHERE plan_id = T.plan_id
      ← MINUS users already in T.assignee_ids

   c. Skill match
      ← keep candidates whose users.skills (split on ",")
        intersects the required-skills set; rank by intersection size

   d. Availability filter
      ← drop candidates with any approved timesheet entry overlapping [today, T.due_date]

   e. Result: ranked list of {user_id, name, role, matched_skills, available} per task
```

Note step 2a — the "infrastructure scope" is inferred semantically from task text, not from a hard filter. The mock data must therefore include enough variety: some tasks clearly infra (mention AWS/Kubernetes/etc.), some clearly not (e.g. frontend tasks), and the in-scope ones tagged consistently so the deduction step has signal.

---

## 4. Mock-Data Volume Guidelines

Sized to support the use case without being noisy.

| Table          | Rows                                                                 |
|----------------|----------------------------------------------------------------------|
| `users`        | ~30 — covering all 11 roles from `SCHEMA.md`, with several IT / Backend / DevOps-skilled users so the matching has candidates |
| `plans`        | 4–6 — including at least **one** infrastructure-focused plan (e.g. `Infrastructure Review Q2 2026`) plus 3–5 non-infra plans for contrast |
| `plan_members` | ~60–100 rows — every plan has 6–15 members                           |
| `buckets`      | 3–4 per plan (e.g. `To Do`, `In Progress`, `Done` — names vary)      |
| `tasks`        | ~40 — at least **10** with `status='todo'` that are clearly infra-scoped; the rest a mix of statuses, plans, and topics |
| `timesheet`    | ~20 leave entries — mix of past, current, and future windows; majority `approved`, a few `pending` |

Cardinality rules of thumb for the infra-scoped todo tasks:

- At least 3 should have **no** current assignee (`assignee_ids=""`).
- At least 3 should have a `due_date` within the next 30 days.
- Required skills across the set should collectively span: AWS, Kubernetes, Terraform, Linux, Monitoring, Security, Docker — so different tasks attract different candidates.
- At least one infra-skilled user must have an `approved` leave entry overlapping `[2026-05-20, 2026-06-30]` so the availability filter is exercised.

---

## 5. Out of Scope

Explicitly *not* in this schema:

- Multi-tenant columns (`tenant_id`) — single implicit tenant for mock purposes.
- Soft-delete columns (`soft_deleted_at`) — mock data represents one consistent snapshot.
- Sync/audit columns (`synced_at`, ETags) — no sync layer here.
- Comments thread structure beyond a flat list — no replies, no reactions.
- Attachment storage — `url` field is illustrative; no actual file hosting assumed.
- Assignment history — only the current `assignee_ids` is stored, no audit trail of past assignees.

---

## 6. Relationship to `SCHEMA.md`

| `SCHEMA.md` (Graph-shaped)           | This schema (simplified)        | Notes                                                                 |
|---------------------------------------|---------------------------------|-----------------------------------------------------------------------|
| `directory_users` + `raw.skills[]`    | `users` with `skills` string    | Comma-string instead of JSON array; same skill vocabulary             |
| `planner_plans_cache`                 | `plans`                         | Drops `owner_group_id` (no group concept here); keeps single `owner`  |
| `plan_members`                        | `plan_members`                  | Same shape, simpler ID format                                         |
| `planner_buckets_cache`               | `buckets`                       | Drops `order_hint`, `etag`                                            |
| `planner_tasks_cache` + `_details`    | `tasks` (single table)          | Merges summary + details; `assignee_ids` is comma-string not array    |
| *(no equivalent)*                     | `timesheet`                     | New table — `SCHEMA.md` has no leave model                            |

Use `SCHEMA.md` when modeling integration with the real MS Graph connector. Use this document when prototyping assignment heuristics, prompts, or UI mocks against a small readable dataset.
