# Design — Install Documentation (Epic 6)

**Status**: Draft for review · open questions resolved in brainstorm + this session
**Author**: Canh Ta (with Claude)
**Date**: 2026-05-11
**Source brainstorm**: `docs/plans/MS365 Epics Brainstorm.md` — Epic 6
**Depends on**:
  - Epic 1 (`2026-05-11-ms365-auth-design.md`) — for `customer.md` scope coverage
  - Epic 2-4 — for what's documented (tools, Teams install)

---

## 1. Goal

A customer IT admin can install the Seta agent in their Microsoft 365 + Teams tenant in **≤30 minutes from docs alone** (dry-run gate). A Seta operations engineer can bootstrap a fresh Seta deployment from a runbook in **≤2 hours from clean AWS account**. Every end user gets a 1-page primer and an in-app `@SetaAgent help` card.

## 2. Non-goals (P1)

- Static-site generator (Docusaurus / VitePress). For now we keep documentation as a plain `docs/` folder in the repo; **hosting is deferred**. Re-evaluate when OSS flip lands and `os.seta-international.com/docs` URL is needed.
- I18n. English only in P1; other languages when a customer requires it.
- Automated screenshot capture. Manual PNG commits.
- PDF generation.
- Versioned docs (each release ships its own). Evergreen "latest" in `main` for P1.

## 3. Deliverables (5 files + 1 in-app card + CI guard)

```
docs/
  install/
    customer.md                    Customer IT admin install guide (PM authors · FS reviews · AG-F2 validates)
    security-overview.md           Customer security / vendor-review answers (PM · FS+AG-S review)
    img/                           PNG screenshots; relative paths from customer.md
      consent-screen.png
      admin-center-upload.png
      ...                          (~6-10 images for P1)
  runbook/
    bootstrap.md                   Seta IT / DevOps bootstrap-from-clean-AWS (PM · DevOps review)
  user/
    quickstart.md                  1-page end-user primer (PM authors · AG-F wires help command)

modules/products/agent/src/cards/
  help.ts                          NEW — static Adaptive Card for `@SetaAgent help`

.github/PULL_REQUEST_TEMPLATE.md   Adds "Docs updated?" checkbox (drift guard)
```

## 4. `docs/install/customer.md` — the headline doc

### 4.1 Audience

A customer IT admin who:
- has Global Administrator (or equivalent) rights in their Microsoft 365 tenant
- is doing this for the first time
- has 30 minutes and a coffee

### 4.2 Required outline

1. **Before you start** (≤2 min read)
   - What gets installed (one Entra app + one Teams app)
   - What permissions are requested + why (cross-link `security-overview.md`)
   - What you need: Global Admin, ~30 min, the latest `seta-agent-<version>.zip`

2. **Step 1 — Admin-consent the Entra app** (≤5 min)
   - Click the consent link your Seta contact sent you
   - Microsoft consent screen renders — screenshot
   - 5 scopes called out individually with one-line rationale each (Tasks.ReadWrite, Group.ReadWrite.All, Group.Read.All, User.Read, offline_access)
   - Click Accept; redirect to confirmation page
   - **Troubleshooting**: "I see a different consent screen", "I don't have Global Admin", "Conditional Access blocked the redirect"

3. **Step 2 — Sideload the Teams app** (≤5 min)
   - Download `seta-agent-<version>.zip` from the link
   - Teams Admin Center → Manage apps → Upload — screenshots at each step
   - Assign to a Users policy → assign policy to your pilot team
   - **Troubleshooting**: "Upload rejected — manifest invalid", "App doesn't appear in the catalog"

4. **Step 3 — Verify a pilot user can @-mention** (≤2 min)
   - Pilot user opens Teams → new chat with @SetaAgent → first message
   - Welcome card appears
   - Pilot user types `show my open tasks`; data appears

5. **What now**
   - Cross-link `user/quickstart.md` for end users to read
   - How to remove the app cleanly (uninstall from Admin Center → tokens auto-revoked)
   - Where to file issues (Seta support email + GitHub Issues link, post-OSS flip)

### 4.3 Troubleshooting matrix (embedded at end of customer.md)

| Symptom | Cause | Fix |
|---|---|---|
| Consent screen shows different scopes than docs say | Different app registration / stale link | Confirm link came from your Seta contact today |
| "Admin consent required" but you ARE admin | Conditional Access policy / step-up auth | Coordinate with your Conditional Access team; provide claims-challenge whitelist for our app id |
| Upload rejected: "manifest invalid" | Wrong zip version | Re-download latest from the link |
| Bot doesn't reply to @-mention | Policy not assigned / propagation lag | Wait 10 min; confirm in Admin Center → Manage apps → policy assignments |
| Bot replies with "Your tenant's consent was revoked" | Admin revoked in Entra portal | Re-do Step 1 (click the consent link again) |

Author-blindness mitigation: AG-F2 walks this guide from a fresh M365 tenant 2 days before M6, stopwatch starts at "Before you start", target ≤30 min. Failures or surprises feed back into the next revision.

## 5. `docs/install/security-overview.md`

Targeted at the customer security / vendor-review reviewer. Pre-answers the 10 most common third-party-vendor questions:

1. What data does the agent access? — Planner tasks/plans/buckets + directory users/groups (read), Planner tasks (write). No mail, files, calendar in P1.
2. Where is the data stored? — AWS Postgres in `<region>`, encrypted at rest (AES-256), encrypted in transit (TLS 1.3).
3. How are credentials protected? — OAuth tokens AES-GCM encrypted with KMS-wrapped DEK; bound to tenant + purpose via KMS EncryptionContext.
4. Multi-tenant isolation? — Postgres RLS on every row, app connects as `tenant_user` (RLS-enforced), `platform_admin` reserved for migrations.
5. Audit? — Every Graph call logged with actor + operation + result; `audit.audit_log` queryable per tenant.
6. Data retention? — Cache rows pruned 30 days after `soft_deleted_at` (P2 — P1 keeps indefinitely).
7. Sub-processors? — AWS (infra), Microsoft (data source), OpenAI / Anthropic (LLM). No data exfiltration to model providers beyond user prompts + tool outputs (which the user typed).
8. GDPR? — Delete-on-request via `tooling/scripts/delete-tenant.ts` (P2 surface). P1: manual process.
9. SOC 2? — Foundation in place (audit log, encryption, RLS); formal SOC 2 prep in P3.
10. How do we revoke? — Uninstall in Teams Admin Center OR remove consent in Entra portal — agent surfaces friendly error within 5 min on the next call.

## 6. `docs/runbook/bootstrap.md` — Seta IT / DevOps

Outline:
1. **Prereqs** — clean AWS account, AWS CLI authenticated, GitHub access to `Seta-International/seta-os`, Node 24 + pnpm 11 + Docker.
2. **Terraform skeleton apply** — VPC, RDS Postgres (pgvector), ECS cluster, ALB, ECR repos for `apps/api` + `apps/worker`, KMS key for token vault, Secrets Manager entries. Module references → `infra/terraform/modules/...` (P2 surface; P1 ships minimal Terraform).
3. **Schema bootstrap** — `psql "$DATABASE_URL" -f infra/postgres/init.sql` (pgvector + pg_trgm + `platform_admin` role); `pnpm migrate` runs every owner package's migrations in dependency order.
4. **First-tenant seed** — fill `BOOTSTRAP_TENANT_SLUG`, `BOOTSTRAP_TENANT_NAME`, `BOOTSTRAP_ENTRA_*`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_CONNECTORS` in AWS Secrets Manager → `pnpm tsx tooling/scripts/seed-first-tenant.ts`. Idempotent; rerunnable.
5. **Deploy apps/api + apps/worker** — `docker build` → ECR push → ECS service update.
6. **Smoke check** — `curl https://staging-api.os.seta-international.com/healthz` → 200; `curl https://staging-worker.../healthz` → 200; Jaeger shows OTel spans for both.
7. **Teams ops channel bind** — `pnpm tsx tooling/scripts/bind-ops-channel.ts` (captures `kind='ops_channel'` reference for `TeamsChannelAlertSink`).
8. **Sideload Teams app for Seta tenant** — same `customer.md` Step 2 but for our own tenant.
9. **Smoke an end-to-end query** — `@SetaAgent show my open tasks` from a Seta user; assert response in <2s, audit row present.

DevOps owns the runbook; dry-runs once from a clean AWS account before M6.

## 7. `docs/user/quickstart.md` — 1-page end-user primer

```
# SetaAgent in Teams — quick start

SetaAgent helps you read, write, and analyze Microsoft Planner — without leaving Teams.

## Try these
- `@SetaAgent show my open tasks`
- `@SetaAgent who's overloaded?`
- `@SetaAgent create 3 follow-up tasks under "Q3 launch"`
- `@SetaAgent reassign John's overdue tasks to Mary`
- `@SetaAgent help` (full list of commands)

## Confirmations
Every write asks "Are you sure?" with the details. Click Confirm or Cancel.

## Daily digest
At 8 AM your local time, SetaAgent sends you a daily summary of due / overdue tasks.
Stop: `@SetaAgent stop daily digest`. Start: `@SetaAgent start daily digest`.

## Troubleshooting
- "You don't have access to that plan" → ask your team admin in Planner.
- "MS365 access revoked" → ping your IT admin to re-do the consent step.
- "This task changed since you looked" → just ask again; the agent will use the latest version.

For more, see [the full user guide][full].

[full]: ../install/customer.md
```

Single page. Linkable from the welcome card and the `help` command card.

## 8. `@SetaAgent help` Adaptive Card

```ts
// modules/products/agent/src/cards/help.ts
export function buildHelpCard(): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      { type: 'TextBlock', text: 'SetaAgent — what I can do', size: 'Large', weight: 'Bolder' },

      { type: 'TextBlock', text: 'Read', weight: 'Bolder' },
      { type: 'FactSet', facts: [
          { title: 'show my open tasks',         value: 'List tasks assigned to you' },
          { title: 'show tasks in <plan>',       value: 'List tasks in a plan' },
          { title: 'who\'s overloaded?',         value: 'Workload analysis as a chart + table' },
          { title: 'list my plans',              value: 'Plans you can see' },
      ]},

      { type: 'TextBlock', text: 'Write (with confirmation)', weight: 'Bolder' },
      { type: 'FactSet', facts: [
          { title: 'create a task',              value: 'Add tasks to a plan; you confirm before commit' },
          { title: 'update / reassign / complete', value: 'Edit existing tasks; bulk OK; you confirm' },
          { title: 'add a comment',              value: 'Comment on a task' },
          { title: 'create a plan',              value: 'Spin up a new Planner plan' },
      ]},

      { type: 'TextBlock', text: 'Subscriptions', weight: 'Bolder' },
      { type: 'FactSet', facts: [
          { title: 'stop daily digest',          value: 'Disable the 8 AM summary' },
          { title: 'start daily digest',         value: 'Re-enable it' },
      ]},

      { type: 'TextBlock',
        text: 'Full user guide: os.seta-international.com/docs/user/quickstart (once hosted) — or see `docs/user/quickstart.md` in the repo.',
        size: 'Small', isSubtle: true, wrap: true },
    ],
  }
}
```

**Routing** (in `modules/products/agent/src/teams-handler.ts`, pre-LLM):

```ts
if (/^@?SetaAgent\s+help\s*$/i.test(text)) {
  return replyCard(buildHelpCard())
}
```

Static. Deterministic. Zero token cost. Updated by hand when the tool surface changes (drift guard catches this via the PR template — see §10).

## 9. Drift guard — `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
### Docs check

- [ ] No install/config/tool-surface change in this PR, OR
- [ ] Updated `docs/install/customer.md` / `security-overview.md`
- [ ] Updated `docs/runbook/bootstrap.md`
- [ ] Updated `docs/user/quickstart.md` and/or `modules/products/agent/src/cards/help.ts`
```

PR template is the friction; AG-F2 dry-run is the verify. No CI link-checker in P1 (the doc-URL surface is small; the cost of false positives outweighs the catch rate). Add link-checker (lychee) when docs site lands at the OSS-flip milestone.

## 10. Validation gates

### 10.1 Fresh-tenant dry-run (AG-F2, 2 days before M6)

```
Stopwatch on. Read customer.md cold. Follow each step exactly.
Target: install completes ≤30 min.
Capture: every confusion moment, every "wait what" → feeds back to PM same day.
```

This is the primary author-blindness mitigation.

### 10.2 Internal bootstrap dry-run (DevOps, before M5)

```
Stopwatch on. Clean AWS account. Follow runbook/bootstrap.md cold.
Target: services live + smoke pass ≤2 hours.
Capture: missing prereqs, ambiguous step ordering, env var typos.
```

### 10.3 Pre-M6 sanity

```
Every example prompt in user/quickstart.md works verbatim on staging.
PM verifies M6-1 day. Failures are P0 to fix.
```

## 11. Acceptance criteria

| AC | Where met |
|---|---|
| Fresh-tenant onboarding ≤30 min | §10.1 dry-run gate |
| Security overview answers 10 standard questions | §5 explicit list |
| Internal bootstrap ≤2 hours from clean AWS | §10.2 dry-run gate |
| Every example prompt in quickstart works on staging | §10.3 sanity |
| In-app `@SetaAgent help` returns capability card | §8 |

## 12. Effort recap (matches brainstorm)

| Addition | MD | Owner |
|---|---:|---|
| `customer.md` (install + troubleshooting + screenshots) | 1.50 | PM |
| `security-overview.md` | 0.25 | PM |
| `bootstrap.md` (internal runbook) | 0.75 | PM |
| `quickstart.md` + `@SetaAgent help` wire-up | 0.25 + 0.10 | PM + AG-F |
| Doc dry-run validation | 0.50 | AG-F2 |
| Troubleshooting matrix (pair session) | 0.25 + 0.25 | PM + FS |
| **Total** | **+3.85** | PM +3.00 · FS +0.25 · AG-F +0.10 · AG-F2 +0.50 |

## 13. Deferrals

P1 close-out:
- Hosting the `docs/` folder at `os.seta-international.com/docs/...` — needs OSS-flip + a tiny Hono route or GitHub Pages decision.
- Link checker (lychee) in CI.
- Refresh-screenshots-on-MS-Admin-Center-UI-change sprint (handled manually at M6-1 week).

P2:
- Static-site generator if doc surface grows past ~20 files.
- I18n if a customer requires it.
- Per-release versioned docs.
- Automated screenshot capture via headless browser.

P3:
- PDF export for vendor-review packets.

## 14. CLAUDE.md changes implied

None — Epic 6 ships text + one Adaptive Card; no boundary changes.

## 15. References

- Epic 1-5 design docs.
- `docs/plans/MS365 Epics Brainstorm.md` — Epic 6 brainstorm source.
- Project Plan — milestones M5 (bootstrap dry-run gate) and M6 (customer dry-run gate).
