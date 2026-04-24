---
name: spec-to-backlog
description: Converts a specification, design doc, or Confluence page into a standard backlog (one Epic + child Story/Task/Bug tickets) using the Agile standards and templates in references/. Use when the user asks to "turn this spec into tickets", "break this design doc into a backlog", "generate tickets from this Confluence page", or pastes a long spec with "make tickets for this". Applies the story-point table and Definition-of-Ready rules from standards.md before writing to Jira, then delegates the Jira push to atlassian:spec-to-backlog if installed, or prints copy-pasteable markdown if not.
---

# Spec to backlog

Turn a spec into a standard backlog. This skill owns the **shape** of the tickets (types, story points, tags, AC, testing notes). It delegates the **write to Jira** to the atlassian plugin when available.

## When to use

- A spec, design doc, PRD, or Confluence URL is in hand and needs to become an Epic + tickets
- User says: "turn this into a backlog", "make tickets for this spec", "break this down"
- Distinct from `sdlc:create-ticket` (single ad-hoc ticket) and `sdlc:triage-issue` (bug report)

## Workflow

Copy this checklist and track progress:

```
- [ ] 1. Read the spec
- [ ] 2. Identify the Epic (single outcome)
- [ ] 3. Break into Story / Task / Bug candidates (no Feature, no Subtask)
- [ ] 4. Apply the project's Agile standards to each ticket
- [ ] 5. Validate against Definition of Ready
- [ ] 6. Materialize to Jira (Tier 1 → 2 → 3)
- [ ] 7. Confirm with user and surface any `needs-human-review` items
```

### 1. Read the spec

If it's a Confluence URL, fetch via `mcp__atlassian__confluence_get_page` if available, else ask the user to paste the content. If it's a local path (commonly under `docs/superpowers/specs/` or `docs/specs/`), read it.

### 2. Identify the Epic

One spec = one Epic. The Epic captures the outcome. If the spec actually covers multiple outcomes, surface this and ask the user whether to split into separate Epics before proceeding.

Use the template at `references/templates/epic.md`.

### 3. Break into child tickets

Per `references/standards.md`:

- **Story** — user-facing value
- **Task** — technical / operational / docs / setup
- **Bug** — existing wrong behavior
- **Never Feature. Never Subtask.**

Use the matching template from `references/templates/`.

### 4. Apply the project's Agile standards

For each ticket, follow `references/atlassian-delegation.md#phase-1--shape`:

- Assign a story point from `1, 2, 3, 5, 8, 13` using the standards.md table. Start from `3` unless signals push up or down.
- Set status `Backlog` for new tickets (they haven't been refined yet), or `Todo` if AC + testing notes + DoD are all present.
- Add required tags:
  - `ai-ready` if enough context for AI execution
  - `needs-context` if any Definition-of-Ready field is missing
  - `needs-human-review` for security, data, migration, permission, billing, payroll, customer-impacting, or SP ≥ 8 work
- Fill acceptance criteria as a checklist (`- [ ]` form, testable, not vague).
- Fill testing notes: happy path + main error path + permission/data/sync concerns if relevant.
- Fill Definition of Done.

### 5. Validate against Definition of Ready

Per standards.md, a ticket is Ready only with: clear summary, valid type, workflow status, story point, AC, testing notes, DoD. If any are missing, keep status at `Backlog` and add tag `needs-context`. Do **not** fabricate missing content — mark it missing and move on.

### 6. Materialize

Follow `references/atlassian-delegation.md#phase-2--materialize`:

1. **Tier 1** — if `atlassian:spec-to-backlog` is in the available skills, invoke it via the `Skill` tool with the shaped markdown as input.
2. **Tier 2** — else if `mcp__atlassian__jira_create_issue` is in the tool list, call it directly for the Epic first, then each child ticket with the Epic link set.
3. **Tier 3** — else print all tickets as a single copy-pasteable markdown block and show the user the Jira field mapping.

**On failure at Tier 1 or 2, stop and surface the error. Do not silently fall through.**

### 7. Confirm and surface risks

After materialize:

- Print a summary: `Created 1 Epic + N tickets. Keys: PROJ-123, PROJ-124, …`
- Separately list any tickets tagged `needs-human-review` — these need a human owner's eyes before moving out of Backlog.
- Separately list any tickets tagged `needs-context` — these need refinement before execution.

## Never do

- Never invent Jira Keys (leave blank; the Jira write produces the real key).
- Never create Feature-type or Subtask-type tickets (banned in standards.md).
- Never use a story point outside `1, 2, 3, 5, 8, 13`.
- Never mark a ticket as `Todo` or higher until Definition of Ready is met.
- Never fabricate acceptance criteria. If the spec is vague on a behavior, tag `needs-context` and say what's missing.

## Key references

- `references/standards.md` — Agile standards (canonical rules)
- `references/atlassian-delegation.md` — detection order, fallback, error handling
- `references/templates/epic.md`, `story.md`, `task.md`, `bug.md` — ticket shapes
