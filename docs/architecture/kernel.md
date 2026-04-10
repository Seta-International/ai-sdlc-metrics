# Future — Process Kernel Design

**Date:** 2026-04-08  
**Status:** Agreed  
**Project:** Seta Future AaaS

---

## Purpose

This document captures the agreed design for the Future Process Kernel — the single source of truth that every domain app, analytics layer, agent, and integration builds on top of.

The kernel solves the root problem of the 4 legacy apps (EMS, Timesheet, Hiring, Review): each app built its own identity, its own manager model, its own approval logic. Nothing could be trusted across system boundaries.

The kernel replaces that with one narrow, stable foundation. Apps own domain workflow. The kernel owns identity, authority, decisions, events, and exposure.

---

## Core Principles

- **Single source of trust** — every entity (person, org, assignment, approval) has one canonical record in the kernel. Apps never duplicate master data.
- **Multi-tenant from day one** — every record belongs to a tenant. Row-level security enforces isolation at the database layer.
- **Deny by default** — nothing is visible or accessible unless explicitly permitted.
- **Apps own workflow, kernel owns primitives** — the kernel does not run domain state machines. It provides the shared envelope for identity, decisions, events, and exposure.
- **Scalable to finance, KPI, reporting, agents** — every future module plugs into these primitives without rebuilding them.

---

## Multi-Tenancy

### Model

A **tenant** is an organization that subscribes to the platform. SETA is tenant #1. Future Vietnamese SMEs and global SMBs are subsequent tenants.

```sql
tenant
  id          UUID v7 PRIMARY KEY
  name        varchar(255) NOT NULL        -- "SETA Corp"
  slug        varchar(100) NOT NULL UNIQUE -- "seta" (used in URLs/config)
  status      active | suspended | cancelled
  plan_tier   starter | professional | enterprise
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Isolation

**Row-level isolation** — all tenants share one PostgreSQL database and schema. Every table carries a `tenant_id` column. PostgreSQL Row Level Security (RLS) policies enforce that no query leaks data across tenant boundaries.

**Why not schema-per-tenant or database-per-tenant:**

- Cost-effective at current scale (<10 tenants, ~300 users per tenant)
- Operationally simple for a 2–4 person engineering team
- Schema-per-tenant isolation can be added if a specific tenant requires it for compliance — this is a targeted migration for that tenant, not a system-wide rewrite

### Structure

```
Tenant (root container)
  └── All kernel entities scoped by tenant_id
  └── RLS policies enforce tenant boundary at DB layer
```

### RLS Tenant Context — Implementation Contract

**Critical security requirement:** `set_config` MUST use transaction-local scope, not session-local scope.

```ts
// nestjs-cls middleware — runs at the start of every request
// (HTTP requests, WebSocket messages, event handlers)
await db.execute(
  sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`,
  //                                                   ^^^^
  //                   false = transaction-local (resets at transaction end)
  //                   true  = session-local (NEVER use — leaks across pooled connections)
)
```

**Why this matters with RDS Proxy:** RDS Proxy reuses backend PostgreSQL connections across requests. If `set_config` is session-level, a reused connection carries the previous request's `tenant_id` — any query without an explicit `set_config` call will run scoped to the wrong tenant. Transaction-local scope resets automatically at transaction end, making it safe with connection pooling.

**Implementation rule:** Every code path that executes DB queries (tRPC procedures, event handlers, MCP tool handlers, outbox relay worker) MUST either:

1. Call `set_config` with `false` (transaction-local) before executing queries, OR
2. Run inside the nestjs-cls request context that sets tenant_id at the lifecycle start

The outbox relay and pg-boss workers are NOT request-scoped — they must explicitly call `set_config` before each row they process.

---

## The Kernel

### 1. Actor — The Central Identity Atom

An **Actor** is anything in the system that can hold identity, be assigned to things, own decisions, and appear in the audit log.

**Three types:**

| Type           | Represents                     | Examples                                                      |
| -------------- | ------------------------------ | ------------------------------------------------------------- |
| `person`       | Any individual human           | Employee, contractor, intern, candidate, client contact       |
| `organization` | Any company or external entity | Client company, partner, vendor org                           |
| `system`       | Non-human actors               | AI agents, integration bots, biometric devices, API consumers |

**Why `system` from day one:** AI agents proposing staffing changes, or biometric devices writing attendance records, need auditable identities. Without this, those actions have no traceable actor in the audit log.

```sql
actor
  id            UUID v7 PRIMARY KEY  -- time-ordered, $defaultFn(() => uuidv7()) in Drizzle
  tenant_id     → tenant reference
  type          person | organization | system
  status        active | inactive | suspended | archived
  display_name
  created_at
  updated_at
```

**Status transitions:**

```
invited → active → inactive → archived
                ↘ suspended → active (reinstated)
```

- `invited` — provisioned but not yet logged in (Microsoft SSO pending)
- `active` — can authenticate and act
- `inactive` — soft-disabled (e.g. on leave of absence, contract paused)
- `suspended` — access blocked pending investigation; reversible
- `archived` — permanently offboarded; never deleted for audit integrity (GDPR: anonymise, not delete)

Rehire = new `actor` record. Previous record stays `archived`.

**What Actor does NOT include:** departments and legal entities are not first-class Actor types. A department is a dimension of where a person sits (`org_placement`). A legal entity is a policy scope dimension. Neither initiates decisions or holds audit trails.

---

### 2. Identity & External Mapping

#### user_identity — login record for a person actor

```sql
user_identity
  id            UUID v7 PRIMARY KEY
  tenant_id
  actor_id      → actor reference
  email
  sso_subject   → Microsoft Entra object ID (oid claim from OIDC token)
  provider      microsoft | google | local
  status        active | suspended | deprovisioned
  last_login_at
```

#### external_identity_map — bridge to legacy and external systems

The kernel issues its own canonical `actor_id` for every identity. External system IDs (EMS employee IDs, Timesheet user IDs, biometric device IDs) are stored here — never used as join keys in application code.

```sql
external_identity_map
  id            UUID v7 PRIMARY KEY
  tenant_id
  actor_id      → canonical actor reference
  system_name   ems | timesheet | hiring | review | biometric | microsoft | payroll
  entity_type   employee | user | candidate | contact
  external_id   → the ID in the external system
  last_synced_at
  sync_state    active | stale | deprovisioned
```

**Why this matters for big-bang migration:** during cutover from the 4 legacy apps, every legacy ID maps cleanly to a canonical actor_id. No data is lost. Future integrations (payroll, finance, new systems) just add rows here.

---

### 3. Roles & Authority

Two distinct layers — permissions and org structure — kept separate.

#### department — canonical org dimension (kernel-owned)

The kernel owns the department reference. The People module writes to it. All other modules reference it.

```sql
department
  id            UUID v7 PRIMARY KEY
  tenant_id
  name
  parent_id     → self-reference for hierarchy (null = root department)
  cost_center_code
  is_active     boolean
  created_at
  updated_at
```

#### role_grant — what you can do

```sql
role_grant
  id            UUID v7 PRIMARY KEY
  tenant_id
  actor_id      → who holds the role
  role_key      hr_ops | line_manager | staffing_owner | account_manager |
                finance_operator | executive | employee |
                review_operator | recruiter |
                tenant_admin | platform_admin
  scope_type    global | department | project | account
  scope_id      → specific department/project/account (null if global)
  granted_by    → actor_id who granted this
  valid_from
  valid_until   → null means permanent until explicitly revoked
```

**role_key is extensible:** new domain modules register new role_keys. The kernel enforces the grant/revoke lifecycle; modules define what the key unlocks.

#### delegation — time-bounded authority transfer

When a manager is on leave, they delegate approval authority. This is NOT a role_grant copy — it is a temporary overlay with full audit trail.

```sql
delegation
  id            UUID v7 PRIMARY KEY
  tenant_id
  delegator_id  → actor_id (who is delegating)
  delegate_id   → actor_id (who receives authority)
  role_key      → which role is being delegated
  scope_type    → mirrors role_grant scope_type
  scope_id      → mirrors role_grant scope_id
  valid_from
  valid_until   → required, no indefinite delegations
  reason        text
  created_at
  revoked_at    → null unless manually cancelled before valid_until
```

**Rule:** decision routing checks `delegation` first (active, within validity window), then falls back to `role_grant`. Delegations auto-expire — no manual cleanup required.

#### org_placement — where you sit (full temporal history)

Written by the People module. Read by every other module. Full temporal history — every placement change creates a new row. Enables org chart as of any past date.

```sql
org_placement
  id            UUID v7 PRIMARY KEY
  tenant_id
  actor_id      → the person
  manager_id    → their line manager (actor_id)
  department_id → canonical department reference
  position_title
  effective_from
  effective_until  → null = current placement
```

**Query pattern:** `WHERE actor_id = $id AND effective_until IS NULL` for current placement. `WHERE actor_id = $id AND effective_from <= $date AND (effective_until IS NULL OR effective_until > $date)` for point-in-time.

**Required indexes for org_placement:**

```sql
-- Primary lookup: current placement for an actor
CREATE INDEX idx_org_placement_actor_current
  ON core.org_placement (tenant_id, actor_id)
  WHERE effective_until IS NULL;

-- Point-in-time lookup (used by agent context grounding + delegation checks)
CREATE INDEX idx_org_placement_actor_temporal
  ON core.org_placement (tenant_id, actor_id, effective_from, effective_until);

-- Manager hierarchy traversal (getDirectReports)
CREATE INDEX idx_org_placement_manager
  ON core.org_placement (tenant_id, manager_id)
  WHERE effective_until IS NULL;
```

**Required indexes for role_grant and delegation (also hit on every agent turn):**

```sql
CREATE INDEX idx_role_grant_actor ON core.role_grant (tenant_id, actor_id);
CREATE INDEX idx_delegation_delegate ON core.delegation (tenant_id, delegate_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_event_entity ON core.audit_event (tenant_id, entity_type, entity_id);
CREATE INDEX idx_outbox_event_pending ON core.outbox_event (tenant_id, status, created_at)
  WHERE status = 'pending';
```

**What this replaces:**

- EMS `manager` and account/project manager roles
- Timesheet `manager_id` and `line_manager_id`
- Review `direct_manager_id` and `reports_to_id`
- Hiring collaborator references

**The rule:** modules resolve authority by combining both. A leave approval goes to the line manager from `org_placement`, confirmed by `role_grant` for `line_manager`. No module invents its own manager logic.

---

### 4. Decision Envelope — Shared Approvals

One shared approval primitive for every workflow in the system. Instead of EMS offboarding tasks, Timesheet leave approvals, and Review reviewer changes all being built separately, they all use the same envelope.

```sql
decision_case
  id            UUID v7 PRIMARY KEY
  tenant_id
  case_type     leave_request | profile_change | staffing_approval |
                contract_approval | offboarding | reviewer_change |
                kpi_score_approval | invoice_approval | budget_change
  status        pending | in_progress | approved | rejected | escalated | cancelled | expired
  requested_by  → actor_id
  owned_by_app  people | time | projects | hiring | performance | finance | goals | agents | admin
  policy_scope  JSONB → { legal_entity, country_code, worker_type }
  created_at
  resolved_at
  expires_at    → null means no expiry; when set, a pg-boss job fires at this time to set
                  status = 'expired', final_action = 'expired', decided_by = null in decision_outcome.
                  Expiry is a distinct state from rejection — it means no one acted, not that someone said no.
                  The owning module receives a DecisionCaseResolvedEvent and decides the downstream consequence
                  (e.g. Time module auto-cancels the leave request on expiry).

decision_step
  id            UUID v7 PRIMARY KEY
  case_id
  tenant_id
  step_order
  actor_id      → who must act (resolved from role_grant + delegation at routing time)
  role_key      → which role grants authority for this step
  action        approve | reject | veto | escalate
  status        pending | completed | skipped
  completed_at
  note

decision_outcome
  id            UUID v7 PRIMARY KEY
  case_id
  tenant_id
  final_action  approved | rejected | escalated | expired
  decided_by    → actor_id (null if system-expired)
  authority_trace JSONB → which role grants, delegations, and rules fired
  recorded_at
```

**Scalability for finance and KPI:** a KPI score approval, an invoice sign-off, a budget change are just new `case_type` values. No new approval infrastructure needed — just a new type registered in the same envelope.

**The rule:** modules own the workflow state machine (what triggers the decision, what happens after). The kernel owns the decision record — who approved it, why they had authority, and the full audit trace.

---

### 5. Event Spine & Audit Log

Every meaningful state change produces an immutable event. This serves three purposes simultaneously: compliance audit trail, analytics pipeline feed, and inter-app communication.

#### audit_event — permanent, immutable record

```sql
audit_event
  id                UUID v7 PRIMARY KEY
  tenant_id
  actor_id          → who caused it
  event_type        people.hired | leave.approved | assignment.changed |
                    contract.signed | kpi.score.submitted | invoice.approved ...
  entity_type       actor | assignment | leave_request | contract | kpi_score ...
  entity_id         → canonical ID of the affected record (UUID v7)
  payload           JSONB → full event data at time of occurrence
  schema_version    -- integer, starts at 1, see schema evolution contract below
  occurred_at
  source_app        people | time | projects | hiring | performance | finance | goals | agents
  correlation_id    → links related events (hire triggers onboarding chain)
  decision_case_id  → links to the approval that caused this (if any)
```

**audit_event schema evolution contract:**

- `schema_version` starts at 1 for all new events.
- Increment ONLY when the `payload` JSONB structure changes in a way that would break existing readers (renamed keys, removed fields, changed types). Adding new keys to `payload` is NOT a breaking change — do not increment for additions.
- When `schema_version` increments, the increment must be accompanied by: (a) documentation of what changed, and (b) updated reader code that handles both old and new versions by branching on `schema_version`.
- Old events are NEVER backfilled to new schema versions. The payload captured the state at the time of occurrence — altering it would violate immutability.
- Current schema_version = 1.

**Immutability enforced at DB layer — two independent layers:**

```sql
-- Layer 1: REVOKE write privileges from the application role
REVOKE UPDATE, DELETE ON core.audit_event FROM future_app_role;

-- Layer 2: Trigger-level guard (fires even if role privileges are elevated)
CREATE OR REPLACE FUNCTION core.prevent_audit_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is immutable — UPDATE and DELETE are prohibited. '
                  'This table is a permanent compliance record. '
                  'Violation: % on row id=%', TG_OP, OLD.id;
END;
$$;

CREATE TRIGGER enforce_audit_event_immutability
BEFORE UPDATE OR DELETE ON core.audit_event
FOR EACH ROW EXECUTE FUNCTION core.prevent_audit_event_mutation();
```

**GDPR compliance note:** When an individual requests erasure, the audit*event record is NOT deleted. Instead, personally identifiable fields in `payload` JSONB are anonymised in place (e.g., replace name with "ANONYMISED", replace email with a hash). The `actor_id` reference is preserved for audit integrity — but `actor` record can be anonymised. The audit trail of \_that an action occurred* is retained; the _identity_ of who performed it is anonymised.

Never deleted. The system's permanent memory.

#### outbox_event — transactional delivery queue (polling-based)

Written in the same DB transaction as the business operation. Guarantees domain events survive process crashes.

```sql
outbox_event
  id            UUID v7 PRIMARY KEY
  tenant_id
  event_type    → mirrors audit_event.event_type
  payload       JSONB
  status        pending | delivered | failed
  attempts      integer DEFAULT 0
  created_at
  deliver_at    → null = immediate; set for scheduled delivery
  delivered_at
```

**Delivery mechanism:**

```
outbox_event (pending)
  → NestJS scheduled relay (every 5s, SELECT ... FOR UPDATE SKIP LOCKED)
  → NestJS in-process EventBus.publish()
  → mark delivered
  → prune after 7 days
```

`FOR UPDATE SKIP LOCKED` ensures safe concurrent relay workers with no double-processing.

**Two tables, two purposes:**

| Table          | Purpose                            | Retention           |
| -------------- | ---------------------------------- | ------------------- |
| `audit_event`  | Permanent immutable compliance log | Forever             |
| `outbox_event` | Transactional delivery guarantee   | 7 days, then pruned |

**How it differs from pg-boss:**

- `outbox_event` = domain event delivery (written transactionally with business ops)
- `pg-boss` = background jobs (emails, notifications, scheduled tasks) — NOT written in the same transaction

**Service extraction path:** when a module is extracted to its own service, swap the relay target from in-process EventBus → BullMQ queue. `outbox_event` table schema stays unchanged. Redis is already in the stack — BullMQ adds zero infrastructure cost.

---

### 6. Visibility & Exposure

Deny-by-default access control for internal actors and external consumers (clients, partners, AI agents).

#### visibility_scope — what internal actors can see

```sql
visibility_scope
  id                UUID v7 PRIMARY KEY
  tenant_id
  actor_id          → the actor
  scope_type        own_data | department | project | account | org_wide
  scope_id          → specific entity ID (null if own_data or org_wide)
  granted_by_role_key → which role_grant produces this scope
```

#### exposure_contract — what external actors can read

```sql
exposure_contract
  id                UUID v7 PRIMARY KEY
  tenant_id
  consumer_type     client | partner | agent | api_key
  consumer_id       → actor_id of the consumer
  resource_type     project_status | kpi_score | roster | invoice_status | delivery_health
  resource_id       → specific resource
  allowed_actions   read | approve
  valid_from
  valid_until
  revoked_at
  revocation_reason
```

**How revocation works:** when an employee is offboarded, a contract ends, or a staffing assignment is removed — the kernel revokes the relevant exposure contracts immediately. No manual cleanup.

**Why this matters for KPI and finance:** client-facing KPI dashboards and invoice status views are controlled entirely by exposure contracts. The KPI app and Finance app don't build their own permission logic — the kernel enforces it.

---

### 7. Platform Configuration

Two kernel-owned tables that the `admin` module manages via its CRUD API. Read by other modules via `AdminQueryFacade`.

#### ai_provider_config — per-tenant AI model and key configuration

```sql
ai_provider_config
  id                    UUID v7 PRIMARY KEY
  tenant_id             UUID nullable  -- null = platform default; UUID = tenant override
  provider              openai | azure_openai | openai_compatible
  base_url              TEXT nullable  -- null = use provider default endpoint
  api_key_ref           TEXT nullable  -- AWS Secrets Manager ARN (null = use platform key)
                                       -- raw key never stored in DB
  classification_model  TEXT NOT NULL  -- default: 'gpt-5.4-nano'
  reasoning_model       TEXT NOT NULL  -- default: 'gpt-5.4'
  embedding_model       TEXT NOT NULL  -- default: 'text-embedding-3-small'
  max_tool_calls        INT DEFAULT 10
  cost_cap_usd_daily    DECIMAL nullable  -- null = no cap
  is_active             BOOLEAN DEFAULT true
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Runtime resolution:** check for active tenant override (`tenant_id = $current, is_active = true`) first, fall back to platform default (`tenant_id IS NULL`). Resolved at agent session start — not per tool call.

**BYO key flow:** tenant admin enters API key in `web-admin` → backend writes to Secrets Manager at `future/{env}/tenant/{tenantId}/openai-api-key` → ARN stored in `api_key_ref` → UI displays `sk-...xxxx` (last 4 chars) after save, never the full value.

#### module_entitlement — which modules a tenant has enabled

```sql
module_entitlement
  id          UUID v7 PRIMARY KEY
  tenant_id   UUID NOT NULL
  module_key  people | time | hiring | performance | projects |
              finance | goals | insights | agents | admin
  is_enabled  BOOLEAN DEFAULT true
  enabled_at  TIMESTAMPTZ NOT NULL
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Rule:** all modules are enabled by default at tenant provisioning. Platform admin can disable individual modules per tenant. `AdminQueryFacade.isModuleEnabled()` is the check point — called by tRPC middleware before routing to any module procedure.

---

## Complete Kernel Schema

```
Tenant (root container — tenant_id on every table, RLS enforced)
  │
  ├── actor                       person | organization | system
  │     ├── user_identity         login + Microsoft SSO link
  │     └── external_identity_map legacy + external system bridges
  │
  ├── department                  canonical org dimension (kernel-owned)
  │
  ├── role_grant                  what each actor can do
  ├── delegation                  time-bounded authority transfer
  ├── org_placement               where each person sits (full temporal history)
  │
  ├── decision_case               shared approval envelope
  │     ├── decision_step         who must act at each step
  │     └── decision_outcome      final result + authority trace
  │
  ├── audit_event                 immutable event log (permanent, INSERT only)
  ├── outbox_event                transactional delivery queue (polling relay, prunable)
  │
  ├── visibility_scope            what internal actors can see
  ├── exposure_contract           what external actors (clients, agents) can read
  │
  ├── ai_provider_config          per-tenant AI model + key config (platform default or override)
  └── module_entitlement          which modules each tenant has enabled

Background jobs (not kernel):
  └── pgboss schema               pg-boss — notifications, emails, scheduled tasks
```

**All IDs:** UUID v7 — time-ordered, native PostgreSQL `uuid` type, `$defaultFn(() => uuidv7())` in Drizzle ORM. Enables cursor-based pagination without extra timestamp columns.

---

## KernelQueryFacade — Public Interface

The only cross-module import allowed from the kernel module. All other modules inject `KernelQueryFacade` via NestJS DI for read operations. No module imports kernel repositories or entities directly.

```ts
export interface KernelQueryFacade {
  // Actor — returns null if not found (caller owns the NotFoundException)
  getActor(actorId: string, tenantId: string): Promise<Actor | null>
  findActorByExternalId(
    systemName: string,
    externalId: string,
    tenantId: string,
  ): Promise<Actor | null>

  // Org placement
  getCurrentOrgPlacement(actorId: string, tenantId: string): Promise<OrgPlacement | null>
  getOrgPlacementAt(actorId: string, asOfDate: Date, tenantId: string): Promise<OrgPlacement | null>
  getDirectReports(managerId: string, tenantId: string): Promise<Actor[]>

  // Role grants
  getRoleGrants(actorId: string, tenantId: string): Promise<RoleGrant[]>
  hasRole(actorId: string, roleKey: string, tenantId: string): Promise<boolean>

  // Delegation
  getActiveDelegations(actorId: string, tenantId: string): Promise<Delegation[]>

  // Decision
  getDecisionCase(caseId: string, tenantId: string): Promise<DecisionCase | null>

  // Exposure
  resolveExposureContract(
    consumerId: string,
    resourceType: string,
    resourceId: string,
    tenantId: string,
  ): Promise<ExposureContract | null>

  // Tenant
  getTenant(tenantId: string): Promise<Tenant | null>

  // Event idempotency — used by all cross-module event handlers
  isEventProcessed(eventId: string, handlerName: string): Promise<boolean>
  markEventProcessed(eventId: string, handlerName: string): Promise<void>
}
```

**Null return contract:** all `get*` methods return `null` when the entity does not exist. They never throw `NotFoundException`. The caller is responsible for deciding what "not found" means in their context and throwing the appropriate domain exception if needed.

**Note:** `ai_provider_config` and `module_entitlement` are managed by the `admin` module and exposed via `AdminQueryFacade` — not `KernelQueryFacade`. `KernelQueryFacade` is limited to identity, authority, decision primitives, and event idempotency.

---

## What the Kernel Does NOT Own

These stay in domain modules. The kernel provides primitives; modules own workflow.

| Domain                                 | Owned by                |
| -------------------------------------- | ----------------------- |
| Employee profiles, employment terms    | People module           |
| Attendance, leave, OT records          | Time module             |
| Project staffing requests, assignments | Projects module         |
| Candidate pipeline                     | Hiring module           |
| Review cycles, evaluations             | Performance module      |
| Invoices, payroll execution            | Finance module (future) |
| OKRs, KPI objectives, scores           | Goals module (future)   |
| Agent configs, execution logs          | Agents module (future)  |

---

## Decisions Log

All open questions resolved:

| Question               | Decision                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID strategy            | UUID v7 — time-ordered, `$defaultFn(() => uuidv7())` in Drizzle                                                                                                                                                                                                |
| Delegation model       | Separate `delegation` table — not a role_grant variant                                                                                                                                                                                                         |
| Department ownership   | Kernel-owned `department` table — People module writes, all modules reference                                                                                                                                                                                  |
| Tenant onboarding      | CLI script (`bun run tenant:provision --name "SETA" --domain seta-international.com`). Writes tenant record, seeds default agents, creates platform_admin role grant. No UI dependency — unblocks team from Day 1. Self-service signup is a future capability. |
| Actor status           | 5 states: `invited → active → inactive → suspended → archived`                                                                                                                                                                                                 |
| org_placement history  | Full temporal history — new row per change, `effective_until IS NULL` = current                                                                                                                                                                                |
| audit_event mutability | Immutable — INSERT only, no UPDATE/DELETE at DB layer                                                                                                                                                                                                          |
| Outbox mechanism       | Custom `core.outbox_event` polling table + `FOR UPDATE SKIP LOCKED` relay                                                                                                                                                                                      |
| Queue system           | pg-boss for background jobs; BullMQ when extracting a module to a separate service (transport swap only, no schema change)                                                                                                                                     |
| AI provider config     | `core.ai_provider_config` — kernel owns table, `admin` module owns CRUD. Tenant can supply BYO OpenAI key via Secrets Manager ARN.                                                                                                                             |
| Module entitlement     | `core.module_entitlement` — all modules enabled at provisioning. Platform admin can toggle per tenant.                                                                                                                                                         |

---

## Next

Application Architecture layer — monorepo structure, how domain modules connect to the kernel, module boundaries.
