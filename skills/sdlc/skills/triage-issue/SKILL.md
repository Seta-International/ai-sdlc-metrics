---
name: triage-issue
description: Converts a bug report, error message, or stack trace into a standard Bug ticket using references/templates/bug.md, setting priority per the P0-P3 rules in standards.md and adding `needs-human-review` for security, data, or permission bugs. Use when the user pastes an error, stack trace, or bug description and asks to "file a bug", "create a ticket for this", "triage this issue", or "add this to the backlog". Delegates dedupe + Jira write to atlassian:triage-issue when installed.
---

# Triage issue

Turn a bug report into a well-formed Bug ticket. This skill shapes the ticket; it delegates dedupe and Jira write to `atlassian:triage-issue` when that plugin is installed.

## When to use

- User pastes an error message, stack trace, screenshot, or bug narrative
- User asks: "file a bug", "triage this", "create a ticket for this error"
- Distinct from `sdlc:spec-to-backlog` (multiple tickets from a spec) and `sdlc:create-ticket` (single ticket for new work)

## Workflow

```
- [ ] 1. Parse the bug input
- [ ] 2. Search for duplicates (if atlassian available)
- [ ] 3. Fill references/templates/bug.md
- [ ] 4. Assign priority per P0-P3 rules
- [ ] 5. Apply required tags
- [ ] 6. Materialize
```

### 1. Parse the bug

Extract: error message, stack trace / file:line, steps to reproduce (if provided), expected vs. actual, affected users/tenants (if known), environment (prod / staging / local). Ask the user only for the gaps that truly block ticket creation.

### 2. Dedupe search

If `atlassian:triage-issue` is in the available skills, prefer delegating the whole thing — it handles dedupe natively. Otherwise, if `mcp__atlassian__jira_search_issues` is available, search for existing open bugs with overlapping error text before creating a new one. If a match exists, surface it and ask: "This looks like PROJ-XXX. Add a comment there instead of creating a new ticket?"

### 3. Fill the template

Use `references/templates/bug.md`. Required sections:

- **Summary** — one line, specific ("pagination returns 500 when per_page > 100" beats "pagination bug")
- **Current Behavior** — what actually happens
- **Expected Behavior** — what should happen
- **Reproduction Steps** — concrete, minimal, numbered
- **Acceptance Criteria** — checklist. At minimum: fix lands, regression test added, verified in staging
- **Testing Notes** — unit / integration / E2E coverage appropriate to the change, including the regression test that locks the fix in
- **Definition of Done** — per standards.md

### 4. Priority

Per standards.md P0-P3 definitions:

- **P0** — urgent blocker, production or critical delivery impact (data loss, outage, security incident)
- **P1** — high impact, should be handled soon (major flow broken, many users affected)
- **P2** — normal planned work (standard bug)
- **P3** — low urgency / nice-to-have (cosmetic, rare edge case)

Pick the one that honestly fits. Ask the user if genuinely unclear.

### 5. Tags

Always add the `bug` domain tag. Also add, per standards.md:

- `needs-human-review` if the bug touches security, data, migration, permission, billing, payroll, or customer-impacting areas. Multi-tenant data access, authentication, and authorization concerns are automatic triggers.
- `needs-context` if any Definition-of-Ready field is missing
- A work-type tag: `backend`, `frontend`, `api`, `database`, `integration`
- A risk tag if applicable: `security`, `data`, `permission`, `migration`, `external-sync`

### 6. Materialize

Follow `references/atlassian-delegation.md#phase-2--materialize`:

1. **Tier 1** — invoke `atlassian:triage-issue` via the `Skill` tool. Pass the shaped markdown. This is the preferred path because atlassian:triage-issue handles dedupe.
2. **Tier 2** — else call `mcp__atlassian__jira_create_issue` with the structured fields.
3. **Tier 3** — else print the filled bug template for manual paste.

On failure at Tier 1 or 2, stop and surface the error.

## Never do

- Never silently create a new bug ticket when a duplicate might exist. If atlassian isn't available and you can't search, tell the user you couldn't dedupe and ask whether to proceed.
- Never set priority P0 without strong evidence (outage, data loss, security). "User is frustrated" is not P0.
- Never skip the `needs-human-review` tag on security / data / permission bugs even if the user says it's minor.
- Never invent reproduction steps. If the user didn't provide them, tag `needs-context` and list what's missing.

## Key references

- `references/standards.md` — P0-P3 definitions, tag taxonomy, Definition of Ready
- `references/atlassian-delegation.md` — detection order, fallback, error handling
- `references/templates/bug.md` — bug template
