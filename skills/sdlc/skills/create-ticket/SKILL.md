---
name: create-ticket
description: Creates a single standard Story or Task ticket from a one-line intent through a short Definition-of-Ready interview (acceptance criteria, testing notes, DoD, story point from the 1/2/3/5/8/13 table). Use when the user says "create a ticket for X", "I need a Jira for X", or "make a story/task for X" — where X is one concrete piece of work, not a spec (use sdlc:spec-to-backlog) and not a bug (use sdlc:triage-issue). Writes to Jira via the atlassian MCP if installed, else prints markdown.
---

# Create ticket

Create one well-formed ticket (Story or Task) from a short intent. This skill interviews the user to fill `standards.md` Definition of Ready, then materializes.

## When to use

- User asks for a single ticket for a single concrete piece of work
- Input is a one-liner, not a long spec (that's `sdlc:spec-to-backlog`) and not a bug report (that's `sdlc:triage-issue`)
- Examples: _"Create a ticket for adding rate limiting to the public API"_, _"I need a Jira for documenting the auth flow"_

## Workflow

```
- [ ] 1. Classify: Story or Task?
- [ ] 2. Interview for DoR
- [ ] 3. Assign story point
- [ ] 4. Apply tags
- [ ] 5. Materialize
```

### 1. Classify Story vs Task

Per standards.md:

- **Story** — delivers user or business value (`As a user, I want …, so that …` fits naturally)
- **Task** — technical, operational, documentation, setup, or maintenance work

Ask the user to confirm the classification. Pick the matching template (`references/templates/story.md` or `task.md`).

### 2. Interview for Definition of Ready

Ask only the questions the intent didn't already answer. Don't ask for fields the user can reasonably leave blank (Jira Key, Confluence Link, Milestone — `TBD` is fine).

Required:

- **Acceptance criteria** — ask for 3-6 testable criteria in checklist form. Push back on vague ones ("works correctly", "looks good", "handles edge cases").
- **Testing notes** — unit / integration / E2E / manual; main happy path; main error path; permission / data / sync concerns if relevant.
- **Definition of Done** — standards.md defaults usually suffice; adjust if the work has special concerns.
- **Epic link** — which Epic does this belong to? If unknown, `TBD`.
- **Priority** — P0 / P1 / P2 / P3. Default P2 unless the user flags urgency.

One question per message when interviewing. Do not dump a whole questionnaire.

### 3. Assign story point

From the `1, 2, 3, 5, 8, 13` table in standards.md. Start from `3` and adjust:

| Signal                                      | Point                                |
| ------------------------------------------- | ------------------------------------ |
| Single file, copy/config change, trivial    | 1                                    |
| One focused change, light testing           | 2                                    |
| Standard ticket, normal testing             | 3                                    |
| Multiple files or edge cases                | 5                                    |
| Cross-system, security, data, heavy testing | 8                                    |
| Ticket should be split first                | 13 — stop and tell the user to split |

Never invent values outside this set. If the effort needs explanation, add one sentence to `AI Execution Notes`.

### 4. Apply tags

Per standards.md:

- Domain tag: the subsystem this ticket belongs to — match the repo's module or bounded-context naming (e.g. `billing`, `auth`, `catalog`, `inventory`). Ask the user if the mapping isn't obvious.
- Work-type tag: `backend` / `frontend` / `api` / `database` / `integration` / `docs`
- `ai-ready` if complete enough for AI execution
- `needs-context` if DoR is incomplete (keep status `Backlog` in that case)
- `needs-human-review` for security / data / permission / migration / billing / payroll / SP 8+

### 5. Materialize

Per `references/atlassian-delegation.md#phase-2--materialize`:

1. **Tier 1** — no dedicated atlassian skill matches single-ticket creation; skip to Tier 2.
2. **Tier 2** — if `mcp__atlassian__jira_create_issue` is available, call it with the filled fields.
3. **Tier 3** — else print the filled template as markdown with the Jira field mapping.

On failure, stop and surface the error.

## Never do

- Never skip the DoR interview to save time. If the user objects, ask which fields they'd accept at `TBD` — but still force acceptance criteria and testing notes, since those are what make a ticket executable.
- Never use a story point outside `1, 2, 3, 5, 8, 13`.
- Never create two ticket types in one call — redirect to `sdlc:spec-to-backlog` if the user's "one ticket" is actually a multi-ticket effort.
- Never auto-promote a new ticket past `Todo`. Status moves are `sdlc:start-work`'s job.

## Key references

- `references/standards.md` — Definition of Ready, story-point table, tag taxonomy
- `references/atlassian-delegation.md` — materialization tiers
- `references/templates/story.md`, `task.md` — ticket shapes
