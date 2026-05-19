# Planner Mock — Infrastructure Review Use Case

This fixture supports the use case: **"A manager asks which tasks need infrastructure or security review, and the Agent suggests available team members with matching skills."**

---

## Agent Flow

### Trigger

The workflow starts when the user asks something like:

> *"Which tasks in the Infrastructure plan need an infra or security review?"*
> *"Show me who on my team can review the blocked infra tasks."*
> *"Suggest reviewers for security tasks in plan-SEC-Q2."*

The Agent matches these against the infrastructure review workflow in its instructions and follows the six steps below.

---

### Step 1 — Fetch tasks (`list_plan_tasks`)

The Agent calls `planner.list_plan_tasks` for the relevant plan. The tool queries `planner.v_visible_tasks`, which enforces access control automatically: the manager only sees tasks in plans they own or where a direct report is a member.

**Tool call:**
```json
{ "planId": "plan-INFRA-2026" }
```

**What comes back (abridged):**
```
task-I01 | Optimize Kubernetes autoscaling | 0%   | bucket: To Do
task-I02 | Audit IAM roles on AWS           | 0%   | bucket: To Do
task-I03 | Review VPC segmentation          | 0%   | bucket: Backlog
task-I04 | Set up Grafana dashboard         | 50%  | bucket: In Progress  assignee: inf-006
task-I05 | Configure Kubernetes RBAC        | 100% | bucket: Done
```

The Agent requests `not_started` + `in_progress` tasks only — `task-I05` (Done) is excluded at this step.

---

### Step 2 — Read full description for each task (`get_task`)

For each non-done task the Agent calls `planner.get_task` to get the description and checklist. These are stored in `planner_task_details_cache` and joined via `v_visible_tasks`.

**Tool call:**
```json
{ "taskId": "task-I01" }
```

**What comes back:**
```
description: "HPA currently uses default config (min=1, max=10, targetCPU=80%).
              After traffic spikes crashing nodes, the team needs to review the full
              autoscaling policy on the GKE production cluster. Check cluster-autoscaler
              and HPA, evaluate KEDA for event-driven autoscaling, standardise
              resource requests/limits across all deployments."
checklist:
  [ ] Check HPA config per namespace
  [ ] Review cluster-autoscaler node pool settings
  [ ] Review resource requests/limits for all deployments
  [ ] Evaluate KEDA
  [ ] Apply new config and write ADR
```

The Agent reads the `description` field — not the `title` — for domain classification. Titles are often too short to be reliable.

---

### Step 3 — Classify domain (Agent reasoning, no tool call)

The Agent reads each description and classifies:

| Task | Trigger keywords in description | Domain |
|------|--------------------------------|--------|
| task-I01 | HPA, autoscaling, GKE, Kubernetes, cluster-autoscaler, KEDA | **INFRASTRUCTURE** |
| task-I02 | IAM roles, AWS accounts, least privilege, service accounts | **INFRASTRUCTURE** |
| task-I03 | VPC, subnet, routing tables, security groups, NACLs | **INFRASTRUCTURE** |
| task-I04 | Grafana, Prometheus, Kubernetes cluster, metrics, alert rules | **INFRASTRUCTURE** |

Tasks classified as OTHER (product features, UI, business logic) are dropped — the Agent does not look for reviewers for them.

---

### Step 4 — Infer required skills (Agent reasoning, no tool call)

From the description, the Agent infers a skill list to pass to the reviewer search:

| Task | Inferred skills |
|------|----------------|
| task-I01 | `["kubernetes", "aws"]` — GKE cluster, HPA |
| task-I02 | `["aws", "security"]` — IAM on AWS |
| task-I03 | `["networking", "aws"]` — VPC, routing, security groups |
| task-I04 | `["kubernetes", "prometheus", "grafana"]` — monitoring stack |

The skill strings must match values stored in `directory_users.raw->'skills'` — the seed uses lowercase kebab-case (`kubernetes`, `prometheus`, not `Kubernetes`, `Prometheus`).

---

### Step 5 — Find available reviewers (`list_available_reviewers`)

For each classified task the Agent calls `planner.list_available_reviewers` with the inferred skills and `myTeamOnly: true`.

**Tool call for task-I01:**
```json
{
  "skills": ["kubernetes", "aws"],
  "myTeamOnly": true
}
```

The tool runs this SQL logic:
```
FROM directory_users u
WHERE availability = 'Available'
  AND manager_id   = current_setting('app.user_id')   -- mgr-001's direct reports only
  AND skills overlap with ['kubernetes', 'aws']        -- jsonb array intersection
```

Then for each matching reviewer, two subqueries run against `planner.v_visible_tasks`:
```sql
COUNT(*) WHERE assignee_ids @> ARRAY[u.entra_object_id]
          AND percent_complete BETWEEN 1 AND 99       -- active_task_count

ARRAY(SELECT title ... LIMIT 5)                       -- active_task_titles
```

**What comes back:**
```
inf-001 | Trần Văn An    | DevOps Engineer    | Available | matched: [kubernetes, aws] | active: 1
inf-002 | Nguyễn Thị Bích| Cloud Architect    | Available | matched: [kubernetes, aws] | active: 1
inf-004 | Bùi Thị Quỳnh  | DevOps Engineer    | Available | matched: [aws]             | active: 0
```

`inf-006` has `kubernetes` but is **Busy (DoNotDisturb)** → filtered out.
`sec-001` has security skills but `manager_id = mgr-002` → filtered out by `myTeamOnly`.

---

### Step 6 — Render report (Agent output)

The Agent assembles one card per INFRA/SECURITY task and renders them in the chat:

```
──────────────────────────────────────────────────────────
Task: Optimize Kubernetes cluster autoscaling config
   Status:   Not Started
   Domain:   Infrastructure
   Priority: Urgent  |  Due: 2026-05-25
   Assignee: Unassigned

   Suggested reviewers from your team:
   • Trần Văn An (DevOps Engineer) — Available
     Skills matched: kubernetes, aws
     Active tasks (1): "Migrate PHP services from EC2 to EKS"

   • Nguyễn Thị Bích (Cloud Architect) — Available
     Skills matched: kubernetes, aws
     Active tasks (1): "Migrate PostgreSQL to AWS RDS Multi-AZ" [BLOCKED]

   • Bùi Thị Quỳnh (DevOps Engineer) — Available
     Skills matched: aws
     Active tasks (0): —

──────────────────────────────────────────────────────────
Task: Deploy ELK stack for centralized log aggregation
   Status:   In Progress 30% [BLOCKED]
             (last updated 5 days ago — no progress detected)
   Domain:   Infrastructure
   Priority: Important  |  Due: 2026-05-21
   Assignee: Nguyễn Thanh Phong (inf-006)

   [!] No available match in your team — inf-006 (current assignee) is Busy.
     Consider unblocking inf-006 or reassigning to someone with ELK experience.
──────────────────────────────────────────────────────────
```

The manager can immediately see:
- Which tasks need attention and why they are blocked
- Who in their team is free to take on a review
- What each suggested reviewer is currently working on, so workload is visible before assigning

---

### Full call sequence (as mgr-001, plan-INFRA-2026)

```
User message
    │
    ▼
list_plan_tasks(planId="plan-INFRA-2026")
    │  returns 4 non-done tasks
    ▼
get_task(taskId="task-I01")  ──┐
get_task(taskId="task-I02")    │  parallel or sequential depending on
get_task(taskId="task-I03")    │  Agent implementation
get_task(taskId="task-I04")  ──┘
    │  returns descriptions + checklists
    ▼
[Agent classifies: all 4 → INFRASTRUCTURE]
[Agent infers skills per task]
    │
    ▼
list_available_reviewers(skills=[...], myTeamOnly=true)  — one call per task
    │  returns reviewers with matched_skills + active_task_count + active_task_titles
    ▼
[Agent renders report]
    │
    ▼
Manager reads report → decides who to assign for review
```

> `list_available_reviewers` is called once per unique skill set. If two tasks share the same inferred skills (e.g. both need `["kubernetes","aws"]`), the Agent may deduplicate and reuse the result.

---

### Edge cases handled by the instructions

| Situation | Agent behaviour |
|-----------|----------------|
| All matching direct reports are Busy | Flag: "No available match in your team" |
| Plan name is ambiguous | Ask one clarifying question, then call `list_plans` |
| User does not have access to the plan | "I don't have visibility into that for your account" + show visible plans |
| Task is classified OTHER | Silently skip — no reviewer search for it |
| Reviewer has no active tasks | Show `Active tasks (0): —` (explicitly indicates they are free) |

---

## Overview

```
tenant_id: 550e8400-e29b-41d4-a716-446655440000

3 managers — 3 fully isolated teams — 8 plans — 17 users — 40 tasks
```

---

## Actors (`directory_users`)

### Managers

| ID | Name | Title | Skills |
|----|------|-------|--------|
| `mgr-001` | Nguyễn Văn Dũng | Infrastructure Manager | kubernetes, terraform, aws, linux, cloud-architecture |
| `mgr-002` | Phạm Thị Hương | Security Manager | security, compliance, azure-ad, oauth, audit |
| `mgr-003` | Lê Minh Tuấn | Product Manager | product-management, agile, nodejs, postgresql |

Managers have `manager_id = NULL` — they are the top level in the mock hierarchy.

### Infrastructure Team (`manager_id = mgr-001`)

| ID | Name | Title | Availability | Skills |
|----|------|-------|-------------|--------|
| `inf-001` | Trần Văn An | DevOps Engineer | **Available** | kubernetes, docker, terraform, aws, linux |
| `inf-002` | Nguyễn Thị Bích | Cloud Architect | **Available** | aws, azure, terraform, cloud-architecture, kubernetes |
| `inf-003` | Lê Hoàng Cường | Infrastructure Engineer | Busy (InAMeeting) | linux, networking, cisco, vmware, storage |
| `inf-004` | Bùi Thị Quỳnh | DevOps Engineer | **Available** | docker, ci-cd, github-actions, terraform, aws |
| `inf-005` | Cao Minh Sơn | Network Engineer | **Available** | networking, cisco, firewall, vpn, dns, load-balancing |
| `inf-006` | Nguyễn Thanh Phong | Site Reliability Engineer | Busy (DoNotDisturb) | kubernetes, monitoring, prometheus, grafana, linux, incident-response |

### Security Team (`manager_id = mgr-002`)

| ID | Name | Title | Availability | Skills |
|----|------|-------|-------------|--------|
| `sec-001` | Hoàng Văn Đức | Security Engineer | **Available** | security, azure-ad, oauth, compliance, penetration-testing |
| `sec-002` | Trần Thị Linh | Security Analyst | **Available** | security, compliance, audit, azure-ad, siem |
| `sec-003` | Vũ Minh Khoa | Network Security Engineer | Busy (InACall) | firewall, vpn, networking, security, ids-ips |
| `sec-004` | Đỗ Thị Hà | AppSec Engineer | **Available** | security, oauth, api-security, owasp, nodejs |

### Product Team (`manager_id = mgr-003`)

| ID | Name | Title | Availability | Skills |
|----|------|-------|-------------|--------|
| `prd-001` | Vũ Quốc Hùng | Backend Developer | **Available** | nodejs, typescript, postgresql, microservices, docker |
| `prd-002` | Đỗ Thị Mai | Frontend Developer | **Available** | react, typescript, ui-design, css, figma |
| `prd-003` | Nguyễn Văn Khải | Full Stack Developer | **Available** | nodejs, react, postgresql, typescript |
| `prd-004` | Hoàng Thị Lan | Database Administrator | Busy (InAMeeting) | postgresql, mongodb, redis, backup-recovery, performance-tuning |

> **Isolation design:** `inf-*` only have `manager_id = mgr-001`, `sec-*` only `mgr-002`, `prd-*` only `mgr-003`. No cross-team membership anywhere.

---

## Plans and Plan Members

### mgr-001 — Infrastructure

| Plan ID | Title | Members (`role=member`) |
|---------|-------|------------------------|
| `plan-INFRA-2026` | Platform Infrastructure 2026 | inf-001, inf-002, inf-004, inf-006 |
| `plan-CLOUD-Q2` | Cloud Migration Q2 2026 | inf-001, inf-002, inf-003 |
| `plan-OPS-2026` | DevOps & Operations 2026 | inf-004, inf-005, inf-006 |

### mgr-002 — Security

| Plan ID | Title | Members (`role=member`) |
|---------|-------|------------------------|
| `plan-SEC-Q2` | Security & Compliance Q2 2026 | sec-001, sec-002, sec-004 |
| `plan-PENTEST-2026` | Penetration Testing 2026 | sec-001, sec-003, sec-004 |

### mgr-003 — Product

| Plan ID | Title | Members (`role=member`) |
|---------|-------|------------------------|
| `plan-PROD-Q2` | Product Development Q2 2026 | prd-001, prd-002, prd-003 |
| `plan-API-Q2` | API Platform Q2 2026 | prd-001, prd-003, prd-004 |
| `plan-MAINT-Q2` | Platform Maintenance Q2 2026 | prd-001, prd-002, prd-004 |

Each manager has `role=owner` in all their own plans. No manager is a member of another manager's plans — this is the primary isolation mechanism.

---

## Buckets

Every plan has the same four buckets in order:

| Bucket name | Meaning | `percent_complete` |
|-------------|---------|-------------------|
| Backlog | Not yet scheduled | 0 |
| To Do | Planned, not started | 0 |
| In Progress | Active work | 1–99 |
| Done | Completed | 100 |

ID pattern: `bkt-{PLAN}-backlog`, `bkt-{PLAN}-todo`, `bkt-{PLAN}-progress`, `bkt-{PLAN}-done`

---

## Tasks

### Conventions

- **Priority:** 0 = Urgent · 1 = Important · 5 = Medium · 9 = Low
- **Status:** `percent_complete` 0 = Not Started · 1–99 = In Progress · 100 = Done
- **Blocked:** `percent_complete` between 1–99 **AND** `last_modified_at_graph < NOW() - 3 days`
- **Domain classification** (used by the infrastructure review workflow):
  - **INFRASTRUCTURE:** description contains — Kubernetes, Docker, EKS, GKE, HPA, AWS, EC2, Terraform, VPC, networking, Prometheus, Grafana, ELK, CI/CD, CDN, disaster recovery
  - **SECURITY:** description contains — OAuth, OWASP, MFA, Azure AD, firewall, penetration testing, audit, IAM, compliance, encryption, SIEM
  - **OTHER:** UI, PDF, dark mode, dashboard, React, TypeScript — skipped by the Agent in the review workflow

### plan-INFRA-2026 (mgr-001)

| ID | Title | Status | Priority | Assignee | Domain | Blocked |
|----|-------|--------|----------|----------|--------|---------|
| task-I01 | Optimize Kubernetes cluster autoscaling config | Not Started | Urgent | — | INFRA | — |
| task-I02 | Audit IAM roles and permissions across AWS accounts | Not Started | Important | — | INFRA | — |
| task-I03 | Review VPC network segmentation and routing rules | Not Started | Important | — | INFRA | — |
| task-I04 | Set up Grafana monitoring dashboard for microservices | In Progress 50% | Important | inf-006 | INFRA | — |
| task-I05 | Configure Kubernetes RBAC and network policies | Done | Important | inf-001 | INFRA | — |

### plan-CLOUD-Q2 (mgr-001)

| ID | Title | Status | Priority | Assignee | Domain | Blocked |
|----|-------|--------|----------|----------|--------|---------|
| task-C01 | Migrate legacy PHP services from EC2 to EKS | In Progress 25% | Medium | inf-001 | INFRA | — |
| task-C02 | Review and optimize AWS Reserved Instances cost | Not Started | Important | — | INFRA | — |
| task-C03 | Set up Terraform remote backend on S3 | Not Started | Medium | — | INFRA | — |
| task-C04 | Migrate production PostgreSQL to AWS RDS Multi-AZ | In Progress 40% | Important | inf-002 | INFRA | **[BLOCKED]** |
| task-C05 | Set up CloudFront CDN and cache policy | Done | Medium | inf-004 | INFRA | — |

> task-C04 is blocked: waiting on VPC peering setup, last modified ~5 days ago.

### plan-OPS-2026 (mgr-001)

| ID | Title | Status | Priority | Assignee | Domain | Blocked |
|----|-------|--------|----------|----------|--------|---------|
| task-O01 | Audit CI/CD pipeline secrets management | Not Started | Important | inf-004 | INFRA | — |
| task-O02 | Deploy ELK stack for centralized log aggregation | In Progress 30% | Important | inf-006 | INFRA | **[BLOCKED]** |
| task-O03 | Audit Terraform state management | Not Started | Medium | — | INFRA | — |
| task-O04 | Plan disaster recovery for production database | Not Started | Urgent | — | INFRA | — |
| task-O05 | Configure SSL/TLS auto-renewal for public domains | Done | Important | inf-004 | INFRA | — |

> task-O02 is blocked: Elasticsearch cluster lacks storage capacity, last modified ~5 days ago.

### plan-SEC-Q2 (mgr-002)

| ID | Title | Status | Priority | Assignee | Domain | Blocked |
|----|-------|--------|----------|----------|--------|---------|
| task-S01 | Audit Azure AD sign-in logs for anomalous behavior | Not Started | Important | sec-002 | SECURITY | — |
| task-S02 | Review OAuth 2.0 token expiry and refresh rotation policy | Not Started | Urgent | — | SECURITY | — |
| task-S03 | Enforce mandatory MFA for all admin/privileged users | In Progress 75% | Urgent | sec-001 | SECURITY | — |
| task-S04 | Review data-at-rest encryption across all storage tiers | Not Started | Important | — | SECURITY | — |
| task-S05 | Enable Row-Level Security on all database tables | Done | Urgent | sec-001, sec-002 | SECURITY | — |

### plan-PENTEST-2026 (mgr-002)

| ID | Title | Status | Priority | Assignee | Domain | Blocked |
|----|-------|--------|----------|----------|--------|---------|
| task-P01 | Penetration test API gateway and auth endpoints | In Progress 40% | Important | sec-001 | SECURITY | **[BLOCKED]** |
| task-P02 | Audit firewall rules and network perimeter security | Not Started | Urgent | — | SECURITY | — |
| task-P03 | OWASP Top 10 vulnerability scan for web app and APIs | Not Started | Important | sec-004 | SECURITY | — |
| task-P04 | Review API security: rate limiting and injection | Not Started | Important | — | SECURITY | — |
| task-P05 | Social engineering awareness and phishing simulation | Done | Medium | sec-003 | SECURITY | — |

> task-P01 is blocked: waiting on isolated staging environment, last modified ~4 days ago.

### plan-PROD-Q2 · plan-API-Q2 · plan-MAINT-Q2 (mgr-003)

All Product team tasks are domain **OTHER** (UI features, bug fixes, API docs, Node upgrade, dark mode) — the Agent skips them in the infrastructure review workflow. Two notable tasks:

| ID | Title | Status | Note |
|----|-------|--------|------|
| task-A02 | Design and implement API rate limiting middleware | In Progress 55% [BLOCKED] | Blocked: waiting on Redis cluster in staging |
| task-A04 | Set up API Gateway with JWT auth middleware | In Progress 70% | Contains JWT keyword but belongs to Product — mgr-003 context only |

---

## Blocked Tasks Summary

| Task | Plan | Assignee | Progress | Reason |
|------|------|----------|----------|--------|
| task-C04 | CLOUD | inf-002 | 40% | Waiting for VPC peering |
| task-O02 | OPS | inf-006 | 30% | Waiting for Elasticsearch storage |
| task-P01 | PENTEST | sec-001 | 40% | Waiting for staging environment |
| task-A02 | API | prd-003 | 55% | Waiting for Redis cluster |

---

## Active Tasks per Reviewer

When `list_available_reviewers` returns a reviewer it includes `active_task_count` and `active_task_titles` drawn from `planner.v_visible_tasks`. As mgr-001:

| Reviewer | Available | Active in-progress tasks | `active_task_count` |
|----------|-----------|--------------------------|---------------------|
| inf-001 | Yes | task-C01 (25%) | 1 |
| inf-002 | Yes | task-C04 (40% — blocked) | 1 |
| inf-004 | Yes | — (task-O01 is Not Started, not in-progress) | 0 |
| inf-006 | **Busy** | task-I04 (50%), task-O02 (30%) | filtered out |
| inf-003 | **Busy** | — | filtered out |

> inf-003 and inf-006 are Busy — filtered out by `availability = 'Available'` and will not appear in reviewer suggestions.

---

## Access Isolation

```
v_visible_plans:
  Rule 1 — user is a direct plan_member (owner or member)
  Rule 2 — user manages a direct report who is a plan_member

v_visible_tasks:
  Rule 1 — current user is a plan_member of the plan containing the task
  Rule 2 — current user is the manager of at least one task assignee
```

### Expected visibility per context

| Actor | Visible plans | Visible tasks |
|-------|--------------|---------------|
| mgr-001 | INFRA, CLOUD, OPS | 15 tasks (task-I\*, task-C\*, task-O\*) |
| mgr-002 | SEC, PENTEST | 10 tasks (task-S\*, task-P\*) |
| mgr-003 | PROD, API, MAINT | 15 tasks (task-PD\*, task-A\*, task-M\*) |
| inf-001 | INFRA, CLOUD (member of both) | tasks in INFRA + CLOUD |
| inf-004 | INFRA, OPS (member of both) | tasks in INFRA + OPS |

---

## Planner Module Changes

### 1. New tool: `planner.list_direct_reports`

**File:** `modules/products/planner/src/tools/read/list_direct_reports.ts`

Returns all users whose `manager_id = current_setting('app.user_id')`. Used when a manager asks "who is on my team" or before calling `get_one_on_one_prep` to resolve an ambiguous name.

```
Input:  {} (no parameters)
Output: { reports: [{ entra_object_id, display_name, user_principal_name,
                      job_title, department, availability, activity }] }
```

> **Key implementation detail:** SQL uses `current_setting('app.tenant_id')` and `current_setting('app.user_id')` directly instead of calling `tenantContext.getTenantId()`. This is consistent with `list_available_reviewers` and makes unit testing possible without a live tenant context.

### 2. Updated tool: `planner.list_available_reviewers`

**File:** `modules/products/planner/src/tools/read/list_available_reviewers.ts`

#### New parameter: `myTeamOnly` (boolean, default `false`)

```typescript
myTeamOnly: z.boolean().optional().default(false)
// When true: restrict results to direct reports of the current user.
// SQL: AND (NOT ${myTeamOnly} OR u.manager_id = current_setting('app.user_id'))
```

#### New output fields: `active_task_count` and `active_task_titles`

```typescript
active_task_count:  z.number().int()     // total in-progress tasks (1–99 %)
active_task_titles: z.array(z.string())  // up to 5 titles, ordered by priority → due_date
```

Both fields are computed via a subquery against `planner.v_visible_tasks` — not the raw cache table — so RLS is enforced automatically:

```sql
(SELECT COUNT(*)::int FROM planner.v_visible_tasks t
 WHERE u.entra_object_id = ANY(t.assignee_ids)
   AND t.percent_complete BETWEEN 1 AND 99) AS active_task_count
```

#### Bug fixed: subquery previously queried `planner_tasks_cache` directly

The original subquery bypassed RLS by hitting `connector_ms365_planner.planner_tasks_cache` directly. Switching to `planner.v_visible_tasks` means:
- `soft_deleted_at IS NULL` is handled automatically by the view
- `tenant_id` filter is handled via `current_setting('app.tenant_id')`
- View Rule 2 ensures a manager only sees tasks where their direct reports are assignees

### 3. Updated agent instructions

**File:** `modules/products/planner/src/seeds/planner.ts`

**New tool-selection hints:**
```
- "who is on my team", "who do I manage", "my direct reports" → planner.list_direct_reports
- "1:1 prep for [person]", "[name]'s snapshot"               → list_direct_reports first
                                                                 if name is ambiguous,
                                                                 then get_one_on_one_prep
```

**Infrastructure review workflow — step 5 (updated):**
```
Call planner.list_available_reviewers with the inferred skills and myTeamOnly: true.
This restricts results to the manager's own direct reports (manager_id = current user)
who are Available and have matching skills. Do NOT pass planId.
```

**Infrastructure review workflow — step 6 report format (updated):**
```
- Task title + current assignee(s) (or "Unassigned")
- Status: 0 = Not Started · 1–99 = In Progress (X%)
          If in_progress and last modified > 3 days → [BLOCKED]
- Domain: Infrastructure / Security
- Priority + due date
- Suggested reviewers from your team:
    name, job title, availability, matched skills,
    active task count + up to 5 in-progress task titles
- [!] No available match in your team — if no direct report qualifies
```

**`PLANNER_TOOL_IDS`:** `'planner.list_direct_reports'` added.

---

## How to Test

### Unit tests (no database required)

Run immediately after cloning, no `DATABASE_URL` needed:

```bash
# Two new / modified tools
pnpm vitest run modules/products/planner/src/tools/read/list_direct_reports.test.ts
pnpm vitest run modules/products/planner/src/tools/read/list_available_reviewers.test.ts

# Full planner unit test suite
pnpm vitest run --project @seta/planner
```

**What unit tests cover:**
- `list_direct_reports`: returns rows, returns empty, propagates sql errors as `ok: false`
- `list_available_reviewers`: correct `matched_skills`, `active_task_count`, `active_task_titles` shape; reviewer with zero active tasks; `myTeamOnly` flag accepted; sql error path

**What unit tests do NOT cover** (sql is mocked — real view logic never runs):
- Isolation between managers
- Correctness of `current_setting('app.user_id')` SQL filter
- RLS view behavior (`v_visible_tasks`, `v_visible_plans`)

### Integration tests (database required)

#### Setup

```bash
pnpm db:up                          # start local PostgreSQL
pnpm migrate                        # run all migrations
psql $DATABASE_URL -f tests/fixtures/planner-mock/seed.sql
```

#### Base pattern

Use `withTenant` from `@seta/db` — the same function the middleware uses in production to set session variables:

```typescript
import { withTenant } from '@seta/db'

await withTenant(sql, TENANT_ID, async (tx) => {
  const plans = await tx`SELECT graph_plan_id FROM planner.v_visible_plans ORDER BY title`
  expect(plans.map(p => p.graph_plan_id)).toEqual([
    'plan-CLOUD-Q2', 'plan-INFRA-2026', 'plan-OPS-2026',
  ])
}, 'mgr-001')
```

#### Scenario 1 — Plan isolation

```typescript
const TENANT = '550e8400-e29b-41d4-a716-446655440000'

it('mgr-001 sees only the 3 Infrastructure plans', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`SELECT graph_plan_id FROM planner.v_visible_plans`
    expect(rows.map(r => r.graph_plan_id).sort()).toEqual([
      'plan-CLOUD-Q2', 'plan-INFRA-2026', 'plan-OPS-2026',
    ])
  }, 'mgr-001')
})

it('mgr-002 sees only the 2 Security plans', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`SELECT graph_plan_id FROM planner.v_visible_plans`
    expect(rows.map(r => r.graph_plan_id).sort()).toEqual([
      'plan-PENTEST-2026', 'plan-SEC-Q2',
    ])
  }, 'mgr-002')
})

it('mgr-001 cannot see mgr-002 plans', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`SELECT graph_plan_id FROM planner.v_visible_plans`
    const ids = rows.map(r => r.graph_plan_id)
    expect(ids).not.toContain('plan-SEC-Q2')
    expect(ids).not.toContain('plan-PENTEST-2026')
  }, 'mgr-001')
})
```

#### Scenario 2 — `list_direct_reports` isolation

```typescript
it('mgr-001 has exactly 6 direct reports', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`
      SELECT entra_object_id
      FROM connector_ms365_directory.directory_users
      WHERE tenant_id  = current_setting('app.tenant_id')::uuid
        AND manager_id = current_setting('app.user_id')
      ORDER BY entra_object_id
    `
    expect(rows.map(r => r.entra_object_id)).toEqual([
      'inf-001', 'inf-002', 'inf-003', 'inf-004', 'inf-005', 'inf-006',
    ])
  }, 'mgr-001')
})

it('employee inf-001 has no direct reports', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`
      SELECT entra_object_id
      FROM connector_ms365_directory.directory_users
      WHERE tenant_id  = current_setting('app.tenant_id')::uuid
        AND manager_id = current_setting('app.user_id')
    `
    expect(rows).toHaveLength(0)
  }, 'inf-001')
})
```

#### Scenario 3 — `list_available_reviewers` with `myTeamOnly`

```typescript
it('mgr-001 finds kubernetes reviewers only within their own team', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`
      SELECT u.entra_object_id,
             u.raw->'presence'->>'availability' AS availability,
             ARRAY(
               SELECT elem FROM jsonb_array_elements_text(u.raw->'skills') elem
               WHERE elem = ANY(ARRAY['kubernetes','aws'])
             ) AS matched_skills
      FROM connector_ms365_directory.directory_users u
      WHERE u.tenant_id = current_setting('app.tenant_id')::uuid
        AND u.raw->'presence'->>'availability' = 'Available'
        AND u.manager_id = current_setting('app.user_id')
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(u.raw->'skills') s
          WHERE s = ANY(ARRAY['kubernetes','aws'])
        )
    `
    const ids = rows.map(r => r.entra_object_id)
    // inf-001 (kubernetes, aws) and inf-002 (aws, kubernetes) are Available
    expect(ids).toContain('inf-001')
    expect(ids).toContain('inf-002')
    // inf-006 has kubernetes but is Busy (DoNotDisturb)
    expect(ids).not.toContain('inf-006')
    // sec-001 is in a different team entirely
    expect(ids).not.toContain('sec-001')
  }, 'mgr-001')
})
```

#### Scenario 4 — Active task count per reviewer

```typescript
it('inf-001 has 1 active task visible to mgr-001', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`
      SELECT COUNT(*)::int AS cnt
      FROM planner.v_visible_tasks
      WHERE 'inf-001' = ANY(assignee_ids)
        AND percent_complete BETWEEN 1 AND 99
    `
    expect(rows[0].cnt).toBe(1) // task-C01 (25%)
  }, 'mgr-001')
})

it('inf-006 has 2 active tasks visible to mgr-001', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`
      SELECT COUNT(*)::int AS cnt
      FROM planner.v_visible_tasks
      WHERE 'inf-006' = ANY(assignee_ids)
        AND percent_complete BETWEEN 1 AND 99
    `
    expect(rows[0].cnt).toBe(2) // task-I04 (50%) + task-O02 (30%)
  }, 'mgr-001')
})
```

#### Scenario 5 — Blocked task detection

```typescript
it('mgr-001 context exposes 2 blocked tasks', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`
      SELECT graph_task_id FROM planner.v_visible_tasks
      WHERE percent_complete BETWEEN 1 AND 99
        AND last_modified_at_graph < NOW() - INTERVAL '3 days'
      ORDER BY graph_task_id
    `
    expect(rows.map(r => r.graph_task_id)).toEqual(['task-C04', 'task-O02'])
  }, 'mgr-001')
})

it('mgr-002 context exposes 1 blocked task', async () => {
  await withTenant(sql, TENANT, async (tx) => {
    const rows = await tx`
      SELECT graph_task_id FROM planner.v_visible_tasks
      WHERE percent_complete BETWEEN 1 AND 99
        AND last_modified_at_graph < NOW() - INTERVAL '3 days'
    `
    expect(rows.map(r => r.graph_task_id)).toEqual(['task-P01'])
  }, 'mgr-002')
})
```

#### Scenario 6 — Infrastructure review workflow (end-to-end via raw SQL)

Run directly with `psql` to verify the full Agent pipeline:

```sql
BEGIN;
SELECT set_config('app.tenant_id', '550e8400-e29b-41d4-a716-446655440000', true);
SELECT set_config('app.user_id', 'mgr-001', true);

-- Step 1: fetch all incomplete tasks (Agent calls list_plan_tasks)
SELECT t.graph_task_id, t.title, t.percent_complete, b.name AS bucket
FROM planner.v_visible_tasks t
JOIN connector_ms365_planner.planner_buckets_cache b
  ON b.tenant_id = t.tenant_id AND b.graph_bucket_id = t.bucket_id
WHERE t.percent_complete < 100
ORDER BY t.priority, t.due_date NULLS LAST;
-- Expected: 11 rows (task-I01..04, task-C01..04, task-O01..04)

-- Step 2: identify blocked tasks
SELECT graph_task_id, title, percent_complete
FROM planner.v_visible_tasks
WHERE percent_complete BETWEEN 1 AND 99
  AND last_modified_at_graph < NOW() - INTERVAL '3 days';
-- Expected: task-C04 (40%), task-O02 (30%)

-- Step 3: find available reviewers with kubernetes/aws skills in mgr-001's team
SELECT u.display_name,
       u.raw->>'jobTitle'                  AS job_title,
       u.raw->'presence'->>'availability'  AS availability,
       ARRAY(
         SELECT elem FROM jsonb_array_elements_text(u.raw->'skills') elem
         WHERE elem = ANY(ARRAY['kubernetes','aws'])
       )                                   AS matched_skills,
       (SELECT COUNT(*)::int
        FROM planner.v_visible_tasks t
        WHERE u.entra_object_id = ANY(t.assignee_ids)
          AND t.percent_complete BETWEEN 1 AND 99) AS active_task_count
FROM connector_ms365_directory.directory_users u
WHERE u.tenant_id = current_setting('app.tenant_id')::uuid
  AND u.raw->'presence'->>'availability' = 'Available'
  AND u.manager_id = current_setting('app.user_id')
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(u.raw->'skills') s
    WHERE s = ANY(ARRAY['kubernetes','aws'])
  );
-- Expected: inf-001 (active=1), inf-002 (active=1), inf-004 (active=0)
-- inf-006 excluded: Busy

ROLLBACK;
```

### Run all integration tests

```bash
DATABASE_URL=postgres://... pnpm test:integration --filter @seta/planner
```

---

## Files in this directory

| File | Contents |
|------|---------|
| `seed.sql` | Complete mock data — INSERT statements for all tables. Single source of truth. |
| `01_directory_users.csv` | Directory users reference |
| `02_planner_plans_cache.csv` | Plans cache reference |
| `03_planner_buckets_cache.csv` | Buckets reference |
| `04_plan_members.csv` | Plan members with role |
| `README.md` | This file |

> CSV files are for reference only. **Do not use them with COPY** — they omit nullable columns (`raw`, `container_url`). Use `seed.sql` for all test environment setup.
