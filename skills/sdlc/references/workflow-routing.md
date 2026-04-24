# Workflow Routing

`sdlc:start-work` uses this tree to pick the right next skill after setting up the workspace. The philosophy: **check what already exists, then size the work. Never force an extra spec or plan file when the ticket itself is sufficient.**

## Step 1 — Check existing artifacts

Before any size-based decision, check whether planning artifacts already exist:

1. **Plan file exists** — check the repo's planning directory (commonly `docs/superpowers/plans/`, `docs/plans/`, or a path referenced by the ticket). If found → confirm with user, then route to `superpowers:executing-plans`. Do not re-plan.
2. **Spec/design file exists** — check the repo's spec directory (commonly `docs/superpowers/specs/`, `docs/specs/`, or a path referenced by the ticket). If found → confirm with user, then route to `superpowers:writing-plans`. Do not re-design.
3. **Neither exists** → continue to Step 2.

## Step 2 — Check if the ticket is Ready

"Ready" is defined by `standards.md` Definition of Ready:

- Clear summary
- Valid type (Epic / Story / Task / Bug)
- Status from the standard workflow
- One story point value from `1, 2, 3, 5, 8, 13`
- Acceptance criteria (checklist form)
- Testing notes
- Clear Definition of Done
- No `needs-context` tag

If the ticket is **not Ready**, go to Step 3 (refinement). If it **is Ready**, go to Step 4 (implementation).

## Step 3 — Not Ready: refinement loop

1. Route to `superpowers:brainstorming` with the ticket as context.
2. After brainstorming produces a refinement, **show the user a diff**: original AC/testing notes/DoD vs. the refined version.
3. Ask: _"Update PROJ-XXX in Jira with this?"_
4. If yes: call `mcp__atlassian__jira_update_issue` if available, else print the updated ticket markdown for the user to paste. Remove `needs-context` tag if present. Move `Backlog → Todo` if it was in Backlog. (No dedicated atlassian skill exists for generic ticket updates — Tier 2 is the starting point here.)
5. If no: proceed but warn the user Jira is stale.
6. Re-evaluate Ready status. Now probably Ready — loop to Step 4.

Never silently proceed to implementation from an unready ticket — the next human or agent will see the stale original AC.

## Step 4 — Ready: size-based routing

Ticketless work (user says "let's build X" with no key) enters here after a quick scope interview.

| Signal                                                          | Action                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SP **1** + single-file config/copy change + unambiguous AC      | Ask user: _"This is a one-line change. Skip TDD and just write it?"_ — proceed per their choice.                                                                                                                    |
| SP **2–3** + single module + clear AC                           | **Ask user: single-track (`superpowers:test-driven-development`) or parallel (`superpowers:subagent-driven-development`)?** Parallel only if the work has 2+ independent sub-tasks that won't touch the same files. |
| SP **3–5** + cross-module / multi-concern                       | Confirm + route to `superpowers:writing-plans`. A plan is genuinely needed here.                                                                                                                                    |
| SP **8** + clear scope + risk signals (migration, architecture) | Confirm + route to `superpowers:writing-plans`. May split into sub-plans.                                                                                                                                           |
| SP **13**                                                       | Refuse to route. Send back to `sdlc:create-ticket` for splitting. Per `standards.md`: _"SP 13 = too large. Split before execution."_                                                                                |
| Any tag `needs-human-review`                                    | **Pause.** Surface the ticket context to the user. Let the user decide the route — do not auto-dispatch.                                                                                                            |

## Never do

- Never auto-route without asking. The user confirms the route or overrides.
- Never create a spec file just because the ticket is a few SP. Ticket + AC = spec when the ticket is Ready.
- Never skip the brainstorming refinement → Jira update loop. The ticket's state in Jira must reflect reality.
- Never ignore a `needs-human-review` tag — it exists because someone (possibly you earlier) flagged real risk.

## Why this works

- **YAGNI.** Extra spec/plan files for clear work are waste; they duplicate the ticket's AC and go stale.
- **Artifact-first.** Resuming from an existing plan beats re-planning. Resuming from a spec beats re-designing.
- **User confirmation at each hop.** The skill proposes; the user decides. Ambiguity gets surfaced, not guessed.
- **Decomposition is a choice, not a default.** TDD vs subagent-driven is about how to split the work, not whether to test. Both routes use TDD internally — tests come first either way.
