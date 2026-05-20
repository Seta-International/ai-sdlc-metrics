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
| `project` | text | no       | Free-text project assignment, e.g. `SETA Internal`, `Client Atlas`. Empty allowed |
| `role`    | text | no       | Free-text role title, e.g. `Backend Developer`, `IT Engineer`. Empty allowed |
| `skills`  | text | no       | Comma-separated skill list, e.g. `AWS,Kubernetes,Terraform`. Empty allowed (user is then never a candidate) |

**Notes**

- `skills` is the primary signal for capability matching. Mix canonical names (AWS, Kubernetes, Terraform, Linux, etc.), broad umbrella terms (DevOps, AI), narrow technical ones (Spark, Kafka, NLP, ML, OOP), and common aliases (k8s, ts, postgres). See edges E21–E22 for the matching implications.
- `role` is free-text — the 11 roles from `SCHEMA.md` (CEO, CTO, CDO, IC Executive, PM, PMO, Frontend Developer, Backend Developer, Fullstack Developer, Talent Acquisition, IT) are recommended for consistency, but the field is not constrained.
- Empty `project`, `role`, or `skills` are valid — see edges E15, E16, E9.

---

### 2.2 `plans.csv` — plans

One row per plan.

| Column        | Type | Required | Description                                                  |
|---------------|------|----------|--------------------------------------------------------------|
| `plan_id`     | text PK | yes   | e.g. `p001`                                                  |
| `title`       | text | yes      | Plan name, e.g. `Infrastructure Review Q2 2026`              |
| `description` | text | no       | One-paragraph plan summary. Empty allowed                    |
| `tags`        | text | no       | Comma-separated, e.g. `infrastructure,cloud,review`. Empty allowed and common |
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
| `title`        | text    | no       | Task title; may be empty, very short, or very long. For in-scope tasks the infra signal must appear somewhere across title/description/tags (see E19, E23) |
| `description`  | text    | yes      | One-paragraph task description; the deduction fallback when title or tags are sparse     |
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

## 4. Happy-Path Scenarios

Each scenario fixes a concrete slice of the mock data and states what the assignment query must produce. The mock data must satisfy every scenario — together they prove the schema and dataset have enough signal for the use case.

**Reference cast** (used by all scenarios; reference date `2026-05-20`):

`users.csv` — relevant rows only

| user_id | name              | project        | role               | skills                                            |
|---------|-------------------|----------------|--------------------|---------------------------------------------------|
| u001    | Trần Văn Hùng     | SETA Internal  | CTO                | `AWS,System Design,DevOps,Engineering Leadership` |
| u002    | Nguyễn Văn Nam    | SETA Internal  | IT Engineer        | `AWS,Kubernetes,Terraform,Linux,Monitoring,Security` |
| u003    | Lê Thị Hoa        | SETA Internal  | IT Engineer        | `AWS,Kubernetes,Linux,Docker`                     |
| u004    | Phạm Quốc Bảo     | Client Atlas   | Backend Developer  | `Node.js,PostgreSQL,Docker,Kafka`                 |
| u005    | Vũ Minh Tuấn      | SETA Internal  | Backend Developer  | `AWS,Docker,Linux,PostgreSQL`                     |
| u008    | Bùi Trung Hiếu    | Client Beta    | IT Engineer        | `AWS,Kubernetes,Terraform,Security`               |

`plans.csv`

| plan_id | title                                | tags                           | owner |
|---------|--------------------------------------|--------------------------------|-------|
| p001    | Infrastructure Review Q2 2026        | `infrastructure,cloud,review`  | u001  |
| p002    | Frontend Modernization               | `frontend,react`               | …     |

`plan_members.csv` (p001)

`u001, u002, u003, u004, u005` — **u008 is deliberately not a member of p001.**

`buckets.csv` (p001)

| bucket_id | name          |
|-----------|---------------|
| b001      | To Do         |
| b002      | In Progress   |
| b004      | Done          |

`tasks.csv`

| task_id | plan_id | bucket_id | status      | priority | assignee_ids | due_date    | title                                                              | tags                                          |
|---------|---------|-----------|-------------|----------|--------------|-------------|--------------------------------------------------------------------|-----------------------------------------------|
| t001    | p001    | b001      | todo        | 1        | *(empty)*    | 2026-06-02  | Review AWS infrastructure architecture and resource allocation     | `infrastructure,aws,cost,review`              |
| t002    | p001    | b001      | todo        | 3        | u003         | 2026-06-15  | Audit Kubernetes cluster security and RBAC policies                | `infrastructure,kubernetes,security,review`   |
| t003    | p001    | b001      | todo        | 5        | *(empty)*    | *(empty)*   | Plan Q3 capacity model                                             | `infrastructure,planning`                     |
| t004    | p001    | b004      | done        | 5        | u002         | 2026-04-30  | Migrate Terraform modules to v1.7                                  | `infrastructure,terraform`                    |
| t005    | p001    | b002      | in progress | 3        | u003         | 2026-05-30  | Set up monitoring dashboards for production services               | `infrastructure,monitoring`                   |
| t006    | p002    | …         | todo        | 5        | *(empty)*    | 2026-06-10  | Refactor design system tokens                                      | `frontend,design-system`                      |

`timesheet.csv`

| leave_id | employee_id | start_date  | end_date    | type     | status   |
|----------|-------------|-------------|-------------|----------|----------|
| lv001    | u002        | 2026-05-25  | 2026-06-10  | annual   | approved |
| lv002    | u005        | 2026-06-20  | 2026-06-25  | annual   | approved |
| lv003    | u003        | 2026-07-01  | 2026-07-10  | sick     | pending  |
| lv004    | u001        | 2026-05-20  | 2026-05-20  | personal | approved |

---

### Scenario 1 — Strong infra match with availability filter

**Input task:** `t001` ("Review AWS infrastructure architecture…", due `2026-06-02`, unassigned).

**Derivation steps**

1. *In-scope?* `status=todo`, title and tags mention `infrastructure,aws,cost,review` → yes.
2. *Required skills* (deduced from tags + title): `AWS`, plus infra-related (`Linux`, `Monitoring`, `Security`).
3. *Candidate pool* = members of p001 = {u001, u002, u003, u004, u005}.
4. *Skill overlap*:
   - u002 → AWS, Linux, Monitoring, Security (**4 matches**)
   - u003 → AWS, Linux (2 matches)
   - u005 → AWS, Linux (2 matches)
   - u001 → AWS (1 match)
   - u004 → 0 matches → drop
5. *Availability vs `[2026-05-20, 2026-06-02]`*:
   - u001 → `lv004` (2026-05-20 → 2026-05-20) overlaps (today is inside the window) → **unavailable**
   - u002 → `lv001` (2026-05-25 → 2026-06-10) overlaps → **unavailable**
   - u003 → no approved leave → available
   - u005 → `lv002` (2026-06-20 → 2026-06-25) does not overlap → available

**Expected suggestion list (top to bottom):**
`u003` (2 matches, available) · `u005` (2 matches, available).
`u002` filtered by availability (high skill, on leave); `u001` filtered by availability (today-only leave); `u004` filtered by zero skill match.

Ordering rule used: descending skill-match count, then ascending `user_id` for ties.

This scenario simultaneously exercises: skill ranking, availability cutoff, and "skilled-but-unavailable" filtering.

---

### Scenario 2 — Already-assigned + legitimate empty result

**Input task:** `t002` ("Audit Kubernetes cluster security…", due `2026-06-15`, `assignee_ids=u003`).

**Derivation**

1. In-scope: yes (todo + infra tags).
2. Required skills: `Kubernetes`, `Security`.
3. Candidate pool = p001 members **minus u003** = {u001, u002, u004, u005}.
4. Skill overlap:
   - u002 → Kubernetes, Security (2 matches)
   - u001, u004, u005 → 0 matches → drop
5. Availability vs `[2026-05-20, 2026-06-15]`:
   - u002 → `lv001` overlaps → unavailable

**Expected suggestion list:** empty.

Demonstrates two important behaviors:
- the current assignee is excluded from suggestions (you suggest *additional* helpers, not the same person)
- a genuinely empty result is a valid outcome — UI/agent must say "no candidate" rather than relaxing the filter silently

---

### Scenario 3 — No due_date → today-only availability

**Input task:** `t003` ("Plan Q3 capacity model", **no due_date**, unassigned).

**Derivation**

1. In-scope: yes.
2. Required skills (loose): `infrastructure`, planning context.
3. Candidate pool = all p001 members.
4. Availability rule with empty due_date → "no approved leave covering today (`2026-05-20`)":
   - u001 → `lv004` (2026-05-20 → 2026-05-20) **does** cover today → unavailable
   - u002 → `lv001` starts 2026-05-25 → does not cover today → available
   - others → available

**Expected suggestion list:** ranking by loose skill match, with `u001` filtered out by today-only availability.

Demonstrates the `due_date IS NULL` fallback branch of the availability rule.

---

### Scenario 4 — Highly-skilled non-member must NOT be suggested

**Input task:** `t001` (same as Scenario 1).

**The trap:** `u008` has a near-perfect skill profile (`AWS,Kubernetes,Terraform,Security`) for an AWS infrastructure review. But `u008` is **not** a row in `plan_members.csv` for `p001`.

**Expected:** `u008` must not appear in the suggestion list for any task in `p001`, regardless of skill match or availability.

Demonstrates that the candidate pool is gated by plan membership, not by skills. A separate workflow ("invite non-member to plan") is out of scope here.

---

### Scenario 5 — Non-todo and non-infra tasks excluded from the input list

The query "list infrastructure tasks needing review" must produce only `t001`, `t002`, `t003` from the reference cast — **not** `t004`, `t005`, or `t006`.

| Task  | Why excluded                                                                  |
|-------|-------------------------------------------------------------------------------|
| t004  | `status=done` — not "needs reviewing"                                         |
| t005  | `status=in progress` — already underway, not awaiting assignment              |
| t006  | `status=todo` ✓ but title/description/tags are frontend-only — not infra      |

Demonstrates the two filters at the top of the use-case query: `status=todo` **and** infra-scope by title/description/tags.

---

## 5. Edge Cases — Behavioral

Scenarios beyond the happy path that exercise branches the use-case query doesn't otherwise reach. Every row referenced below is **valid** — clean foreign keys, valid JSON, in-range priorities. Only the *combinations* are unusual.

### 5.0 Reference cast — additions

These rows extend the cast defined in Section 4. The combined cast (Sections 4 + 5) is the **final** mock dataset. Scenarios 1–5 in Section 4 were computed against Section 4 data only; with Section 5 additions layered in, three scenarios shift, and each shift is called out in the edge that introduces it:

- **Scenario 1** reshapes via `lv005` — see E1.
- **Scenario 2** reshapes via `u015`'s alias-form `k8s` skill (if the consumer applies the alias map) — see E22.
- **Scenario 5**'s input task list grows to include `t007`–`t020`; the *exclusion principles* it asserts about `t004`/`t005`/`t006` still hold.

**`users.csv` additions**

| user_id | name              | project        | role               | skills                              |
|---------|-------------------|----------------|--------------------|-------------------------------------|
| u009    | Đỗ Mỹ Linh        | SETA Internal  | PM                 | *(empty)*                           |
| u010    | Bùi Hoàng Long    | SETA Internal  | IT Engineer        | `AWS,Kubernetes,Linux,Docker`       |
| u011    | Trần Hồng Anh     | SETA Internal  | IT Engineer        | `Linux,Monitoring,Docker`           |
| u012    | Lê Quang Vinh     | *(empty)*      | Junior Developer   | `JavaScript,HTML,CSS`               |
| u013    | Đinh Thanh Mai    | SETA Internal  | *(empty)*          | `DevOps,AI`                         |
| u014    | Phạm Lan Anh      | Client Atlas   | Data Scientist     | `ML,NLP,Spark,Kafka`                |
| u015    | Lý Minh Hoàng     | SETA Internal  | Software Engineer  | `k8s,ts,postgres,OOP`               |

**`plans.csv` additions**

| plan_id | title                          | description                                                                   | tags                      | owner |
|---------|--------------------------------|-------------------------------------------------------------------------------|---------------------------|-------|
| p003    | DevOps Standalone Project      | Single-engineer infra spike covering Terraform bootstrap and CI hardening     | `infrastructure,devops`   | u010  |
| p004    | Backend Cleanup Sprint         | *(empty)*                                                                     | *(empty)*                 | u004  |
| p005    | AI Platform R&D                | Build internal AI experimentation platform with Spark + ML pipelines          | `ai,ml,spark`             | u013  |
| p006    | Orphan Plan                    | *(empty)*                                                                     | *(empty)*                 | u013  |

**`plan_members.csv` additions**

| plan_id | member_id |
|---------|-----------|
| p001    | u009      |
| p001    | u011      |
| p001    | u015      |
| p003    | u010      |
| p004    | u004      |
| p004    | u012      |
| p005    | u013      |
| p005    | u014      |

`p006` has **no rows** in `plan_members.csv` — that absence is the data for edge E18.

**`buckets.csv` additions**

| bucket_id | plan_id | name    |
|-----------|---------|---------|
| b005      | p003    | To Do   |
| b006      | p003    | Done    |
| b007      | p004    | To Do   |
| b008      | p004    | Done    |
| b009      | p005    | To Do   |
| b010      | p005    | Done    |
| b011      | p006    | To Do   |
| b012      | p006    | Done    |

**`tasks.csv` additions**

| task_id | plan_id | bucket_id | status | priority | assignee_ids                  | due_date    | title                                                | tags                                  |
|---------|---------|-----------|--------|----------|-------------------------------|-------------|------------------------------------------------------|---------------------------------------|
| t007    | p001    | b001      | todo   | 3        | *(empty)*                     | 2026-06-05  | Update operational runbook                           | `documentation,operations`            |
| t008    | p001    | b001      | todo   | 5        | *(empty)*                     | 2026-06-08  | Audit CDN cache configuration for SPA deploys        | `infrastructure,frontend,review`      |
| t009    | p001    | b001      | todo   | 1        | *(empty)*                     | 2026-05-10  | Patch CVE in nginx ingress                           | `infrastructure,security`             |
| t010    | p003    | b005      | todo   | 3        | *(empty)*                     | 2026-06-12  | Bootstrap Terraform state backend                    | `infrastructure,terraform`            |
| t011    | p001    | b001      | todo   | 1        | *(empty)*                     | 2026-05-20  | Rotate root credentials immediately                  | `infrastructure,security,urgent`      |
| t012    | p001    | b001      | todo   | 5        | `u001,u002,u003,u004,u005`    | 2026-06-30  | Quarterly infra retro                                | `infrastructure,review`               |
| t013    | p001    | b001      | todo   | 3        | *(empty)*                     | 2026-06-08  | Upgrade Kubernetes control plane                     | `infrastructure,kubernetes`           |
| t014    | p001    | b001      | todo   | 5        | *(empty)*                     | 2026-07-01  | Modernize legacy mainframe COBOL batch jobs          | `infrastructure,legacy`               |
| t015    | p001    | b001      | todo   | 5        | *(empty)*                     | 2026-06-20  | *(empty)*                                            | *(empty)*                             |
| t016    | p001    | b001      | todo   | 5        | *(empty)*                     | 2026-07-15  | Investigate and document the root cause of the intermittent 502 errors observed during the morning peak traffic window in the production payment gateway and propose a remediation plan covering load balancing strategy | `infrastructure,reliability`          |
| t017    | p001    | b001      | todo   | 3        | *(empty)*                     | 2026-06-18  | Setup k8s monitoring stack                           | `kubernetes,monitoring`               |
| t018    | p005    | b009      | todo   | 3        | *(empty)*                     | 2026-06-30  | Set up Spark cluster for ML pipelines                | `ai,spark,ml,nlp`                     |
| t019    | p006    | b011      | todo   | 5        | *(empty)*                     | 2026-06-25  | Define DevOps roadmap                                | *(empty)*                             |
| t020    | p004    | b007      | todo   | 5        | *(empty)*                     | 2026-06-22  | Reduce build flakiness                               | *(empty)*                             |

**Task description specifics**

- `t007.description`: *"Document the steps to rotate IAM credentials and refresh Kubernetes secrets across the AWS production cluster."* — infra signal lives only here.
- `t015.description`: *"Check AWS production cluster cost report and identify optimization candidates."* — title and tags are empty; description is the only scope signal.
- `t018.description`: *"Provision Spark for the ML team's NLP pipelines; coordinate with u014 on cluster sizing."* — exercises narrow-scope skill matching (Spark, NLP).
- `t020.description`: *"Reduce CI build flakiness in the backend repos; root-cause the intermittent test failures."* — non-infra task inside a sparse-data plan.

**`timesheet.csv` additions**

| leave_id | employee_id | start_date  | end_date    | type     | status   |
|----------|-------------|-------------|-------------|----------|----------|
| lv005    | u003        | 2026-06-02  | 2026-06-02  | personal | approved |
| lv006    | u011        | 2026-05-20  | 2026-05-22  | sick     | approved |
| lv007    | u002        | 2026-05-28  | 2026-06-02  | personal | pending  |
| lv008    | u005        | 2026-05-22  | 2026-05-23  | sick     | pending  |
| lv009    | u014        | 2026-06-15  | 2026-06-25  | annual   | approved |
| lv010    | u012        | 2026-05-10  | 2026-05-15  | sick     | approved |
| lv011    | u013        | 2026-07-01  | 2026-07-05  | personal | rejected |

---

### 5.1 Availability boundaries

**E1. Leave ends exactly on a task's due_date (inclusive overlap).**
`lv005` covers `u003` on `2026-06-02` only. `t001.due_date = 2026-06-02`. Per the rule (`start_date <= due_date AND end_date >= today`), this overlaps. `u003` becomes unavailable for `t001`.

*Cross-check with Scenario 1:* the Section 4 baseline list was `u003, u005`. With `lv005` active (full dataset), `u003` drops out — leaving `u005` as the sole suggestion for `t001`. Verifies that the boundary day is treated as inclusive on the upper end.

**E2. Leave starts exactly on today.**
`lv006` covers `u011` from `2026-05-20` (today) to `2026-05-22`. For any task with `due_date >= today`, `u011` is unavailable. Demonstrates the lower boundary of the availability window.

**E3. Approved and pending leaves overlapping the same window.**
`u002` has `lv001` (approved, 2026-05-25 → 2026-06-10) and `lv007` (pending, 2026-05-28 → 2026-06-02). Only the approved entry filters; the pending entry is informational. `u002` remains unavailable, but the reason is `lv001`, not `lv007`. Removing `lv001` would make `u002` available again even with `lv007` still present.

---

### 5.2 Saturation

**E4. Single-member plan.**
`p003` has one member (`u010`) who is also the owner. For `t010`, the candidate pool size is exactly 1. If `u010` lacks a required skill or is on leave, the suggestion list is empty. The query must degrade gracefully — "single suggestion or empty" is a valid shape, not an error.

**E5. Fully-saturated assignment.**
`t012.assignee_ids = u001,u002,u003,u004,u005` covers every member of `p001` who has any skill. After excluding existing assignees, the candidate pool is empty (only `u009` and `u011` remain in `p001`; `u009` has empty skills, `u011`'s skills may or may not match). For most skill sets the suggestion list is empty even though the task is `status=todo`. Demonstrates: a `todo` task with no assignment headroom.

**E6. All capable members unavailable.**
`t013` requires `Kubernetes`. In `p001`, only `u002` and `u003` have Kubernetes. For `t013.due_date = 2026-06-08`, the window is `[2026-05-20, 2026-06-08]`:
- `u002` → `lv001` overlaps → unavailable
- `u003` → `lv005` (2026-06-02) overlaps → unavailable

Suggestion list is empty — but for an availability reason, not a capability reason. Contrast with E10.

---

### 5.3 Skill-deduction surface

**E7. Infra signal in description only.**
`t007` title is generic ("Update operational runbook"). Tags are `documentation,operations` with no `infrastructure` tag. The description carries the signal: *"…rotate IAM credentials and refresh Kubernetes secrets across the AWS production cluster."* Required skills must be deduced from description text: `AWS, Kubernetes, Security`. Exercises the description-reading branch of scope deduction.

**E8. Mixed-scope task.**
`t008` tags = `infrastructure,frontend,review`. Title mentions CDN cache and SPA deploys — both infra (CDN/CloudFront) and frontend (SPA build) concerns. The task must appear in the infra list (because `infrastructure` is in tags), and required-skill deduction should include both worlds. Candidate ranking is then dominated by whichever world has more members with matching skills — in this cast, infra wins because no `p001` member has frontend skills.

**E9. User with empty skills.**
`u009` has `skills=""`. She is a member of `p001`. Regardless of availability, she must never appear in any suggestion list. Empty skills = zero overlap by definition. Demonstrates: membership alone is not enough; skills are a hard pre-filter.

**E10. Zero skill overlap across all users.**
`t014` requires `Mainframe COBOL` (deduced from "legacy mainframe COBOL batch jobs"). No user in any plan has that skill. The suggestion list is empty, and the *reason* is missing capability — not availability, not saturation. The consumer should be able to distinguish these three empty-list reasons.

---

### 5.4 Determinism / tie-breaking

**E11. Tied candidates.**
Scenario 1 already produces a tie: `u003` and `u005` both have 2 skill matches and are both available. The expected ordering rule is **ascending `user_id`** → `u003` before `u005`. No new data required; the rule applies to any tie.

**E12. Tied input tasks.**
The "needs review" list will contain multiple tasks with the same `priority` and `due_date` (e.g. several at `priority=5`). The expected ordering rule is **ascending `task_id`**. No new data required.

These are not data constraints — they are query-side determinism contracts that the mock dataset naturally exercises because of how the cast is laid out.

---

### 5.5 Due-date corners

**E13. `due_date = today`.**
`t011.due_date = 2026-05-20`. The availability window collapses to `[today, today]`. Only leaves covering today filter: `u001` (`lv004`), `u011` (`lv006`). Leaves starting tomorrow do not affect this task. Required skills for `t011` (from tag `security` + title) → `Security`. Only `u002` has Security among `p001` members; `u002`'s leave `lv001` starts 2026-05-25, not today, so `u002` is available. Expected: `u002` is the sole suggestion.

**E14. Overdue task.**
`t009.due_date = 2026-05-10` — already in the past. The window `[2026-05-20, 2026-05-10]` is inverted/empty. The rule degrades to the same fallback as an empty due_date: **today-only availability**. The task is still listed (status is `todo`); the consumer is expected to surface the overdue indication separately (e.g., a UI badge), which is outside the schema's responsibility.

---

### 5.6 Sparse / missing fields

Real-world rows often have empty optional fields. Of these, **empty task tags is the common case** — the bulk of volume-fill tasks should have `tags=""`. The dataset must not lean on tags as a required signal.

**E15. Empty `project` on user.**
`u012.project = ""`. Project is informational and never read by the matching query; the empty value must not break any join or render path.

**E16. Empty `role` on user.**
`u013.role = ""`. Same character as E15 — informational only.

**E17. Empty `description` and `tags` on plan.**
`p004` has both empty. Tasks inside `p004` lose all plan-level scope hints; scope deduction for those tasks must rely entirely on task-level signals (title, description, task tags).

**E18. Plan with zero members.**
`p006` has no rows in `plan_members.csv`. A `todo` task in `p006` (e.g. `t019`) returns an empty candidate pool *before* skill or availability filters apply. Empty-result reason is "plan has no members" — distinguishable from E5 (saturation), E6 (all unavailable), and E10 (no skill).

**E19. Empty `title` on task.**
`t015.title = ""` and `t015.tags = ""`. `description` (`"Check AWS production cluster cost report and identify optimization candidates."`) is the only scope signal. Demonstrates: scope deduction must never rely solely on title.

**E20. Empty `tags` is the common case.**
`t015`, `t019`, `t020` all have `tags = ""`. So should the majority of volume-fill tasks. Tags must not be treated as a required input for any matching step — they are a *hint*, not a contract.

---

### 5.7 Skill vocabulary variance

Skills cluster at very different granularities, and the same concept often appears under multiple names.

**E21. Skill scope: broad ↔ narrow.**
- Broad: `u013.skills = "DevOps,AI"` — umbrella terms covering many capabilities.
- Narrow: `u014.skills = "ML,NLP,Spark,Kafka"` — precise tools and disciplines.

Default matching is **literal token comparison after case-folding** — "DevOps" does not implicitly expand to "Kubernetes" or "Terraform"; "AI" does not implicitly match "ML". If the consumer wants hierarchical expansion, it must declare the rule explicitly. The mock data exposes the trade-off — a "DevOps" engineer is not suggested for a task needing "Linux" unless the consumer expands umbrellas.

`t018` (in `p005`) requires `Spark, ML, NLP` (from tags + title). `p005` members:
- `u013` (`DevOps,AI` — 0 literal matches). No `approved` leave (`lv011` is rejected) → available.
- `u014` (`ML,NLP,Spark,Kafka` — 3 literal matches). `lv009` (approved, 2026-06-15 → 2026-06-25) overlaps `[2026-05-20, 2026-06-30]` → unavailable.

Expected result under default (literal) matching: **empty** — the 3-match candidate is on leave, the available candidate has 0 matches. If the consumer expands `AI → ML` (umbrella → narrow), `u013` becomes a 1-match available candidate. Same trade-off as E22.

**E22. Skill aliases / synonyms.**
`u015.skills = "k8s,ts,postgres,OOP"`. Recommended alias map (consumer-owned; extensible):

| Alias    | Canonical    |
|----------|--------------|
| k8s      | Kubernetes   |
| ts       | TypeScript   |
| postgres | PostgreSQL   |
| js       | JavaScript   |

`t017.title = "Setup k8s monitoring stack"`, `tags = "kubernetes,monitoring"` — the same concept appears in both alias and canonical form within one row. After normalization, required skills are `{Kubernetes, Monitoring}`.

*Cross-check with Scenario 2:* with alias normalization on, `u015` becomes a 1-match candidate for `t002` (Kubernetes after `k8s → Kubernetes`); `u015` has no leave entries → available; expected list shifts from empty (Section 4 baseline) to `u015`. Without normalization, Scenario 2's empty result still holds. The consumer must declare its stance, and the data exercises both stances simultaneously.

---

### 5.8 Title length variance

Task titles range from absent to multi-clause sentences. The dataset spans the full range.

**E23. Title length spread.**
- Empty: `t015` (covered in E19).
- Short: `t017.title = "Setup k8s monitoring stack"` (4 words).
- Medium: most tasks `t001`–`t014`.
- Long: `t016.title` — a full-sentence problem statement of 35+ words: *"Investigate and document the root cause of the intermittent 502 errors observed during the morning peak traffic window in the production payment gateway and propose a remediation plan covering load balancing strategy."*

Scope deduction must scale from minimal to verbose input without truncation and without changing the matching rules. Keyword extraction from `t016`'s title alone surfaces `production`, `payment gateway`, `load balancing`, `remediation` — none of which are canonical skill names. The infra signal comes from tags (`infrastructure,reliability`); the title is helpful but not sufficient alone.

---

### 5.9 Timesheet status mix

The dataset contains all three leave statuses; only `approved` filters availability.

**E24. Pending leave overlapping an active window.**
`lv008` (`u005`, 2026-05-22 → 2026-05-23, **pending**) overlaps the window of any task whose `due_date >= 2026-05-22` but does **not** filter `u005`. The consumer must gate on `status='approved'` before applying the overlap test — never on "any leave entry".

**E25. Rejected leave.**
`lv011` (`u013`, 2026-07-01 → 2026-07-05, **rejected**) is present in the dataset and ignored by the availability rule. Less common in practice than pending but a valid third status.

**E26. Past approved leave.**
`lv010` (`u012`, 2026-05-10 → 2026-05-15, **approved**, both dates before today) does not filter — the overlap test fails on `end_date >= today` (`2026-05-15 < 2026-05-20`). Demonstrates that "`approved`" alone is insufficient; the temporal overlap check is the real gate.

---

## 6. Mock-Data Volume Guidelines

Sized for a ~300-person org. The named cast from Sections 4 and 5 (`u001`–`u015`, `p001`–`p006`, `t001`–`t020`, `lv001`–`lv011`) stays exactly as written — those rows are the scenario anchors. Everything else is volume fill that follows the same shape and the rules below.

| Table          | Rows                                                                 |
|----------------|----------------------------------------------------------------------|
| `users`        | **~300** — covering all 11 roles from `SCHEMA.md`, mixing broad-scope skills (DevOps, AI, Frontend), narrow technical ones (Spark, Kafka, NLP, ML, OOP), and a meaningful share of alias-form spellings (`k8s`, `ts`, `postgres`) |
| `plans`        | **~50** — at least **3–5** infrastructure-focused plans, **one** zero-member orphan plan, several sparse-fields plans, the rest non-infra for contrast |
| `plan_members` | **~1,500–2,500 rows** — most plans have 15–40 members; many users belong to multiple plans (average ~6 plans/user); at least one plan deliberately has zero |
| `buckets`      | 3–4 per plan → **~150–200 total** (e.g. `To Do`, `In Progress`, `Done` — names vary)      |
| `tasks`        | **~600** — at least **80** with `status='todo'` that are clearly infra-scoped; the rest a mix of statuses, plans, and topics. Title length spans from empty/short placeholders to multi-clause sentences |
| `timesheet`    | **~400 leave entries** — mix of past, current, and future windows; ~70% `approved`, ~25% `pending`, ~5% `rejected` |

Cardinality rules of thumb for the infra-scoped todo tasks:

- At least **30** should have **no** current assignee (`assignee_ids=""`).
- At least **30** should have a `due_date` within the next 30 days.
- Required skills across the set should collectively span: AWS, Kubernetes, Terraform, Linux, Monitoring, Security, Docker, Spark, NLP, ML — so different tasks attract different candidates.
- At least **5** infra-skilled users must have an `approved` leave entry overlapping `[2026-05-20, 2026-06-30]` so the availability filter is exercised at scale.
- At least **15** infra-skilled users must remain available across the same window so the suggestion lists are non-trivial.

Field-sparsity rules of thumb across all tasks:

- **~60% of tasks should have `tags=""`** (~360 of ~600) — empty tags is the common case in real data; the dataset must reflect that.
- ~20% of tasks should have very short titles (≤ 3 words) or empty (~120 of ~600).
- ~10% of tasks should have long, sentence-form titles (~60 of ~600).
- ~30% of plans should have `description=""`; ~40% should have `tags=""`.
- ~15% of users should have at least one of `project` / `role` empty (~45 of ~300).
- ~5% of users should have `skills=""` (~15 of ~300) — these never appear as candidates.
- ~10% of users should use alias-form skills (`k8s`, `ts`, `postgres`, etc.) so the alias map is exercised broadly, not just by `u015`.

---

## 7. Out of Scope

Explicitly *not* in this schema:

- Multi-tenant columns (`tenant_id`) — single implicit tenant for mock purposes.
- Soft-delete columns (`soft_deleted_at`) — mock data represents one consistent snapshot.
- Sync/audit columns (`synced_at`, ETags) — no sync layer here.
- Comments thread structure beyond a flat list — no replies, no reactions.
- Attachment storage — `url` field is illustrative; no actual file hosting assumed.
- Assignment history — only the current `assignee_ids` is stored, no audit trail of past assignees.

---

## 8. Relationship to `SCHEMA.md`

| `SCHEMA.md` (Graph-shaped)           | This schema (simplified)        | Notes                                                                 |
|---------------------------------------|---------------------------------|-----------------------------------------------------------------------|
| `directory_users` + `raw.skills[]`    | `users` with `skills` string    | Comma-string instead of JSON array; same skill vocabulary             |
| `planner_plans_cache`                 | `plans`                         | Drops `owner_group_id` (no group concept here); keeps single `owner`  |
| `plan_members`                        | `plan_members`                  | Same shape, simpler ID format                                         |
| `planner_buckets_cache`               | `buckets`                       | Drops `order_hint`, `etag`                                            |
| `planner_tasks_cache` + `_details`    | `tasks` (single table)          | Merges summary + details; `assignee_ids` is comma-string not array    |
| *(no equivalent)*                     | `timesheet`                     | New table — `SCHEMA.md` has no leave model                            |

Use `SCHEMA.md` when modeling integration with the real MS Graph connector. Use this document when prototyping assignment heuristics, prompts, or UI mocks against a small readable dataset.
