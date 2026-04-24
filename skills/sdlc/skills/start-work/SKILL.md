---
name: start-work
description: Picks up a ticket (or starts ticketless work), fetches the ticket via atlassian, creates the feat/{key} or fix/{key} branch off main, moves Jira status to In Progress, and routes to the right next skill (superpowers:brainstorming when ticket is not Ready, superpowers:writing-plans when cross-module/architecture, or asks the user to pick between superpowers:test-driven-development and superpowers:subagent-driven-development when the ticket is Ready and single-concern). Use when the user says "let's start on PROJ-XXX", "I'll take PROJ-YYY", "start work on this ticket", or "let's start building X" (ticketless).
---

# Start work

Set up the workspace and hand off to the right superpowers skill based on artifacts already present and ticket readiness.

## When to use

- User mentions a ticket key with intent: "I'll take PROJ-123", "start on PROJ-45", "let's pick up PROJ-66"
- Ticketless start: "let's start building X", "I want to add Y"
- Distinct from ticket-creation skills (which make the ticket) and from `sdlc:finish-work` (which ships it)

## Workflow

```
- [ ] 1. Fetch ticket (if key given)
- [ ] 2. Move Jira status to In Progress
- [ ] 3. Create branch off main
- [ ] 4. Route to the right next skill
```

### 1. Fetch ticket

If the user gave a ticket key, pull full details before doing anything else.

- **Tier 1** — if `mcp__atlassian__jira_get_issue` is available, fetch by key
- **Tier 2** — else, if `atlassian:search-company-knowledge` is available, use it to find the ticket
- **Tier 3** — else, ask the user to paste the ticket content

Summarize back to the user: type, summary, status, story point, tags, acceptance criteria. Confirm this is the ticket they meant before proceeding.

If ticketless, skip to step 3 after a brief scope interview: _"What are you building? Rough size — hours, days, or longer?"_

### 2. Move Jira status to In Progress

If ticket is in `Backlog` or `Todo`, transition it to `In Progress`. No dedicated atlassian skill owns status transitions — call `mcp__atlassian__jira_transition_issue` directly if available, else print the status change for the user to do manually.

If the ticket is already `In Progress`, skip the transition. If it's further along (`In Review` / `Testing` / `Done`), surface this and ask the user whether they're re-opening work.

### 3. Create branch

Per `references/pr-linking.md`:

- With ticket: `feat/PROJ-123` (new feature) or `fix/PROJ-456` (bug fix)
- Without ticket: `feat/<slug>` — lowercase, dash-separated, 3-5 words, no dates

Check that the working tree is clean before creating. Branch off the repo's default branch (`main` or `master`). Never push directly to the default branch.

### 4. Route to the next skill

Follow the decision tree in `references/workflow-routing.md`. Summary:

1. **Plan file exists** (commonly under `docs/superpowers/plans/` or `docs/plans/`, or wherever the ticket references) → confirm → route to `superpowers:executing-plans`
2. **Spec/design file exists** (commonly under `docs/superpowers/specs/` or `docs/specs/`) → confirm → route to `superpowers:writing-plans`
3. **Ticket not Ready** (missing AC / testing notes / DoD, or tag `needs-context`, or SP 13) → route to `superpowers:brainstorming` → show refinement diff → offer Jira update (see below) → re-evaluate
4. **Ticket Ready + single-concern/module** → **ask the user: single-track (`superpowers:test-driven-development`) or parallel (`superpowers:subagent-driven-development`)?** Parallel only if the work has independent sub-tasks.
5. **Ticket Ready + cross-module / architecture / migration** → confirm → route to `superpowers:writing-plans`
6. **Tag `needs-human-review`** → pause, surface the risk, let the user decide the route

Always propose the route and confirm before dispatching. Never auto-invoke a downstream skill without user sign-off.

### 4a. Brainstorming → Jira update loop

When routing to `superpowers:brainstorming` for a not-Ready ticket:

1. After brainstorming produces a refined requirement, show the user a diff: _original AC vs refined AC, original testing notes vs refined_.
2. Ask: _"Update PROJ-XXX in Jira with this?"_
3. If yes:
   - Call `mcp__atlassian__jira_update_issue` with the refinement (no atlassian skill exists for generic updates, so Tier 2 is the starting point)
   - Remove `needs-context` tag if present
   - Transition `Backlog → Todo` if it was in Backlog
4. If no: proceed but warn that Jira is stale
5. Loop back to step 4 (re-evaluate routing — now probably Ready)

The goal: Jira reflects reality before implementation starts. Matches standards.md DoR rules.

## Never do

- Never skip the fetch. Acting on a ticket key without pulling its data means guessing at scope.
- Never auto-route without user confirmation. The user picks the path; the skill proposes.
- Never create a branch off a branch other than `main` (per the repo's Git conventions; defer to the project's CLAUDE.md if it specifies a different default branch).
- Never silently proceed from an unready ticket to implementation. Either refine (and update Jira) or surface the gap.

## Key references

- `references/workflow-routing.md` — the full decision tree + refinement loop
- `references/atlassian-delegation.md` — ticket fetch tiers, status transitions
- `references/pr-linking.md` — branch naming conventions
- `references/standards.md` — Definition of Ready, workflow statuses
