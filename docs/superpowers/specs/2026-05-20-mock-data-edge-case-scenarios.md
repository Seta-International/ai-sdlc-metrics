# Mock Data — Edge-Case Scenarios

**Purpose.** Companion to [`2026-05-20-mock-data-schema-design.md`](./2026-05-20-mock-data-schema-design.md). That spec's §5 catalogs 26 edges (E1–E26) with a short justification each. This document is the worked playbook — every edge becomes a concrete scenario aimed at the **consumer implementer**: whoever writes the matching query, the generator test, or the agent-tool that answers *"who should review this infrastructure task?"*

**Reference date:** `2026-05-20`. Every row referenced below lives in the schema-design spec §4 (named cast) or §5.0 (cast additions). No new fixtures are invented here.

**Related reading.** The agent-layer perspective on the same matching problem (LLM rationale, embedding cold-start, MCP downtime) lives in [`finding-staff-for-a-task.md`](./finding-staff-for-a-task.md) §7. This doc stops at the dataset boundary; the agent doc starts where the dataset ends.

---

## How to read this doc

Each edge follows the same shape:

- **Scenario** — 1–3 sentences naming the situation by row ID.
- **Reference rows** — only the rows this edge touches; the full cast lives in the schema spec.
- **Execution trace** — a five-column table walking the use-case query (Scope → Candidate pool → Skill rank → Availability → Output). Steps an edge does not exercise are omitted.
- **Expected suggestion list** — one line, the final answer.

### Trace columns

| Column | Meaning |
|--------|---------|
| **Step** | The named step from schema spec §3 "Use-Case Walkthrough" or a sub-step where the edge fires. |
| **Inputs** | The concrete fields and values feeding this step. |
| **Result** | What the step produces against the dataset. |
| **Expected** | What a correct consumer should output at this step. Usually identical to Result; differs when the edge depends on a consumer-side choice (e.g., alias normalization on/off) — both branches are shown. |
| **Failure mode if mishandled** | The concrete query-side bug a consumer is likely to introduce — what to grep for in a review. |

### Conventions

- "Today" is `2026-05-20`.
- p001 (Infrastructure Review Q2 2026) member set after §5.0 additions: `{u001, u002, u003, u004, u005, u009, u011, u015}`. **u008 is deliberately not a member.**
- Skill-rank ordering rule: descending intersection size, then ascending `user_id`.
- Task ordering rule: ascending `priority` (1=urgent first), then ascending `task_id`.
- Availability rule: an `approved` leave overlapping `[today, task.due_date]` filters; pending and rejected leaves never filter. Overlap is `start_date <= due_date AND end_date >= today`, **both bounds inclusive**. Empty `due_date` → today-only.

---

## §1. Availability boundaries

### E1. Leave ends exactly on a task's `due_date` (inclusive overlap)

**Scenario.** `u003` has a single-day approved leave `lv005` covering only `2026-06-02`. Task `t001` is due `2026-06-02` and unassigned. The overlap rule treats both bounds as inclusive — `u003` becomes unavailable for `t001`.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u003` | skills = `AWS,Kubernetes,Linux,Docker`; member of p001 |
| tasks | `t001` | status=todo, assignee=∅, due=`2026-06-02`, tags=`infrastructure,aws,cost,review` |
| timesheet | `lv005` | `u003`, `2026-06-02 → 2026-06-02`, personal, **approved** |
| timesheet | `lv001` | `u002`, `2026-05-25 → 2026-06-10`, annual, approved |
| timesheet | `lv004` | `u001`, `2026-05-20 → 2026-05-20`, personal, approved |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope filter | `t001.status=todo`, tags include `infrastructure,aws` | in scope | t001 listed | — |
| Candidate pool | p001 members minus assignees (∅) | `{u001,u002,u003,u004,u005,u009,u011,u015}` | 8 candidates | Including `u008` because skill-first heuristic short-circuited the membership join |
| Skill rank | required = `{AWS, Linux, Monitoring, Security}` (tags + title) | u002:4, u003:2, u005:2, u001:1, others:0 | u002 ≻ u003 = u005 ≻ u001 | Counting only tag-derived skills and missing `Monitoring`/`Security` from the use-case-walkthrough deduction |
| Availability | window = `[2026-05-20, 2026-06-02]`; overlap = `start ≤ due AND end ≥ today` | u001 out (lv004), u002 out (lv001), **u003 out (lv005: 06-02 ≤ 06-02 ✓ AND 06-02 ≥ 05-20 ✓)**, u005 in | same | Using `start < due AND end > today` (strict) keeps u003 in — boundary day silently treated as exclusive |
| Output | skill-ranked survivors | `[u005]` | `[u005]` | Output `[u003, u005]` — leaks the boundary-day bug |

**Expected suggestion list:** `[u005]` (sole survivor — 2 matches, available).

> **Cross-ref.** Without `lv005`, this is the Scenario 1 baseline `[u003, u005]`. E1 is the one new datapoint that reshapes Scenario 1's output.

---

### E2. Leave starts exactly on today

**Scenario.** `u011` has approved leave `lv006` covering `2026-05-20 → 2026-05-22`. Today is `2026-05-20`. For any task whose `due_date ≥ today`, `u011` is unavailable.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u011` | skills = `Linux,Monitoring,Docker`; member of p001 |
| tasks | `t017` | status=todo, assignee=∅, due=`2026-06-18`, tags=`kubernetes,monitoring`, title="Setup k8s monitoring stack" |
| timesheet | `lv006` | `u011`, `2026-05-20 → 2026-05-22`, sick, **approved** |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Skill rank | required = `{Kubernetes, Monitoring}` (literal) | u011: `Monitoring` (1 match) | u011 ranked | — |
| Availability | window = `[2026-05-20, 2026-06-18]`; lv006 starts `2026-05-20` (= today) | `start_date=2026-05-20 ≤ 2026-06-18` ✓ AND `end_date=2026-05-22 ≥ 2026-05-20` ✓ → u011 out | u011 out | Using `start > today` (strict lower bound) keeps u011 in — first day of leave treated as still-available |

**Expected:** `u011` is filtered out of every task whose window includes today.

---

### E3. Approved + pending leaves overlap the same window

**Scenario.** `u002` has two leaves touching the same period — `lv001` (approved) and `lv007` (pending). Only the approved entry filters; the pending entry is informational. Removing `lv001` would make `u002` available again *even with `lv007` still present*.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| timesheet | `lv001` | `u002`, `2026-05-25 → 2026-06-10`, annual, **approved** |
| timesheet | `lv007` | `u002`, `2026-05-28 → 2026-06-02`, personal, **pending** |
| tasks | `t001` | due=`2026-06-02` |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Availability | filter `WHERE status = 'approved'` before overlap test | u002 unavailable via lv001 alone | u002 unavailable; reason = lv001 | Filtering on "any leave row exists in window" — lv007 wrongly contributes to the decision |
| Reason surfacing | rationale should name lv001, not lv007 | lv001 (approved) | lv001 | Naming both lv001 and lv007 inflates the perceived availability conflict |

**Expected:** `u002` unavailable for `t001`; the *reason* is `lv001`, never `lv007`.

---

## §2. Saturation

### E4. Single-member plan, no skill match

**Scenario.** `p003` (DevOps Standalone Project) has exactly one member, `u010`, who is also the owner. Task `t010` requires Terraform. `u010` does not have Terraform. Pool size is 1; result is empty.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u010` | skills = `AWS,Kubernetes,Linux,Docker` |
| plan_members | (p003) | `{u010}` |
| tasks | `t010` | status=todo, due=`2026-06-12`, tags=`infrastructure,terraform`, title="Bootstrap Terraform state backend" |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Candidate pool | p003 members | `{u010}` | 1 candidate | — |
| Skill rank | required = `{Terraform}` | u010: 0 matches | dropped | Counting `Docker` or `AWS` as a Terraform-adjacent match (no umbrella expansion configured) |
| Output | skill-filtered survivors | ∅ | `[]` | Returning u010 with rationale "broad infra background" — invents signal |

**Expected:** empty list. The consumer must surface "no candidate" (reason: pool=1 + zero skill match), not silently relax the skill filter.

---

### E5. Fully-saturated assignment

**Scenario.** `t012` ("Quarterly infra retro") has `assignee_ids = u001,u002,u003,u004,u005` — every member of p001 with non-trivial skills. After excluding existing assignees, only `{u009, u011, u015}` remain. `u009` has empty skills; `u011` and `u015` have at most loose overlap with broad infra. Most skill sets produce an empty list.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t012` | status=todo, assignees=`u001,u002,u003,u004,u005`, tags=`infrastructure,review` |
| users | `u009` | skills = `""` |
| users | `u011` | skills = `Linux,Monitoring,Docker` |
| users | `u015` | skills = `k8s,ts,postgres,OOP` |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Candidate pool | p001 members minus assignees | `{u009, u011, u015}` | 3 candidates | Forgetting the `MINUS assignees` step — u002, u003 etc. re-suggested for the task they're already on |
| Skill rank | required = broad `{infrastructure, review}` umbrella | u009: 0; u011: maybe 1 (`Linux`); u015: 0 literal (1 under alias mode) | mostly ∅ | — |
| Output | survivors | ∅ or `[u011]` depending on stance | `[]` (literal) | Returning the assignees themselves — task is `todo` so they look like work |

**Expected:** empty under literal matching. Distinguishable empty-result reason: **saturation** (pool was non-empty before skill filter, but every strong candidate is already on the task).

---

### E6. All capable members unavailable

**Scenario.** `t013` (Upgrade Kubernetes control plane) requires `Kubernetes`. In p001 the only members with Kubernetes are `u002` and `u003`. Both have approved leaves overlapping `[2026-05-20, 2026-06-08]`. Result is empty — but for an **availability** reason, not a capability reason.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t013` | status=todo, due=`2026-06-08`, tags=`infrastructure,kubernetes` |
| users | `u002` | skills include `Kubernetes` |
| users | `u003` | skills include `Kubernetes` |
| timesheet | `lv001` | u002, 2026-05-25 → 2026-06-10, approved |
| timesheet | `lv005` | u003, 2026-06-02 → 2026-06-02, approved |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Skill rank | required = `{Kubernetes}` (literal) | u002:1, u003:1 | both ranked | Under alias mode u015 (`k8s`) would also rank — see E22 |
| Availability | window = `[2026-05-20, 2026-06-08]` | u002 out (lv001), u003 out (lv005) | both out | — |
| Output | survivors | ∅ | `[]` | Collapsing the "no-skill" and "all-unavailable" empty-list reasons into a single message — user can't tell whether to wait or to widen scope |

**Expected:** empty list. **Reason = availability**, distinguished from E5 (saturation), E10 (no skill), E18 (no members).

---

## §3. Skill-deduction surface

### E7. Infra signal in description only

**Scenario.** `t007` has a generic title ("Update operational runbook") and non-infra tags (`documentation,operations`). The infra signal lives only in the description: *"Document the steps to rotate IAM credentials and refresh Kubernetes secrets across the AWS production cluster."* Required skills must be deduced from description text.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t007` | status=todo, due=`2026-06-05`, tags=`documentation,operations`, description includes "IAM credentials", "Kubernetes secrets", "AWS production cluster" |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope filter | tag-only match against `infrastructure*` | **t007 excluded** | t007 **included** (description scan) | Scope filter looks at tags only — t007 silently dropped from "needs review" list despite carrying clear infra signal |
| Skill deduction | description tokens → `{AWS, Kubernetes, Security}` (IAM ≈ Security) | required = `{AWS, Kubernetes, Security}` | same | Using tags as the only deduction source — required set is `{documentation, operations}`, no candidate scores >0 |
| Skill rank | p001 candidates | u002:3, u003:2, u001:1, u005:1, u015:0 literal (1 alias) | u002 ≻ u003 ≻ u001 = u005 | — |
| Availability | window `[2026-05-20, 2026-06-05]` | u001 out (lv004), u002 out (lv001), u003 out (lv005), u005 in | u005 in | — |
| Output | ranked survivors | `[u005]` | `[u005]` | Empty list — because scope filter or skill deduction dropped the task |

**Expected:** `[u005]`. The doc-level lesson: **scope deduction must read all three of title, description, tags.**

---

### E8. Mixed-scope task (infra + frontend)

**Scenario.** `t008` has tags `infrastructure,frontend,review` and title "Audit CDN cache configuration for SPA deploys" — both worlds. The task must appear in the infra list because `infrastructure` is in tags. Required-skill deduction should include both worlds; candidate ranking is dominated by whichever world has members with matching skills (infra wins in p001).

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t008` | status=todo, due=`2026-06-08`, tags=`infrastructure,frontend,review`, title mentions CDN, SPA |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope filter | any of {`infrastructure`} present | in scope | in scope | "Pure infra only" rule (`tags = {infrastructure,*infra*}`) drops t008 — false-negative |
| Skill deduction | tokens span `{AWS, CloudFront, SPA, frontend-build}` | required deduced | same | Picking only the *first* tag's domain — frontend skills missed (or vice versa) |
| Skill rank | p001 candidates | u002:1+, u003:1, u005:1 on AWS-side; nobody scores on SPA-side | infra-side ranks | Treating mixed-scope as "ambiguous" and returning ∅ — invents an "uncertain" branch the schema does not specify |
| Availability | window `[2026-05-20, 2026-06-08]` | u002 out, u003 out, u005 in | u005 in | — |
| Output | survivors | `[u005]` | `[u005]` | — |

**Expected:** `[u005]`. The mixed-scope task is **not** a reason to exclude.

---

### E9. User with empty skills is never a candidate

**Scenario.** `u009` has `skills = ""`. She is a member of p001. Regardless of plan membership, role, or availability, she must never appear in any suggestion list — empty skills means zero intersection by definition.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u009` | role=`PM`, skills=`""`, member of p001 |
| tasks | `t001` | (any p001 todo task) |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Candidate pool | p001 members | u009 included in pool | u009 in pool | — |
| Skill rank | required = any non-empty set; u009.skills.split(",") = `[""]` | intersection size = 0 | u009 dropped | Treating `skills=""` as "unknown — query elsewhere" or as a wildcard match (1.0 score) — u009 wrongly top-ranked |
| Output | survivors | u009 not present | u009 not present | — |

**Expected:** `u009` appears in zero suggestion lists across the entire dataset. **Membership alone is not enough; skills are a hard pre-filter.**

---

### E10. Zero skill overlap across all users

**Scenario.** `t014` ("Modernize legacy mainframe COBOL batch jobs") requires `Mainframe COBOL` and adjacent legacy-migration skills. No user in any plan has these. Suggestion list is empty, and the *reason* is **missing capability** — not availability (E6), not saturation (E5), not membership (E18).

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t014` | status=todo, due=`2026-07-01`, tags=`infrastructure,legacy`, title mentions COBOL, mainframe |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Skill deduction | tokens → `{COBOL, Mainframe, legacy-migration}` | required = niche set | same | Downgrading to "infrastructure" only — every infra-skilled user wrongly ranks |
| Skill rank | p001 members vs `{COBOL, Mainframe, ...}` | all zero | ∅ | — |
| Output | survivors | ∅ | `[]` with reason="no capable candidate" | Returning the AWS-strongest user with rationale "closest infra match" — invents a relaxation step the schema does not specify |

**Expected:** empty list. **The consumer should be able to distinguish four empty-list reasons** — no skill (E10), all unavailable (E6), saturation (E5), no members (E18).

---

## §4. Determinism / tie-breaking

### E11. Tied candidates

**Scenario.** Two candidates have the same skill-match count and both pass availability. The expected ordering rule is **ascending `user_id`**. Scenario 1's baseline (without `lv005` from §5.0) already produces this tie: `u003` and `u005` both at 2 matches, both available → `[u003, u005]`.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| (Schema spec §4 Scenario 1 baseline; no new rows.) | | |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Skill rank | required `{AWS, Linux, Monitoring, Security}`; u003:2, u005:2 | tie at 2 | tie | — |
| Tie-break | ordering rule | `u003` (lex first) before `u005` | `[u003, u005]` | Insertion-order, hash-iteration-order, or "first matched" ordering — output non-deterministic across runs / databases |
| Output | tied list | `[u003, u005]` | `[u003, u005]` | Picking only one of the tied candidates — drops valid information silently |

**Expected:** ascending `user_id` for ties. **Stable across runs is the contract; any unstable ordering is the bug.**

---

### E12. Tied input tasks

**Scenario.** The "needs review" list will contain multiple tasks with identical `priority` and `due_date`. Among p001 todo+infra: `t012`, `t014`, `t015`, `t016` all share `priority=5`; some share `due_date`. Ordering rule is **ascending `priority`, then ascending `task_id`**.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t001` | priority=1, due=2026-06-02 |
| tasks | `t009` | priority=1, due=2026-05-10 |
| tasks | `t011` | priority=1, due=2026-05-20 |
| tasks | `t003`, `t008`, `t012`, `t014`, `t015`, `t016` | priority=5 (varying due dates) |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Task ordering | sort `(priority ASC, task_id ASC)` | t001, t009, t011 before all priority-5 tasks; within priority=5, t003 ≺ t008 ≺ t012 ≺ t014 ≺ t015 ≺ t016 | stable | Sorting by `due_date` only — overdue (t009) and "today" (t011) bury under far-future tasks |
| | | | | Sorting by insertion order — output drifts between runs |

**Expected:** stable, deterministic input ordering. Tied tasks resolved by `task_id`.

---

## §5. Due-date corners

### E13. `due_date = today`

**Scenario.** `t011` ("Rotate root credentials immediately") is due `2026-05-20` — today. The availability window collapses to `[today, today]`. Only leaves covering today filter. Required skill: `Security`.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t011` | status=todo, priority=1, due=`2026-05-20`, tags=`infrastructure,security,urgent` |
| users | `u002` | skills include `Security` |
| timesheet | `lv001` | u002, 2026-05-25 → 2026-06-10, approved |
| timesheet | `lv004` | u001, 2026-05-20 → 2026-05-20, approved |
| timesheet | `lv006` | u011, 2026-05-20 → 2026-05-22, approved |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Skill rank | required = `{Security}` | u002:1, others:0 (u008 has Security but not p001 member — see E18 / Scenario 4) | u002 ranked | — |
| Availability | window = `[2026-05-20, 2026-05-20]` | u002 lv001 starts 2026-05-25 → no overlap → in | u002 in | Implementing the window as `start ≤ due AND start ≥ today` (point-equal-to-today required) — leaves that *start tomorrow* wrongly filter |
| Output | survivors | `[u002]` | `[u002]` | — |

**Expected:** `[u002]`. **A leave starting tomorrow does not filter a task due today.**

---

### E14. Overdue task

**Scenario.** `t009` ("Patch CVE in nginx ingress") is due `2026-05-10` — already in the past. The window `[2026-05-20, 2026-05-10]` is inverted. The rule degrades to the same fallback as an empty `due_date`: **today-only availability**.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t009` | status=todo, priority=1, due=`2026-05-10`, tags=`infrastructure,security` |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope filter | status=todo → still listed | t009 in scope | t009 listed | Filtering on `due_date >= today` to define "active" — overdue tasks silently disappear from the very list that exists to surface them |
| Availability | inverted window → degrade to today-only | u002 in (lv001 not today), u001 out (lv004 = today), u011 out (lv006 includes today) | survivors | Computing on the inverted window literally — `start ≤ 2026-05-10 AND end ≥ 2026-05-20` yields no overlaps ever; everyone available; lv004 missed |
| Output | survivors with Security | `[u002]` | `[u002]` | — |
| UI/agent | display | overdue indicator surfaced separately | flagged | The schema is silent on UI badges; treating overdue as a *filter* (drop from list) is a UI bug masquerading as a query rule |

**Expected:** `[u002]`. **Overdue ≠ excluded; overdue → today-only availability fallback.**

---

## §6. Sparse / missing fields

### E15. Empty `project` on user

**Scenario.** `u012.project = ""`. Project is purely informational — never read by the matching query and never the basis of a join. The empty value must not break any join or render path.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u012` | project=`""`, role=`Junior Developer`, skills=`JavaScript,HTML,CSS`, member of p004 |
| tasks | `t020` | p004, status=todo, due=`2026-06-22`, title="Reduce build flakiness" |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Candidate render | join users → suggestion row | u012's row materializes with project=`""` | renders cleanly | `JOIN ON users.project IS NOT NULL` (or equivalent rendering guard) drops u012 from candidate lists entirely |
| Scope filter | (independent of project) | unchanged | unchanged | Treating empty project as "external contractor" and filtering — invents a category the schema does not define |

**Expected:** empty `project` is silent in the matching layer. **Project is read by people, not by the query.**

---

### E16. Empty `role` on user

**Scenario.** `u013.role = ""`. Same character as E15 — informational only. Skills (`DevOps,AI`) carry the matching signal.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u013` | role=`""`, skills=`DevOps,AI`, member of p005 |
| tasks | `t018` | p005, status=todo, tags=`ai,spark,ml,nlp` |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Candidate pool | p005 members | `{u013, u014}` | both in pool | Filtering on `role != ''` to "skip stub users" — u013 silently dropped |
| Skill rank | required `{Spark, ML, NLP}`; u013 literal=0, alias-umbrella=1 | u013: 0 (literal) | drop (literal) | — |
| Rationale | the rationale should not say "role: PM" or any guess | role rendered as `""` or "—" | empty | Stringifying as `"None"` / `"null"` and surfacing in the UI as a role |

**Expected:** matching ignores `role`; rationale renders empty role as empty.

---

### E17. Empty `description` and `tags` on plan

**Scenario.** `p004` (Backend Cleanup Sprint) has `description = ""` and `tags = ""`. Tasks inside `p004` lose all plan-level scope hints; deduction must rely on task-level signals alone.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| plans | `p004` | description=`""`, tags=`""`, owner=u004 |
| tasks | `t020` | p004, tags=`""`, title="Reduce build flakiness", description includes "CI build flakiness in the backend repos" |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope deduction | combines plan.tags + task.tags + task.title + task.description | plan side contributes ∅; task side carries "build flakiness", "CI", "backend repos" | non-infra → t020 excluded | Treating `plan.tags=""` as "infra by default" (or as "unknown — include") — t020 wrongly enters the infra list |
| Skill deduction | task-side tokens only | required set narrow | same | Refusing to deduce skills because plan-level hints are absent — required set is empty, every candidate scores 0 |

**Expected:** t020 is **not** in the infra list. Sparse plan-level fields shrink, not invert, the deduced scope.

---

### E18. Plan with zero members

**Scenario.** `p006` (Orphan Plan) has no rows in `plan_members.csv`. Task `t019` is in `p006`. The candidate pool is empty **before** skill or availability filters apply.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| plans | `p006` | description=`""`, tags=`""`, owner=u013 |
| plan_members | (p006) | **no rows** |
| tasks | `t019` | p006, status=todo, due=`2026-06-25`, title="Define DevOps roadmap", tags=`""` |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Candidate pool | `plan_members WHERE plan_id=p006` | ∅ | empty pool | Falling back to "all tenant users" when the pool is empty — every infra-skilled user wrongly suggested for an orphan plan |
| Skill rank | n/a | n/a | skipped | Running skill rank against the empty pool is harmless, but reporting "no skill match" obscures the actual reason |
| Output | survivors | ∅ with reason="plan has no members" | `[]` | Returning the plan owner (u013) as default candidate — invents membership |

**Expected:** empty list. **Reason = no members** — distinguishable from E5 (saturation), E6 (all unavailable), E10 (no skill).

---

### E19. Empty `title` on task

**Scenario.** `t015.title = ""` and `t015.tags = ""`. The description (`"Check AWS production cluster cost report and identify optimization candidates."`) is the only scope signal. Scope deduction must never rely solely on title.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t015` | p001, status=todo, due=`2026-06-20`, title=`""`, tags=`""`, description mentions AWS, cost report |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope filter | title-substring match for `infra*` or similar keywords | no hit on title; no hit on tags; description has `AWS, production cluster, cost` | in scope | Title-only or tag-only deduction — t015 disappears from the infra list |
| Skill deduction | description tokens → `{AWS, cost-optimization}` | required = `{AWS}` minimum | same | Empty title interpreted as "draft task — skip" |
| Skill rank | p001 members vs `{AWS}` | u002:1, u003:1, u005:1, u001:1, u015:0 | many candidates | — |
| Availability | window `[2026-05-20, 2026-06-20]` | u001 out, u002 out, u003 out (lv005 in range), u005 out (lv002 from 2026-06-20 → boundary in range) | sparse survivors | u005's `lv002` starts exactly on `t015.due_date` — another inclusive-boundary check (cf. E1) |

**Expected:** scope deduction reads description; t015 stays in the infra list.

---

### E20. Empty `tags` is the common case

**Scenario.** `t015`, `t019`, `t020` all carry `tags = ""`. The dataset's volume-fill rule (~60%) makes empty tags the majority case. The matching layer must treat tags as a **hint**, not a contract.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| tasks | `t015`, `t019`, `t020` | tags=`""` |
| (spec §6.4) | volume rule | ~60% of all tasks |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope filter | "infrastructure tag present" | matches only the ~40% with non-empty tags | should match on title+description+tags union | Tag-only filter drops the majority of tasks — the use case never sees its real input volume |
| Skill deduction | (required-set derivation) | tag-derived set when present, else fall through to title/description | same | Returning empty required set when tags absent — no candidate scores anywhere |

**Expected:** **the matching query degrades gracefully on empty tags.** A required-tag implementation is wrong on the majority of the dataset.

---

## §7. Skill vocabulary variance

### E21. Skill scope: broad ↔ narrow

**Scenario.** Skills cluster at very different granularities. `u013.skills = "DevOps,AI"` is umbrella; `u014.skills = "ML,NLP,Spark,Kafka"` is precise. Default matching is **literal token comparison after case-folding** — "DevOps" does not implicitly expand to "Kubernetes"; "AI" does not implicitly match "ML". `t018` exposes the tradeoff: the 3-match candidate is unavailable; the 0-match candidate is available.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u013` | skills=`DevOps,AI`, member of p005 |
| users | `u014` | skills=`ML,NLP,Spark,Kafka`, member of p005 |
| tasks | `t018` | p005, status=todo, due=`2026-06-30`, tags=`ai,spark,ml,nlp`, title="Set up Spark cluster for ML pipelines" |
| timesheet | `lv009` | u014, 2026-06-15 → 2026-06-25, annual, approved |
| timesheet | `lv011` | u013, 2026-07-01 → 2026-07-05, personal, **rejected** |

**Execution trace**

| Step | Inputs | Result | Expected (literal) | Expected (umbrella-expanded) | Failure mode |
|------|--------|--------|--------------------|------------------------------|--------------|
| Skill rank | required `{Spark, ML, NLP}` | u013: literal 0, expanded 1 (`AI → ML`); u014: literal 3 | literal: u014:3, u013:0 → drop | expanded: u014:3, u013:1 | Switching between modes without documenting it — output silently changes |
| Availability | window `[2026-05-20, 2026-06-30]` | u013 in (lv011 rejected — see E25); u014 out (lv009 overlaps) | u013 not in skill-set under literal | u013 in under expanded | Counting `lv011` as filtering — u013 wrongly dropped |
| Output | survivors | (depends on stance) | `[]` | `[u013]` | Picking the highest *raw skill score* before availability — u014 wrongly tops the suggestion list despite being on leave |

**Expected:**
- Under **literal**: `[]`.
- Under **umbrella-expanded**: `[u013]`.

**The consumer must declare its stance.** The data exercises both stances simultaneously.

---

### E22. Skill aliases / synonyms

**Scenario.** `u015.skills = "k8s,ts,postgres,OOP"` uses common shorthand. The recommended alias map is consumer-owned. Cross-check with Scenario 2: `t002` has `assignee=u003`, required `{Kubernetes, Security}`. Pool after excluding u003: `{u001, u002, u004, u005, u009, u011, u015}`. Without normalization → empty. With normalization → `[u015]`.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u015` | skills=`k8s,ts,postgres,OOP`, member of p001 |
| tasks | `t002` | status=todo, assignee=`u003`, due=`2026-06-15`, tags=`infrastructure,kubernetes,security,review` |
| (spec §5.7) | alias map | `k8s→Kubernetes, ts→TypeScript, postgres→PostgreSQL, js→JavaScript` |

**Execution trace**

| Step | Inputs | Result | Expected (no alias) | Expected (alias on) | Failure mode |
|------|--------|--------|---------------------|---------------------|--------------|
| Skill rank | required `{Kubernetes, Security}` | u002:2 (skill matches both) but on leave; u015: 0 literal, 1 via `k8s→Kubernetes` | u002:2, others:0 | u002:2, u015:1 | Hardcoding alias normalization but not declaring it — answer disagrees with consumer expectation |
| Availability | window `[2026-05-20, 2026-06-15]` | u002 out (lv001 overlaps), u015 in (no leave entries) | u002 dropped | u002 dropped | — |
| Output | survivors | no alias: ∅; with alias: `[u015]` | `[]` | `[u015]` | Aliases applied to candidate skills but not to required-set tokens — partial normalization mishandles `t017` where the *task* uses `k8s` |

**Expected:** consumer-declared. Same dataset exercises both branches, so the choice of stance is the contract — not a hidden default.

---

## §8. Title length variance

### E23. Title length spread (empty → 35+ words)

**Scenario.** Titles range from absent (`t015`) to a 35-word problem statement (`t016`). Scope deduction must scale across the range without changing the matching rules — long titles don't get truncated; short titles don't bypass the deduction.

**Reference rows**

| Source | Row | Title length | Notes |
|--------|-----|--------------|-------|
| tasks | `t015` | 0 words (empty) | covered in E19 |
| tasks | `t017` | 4 words | `Setup k8s monitoring stack` |
| tasks | `t001`–`t014` | medium | typical |
| tasks | `t016` | 35+ words | full sentence: *"Investigate and document the root cause of the intermittent 502 errors observed during the morning peak traffic window in the production payment gateway and propose a remediation plan covering load balancing strategy."* — tags=`infrastructure,reliability` carry the infra signal |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Scope filter | `t016` tags include `infrastructure` | in scope via tags | in scope | Truncating title to N chars before keyword extraction — long titles lose context on the truncated tail |
| Skill deduction (t016) | tokens: "production", "payment gateway", "load balancing", "remediation" | no canonical skills surface from title alone | required set comes from tags | Title parsing produces noisy required skills (e.g., "payment-gateway" as a literal token) — candidates score artificially low |
| Skill deduction (t017) | title `Setup k8s monitoring stack` is short; tag-derived `{Kubernetes, Monitoring}` | required set well-defined | same | Short title heuristic ("less than 5 words = stub task") rejects t017 |

**Expected:** scope deduction adapts to whatever signal is available (title, description, tags). **Truncation, padding, or "minimum-length" heuristics are wrong.**

---

## §9. Timesheet status mix

### E24. Pending leave overlapping an active window

**Scenario.** `lv008` covers `u005` on `2026-05-22 → 2026-05-23`, **pending**. For any task with `due_date ≥ 2026-05-22`, lv008 overlaps the window — but because it's pending, it does **not** filter `u005`. The consumer must gate on `status='approved'` before applying the overlap test.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| users | `u005` | skills=`AWS,Docker,Linux,PostgreSQL`, member of p001 |
| timesheet | `lv008` | u005, `2026-05-22 → 2026-05-23`, sick, **pending** |
| tasks | `t001` | due=`2026-06-02` |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Availability | filter `WHERE status='approved'` then overlap test | lv008 excluded by status; u005 not filtered by lv008 | u005 available | Skipping the status gate — pending and approved both filter; u005 wrongly unavailable for t001 |
| Result | u005's availability for t001 | available | available (lv002 = 2026-06-20 also doesn't overlap [today, 2026-06-02]) | — |

**Expected:** `u005` is available for t001 despite lv008. **Pending ≠ filter.**

---

### E25. Rejected leave is ignored

**Scenario.** `lv011` (`u013`, `2026-07-01 → 2026-07-05`, **rejected**) is present in the dataset and must be ignored by the availability rule. Less common in practice than pending, but a valid third status.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| timesheet | `lv011` | u013, `2026-07-01 → 2026-07-05`, personal, **rejected** |
| users | `u013` | skills=`DevOps,AI`, member of p005 |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Availability | filter `WHERE status='approved'` | lv011 excluded by status | u013 available across `2026-07-01 → 2026-07-05` | Filtering on `status != 'cancelled'` (lenient gate) — rejected wrongly counted |
| Combined with E21 | u013's availability for `t018` (due 2026-06-30) | window `[2026-05-20, 2026-06-30]` does not overlap rejected lv011 dates anyway, so the gate's correctness is not directly observable for t018 — use a task whose window extends past `2026-07-01` | gate must hold | If the consumer only ever tested against tasks before 2026-07-01, the bug remains hidden until a late-due task surfaces it |

**Expected:** `u013` is treated as available throughout the window covered by `lv011`. The status gate is the only gate that excludes rejected leaves; date-only checks would mistakenly include them.

---

### E26. Past approved leave does not filter

**Scenario.** `lv010` (`u012`, `2026-05-10 → 2026-05-15`, **approved**, both dates before today) demonstrates that `status='approved'` alone is insufficient — the temporal overlap check is the real gate. With `end_date=2026-05-15 < today=2026-05-20`, the overlap test fails on `end_date >= today`.

**Reference rows**

| Source | Row | Relevant fields |
|--------|-----|-----------------|
| timesheet | `lv010` | u012, `2026-05-10 → 2026-05-15`, sick, **approved** |
| users | `u012` | skills=`JavaScript,HTML,CSS`, member of p004 |

**Execution trace**

| Step | Inputs | Result | Expected | Failure mode if mishandled |
|------|--------|--------|----------|----------------------------|
| Availability | overlap test `start ≤ due AND end ≥ today` | lv010.end = 2026-05-15 < 2026-05-20 → no overlap → u012 not filtered | u012 available | Using "is on approved leave" as a flag column instead of the overlap test — u012 wrongly marked unavailable for any future task |
| Cross-check | combine with E2 (lv006 covers today exactly) | lv006 filters (today is inside [start, end]); lv010 does not (today is after end) | the date boundary, not the status, decides | Conflating "has approved leave entries" with "is currently on leave" |

**Expected:** `u012` is available today and going forward. **Approved is necessary but not sufficient; the overlap test is the gate.**

---

## §10. Empty-result reason matrix

When the suggestion list comes back empty, **the reason matters**. Consumers should be able to surface "no candidate" with the correct rationale; UIs/agents should branch on the reason (retry, widen, escalate). The dataset exercises five distinct reasons:

| Reason | Where the pool/filter goes empty | Exemplar edge | Exemplar task | Distinguishing test |
|--------|----------------------------------|---------------|---------------|---------------------|
| **No members** | `plan_members WHERE plan_id=…` returns 0 rows | E18 | `t019` (in `p006`) | `count(plan_members) = 0` for the plan |
| **No skill** | Pool non-empty; intersection with required-set = 0 for every candidate | E10 | `t014` (COBOL/legacy) | Required-set has tokens with **no** corresponding `users.skills` token in any tenant row |
| **All unavailable** | Pool non-empty, some candidates have skill, **none** pass overlap test | E6 | `t013` (Kubernetes) | At least one candidate has skill match ≥ 1; all such candidates have an approved leave overlapping the window |
| **Saturation** | Pool empty after `MINUS assignees` | E5 | `t012` (every member already assigned) | `assignee_ids` covers the entire skill-bearing membership |
| **Consumer-mode mismatch** | Pool/skill non-empty under one stance, empty under the active stance | E21, E22 | `t002` (no alias) / `t018` (literal mode) | Same task yields different lists under different alias/umbrella settings |

**Consumer contract.** A single "no candidate" message that conflates these reasons is a usability bug. The schema gives the consumer all five signals; how they're surfaced (UI badge, agent rationale, error category) is downstream of this document.

---

## Related documents

- [`2026-05-20-mock-data-schema-design.md`](./2026-05-20-mock-data-schema-design.md) — full schema, cast, scenario walkthrough, volume guidelines. §5 is the source for E1–E26.
- [`finding-staff-for-a-task.md`](./finding-staff-for-a-task.md) §7 — the agent-layer companion: how the LLM rationale, embedding cold-start, and MCP downtime layer on top of the dataset edges captured here.
- [`SCHEMA.md`](./SCHEMA.md) — MS Graph–shaped source-of-truth schema, for when the mock dataset is replaced by the real connector.
