# Mock Data — Adding `email` and `rbac_role` to `users.csv`

**Status:** Design. Delta on top of [`2026-05-20-mock-data-schema-design.md`](./2026-05-20-mock-data-schema-design.md) (referred to below as *the base spec*).

**Purpose.** Add two columns to the mock `users.csv` so the dataset can model:

1. **Contact identity** — each employee has a deterministic, unique email.
2. **Role-based access control** — each employee has exactly one RBAC role that gates whether they can be suggested as a task assignee.

RBAC values and the job-title-to-role mapping come from the rubric in `image.png` (top-level RBAC mapping table for the platform).

This document amends the base spec; it does not replace it. Only the sections explicitly called out below change.

---

## 1. Schema additions to `users.csv`

Two new columns are inserted into `users.csv`. The header order changes from:

```
user_id, name, project, role, skills
```

to:

```
user_id, name, email, project, role, rbac_role, skills
```

| Column | Type | Required | Description |
|---|---|---|---|
| `email` | text | **yes** | Lowercase ASCII, **unique** across all users. Format `<given>.<familymiddle>@setafuture.onmicrosoft.com`. Generation algorithm in §2. Never empty. |
| `rbac_role` | text | **yes** | One of `org.admin` · `planner.admin` · `planner.contributor` · `planner.viewer`. Never empty — even when `role` is empty, `rbac_role` falls back to `planner.viewer` (§3). |

**Constraints (mock data must respect):**

- `email` is unique. `user_id` remains the primary key; `email` is a unique secondary identifier.
- `email` and `rbac_role` are **always present** — they are the only `users.csv` fields with no empty-value edge.
- `rbac_role` is fully derivable from `role` plus the rule in §3, including the empty-`role` case. Generation must be deterministic.

The base spec's §2.1 notes (skills semantics, `role` is free-text, edge references) are unchanged.

---

## 2. Email generation algorithm

Deterministic and reproducible from `users.name` alone.

**Inputs.** `users.name` (UTF-8, ≥2 whitespace-separated tokens, may contain Vietnamese diacritics).

**Algorithm.**

1. **Tokenize** on whitespace → `tokens[]`. Every name in the dataset has at least 2 tokens.
2. `given = tokens[-1]` (last token — the personal name in Vietnamese order).
3. `familymiddle_tokens = tokens[0:-1]` (everything else, in original order).
4. **Normalize each token:**
   - Strip diacritics via Unicode NFD decomposition + remove combining marks.
   - Map `Đ → D` and `đ → d` explicitly (NFD does not decompose these).
   - Lowercase.
5. **Build local-part:** `local = given_norm + "." + concat(familymiddle_tokens_norm)`.
   - When `len(tokens) == 2` the `familymiddle` concat collapses to a single token → the local-part is `given.family`.
6. **Build email:** `email = local + "@setafuture.onmicrosoft.com"`.
7. **Collision handling:** if `email` already exists in the dataset under construction, append the smallest integer ≥ 2 to the end of the local-part: `hung.tran` → `hung.tran2` → `hung.tran3`. The number sits in the local-part, immediately before the `@`.

**Test cases (must hold exactly):**

| Name | Email |
|---|---|
| Trần Văn Hùng | `hung.tranvan@setafuture.onmicrosoft.com` |
| Nguyễn Văn Nam | `nam.nguyenvan@setafuture.onmicrosoft.com` |
| Lê Thị Hoa | `hoa.lethi@setafuture.onmicrosoft.com` |
| Phạm Quốc Bảo | `bao.phamquoc@setafuture.onmicrosoft.com` |
| Vũ Minh Tuấn | `tuan.vuminh@setafuture.onmicrosoft.com` |
| Bùi Trung Hiếu | `hieu.buitrung@setafuture.onmicrosoft.com` |
| Đỗ Mỹ Linh | `linh.domy@setafuture.onmicrosoft.com` |
| Đinh Thanh Mai | `mai.dinhthanh@setafuture.onmicrosoft.com` |
| Lý Minh Hoàng | `hoang.lyminh@setafuture.onmicrosoft.com` |
| *(2nd "Trần Văn Hùng" if any)* | `hung.tranvan2@setafuture.onmicrosoft.com` |

---

## 3. RBAC mapping

`rbac_role` is derived from `role` via a fixed lookup. The mapping covers:

- All canonical role labels in §6.1 of the base spec.
- All legacy labels in the named cast (§4–5 of the base spec): `IT Engineer`, `PM`, `Backend Developer`, `Junior Developer`, `Software Engineer`.
- The empty-`role` case (u013) — defaults to `planner.viewer` (least privilege).

| Group | Role labels | `rbac_role` | Count |
|---|---|---|---:|
| Org leadership | CEO, CTO, CDO, VP Engineering | `org.admin` | 4 |
| Plan leadership | Engineering Manager, Tech Lead, Software Architect | `planner.admin` | 19 |
| Engineering ICs | Junior/Mid/Senior × {Frontend, Backend, Fullstack, Mobile} Developer; `Backend Developer` *(legacy)* | `planner.contributor` | 134 |
| DevOps & infra ICs | DevOps Engineer, Senior DevOps Engineer, Site Reliability Engineer, Cloud Engineer; `IT Engineer` *(legacy)* | `planner.contributor` | 24 |
| Data & AI | Data Engineer, Senior Data Engineer, Data Scientist, Senior Data Scientist, ML Engineer, MLOps Engineer, AI Engineer, Generative AI Engineer | `planner.contributor` | 20 |
| QA | Junior QA Engineer, QA Engineer, Senior QA Engineer, QA Automation Engineer, QA Lead | `planner.contributor` | 26 |
| Security | Security Engineer, Senior Security Engineer, Security Lead | `planner.contributor` | 6 |
| Project & product | `PM` *(legacy)*, Project Manager, Senior Project Manager, Delivery Manager, Scrum Master, Product Owner, Business Analyst | `planner.contributor` | 28 |
| Design | UI/UX Designer, Senior UI/UX Designer, Design Lead | `planner.contributor` | 8 |
| Other legacy (cast only) | `Junior Developer`, `Software Engineer` | `planner.contributor` | 2 |
| PMO | PMO Lead, PMO Analyst | `planner.viewer` | 3 |
| HR & Talent | HR Manager, HR Generalist, HR Business Partner, Talent Acquisition | `planner.viewer` | 8 |
| Internal IT | IT Support, IT Administrator | `planner.viewer` | 4 |
| Business ops | Account Manager, Sales Manager, Marketing Specialist, Finance / Accountant, Operations Manager, Office Administrator | `planner.viewer` | 11 |
| Internal comms | IC Executive | `planner.viewer` | 2 |
| Empty role | `""` *(u013 only)* | `planner.viewer` | 1 |
| **Total** | | | **300** |

**Distribution rollup:**

| `rbac_role` | Count | % |
|---|---:|---:|
| `org.admin` | 4 | 1.3% |
| `planner.admin` | 19 | 6.3% |
| `planner.contributor` | 248 | 82.7% |
| `planner.viewer` | 29 | 9.7% |

**Notes on the mapping:**

- The mapping is **single-valued** — each `role` string resolves to exactly one `rbac_role`. No multi-role users.
- Legacy labels are not present in volume fill (per base spec §6.1 note). They only appear on the named-cast rows and all resolve to `planner.contributor` — the IC tier.
- Empty `role` resolves to `planner.viewer` by default. Edge E16 (empty `role` is informational) is unchanged; the new rule only declares what `rbac_role` should be filled with when `role` is empty.

---

## 4. Use-case rule update

Modify the candidate-pool derivation in §3 of the base spec (use-case walkthrough). The current `2b` reads:

```
b. Candidate pool
   ← plan_members.member_id WHERE plan_id = T.plan_id
   ← MINUS users already in T.assignee_ids
```

The revised `2b` adds a single new minus-clause:

```
b. Candidate pool
   ← plan_members.member_id WHERE plan_id = T.plan_id
   ← MINUS users where rbac_role = 'planner.viewer'   ← NEW
   ← MINUS users already in T.assignee_ids
```

**Rationale.** `planner.viewer` is, by definition in the RBAC rubric, the role that cannot author or be assigned planner work. A user in that role appearing in a suggestion list is a permission violation, not a usability suggestion — the filter belongs in the candidate-pool step, not as a downstream UI hint.

**Filter order (semantic; conjunctive, so result-equivalent under reorder):**

1. Plan membership.
2. **RBAC: drop `planner.viewer`.**
3. Drop current assignees.
4. Skill match.
5. Availability filter.

**Effect on existing happy-path scenarios (§4 of the base spec):**

None of `p001`'s current members (u001, u002, u003, u004, u005, u009, u011, u015) have `rbac_role='planner.viewer'`. Therefore Scenarios 1–5 produce identical expected suggestion lists to the existing spec. The new filter is silently consistent with the documented results. Edge E27 (§5 below) is what makes the filter visibly fire.

---

## 5. New edges

### E27. Viewer-member excluded from suggestion despite skill match *(new data required)*

Adds a new named-cast row using the reserved ID `u007` (per base spec §6.1: "`u006` and `u007` are intentionally unused so that the named anchor cast can grow without IDs colliding with volume fill"):

| user_id | name | email | project | role | rbac_role | skills |
|---|---|---|---|---|---|---|
| u007 | Vũ Bích Ngọc | `ngoc.vubich@setafuture.onmicrosoft.com` | SETA Internal | IT Support | `planner.viewer` | `AWS,Linux,Docker` |

Plus one new row in `plan_members.csv`: `(p001, u007)`.

**Cross-check with Scenario 1 (t001, AWS infrastructure review, due 2026-06-02):**

u007 has skills `AWS, Linux, Docker` overlapping required `{AWS, Linux, Monitoring, Security}` by 2 — the same match count as u003 and u005.

- **§4-only baseline** (Scenario 1's primary documented result is `{u003, u005}`):
  - Without RBAC: list would be `{u003, u005, u007}` (tie-broken by `user_id` ascending).
  - With RBAC: u007 dropped → list back to `{u003, u005}`.
- **Full §4+§5 baseline** (Scenario 1 reshapes to `{u005}` via lv005 making u003 unavailable — see existing edge E1):
  - Without RBAC: list would be `{u005, u007}` (both 2-match, both available).
  - With RBAC: u007 dropped → list back to `{u005}`.

In both baselines, the RBAC filter is the deciding factor that removes u007 — demonstrating it actively fires on real data, independent of the availability shifts in §5.

### E28. Empty-`role` user defaulted to viewer is filtered *(no new data)*

u013 has `role=''` → by the §3 default rule, `rbac_role='planner.viewer'`.

u013 is a member of `p005`. For t018 (requires `Spark, ML, NLP` from tags + title):

- Under literal matching: u013's skills `DevOps,AI` give 0 matches.
- Under alias/umbrella expansion (consumer-owned, per existing edge E21: `AI → ML`): u013 would become a 1-match available candidate.
- With the RBAC filter (step 2b): u013 is dropped *before* skill match runs, regardless of expansion stance.

Demonstrates: the default-to-viewer rule for empty-role users has a real downstream effect — the rule changes outcomes under at least one consumer stance (the umbrella-expanding one).

### Adjusted edges from existing spec

- **E16 (empty `role`):** wording unchanged — empty `role` is still informational and never read by the matching query. Add a one-sentence note: `rbac_role` is **never** empty even when `role` is.
- **No other existing edge** changes wording or expected result.

---

## 6. Data & volume changes

### 6.1 Role catalog (§6.1 of base spec)

Exactly one row of the catalog table changes its **cast members** column:

| Family | Role | Count | Cast members (old) | Cast members (new) |
|---|---|---:|---|---|
| Internal IT | IT Support | 2 | — | **u007** |

Catalog total stays exactly **300** — u007 promotes one IT Support row from volume fill into the named cast; no row added or removed elsewhere.

### 6.2 Other tables (§6.2 of base spec)

- `plan_members.csv`: **+1 row** `(p001, u007)`. Total volume still fits the 1,500–2,500 envelope.
- `plans.csv`, `buckets.csv`, `tasks.csv`, `timesheet.csv`: **no change**.

### 6.3 Infrastructure-task cardinality (§6.3 of base spec)

Add one rule to the existing bullet list:

> - At least **1** `planner.viewer` user must be a member of **`p001`** (the canonical infrastructure plan) and have ≥ 1 infra skill — so the RBAC filter at step 2b is exercised on real data within the canonical happy-path plan. Satisfied by `u007` per edge E27.

All other rules in §6.3 are unchanged.

### 6.4 Field-sparsity rules (§6.4 of base spec)

Add three rules to the existing bullet list:

> - `email` is **always non-empty** and **unique** across all 300 rows.
> - `rbac_role` is **always non-empty** across all 300 rows (no empty values, even for the empty-`role` user u013).
> - *(recommended, not strict)* Volume fill should produce at least one email collision pair — i.e., ≥ 2 users whose normalized name pattern yields the same base local-part, so the dataset contains an explicit `{base}@…` and `{base}2@…` pair. Validates that the suffix algorithm actually fires in the produced data, instead of living only in documentation.

All other sparsity rules in §6.4 are unchanged.

---

## 7. Out of scope

Explicitly *not* in this delta:

- Per-tenant or per-project RBAC. The RBAC role is global across the org; the mock does not model "u002 is `planner.admin` of `p001` but `planner.contributor` of `p005`". If that distinction is ever needed, a separate join table is the right shape — not a column on `users.csv`.
- RBAC checks on `plan_members.csv`. A `planner.viewer` user **may still appear** as a row in `plan_members` (in fact, edge E27 requires exactly this). The filter applies at suggestion time, not at membership time.
- Mapping of `rbac_role` to MS Graph Planner permission values. The four roles here are an internal abstraction; integration with Graph permissions is a separate connector concern.
- Email deliverability. The `setafuture.onmicrosoft.com` domain is illustrative and matches the M365 tenant default — no actual mailbox is assumed.
- `email` change history or alias support. Each user has exactly one email; renames are out of scope for the mock.
