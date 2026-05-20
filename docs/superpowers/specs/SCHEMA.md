# Mock Data Schema Reference

## CSV → Database Table Mapping

| CSV File | DB Schema | DB Table |
|---|---|---|
| `directory_users.csv` | `connector_ms365_directory` | `directory_users` |
| `directory_groups.csv` | `connector_ms365_directory` | `directory_groups` |
| `directory_group_members.csv` | `connector_ms365_directory` | `directory_group_members` |
| `directory_sync_state.csv` | `connector_ms365_directory` | `sync_state` |
| `planner_plans_cache.csv` | `connector_ms365_planner` | `planner_plans_cache` |
| `planner_buckets_cache.csv` | `connector_ms365_planner` | `planner_buckets_cache` |
| `planner_tasks_cache.csv` | `connector_ms365_planner` | `planner_tasks_cache` |
| `planner_task_details_cache.csv` | `connector_ms365_planner` | `planner_task_details_cache` |
| `planner_plan_members.csv` | `connector_ms365_planner` | `plan_members` |
| `planner_sync_watermarks.csv` | `connector_ms365_planner` | `sync_watermarks` |

The single tenant used across all files: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

---

## Connector: MS365 Directory

### `directory_users`

One row per Microsoft 365 user synced from Entra ID. The `raw` column holds the full Graph API response so consumers never need to re-fetch.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `entra_object_id` | text PK | Entra (AAD) user object ID — a GUID |
| `user_principal_name` | text | Login name: `firstname.lastname@setafuture.onmicrosoft.com` |
| `mail` | text | Primary SMTP address (same as UPN in this tenant) |
| `display_name` | text | Full Vietnamese name, e.g. `Nguyễn Văn Nam` |
| `manager_id` | text | `entra_object_id` of this user's direct manager (`NULL` for CEO) |
| `raw` | jsonb | Full MS Graph `user` response — see below |
| `synced_at` | timestamptz | When this row was last written by the sync job |

**`raw` field structure** (MS Graph `/users/{id}`)

```jsonc
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users/$entity",
  "id": "<entra_object_id>",           // same as entra_object_id column
  "displayName": "Nguyễn Văn Nam",
  "givenName": "Nam",                   // first name
  "surname": "Nguyễn",                  // family name
  "userPrincipalName": "nam.nguyen@setafuture.onmicrosoft.com",
  "mail": "nam.nguyen@setafuture.onmicrosoft.com",
  "jobTitle": "Backend Developer",      // one of the 11 defined roles
  "department": "Backend Engineering",  // maps to role group
  "officeLocation": "Ho Chi Minh City",
  "city": "Ho Chi Minh City",
  "country": "Vietnam",
  "usageLocation": "VN",               // ISO 3166-1 alpha-2
  "mobilePhone": "+84 912345678",
  "businessPhones": ["+84 912345678"],
  "preferredLanguage": "vi-VN",
  "accountEnabled": true,
  "userType": "Member",                // Member | Guest
  "employeeId": "1042",                // sequential from 1000
  "skills": ["Node.js", "PostgreSQL", "Docker"],  // 3–7 skills for the role
  "createdDateTime": "2025-08-12T00:00:00.000Z",
  "@odata.etag": "W/\"JzEt...\""
}
```

**Skills by job title**

| Job Title | Example Skills |
|---|---|
| CEO | Leadership, Business Strategy, Stakeholder Management, Digital Transformation |
| CTO | AWS, Engineering Leadership, DevOps, System Design |
| CDO | ML, NLP, Python, Data Engineering, AI |
| VP Engineering | Engineering Leadership, AWS, System Design, DevOps |
| Engineering Manager | Engineering Leadership, Agile, Risk Management, Stakeholder Management |
| Tech Lead | TypeScript, Node.js, System Design, React, PostgreSQL |
| Software Architect | System Design, AWS, Kubernetes, gRPC, PostgreSQL |
| Frontend Developer (Junior / Mid / Senior) | React, TypeScript, Next.js, JavaScript, Cypress, Design Systems |
| Backend Developer (Junior / Mid / Senior) | Node.js, PostgreSQL, Docker, TypeScript, Kafka, GraphQL |
| Fullstack Developer (Junior / Mid / Senior) | React, Node.js, TypeScript, PostgreSQL, Docker, AWS |
| Mobile Developer (Junior / Mid / Senior) | React Native, iOS, Android, Swift, Kotlin, SwiftUI |
| DevOps Engineer (Senior) | AWS, Kubernetes, Terraform, Helm, CI/CD, GitHub Actions, ArgoCD |
| Site Reliability Engineer | Linux, Monitoring, Prometheus, Grafana, Kubernetes, OpenTelemetry |
| Cloud Engineer | AWS, Azure, GCP, Terraform, CloudFront |
| IT Engineer | AWS, Kubernetes, Terraform, Linux, Monitoring, Security |
| Data Engineer (Senior) | Spark, Kafka, Airflow, Python, PostgreSQL, dbt, BigQuery |
| Data Scientist (Senior) | ML, NLP, Spark, Python, PyTorch, TensorFlow, Feature Engineering |
| ML Engineer | ML, PyTorch, TensorFlow, MLflow, Python |
| MLOps Engineer | MLOps, Kubernetes, MLflow, AWS, Docker, Python |
| AI Engineer | LLM, Prompt Engineering, LangChain, RAG, OpenAI SDK, Anthropic SDK |
| Generative AI Engineer | LLM, Fine-tuning, PyTorch, Hugging Face, RAG, Vector Databases |
| QA Engineer (Junior / Senior) | Cypress, Playwright, API Testing, Postman, JMeter, TypeScript |
| QA Automation Engineer | Selenium, Cypress, Playwright, Test Automation, Robot Framework |
| QA Lead | Test Automation, Cypress, Playwright, Risk Management |
| Security Engineer (Senior) | Security, OWASP, IAM, Penetration Testing, SAST, DAST, Threat Modeling |
| Security Lead | Security, ISO 27001, SOC 2, Zero Trust, Risk Management |
| Project Manager (Senior) | Agile, Scrum, JIRA, Risk Management, Stakeholder Management, Portfolio Management |
| Delivery Manager | Agile, Stakeholder Management, Risk Management, Resource Planning |
| Scrum Master | Scrum, Agile, Kanban, Stakeholder Management |
| Product Owner | Agile, Scrum, Product Roadmap, Stakeholder Management |
| Business Analyst | Stakeholder Management, Risk Management, Agile, JIRA, Product Roadmap |
| PMO (Lead / Analyst) | Portfolio Management, KPI, Governance, Resource Planning |
| UI/UX Designer (Senior / Lead) | Figma, Sketch, Wireframing, Prototyping, User Research, Design Systems, Accessibility |
| HR (Manager / Generalist / BP) | HRIS, Onboarding, Employee Engagement, Labor Law VN, Performance Reviews |
| Talent Acquisition | Technical Recruiting, LinkedIn Recruiter, Onboarding |
| IT Support / Administrator | Linux, Monitoring, Security, Office Operations |
| Account Manager / Sales Manager | Account Management, B2B Sales, CRM, Negotiation, Stakeholder Management |
| Marketing Specialist | Content Marketing, SEO, CRM |
| Finance / Accountant | Accounting, Financial Reporting, Budgeting |
| Operations Manager / Office Administrator | Office Operations, Stakeholder Management, HRIS |
| IC Executive | Internal Communications, Employee Engagement, Town Hall Facilitation |

---

### `directory_groups`

One row per Entra group (Teams-backed M365 groups and security groups).

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `entra_group_id` | text PK | Entra group object ID — a GUID |
| `display_name` | text | Human-readable group name |
| `group_type` | text | `Unified` (M365 / Teams group) or `SecurityGroup` |
| `raw` | jsonb | Full MS Graph `group` response — see below |
| `synced_at` | timestamptz | When this row was last written |

**`raw` field structure** (MS Graph `/groups/{id}`)

```jsonc
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#groups/$entity",
  "id": "<entra_group_id>",
  "displayName": "Frontend Team",
  "description": "Frontend engineering team",
  "mail": "frontend-team@setafuture.onmicrosoft.com",
  "mailEnabled": true,
  "securityEnabled": false,            // true only for SecurityGroup type
  "mailNickname": "frontend-team",
  "groupTypes": ["Unified"],           // ["Unified"] = M365/Teams; [] = security
  "visibility": "Private",             // Public | Private
  "resourceProvisioningOptions": ["Team"],  // ["Team"] = has a Teams workspace
  "membershipRule": null,
  "createdDateTime": "2025-11-10T00:00:00.000Z",
  "renewedDateTime": "2026-05-19T07:00:00+00:00",
  "@odata.etag": "W/\"JzEt...\""
}
```

**Groups in this dataset**

| Group | Type | Purpose |
|---|---|---|
| Leadership Team | Unified | CEO, CTO, CDO, IC Execs |
| Engineering All Hands | Unified | All PMs + developers |
| Frontend Team | Unified | All Frontend Developers |
| Backend Team | Unified | All Backend Developers |
| Fullstack Team | Unified | All Fullstack Developers |
| PMO Office | Unified | All PMO staff |
| Product Management | Unified | All PMs |
| HR & Talent | Unified | All Talent Acquisition staff |
| IT & Infrastructure | Unified | All IT staff |
| Infrastructure Review | Unified | Cross-functional review task force |
| Cloud & DevOps | Unified | IT + cloud-skilled Backend engineers |
| Data & Analytics | Unified | CDO + data-skilled Backend engineers |
| Security Task Force | SecurityGroup | IT + select engineers |
| Internal Communications | Unified | CEO + all IC Executives |

---

### `directory_group_members`

Maps users to groups. One row per (group, user) pair.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `entra_group_id` | text PK | References `directory_groups.entra_group_id` |
| `entra_object_id` | text PK | References `directory_users.entra_object_id` |
| `role` | text | `owner` (group admin) or `member` |
| `synced_at` | timestamptz | When this row was last written |

---

### `sync_state`

Tracks the delta-sync cursor for each resource type. One row per resource kind.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `resource_kind` | text PK | `users` or `groups` |
| `delta_token` | text | Opaque cursor returned by MS Graph delta queries; `NULL` before first sync |
| `last_full_sync_at` | timestamptz | When the last full (non-delta) sync ran |
| `last_delta_sync_at` | timestamptz | When the last delta sync ran |
| `status` | text | `idle` \| `syncing` \| `error` |

---

## Connector: MS365 Planner

### `planner_plans_cache`

One row per Planner plan. Plans are owned by an Entra group.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `graph_plan_id` | text PK | 28-char opaque Planner plan ID |
| `owner_group_id` | text | Entra group ID that owns this plan — links to `directory_groups` |
| `title` | text | Plan name |
| `container_url` | text | Graph URL of the owning group |
| `etag` | text | MS Graph ETag for optimistic concurrency on writes |
| `raw` | jsonb | Full MS Graph `plannerPlan` response — see below |
| `synced_at` | timestamptz | When this row was last written |
| `soft_deleted_at` | timestamptz | Set when plan is deleted in Graph; `NULL` for active plans |

**`raw` field structure** (MS Graph `/planner/plans/{id}`)

```jsonc
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#planner/plans/$entity",
  "id": "a593a09a08e0438b974e632e4831",   // 28-char plan ID
  "title": "Infrastructure Review Q2 2026",
  "owner": "<group-guid>",               // deprecated; prefer container
  "container": {
    "@odata.type": "#microsoft.graph.plannerPlanContainer",
    "containerId": "<group-guid>",
    "type": "group",                      // group | roster | teamsChannel | ...
    "url": "https://graph.microsoft.com/v1.0/groups/<group-guid>"
  },
  "createdBy": {
    "@odata.type": "#microsoft.graph.identitySet",
    "user": { "id": "<user-guid>", "displayName": "Trần Văn Hùng" }
  },
  "createdDateTime": "2026-02-18T00:00:00.000Z",
  "@odata.etag": "W/\"JzEt...\""
}
```

**Plans in this dataset**

| Plan | Owner Group |
|---|---|
| Infrastructure Review Q2 2026 | Infrastructure Review |
| Q2 2026 Engineering Sprint | Engineering All Hands |
| Frontend Modernization | Frontend Team |
| Backend Services Optimization | Backend Team |
| Cloud Infrastructure Setup | Cloud & DevOps |
| Security & Compliance 2026 | Security Task Force |
| Product Roadmap H1 2026 | Product Management |
| PMO Governance & Reporting | PMO Office |

---

### `planner_buckets_cache`

One row per bucket (column/stage) within a plan.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `graph_bucket_id` | text PK | 28-char opaque bucket ID |
| `plan_id` | text | Parent plan — references `planner_plans_cache.graph_plan_id` |
| `name` | text | Bucket label, e.g. `To Do`, `In Progress`, `Done` |
| `order_hint` | text | Opaque ordering string used by Planner, e.g. `"1000!"` |
| `etag` | text | MS Graph ETag |
| `raw` | jsonb | Full MS Graph `plannerBucket` response — see below |
| `synced_at` | timestamptz | When this row was last written |
| `soft_deleted_at` | timestamptz | Set when bucket is removed; `NULL` for active buckets |

**`raw` field structure** (MS Graph `/planner/buckets/{id}`)

```jsonc
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#planner/buckets/$entity",
  "id": "6ada77ffdd7a4350ab4f2952befd",
  "name": "To Do",
  "planId": "a593a09a08e0438b974e632e4831",
  "orderHint": "1000!",
  "@odata.etag": "W/\"JzEt...\""
}
```

Each plan uses a standard 4-bucket layout:

| Plan | Buckets |
|---|---|
| Infrastructure Review, Frontend, Backend, Security, Product | To Do → In Progress → In Review → Done |
| Engineering Sprint | Backlog → Sprint 1 → Sprint 2 → Done |
| Cloud Infrastructure | To Do → In Progress → Blocked → Done |
| PMO | To Do → In Progress → Done |

---

### `planner_tasks_cache`

One row per Planner task. Contains the summary fields used for listing and filtering.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `graph_task_id` | text PK | 28-char opaque task ID |
| `plan_id` | text | Parent plan — references `planner_plans_cache.graph_plan_id` |
| `bucket_id` | text | Current bucket — references `planner_buckets_cache.graph_bucket_id` |
| `title` | text | Task title |
| `percent_complete` | smallint | `0` (not started) · `50` (in progress) · `100` (complete) |
| `priority` | smallint | `1` urgent · `3` important · `5` medium · `9` low |
| `due_date` | timestamptz | Task due date; `NULL` if not set |
| `assignee_ids` | text[] | Array of `entra_object_id` values — PostgreSQL array `{uuid1,uuid2}` |
| `created_by` | text | `entra_object_id` of creator |
| `created_at_graph` | timestamptz | Creation timestamp from Graph |
| `last_modified_by` | text | `entra_object_id` of last editor |
| `last_modified_at_graph` | timestamptz | Last modification timestamp from Graph |
| `etag` | text | MS Graph ETag |
| `raw` | jsonb | Full MS Graph `plannerTask` response — see below |
| `synced_at` | timestamptz | When this row was last written |
| `soft_deleted_at` | timestamptz | Set when task is deleted; `NULL` for active tasks |

**`raw` field structure** (MS Graph `/planner/tasks/{id}`)

```jsonc
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#planner/tasks/$entity",
  "id": "701db1d899974616b6c8d7fa7f17",
  "planId": "a593a09a08e0438b974e632e4831",
  "bucketId": "6ada77ffdd7a4350ab4f2952befd",
  "title": "Review AWS infrastructure architecture and resource allocation",
  "orderHint": "583921!",               // opaque sort key
  "assigneePriority": "71234!",         // opaque sort key within assignee view
  "percentComplete": 0,                 // 0 | 50 | 100
  "priority": 1,                        // 1=urgent 3=important 5=medium 9=low
  "startDateTime": null,
  "dueDateTime": "2026-06-02T07:00:00.000Z",
  "createdDateTime": "2026-04-15T07:00:00.000Z",
  "completedDateTime": null,            // set when percentComplete = 100
  "hasDescription": true,               // true when task_details has a description
  "previewType": "description",         // automatic | noPreview | checklist | description
  "referenceCount": 0,
  "checklistItemCount": 4,              // total checklist items
  "activeChecklistItemCount": 4,        // unchecked items
  "conversationThreadId": null,
  "createdBy": {
    "@odata.type": "#microsoft.graph.identitySet",
    "user": { "id": "<user-guid>" }
  },
  "completedBy": null,                  // identitySet when task is done
  "assignments": {                      // open dict — key = assignee entra_object_id
    "<user-guid>": {
      "@odata.type": "#microsoft.graph.plannerAssignment",
      "orderHint": "71687!",
      "assignedBy": {
        "@odata.type": "#microsoft.graph.identitySet",
        "user": { "id": "<assigner-guid>" }
      },
      "assignedDateTime": "2026-05-19T07:00:00+00:00"
    }
  },
  "appliedCategories": {               // label flags (category1–6 map to plan colour labels)
    "category1": false,
    "category2": false,
    "category3": false,
    "category4": false,
    "category5": false,
    "category6": false
  },
  "@odata.etag": "W/\"JzEt...\""
}
```

> **Note on `assignments`:** The object keys are user GUIDs, not an array. To find assignees, iterate the keys of `raw->'assignments'` or use the denormalised `assignee_ids` array column directly.

---

### `planner_task_details_cache`

One row per task (same PK as `planner_tasks_cache`). Holds the heavy payload fetched separately by Graph.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `graph_task_id` | text PK | References `planner_tasks_cache.graph_task_id` |
| `description` | text | Free-text task description / acceptance criteria |
| `checklist` | jsonb | Checklist items — open dict keyed by item GUID — see below |
| `references` | jsonb | Attached external links — open dict keyed by encoded URL (empty in this dataset) |
| `etag` | text | MS Graph ETag (separate from the task ETag) |
| `raw` | jsonb | Full MS Graph `plannerTaskDetails` response — mirrors the columns above |
| `synced_at` | timestamptz | When this row was last written |

**`checklist` field structure**

```jsonc
{
  "<item-guid-28-chars>": {
    "@odata.type": "#microsoft.graph.plannerChecklistItem",
    "isChecked": false,                 // true = checked off
    "title": "Audit EC2 instances",     // checklist item text
    "orderHint": "422!",                // opaque sort key
    "lastModifiedBy": {
      "user": { "id": "<user-guid>" }
    },
    "lastModifiedDateTime": "2026-05-19T07:00:00+00:00"
  },
  "<another-item-guid>": { ... }
}
```

**`references` field structure** (empty in this dataset — shown for completeness)

```jsonc
{
  "<percent-encoded-url>": {
    "@odata.type": "#microsoft.graph.plannerExternalReference",
    "alias": "Design Doc",
    "type": "PowerPoint",               // Word | Excel | PowerPoint | OneNote | Project | Visio | Other
    "previewPriority": "8585!",
    "lastModifiedBy": { "user": { "id": "<user-guid>" } },
    "lastModifiedDateTime": "2026-05-19T07:00:00+00:00"
  }
}
```

---

### `plan_members`

Maps users to plans (not groups — this is plan-level membership derived from the owning group's membership at sync time).

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `plan_id` | text PK | References `planner_plans_cache.graph_plan_id` |
| `user_id` | text PK | `entra_object_id` — references `directory_users.entra_object_id` |
| `synced_at` | timestamptz | When this row was last written |

---

### `sync_watermarks`

Tracks the sync cursor per plan (and one tenant-level entry). Used by the delta-sync job to resume from the last known position.

| Column | Type | Description |
|---|---|---|
| `tenant_id` | uuid PK | Owning tenant |
| `scope_kind` | text PK | `plan` (per-plan sync) or `tenant` (tenant-wide) |
| `scope_id` | text PK | The `graph_plan_id` when `scope_kind = plan`; `tenant_id` when `scope_kind = tenant` |
| `last_sync_at` | timestamptz | Timestamp of last successful sync for this scope |
| `status` | text | `idle` \| `syncing` \| `error` |
| `delta_token` | text | Opaque cursor from Graph delta query; `NULL` triggers a full sync |

---

## Cross-Table Join Map

```
directory_users.entra_object_id
  └─► directory_group_members.entra_object_id  (user → group)
  └─► planner_tasks_cache.assignee_ids[]        (user is assigned a task)
  └─► planner_tasks_cache.created_by            (user created a task)
  └─► plan_members.user_id                      (user is member of a plan)
  └─► raw->assignments keys                     (same as assignee_ids, in JSON)

directory_groups.entra_group_id
  └─► directory_group_members.entra_group_id    (group → users)
  └─► planner_plans_cache.owner_group_id        (group owns a plan)

planner_plans_cache.graph_plan_id
  └─► planner_buckets_cache.plan_id             (plan → buckets)
  └─► planner_tasks_cache.plan_id               (plan → tasks)
  └─► plan_members.plan_id                      (plan → members)
  └─► sync_watermarks.scope_id                  (plan sync cursor)

planner_buckets_cache.graph_bucket_id
  └─► planner_tasks_cache.bucket_id             (bucket → tasks)

planner_tasks_cache.graph_task_id
  └─► planner_task_details_cache.graph_task_id  (task → details/checklist)
```

## Example Agent Query Patterns

**"Who in the Infrastructure Review team has AWS and Kubernetes skills?"**
```
directory_group_members (group = Infrastructure Review)
  → directory_users.entra_object_id
  → raw->>'skills' contains 'AWS' AND 'Kubernetes'
```

**"Which tasks are assigned to a given user?"**
```
planner_tasks_cache WHERE assignee_ids @> ARRAY['<user-id>']
  JOIN planner_task_details_cache ON graph_task_id   -- for description + checklist
```

**"What is the remaining workload for a user across all plans?"**
```
planner_tasks_cache WHERE assignee_ids @> ARRAY['<user-id>']
  AND percent_complete < 100
  AND soft_deleted_at IS NULL
ORDER BY priority, due_date
```

**"Show all infrastructure review tasks not yet complete with their assignees"**
```
planner_plans_cache  WHERE title ILIKE '%infrastructure%'
  → planner_tasks_cache WHERE plan_id = ... AND percent_complete < 100
  → directory_users WHERE entra_object_id = ANY(assignee_ids)
```
