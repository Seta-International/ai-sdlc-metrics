---
name: finish-work
description: Finishes work on a branch — creates the PR with Closes PROJ-XXX cross-link and the repo's PR template, hands off review to code-review or superpowers:requesting-code-review, moves Jira In Progress → In Review on PR open, then moves In Review → Testing on merge and comments the merged PR URL on the ticket. Use when the user says "open a PR", "ship this", "the PR merged", "it's landed", "update the ticket" — covers both the pre-merge (open PR) and post-merge (close out) moments. Delegates the actual branch-prep to superpowers:finishing-a-development-branch when installed.
---

# Finish work

Close out a development branch: open PR, link it to the ticket, transition Jira, hand off review, and (post-merge) update the ticket with the outcome.

## When to use

Two distinct moments, both handled here:

- **Pre-merge** — user says "open a PR", "push this up", "ship this for review"
- **Post-merge** — user says "the PR merged", "it landed", "update the ticket"

The skill detects which moment from context:

- **No PR yet** (working tree has commits to push, or PR not found for the branch) → **pre-merge** flow
- **PR exists and merged** (`gh pr view --json state` returns `MERGED`) → **post-merge** flow
- **PR exists but still open** → the PR is already up; ask the user whether they want to re-request review (hand off to `code-review:code-review` or `superpowers:requesting-code-review`) or wait for review — do not create a second PR, do not transition Jira

## Workflow — pre-merge

```
- [ ] 1. Pre-flight: branch, tests, uncommitted work
- [ ] 2. Hand off branch preparation
- [ ] 3. Build PR body with ticket cross-link
- [ ] 4. Create PR via gh
- [ ] 5. Transition Jira to In Review
- [ ] 6. Hand off review
```

### 1. Pre-flight

- Confirm current branch is not the default branch (never push directly to `main`/`master`)
- Confirm working tree is clean or all changes are intentional
- Detect ticket key from the branch name (`feat/PROJ-123` → `PROJ-123`); if the branch is ticketless (slug-named), ask the user whether this PR closes a ticket

### 2. Hand off branch preparation

If `superpowers:finishing-a-development-branch` is available, invoke it first. It handles: running tests, rebasing on main, cleaning up commit history. Let it do that job.

### 3. Build the PR body

Per `references/pr-linking.md`:

- Read the repo's PR template at `.github/pull_request_template.md` first
- Prepend the ticket cross-link at the top: `Closes PROJ-123` (or `Closes` for each ticket if multiple, or `Refs:` if this PR only partially addresses a ticket)
- Fill the template's Summary and Test plan sections from the actual commits and changes

### 4. Create the PR

Use `gh pr create --title "<type>(<scope>): <summary>" --body "$(cat <<'EOF' … EOF)"`. Title format matches commit style (see `references/pr-linking.md`).

### 5. Transition Jira to In Review

Call `mcp__atlassian__jira_transition_issue` with status `In Review`. If the MCP tool isn't available, print the status change for the user to do manually.

### 6. Hand off review

If `code-review:code-review` is available, invoke it. Else, if `superpowers:requesting-code-review` is available, use it. Else, point the user at the PR URL and ask them to request review manually.

## Workflow — post-merge

```
- [ ] 1. Detect merge state
- [ ] 2. Comment merged PR on ticket
- [ ] 3. Transition Jira to Testing
- [ ] 4. Ask user to verify acceptance before Done
```

### 1. Detect merge state

Check `gh pr view --json state,mergedAt,mergeCommit` for the branch's PR. Only proceed if `state == "MERGED"`.

### 2. Comment on ticket

Post a comment using the template in `references/pr-linking.md`:

```
Merged in {pr-url}

Commits:
- {short-sha} feat(scope): …

Next: Testing (acceptance verification).
```

Use `mcp__atlassian__jira_add_comment` if available, else print the comment for manual paste.

### 3. Transition Jira to Testing

**Not Done.** Per standards.md: _"A ticket is done only when acceptance criteria pass, tests are complete, review is complete, blockers are resolved."_ That requires human verification. Move to `Testing` and stop.

### 4. Ask user about Done

After the Testing transition, ask: _"All acceptance criteria verified in staging? Move to Done?"_ Only transition `Testing → Done` on explicit user confirmation.

## Never do

- Never auto-transition a ticket to `Done`. Human acceptance is required per standards.md.
- Never force-push to a branch that already has an open PR (breaks review history).
- Never skip the `Closes PROJ-XXX` line — it wires the Jira-GitHub auto-transition and documents the link.
- Never invent a merged state. Verify via `gh pr view` before posting "merged" comments on tickets.
- Never merge without a review approval when the branch is protected (check `gh pr view` for required approvals).

## Key references

- `references/pr-linking.md` — PR body, title, commit conventions, status transition rules
- `references/atlassian-delegation.md` — Jira transition and comment tiers
- `references/standards.md` — workflow rules, Definition of Done
