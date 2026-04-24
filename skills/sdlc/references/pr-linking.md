# PR ↔ Ticket Linking Conventions

Used by `sdlc:start-work` (branch creation) and `sdlc:finish-work` (PR creation, ticket cross-link, status transitions).

## Contents

- Branch names
- Commit messages
- PR body
- PR title
- Jira status transitions
- Cross-link: comment on ticket after PR merge
- Never do

## Branch names

Standard Jira + GitHub convention:

```
feat/{ticket-key}      # new feature, e.g. feat/PROJ-123
fix/{ticket-key}       # bug fix,   e.g. fix/PROJ-456
```

Ticketless variants (rare — only when the user explicitly said "no ticket"):

```
feat/{slug}            # e.g. feat/add-retry-to-public-api
fix/{slug}
```

Slug rules: lowercase, dash-separated, 3–5 words, no dates.

Never push directly to the default branch. Always branch off the default branch (`main` or `master`, check the repo). Defer to the repo's CLAUDE.md if it specifies a different workflow.

## Commit messages

Use conventional commits. Check `git log --oneline -20` in the target repo to match local style.

```
feat(api): add pagination to list endpoint
fix(auth): reject expired refresh tokens
docs(readme): document environment variables
```

Format: `<type>(<scope>): <summary>`, optionally with PR number at end (`(#123)`).

- `<type>` from conventional commits: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- `<scope>` is the module, package, or area being touched (e.g. `api`, `ui`, `auth`, `billing`)
- `<summary>` is imperative present tense, starts lowercase after the colon

**Ticket reference in commit trailer** — only when multiple commits exist on a branch. The final merge commit from the PR already carries the ticket key via the PR title. For individual commits, a trailer is optional:

```
feat(api): add pagination to list endpoint

Refs: PROJ-123
```

## PR body

If the repo has a PR template (`.github/pull_request_template.md`), read it first. Extend it with the ticket cross-link at the top, not the bottom:

```
Closes PROJ-123

## Summary
…

## Test plan
- [ ] …
```

The `Closes` keyword does two jobs:

- Jira picks it up via the Jira-GitHub integration and auto-transitions the ticket on merge
- GitHub auto-closes issues when the PR merges (harmless even when the "issue" is actually just a link reference)

If multiple tickets are covered by one PR, list them all:

```
Closes PROJ-123
Closes PROJ-124
```

If the PR only partially addresses a ticket, use `Refs:` instead of `Closes`:

```
Refs: PROJ-125  (this PR is step 1 of 3)
```

## PR title

Match commit title format:

```
feat(api): add pagination to list endpoint
```

The PR title becomes the final merge commit when "Squash and merge" is used.

## Jira status transitions

Driven by `finish-work`:

| Event                       | Transition                                                                    |
| --------------------------- | ----------------------------------------------------------------------------- |
| PR created                  | `In Progress → In Review`                                                     |
| PR merged                   | `In Review → Testing` (not Done — Testing is a human gate per `standards.md`) |
| Acceptance verified by user | `Testing → Done` — only on explicit user confirmation                         |

**Never auto-transition to Done.** Per `standards.md`: _"A ticket is done only when acceptance criteria pass, tests are complete, review is complete, blockers are resolved."_ That requires a human check. `finish-work` moves to Testing and asks the user to verify before moving to Done.

## Cross-link: comment on ticket after PR merge

When `finish-work` detects a merge, post a comment on the ticket:

```
Merged in {pr-url}

Commits:
- {short-sha} feat(scope): …
- {short-sha} test(scope): …

Next: Testing (acceptance verification).
```

Use `mcp__atlassian__jira_add_comment` if available; otherwise print the comment for manual paste.

## Never do

- Never force-push to a branch that already has a PR (breaks review history).
- Never squash commits locally before PR merge — GitHub handles that on merge.
- Never invent a Jira Key to put in a branch name. If the work has no ticket, use the ticketless slug form.
- Never skip the `Closes PROJ-XXX` line — it's what wires the auto-transition.
