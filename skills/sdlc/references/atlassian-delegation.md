# Atlassian Delegation Pattern

Every skill in this plugin follows a **two-phase pipeline**: shape the input against the project's Agile standards (ours), then materialize to Jira (theirs, if available).

## Phase 1 — Shape

Apply the project's Agile standards to produce a ticket that matches `standards.md`:

- Correct type (Epic / Story / Task / Bug) per the "Ticket Types" table
- Status default (new tickets start in `Backlog`; refined tickets move to `Todo`)
- Story point from the `1 / 2 / 3 / 5 / 8 / 13` table — never invent a point outside this set
- Required fields: Epic link, Milestone, Priority, Tags, Jira Key (blank until sync), Confluence Link (blank until sync)
- Required tags per `standards.md`:
  - `ai-ready` if the ticket has enough context for AI execution
  - `needs-context` if any Definition-of-Ready field is missing
  - `needs-human-review` for security, data, migration, permission, billing, payroll, customer-impacting, or SP ≥ 8 work
- Acceptance criteria in checklist form (`- [ ]`)
- Testing notes covering happy path + main error path
- Definition of Done

The output of Phase 1 is a markdown block in the exact shape of `references/templates/<type>.md`, with every field filled.

## Phase 2 — Materialize

Try these tiers **in order**. Use the first one available:

### Tier 1 — Dedicated atlassian skill

Check the available-skills list for the skill that matches this moment:

| Our skill                          | Delegates to                                   |
| ---------------------------------- | ---------------------------------------------- |
| `sdlc:spec-to-backlog`             | `atlassian:spec-to-backlog`                    |
| `sdlc:triage-issue`                | `atlassian:triage-issue`                       |
| `sdlc:create-ticket`               | (no direct match — use Tier 2)                 |
| `sdlc:start-work` (ticket fetch)   | `atlassian:search-company-knowledge` or Tier 2 |
| `sdlc:finish-work` (status update) | Tier 2                                         |

If the matching skill is installed, invoke it via the `Skill` tool, passing the shaped markdown from Phase 1 as the input.

### Tier 2 — Atlassian MCP tools

If no dedicated skill matches, check the tool list for `mcp__atlassian__*` tools. Common ones:

- `mcp__atlassian__jira_create_issue` — create a ticket from structured fields
- `mcp__atlassian__jira_update_issue` — update fields, transition status
- `mcp__atlassian__jira_get_issue` — fetch ticket by key
- `mcp__atlassian__jira_transition_issue` — move ticket across workflow statuses
- `mcp__atlassian__jira_add_comment` — comment on ticket (used by `finish-work`)

Call these directly with fields parsed from the Phase 1 markdown.

### Tier 3 — Markdown fallback

If neither atlassian skills nor MCP tools are present, print the Phase 1 markdown inside a copy-paste block and tell the user which Jira field maps to which markdown section. Example:

```
Atlassian plugin not installed. Copy this into a new Jira issue:

---
[STORY] Add pagination to invoices list
…
---

Field mapping:
- Title → Summary
- Tags → Labels
- Story Point → Story Points custom field
- Status → Status (start in Backlog)
```

## Error handling

If a Tier 1 or Tier 2 call fails (auth error, network, 404):

- **Stop.** Surface the exact error to the user.
- **Do not silently fall through** to a lower tier. The user needs to know the Jira write didn't happen — they might otherwise assume it did.
- Let the user decide: retry, fix config, or accept the markdown fallback.

When in doubt, ask rather than guess — the cost of a bad silent write is much higher than the cost of a clarifying question.

## Never do

- Never invent a Jira Key. If the sync hasn't happened yet, the `Jira Key` field stays blank.
- Never retry with backoff — atlassian's MCP handles its own transport. A failure is a real failure.
- Never prompt for Jira credentials — auth lives in atlassian's MCP server.
- Never write to Confluence directly from this plugin — if a link to a supporting page is needed, ask the user for the URL or use `atlassian:search-company-knowledge` to find it.
