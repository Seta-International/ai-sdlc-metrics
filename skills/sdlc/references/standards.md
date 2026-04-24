# Agile Standards

## Contents

- Purpose
- Golden Rules
- Ticket Types
- Required Fields
- Statuses
- Workflow Rules
- Story Points
- Definition Of Ready
- Acceptance Criteria
- Testing Notes
- Definition Of Done
- Tags
- AI Execution Rules
- Jira And Confluence Sync

## Purpose

This standard defines how humans and AI create, refine, estimate, execute, and sync tickets.

The goal is consistency. A ticket should be short enough for Jira, clear enough for a human, and specific enough for an AI agent to execute and test.

## Golden Rules

- Hierarchy: `Epic -> Story / Task / Bug`
- Workflow: `Backlog -> Todo -> In Progress -> In Review -> Testing -> Done`
- Use one estimate field only: `Story Point`
- Do not use Feature.
- Do not require Subtask. Implementation breakdown is handled by the developer or AI agent.
- Keep Jira tickets concise. Put long background, diagrams, and decisions in Confluence.
- Do not invent real Jira keys, Confluence links, milestones, owners, or production facts.

## Ticket Types

Use exactly one ticket type.

| Type  | Use When                                                          | Do Not Use For                            |
| ----- | ----------------------------------------------------------------- | ----------------------------------------- |
| Epic  | A larger outcome that groups stories, tasks, and bugs             | A single implementation step              |
| Story | Work that delivers user or business value                         | Pure technical cleanup                    |
| Task  | Technical, operational, documentation, setup, or maintenance work | User-facing behavior with acceptance flow |
| Bug   | Existing behavior is wrong, broken, or regressed                  | New behavior or missing feature           |

## Required Fields

Use these fields in every Story, Task, and Bug.

| Field           | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| Status          | One of the standard workflow statuses                      |
| Epic            | Parent epic name or `TBD` if not known                     |
| Milestone       | Release, sprint, or delivery target, or `TBD` if not known |
| Priority        | `P0`, `P1`, `P2`, or `P3`                                  |
| Story Point     | One value from `1, 2, 3, 5, 8, 13`                         |
| Tags            | Short kebab-case labels                                    |
| Jira Key        | External Jira issue key after sync, or blank               |
| Confluence Link | Supporting page after sync, or blank                       |

Priority meanings:

- `P0`: urgent blocker, production or critical delivery impact.
- `P1`: high impact, should be handled soon.
- `P2`: normal planned work.
- `P3`: low urgency or nice-to-have.

## Statuses

- `Backlog`: idea exists, not ready for execution.
- `Todo`: refined, accepted, and ready to start.
- `In Progress`: implementation is happening.
- `In Review`: output is ready for review.
- `Testing`: verification and acceptance checks are running.
- `Done`: accepted with evidence.

## Workflow Rules

Move a ticket only when the rule is true.

| Move To     | Rule                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| Backlog     | The work is captured, but details may be incomplete                          |
| Todo        | Summary, acceptance criteria, testing notes, tags, and story point are ready |
| In Progress | A human or AI agent has started execution                                    |
| In Review   | The implementation or output is ready for review                             |
| Testing     | Review passed or is not required, and verification is running                |
| Done        | Acceptance criteria and definition of done are satisfied                     |

## Story Points

Story points are relative effort. They cover scope, complexity, uncertainty, dependencies, risk, and testing effort.

| Point | Meaning                                                                     |
| ----: | --------------------------------------------------------------------------- |
|     1 | Tiny, clear, low risk. Usually docs, copy, config, or a very small fix      |
|     2 | Small and clear. One focused change with light testing                      |
|     3 | Normal ticket. Clear scope, normal implementation, normal testing           |
|     5 | Medium or complex. Multiple steps, files, or edge cases                     |
|     8 | Large or risky. Cross-system, security, data, integration, or heavy testing |
|    13 | Too large. Split before execution                                           |

AI must use this table as the baseline when creating or refining tickets.

Story point rules:

- Start from `3`.
- Use `1` only when the work is tiny and low risk.
- Use `2` when the work is small, clear, and isolated.
- Use `5` when the work touches multiple areas or has meaningful testing effort.
- Use `8` when the work has high risk, unclear dependencies, or cross-system impact.
- Use `13` when the ticket should be split before execution.
- Do not add a second effort score.
- If an estimate needs explanation, add one short sentence in `AI Execution Notes`.

## Definition Of Ready

A ticket is ready only when it has:

- A clear summary.
- A valid type: Epic, Story, Task, or Bug.
- A status from the standard workflow.
- One story point value.
- Acceptance criteria.
- Testing notes.
- A clear definition of done.

If any required detail is missing, keep the ticket in `Backlog` and add the tag `needs-context`.

## Acceptance Criteria

Acceptance criteria must be testable.

Use checklist style:

```md
- [ ] User can ...
- [ ] System shows ...
- [ ] Error case handles ...
```

Avoid vague criteria like:

- "Works correctly"
- "Looks good"
- "Handle edge cases"

## Testing Notes

Testing notes tell a human or AI how to verify the ticket.

Good testing notes include:

- Unit, integration, E2E, or manual verification needed.
- Main happy path.
- Important error path.
- Permission, data, or sync behavior if relevant.

## Definition Of Done

A ticket is done only when:

- All acceptance criteria pass.
- Required tests or manual checks are completed.
- Review is complete if required.
- Known blockers are resolved or explicitly accepted.
- Jira and Confluence are updated when external sync is connected.

## Tags

Use short kebab-case tags.

Recommended tag types:

- Domain: `planner`, `people`, `finance`, `agents`, `admin`
- Work type: `backend`, `frontend`, `api`, `database`, `integration`, `docs`
- Risk: `security`, `data`, `permission`, `migration`, `external-sync`
- AI execution: `ai-ready`, `needs-human-review`, `needs-context`

Required AI tags:

- Add `ai-ready` when the ticket has enough context for AI execution.
- Add `needs-context` when the ticket is missing information.
- Add `needs-human-review` for security, data, migration, permission, billing, payroll, customer-impacting, or story point `8+` work.

## AI Execution Rules

When AI creates or updates a ticket, it must:

- Keep the ticket concise.
- Do not invent real milestones, Jira keys, or Confluence links.
- Ask for clarification when acceptance criteria or testing notes are unclear.
- Use the story point table consistently.
- Mark risky or unclear work with `needs-human-review` or `needs-context`.
- Preserve human-written intent when refining text.
- Do not create Subtasks.
- Do not change a ticket to `Done` without testing evidence.
- Do not add extra estimate fields.

## Jira And Confluence Sync

These templates are designed to map cleanly to Jira later:

- `Status` maps to Jira status.
- `Epic` maps to epic link or parent.
- `Milestone` maps to fix version, release, or milestone field.
- `Story Point` maps to story points.
- `Tags` maps to labels.
- `Jira Key` stores the external ticket key.
- `Confluence Link` stores the supporting spec or context page.
