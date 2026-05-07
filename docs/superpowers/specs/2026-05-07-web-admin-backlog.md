# Web Admin Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.6.
**Tickets:** 1 Epic, 4 Stories.

**Personas served:**

- Tenant administrator — manages tenant settings, module toggles. Module-specific admin pages (Planner sync, Agents AI config) host inside this zone but their content is owned by PLAN-6 / AGN-6.
- Platform administrator (SETA operator) — distinct view, role-gated; can view but not alter tenant config (per agents-srs FR-084).

---

## [EPIC] ADMIN-1 web-admin zone shell + platform admin

ID: ADMIN-1
Status: Backlog
Sprint: Sprint-3 → Sprint-4
Release: phase-1
Priority: P0
Story Point: 13
Rank: 100
Jira Key:
Confluence Link:

### Summary

Scaffolds the `apps/web-admin` zone, integrates AppLayout, implements tenant settings + module toggles backed by the `admin` schema, and adds a role-gated platform-admin (SETA operator) view per agents-srs FR-084. Provides only the host shell — module-specific admin pages (PLAN-6 sync, AGN-6 AI config) live inside this zone but are authored by their respective backlogs.

### Goal

By S4 close, a Tenant administrator can sign into web-shell, navigate to `/admin/...`, and configure tenant settings + module toggles. A Platform administrator (SETA operator) can view tenant config but not alter.

### Scope

- `apps/web-admin` zone scaffold (Next.js zone, ECS service, ECR repo).
- AppLayout integration via `@future/app-layout`.
- Sidebar config registered with shell.
- Tenant settings page (timezone, locale, branding) backed by `admin` schema.
- Module toggles (admin schema) UI.
- Platform-admin role-gated view distinct from tenant admin (FR-084 cross-link).
- Host shell for module admin pages (PLAN-6, AGN-6 land their UIs here).

### Out of Scope

- AI config admin (lives in AGN-6).
- Planner sync admin (lives in PLAN-6).
- Hiring / Time / Performance / Finance / Goals admin — out of Phase-1 portfolio.

### SRS Coverage

- agents-srs FR-084 (platform vs tenant admin distinction).
- CLAUDE.md `admin` schema ownership: tenant settings, AI config, module toggles.

### Acceptance Criteria

- [ ] `apps/web-admin/` zone exists, builds, deploys.
- [ ] Tenant settings page reachable at `/admin/settings`.
- [ ] Module toggles writable by Tenant administrator only.
- [ ] Platform-admin view at `/admin/platform` is role-gated; reads tenant config without write capability.
- [ ] Every admin write emits a kernel `audit_event` in same DB tx (per §13 T1-2).

### Child Tickets

- ADMIN-1.S1 web-admin zone scaffold + AppLayout integration (Story)
- ADMIN-1.S2 Tenant settings page (Story)
- ADMIN-1.S3 Module toggles UI (Story)
- ADMIN-1.S4 Platform-admin role-gated view (Story)

### Definition of Done

- All child Stories `Status: Done`.
- A Tenant administrator can configure tenant settings + module toggles end-to-end.
- A Platform administrator can view but not alter tenant config — verified by failing-write test.

---

### [STORY] ADMIN-1.S1 web-admin zone scaffold + AppLayout integration

ID: ADMIN-1.S1
Status: Backlog
Epic: ADMIN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 110
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want the `apps/web-admin` zone scaffolded with AppLayout + sidebar registered with web-shell, so that subsequent admin pages have a host to land in.

#### Acceptance Criteria

- [ ] Zone scaffolds at `apps/web-admin/` mirroring the `apps/web-planner/` shape.
- [ ] AppLayout from `@future/app-layout` integrated (Personal Hubs + Global Nav).
- [ ] Sidebar config registered with shell (NavGroup with `items` only — no zone-local sidebar per CLAUDE.md).
- [ ] Page routes under `/admin/...`.
- [ ] Cross-zone navigation from web-shell to web-admin uses hard `<a>` reload (per CLAUDE.md).
- [ ] **E2E** — A Tenant administrator signs into web-shell, clicks the "Admin" sidebar entry, lands on `/admin` in the new web-admin zone within 2s.

#### AI Execution Notes

Mirror `apps/web-planner/` structure. Register a sidebar `NavGroup` with `items` (static) only — no `render` function and no zone-local sidebar component (per CLAUDE.md Navigation rule). Terraform ECS service + ECR repo config lives alongside the other zone infra. Cross-zone `<a>` links per CLAUDE.md multi-zone rule.

#### Testing Notes

- Unit: sidebar config shape satisfies `NavGroup` type (items-only, no render).
- Integration: n/a for scaffold.
- E2E: Playwright — sign in via web-shell, click "Admin" nav entry, assert URL is `/admin` within 2 s.

#### Dependencies

- Blocked by: FOUND-3.T1 (multi-zones scaffold), FOUND-3.T2 (app-layout)
- Blocks: ADMIN-1.S2, ADMIN-1.S3, ADMIN-1.S4 (all require this host shell)

#### Cross-links

- FOUND-3.T2 (app-layout), FOUND-3.T1 (multi-zones scaffold)

#### Definition of Done

- Inherits project DoD.
- Zone builds and deploys via CI without errors.
- Sidebar `NavGroup` typecheck passes with `items`-only shape.

---

### [STORY] ADMIN-1.S2 Tenant settings page

ID: ADMIN-1.S2
Status: Backlog
Epic: ADMIN-1
Sprint: Sprint-3
Release: phase-1
Priority: P1
Story Point: 3
Rank: 120
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to configure tenant timezone, locale, branding, so that the platform reflects my organization's identity.

#### Acceptance Criteria

- [ ] Settings page at `/admin/settings` with form for timezone, locale, branding.
- [ ] Backed by `admin.tenant_setting` table (Drizzle schema in `admin` module).
- [ ] Uses Server Actions or tRPC mutation (project pattern).
- [ ] kernel `audit_event` for every change (per §13 T1-2).
- [ ] **E2E** — Tenant admin changes timezone; refresh persists; audit event visible in admin audit view.

#### AI Execution Notes

Schema lives at `apps/api/src/modules/admin/infrastructure/`. Every write goes through the `admin` module command handler — never raw SQL in the route. `audit_event` must be written in the same DB transaction as the setting mutation; rollback if audit write fails (per §13 T1-2). Use `DB_TOKEN` + `RlsMiddleware` patterns from FOUND-2.T5.

#### Testing Notes

- Unit: command handler happy path + validation errors.
- Integration: against real Postgres — write setting, read back, assert audit row present.
- E2E: Playwright — change timezone, refresh, verify persisted value.
- Permission: only Tenant administrator role can call the mutation; platform_admin calls must be rejected with 403.

#### Dependencies

- Blocked by: ADMIN-1.S1 (host shell must exist), FOUND-2.T5 (RLS middleware)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Audit assertion test in `admin.handler.spec.ts` covers the settings mutation path.
- RLS dual-tenant probe passes against `admin.tenant_setting`.

---

### [STORY] ADMIN-1.S3 Module toggles UI

ID: ADMIN-1.S3
Status: Backlog
Epic: ADMIN-1
Sprint: Sprint-4
Release: phase-1
Priority: P2
Story Point: 3
Rank: 130
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to enable / disable platform modules per tenant, so that my tenant only sees the modules they are licensed for.

#### Acceptance Criteria

- [ ] Page at `/admin/modules` with toggle list.
- [ ] Backed by `admin.module_toggle` table.
- [ ] Toggle off hides module from sidebar within 5 minutes (per agents-srs FR-083 config-propagation pattern, applied here too).
- [ ] kernel `audit_event` for every toggle change.
- [ ] **E2E** — Tenant admin disables `time` module; user signs in fresh, no `Time` sidebar entry.

#### AI Execution Notes

`admin.module_toggle` table must include `tenant_id` (per CLAUDE.md "every table has tenant_id" rule). The sidebar propagation relies on the config-propagation pattern from agents-srs FR-083 — apply the same TTL / polling mechanism here. Audit event written in the same DB transaction as the toggle mutation.

#### Testing Notes

- Unit: command handler — enable toggle, disable toggle, each emits audit event.
- Integration: toggle off → verify sidebar query returns no entry for that module within propagation window.
- E2E: Playwright — disable `time` module, sign in as end user, assert no "Time" sidebar entry.
- Permission: only Tenant administrator role can call; platform_admin calls must be rejected with 403.

#### Dependencies

- Blocked by: ADMIN-1.S1 (host shell must exist)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Audit assertion test in `admin.handler.spec.ts` covers the toggle mutation path.
- Propagation integration test confirms sidebar suppression within 5-minute window.

---

### [STORY] ADMIN-1.S4 Platform-admin role-gated view

ID: ADMIN-1.S4
Status: Backlog
Epic: ADMIN-1
Sprint: Sprint-4
Release: phase-1
Priority: P1
Story Point: 5
Rank: 140
Jira Key:
Confluence Link:

#### Summary

As a Platform administrator, I want to view tenant configuration across all tenants, so that I can support customers without altering their settings.

#### Acceptance Criteria

- [ ] Platform-admin view at `/admin/platform`.
- [ ] Role-gated by kernel `platform_admin` grant (cross-link FOUND-2 kernel module).
- [ ] Read-only: every write API rejects platform_admin role with structured error (agents-srs FR-084: "shall be able to view but not alter tenant configuration values").
- [ ] kernel `audit_event` for every read (audit must capture platform_admin reads of tenant data).
- [ ] **E2E** — Platform admin signs in; navigates to `/admin/platform`; sees tenant list; attempts to edit a tenant setting via API; receives 403 with reason "platform_admin is read-only on tenant config."

#### AI Execution Notes

Role gate implemented via `KernelAuditFacade` / kernel authority module — never inline role checks in the route layer. The write-rejection guard lives in the `admin` module command handler (not the tRPC router). Audit event for reads must include the platform_admin subject and the tenant whose data was accessed.

#### Testing Notes

- Unit: command handler rejects platform_admin subject with structured 403 error; read query emits audit event.
- Integration: platform_admin token → read succeeds, write returns 403 with reason string.
- E2E: Playwright — platform admin flow end-to-end per acceptance criteria.
- Permission: platform_admin can list tenants and read settings; tenant_admin role must NOT be able to reach `/admin/platform`.

#### Dependencies

- Blocked by: ADMIN-1.S1 (host shell must exist), FOUND-2 (kernel authority module for platform_admin grant)
- Blocks: none

#### Cross-links

- agents-srs FR-084

#### Definition of Done

- Inherits project DoD.
- Failing-write test asserts 403 with exact reason string for platform_admin role.
- Audit assertion test in `admin.handler.spec.ts` covers platform_admin read path.
