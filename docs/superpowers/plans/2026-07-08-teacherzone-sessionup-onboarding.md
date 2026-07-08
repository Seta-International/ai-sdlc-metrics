# Onboard TeacherZone (SessionUp repo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `SETA-International-Vietnam/SessionUp` (TeacherZone's repo) into the shared AI SDLC metrics collector, mirroring what's already live for Future/agent-platform.

**Architecture:** No code changes to this repo (`ai-sdlc-metrics`) — its generic template/collector already support this. All changes are: (a) 4 files added/edited in SessionUp's own repo (PR template + 3 workflow files), (b) GitHub labels + repo secrets on SessionUp, (c) 3 new Jira custom fields + an Incident issue type on the `SU` project (separate Jira Cloud site from Future), (d) confirming the already-provisioned Grafana `TeacherZone` folder has a working PM viewer login.

**Tech Stack:** GitHub Actions (reusable workflows), `gh` CLI, Jira Cloud REST API (`curl`), shared Postgres (`seta-reporting` RDS), Grafana OSS API.

## Global Constraints

- SessionUp's repo (`SETA-International-Vietnam/SessionUp`) requires the `seta-canhta` GitHub account (`gh auth switch --user seta-canhta`) — the default `canhta` account cannot see it.
- SessionUp's local checkout at `/Users/canh/Projects/TeacherZone/SessionUp` is **on an unrelated in-progress feature branch** (`feat/SU-1777-ses-delivery-status-reconciliation`, with an untracked file and active `.superpowers/sdd` session artifacts). Never edit files there directly — all SessionUp file changes happen in an isolated worktree (Task 1).
- `JIRA_KEY = SU`, `JIRA_SITE_URL = https://sessionupcom.atlassian.net` — a different Jira Cloud site than Future's `all-it.atlassian.net`. Its own `JIRA_EMAIL`/`JIRA_TOKEN` are required; Future's credentials do not work here.
- `deploy-strategy = workflow_runs:deploy-prod.yml` — SessionUp has no GitHub Deployments/Releases/tags; counted deploys come from successful runs of its existing `deploy-prod.yml` workflow.
- Tasks 6–8 need secrets the assistant does not have (a Jira API token for the `SU` site, the existing `seta-reporting` DB credentials, and Grafana admin/PM passwords). Each of those tasks says exactly what to ask the user for — stop and ask rather than guessing or inventing values.
- Any `git push` / `gh pr create` / `gh secret set` / production Grafana change is a visible-to-others or hard-to-reverse action — confirm with the user immediately before running it, even if a task step says to run it.
- SessionUp has Husky commit-msg/branch-name hooks not documented anywhere in this repo: commits must start with `SU-<number> ` (regex `^SU-\d+ .+`; `SU-000` is the repo's existing convention for ticket-less chores, seen in prior history), and branches must match `<type>/SU-<number>[-<description>]` (types: feat/fix/docs/style/refactor/perf/test/build/ci/chore). Discovered by hook failure during Task 1/4 execution — all commit/branch examples below already reflect it.

---

### Task 1: Set up isolated SessionUp worktree

**Files:**
- Create (via git, not a file edit): worktree directory `/Users/canh/Projects/TeacherZone/SessionUp/.worktrees/chore-ai-sdlc-onboarding`
- Modify: `/Users/canh/Projects/TeacherZone/SessionUp/.gitignore`

**Interfaces:**
- Produces: an isolated working directory on branch `chore/SU-000-ai-sdlc-metrics-onboarding`, based on `origin/main`, that Tasks 3–5 make their file changes in.

- [x] **Step 1: Confirm the main checkout's state hasn't changed**

```bash
cd /Users/canh/Projects/TeacherZone/SessionUp && git status && git branch --show-current
```

Expected: still shows branch `feat/SU-1777-ses-delivery-status-reconciliation` with the untracked `docs/notifications/custom-communication-delivery-status-rca.md`. If this looks different (e.g. someone committed/switched branches), stop and re-check before proceeding — do not assume Task 1's branch-base plan still holds.

- [x] **Step 2: Fetch latest and verify `.worktrees/` is ignored**

```bash
cd /Users/canh/Projects/TeacherZone/SessionUp
git fetch origin main
git check-ignore -q .worktrees || echo "NOT IGNORED"
```

Expected: no output (already ignored) — but SessionUp's `.gitignore` was checked during planning and has **no** `.worktrees` rule, so this will print `NOT IGNORED`.

- [x] **Step 3: Add `.worktrees/` to `.gitignore` and commit on a fresh branch off `origin/main`**

```bash
cd /Users/canh/Projects/TeacherZone/SessionUp
git worktree add -b chore/SU-000-ai-sdlc-metrics-onboarding .worktrees/chore-ai-sdlc-onboarding origin/main
cd .worktrees/chore-ai-sdlc-onboarding
printf '\n# Local git worktrees (see superpowers:using-git-worktrees)\n.worktrees/\n' >> .gitignore
git add .gitignore
git commit -m "chore: ignore .worktrees/ for isolated worktree workspaces"
```

Expected: `git worktree add` reports the new worktree created; the commit succeeds with `1 file changed`.

- [x] **Step 4: Verify the worktree is clean and isolated from the main checkout**

```bash
cd /Users/canh/Projects/TeacherZone/SessionUp/.worktrees/chore-ai-sdlc-onboarding
git status
git log --oneline -1
git worktree list
```

Expected: `git status` shows clean; `git log` shows the gitignore commit on top of `origin/main`'s latest; `git worktree list` shows both the original checkout (on `feat/SU-1777-...`) and the new one (on `chore/SU-000-ai-sdlc-metrics-onboarding`) as separate entries.

All remaining SessionUp file-editing tasks (3, 4) run inside `/Users/canh/Projects/TeacherZone/SessionUp/.worktrees/chore-ai-sdlc-onboarding`.

---

### Task 2: Create GitHub labels `ai-assisted` / `ai-agent`

**Files:** none (repo settings only, via `gh` CLI — does not need the worktree)

**Interfaces:**
- Produces: two labels on the SessionUp repo that `ai-sdlc-label-check.yml` (Task 4) applies to PRs.

- [x] **Step 1: Switch to the account with access, then create the labels**

```bash
gh auth switch --user seta-canhta
gh label create "ai-assisted" --repo SETA-International-Vietnam/SessionUp --color "0075ca" --description "PR had AI assistance"
gh label create "ai-agent"    --repo SETA-International-Vietnam/SessionUp --color "e4e669" --description "PR created by agent"
```

Expected: both commands print `✓ Label "ai-assisted" created` / `✓ Label "ai-agent" created` (or "already exists" if re-run — safe either way).

- [x] **Step 2: Verify**

```bash
gh label list --repo SETA-International-Vietnam/SessionUp --search "ai-"
```

Expected: both `ai-assisted` and `ai-agent` listed with the descriptions above.

---

### Task 3: Add the AI usage block to SessionUp's PR template

**Files:**
- Modify: `.github/PULL_REQUEST_TEMPLATE.md` (in the Task 1 worktree)

**Interfaces:**
- Produces: a `## AI usage` section whose checkbox/line text exactly matches the regexes `ai-sdlc-label-check.yml` (Task 4) uses (`ai assisted`, `agent created`, `ai time saved\s*\(hours\)\s*:\s*[0-9...]`).

- [x] **Step 1: Append the block**

The existing template ends with the "Quick Check" section (`- [ ] Evidence is real — not reused from a previous PR`). Append this new section immediately after it, matching agent-platform's exact wording:

```bash
cd /Users/canh/Projects/TeacherZone/SessionUp/.worktrees/chore-ai-sdlc-onboarding
cat >> .github/PULL_REQUEST_TEMPLATE.md << 'EOF'

## AI usage
- [ ] AI assisted → add label `ai-assisted`
- [ ] Agent created → add labels `ai-assisted` **and** `ai-agent`
- AI time saved (hours): <!-- optional, e.g. 3 -->
EOF
```

- [x] **Step 2: Verify the diff is additive only**

```bash
git diff .github/PULL_REQUEST_TEMPLATE.md
```

Expected: diff shows only new `+` lines (the block above) appended at the end — no existing lines touched.

- [x] **Step 3: Commit**

```bash
git add .github/PULL_REQUEST_TEMPLATE.md
git commit -m "chore: add AI usage checklist to PR template"
```

---

### Task 4: Add the three AI SDLC workflow files

**Files:**
- Create: `.github/workflows/ai-sdlc-metrics.yml` (in the Task 1 worktree)
- Create: `.github/workflows/ai-sdlc-label-check.yml`
- Create: `.github/workflows/ai-sdlc-jira-sync.yml`

**Interfaces:**
- Consumes: repo secrets `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD`, `JIRA_AI_TOOL_FIELD`, `JIRA_AI_TIME_SAVED_FIELD`, `REPORTING_DB_URL` — created in Task 7. Workflows will fail at runtime until Task 7 lands; that's expected and fine to merge in the meantime (they simply won't fire usefully until then, same as any other pull_request/schedule trigger with missing secrets — GitHub Actions surfaces this as a job failure, not a merge blocker).
- Produces: on `pull_request: closed` (merged), applies `ai-assisted`/`ai-agent` labels and nags for missing AI-usage info; syncs the merged PR's AI fields to its Jira ticket; on schedule/dispatch, collects monthly metrics into `reporting.metric_counts` for `project = 'TeacherZone'`.

- [x] **Step 1: Create `ai-sdlc-metrics.yml`**

```bash
cd /Users/canh/Projects/TeacherZone/SessionUp/.worktrees/chore-ai-sdlc-onboarding
cat > .github/workflows/ai-sdlc-metrics.yml << 'EOF'
name: AI SDLC — Metrics Collection (TeacherZone)

# Thin caller: all logic lives in Seta-International/ai-sdlc-metrics.
# Onboarding: fill the <PLACEHOLDERS>, add the three repo secrets
# (JIRA_EMAIL, JIRA_TOKEN + JIRA_AI_USAGE_FIELD, REPORTING_DB_URL), done.
# Optional: JIRA_AI_TOOL_FIELD and JIRA_AI_TIME_SAVED_FIELD (customfield ids)
# turn on the ROI (time saved) and tool-mix metrics; leave unset to skip them.

on:
  schedule:
    - cron: '0 * * * *'    # hourly: current month running totals
    - cron: '30 0 1 * *'   # monthly: finalize previous calendar month
    - cron: '45 1 1 1,4,7,10 *'  # quarterly: governance auto-check
  pull_request:
    types: [closed]
  deployment_status:
  workflow_dispatch:
    inputs:
      month:
        description: 'Re-collect a specific month (YYYY-MM); blank = current month'
        required: false
      manual_period:
        description: 'Manual input period (YYYY-MM or YYYY-Q<n>)'
        required: false
      manual_fields:
        description: 'Manual input pairs separated by ";", e.g. total_engineers=18; cost_actual=30'
        required: false

jobs:
  collect-current-month:
    if: >
      github.event_name != 'workflow_dispatch' && github.event.schedule != '30 0 1 * *' &&
      github.event.schedule != '45 1 1 1,4,7,10 *' &&
      (github.event_name != 'pull_request' || github.event.pull_request.merged == true)
      || (github.event_name == 'workflow_dispatch' && inputs.manual_period == '')
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/collect.yml@main
    with:
      project: TeacherZone
      gh-repo: ${{ github.repository }}
      jira-project: SU
      jira-base: 'https://sessionupcom.atlassian.net'
      prod-env: 'production'           # unused — deploy-strategy is workflow_runs, not deployments
      deploy-strategy: 'workflow_runs:deploy-prod.yml'
      month: ${{ inputs.month || '' }}
    secrets:
      jira-email: ${{ secrets.JIRA_EMAIL }}
      jira-token: ${{ secrets.JIRA_TOKEN }}
      jira-ai-usage-field: ${{ secrets.JIRA_AI_USAGE_FIELD }}
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}
      jira-ai-tool-field: ${{ secrets.JIRA_AI_TOOL_FIELD }}
      jira-ai-time-saved-field: ${{ secrets.JIRA_AI_TIME_SAVED_FIELD }}

  collect-previous-month:
    if: github.event_name == 'schedule' && github.event.schedule == '30 0 1 * *'
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/collect.yml@main
    with:
      project: TeacherZone
      gh-repo: ${{ github.repository }}
      jira-project: SU
      jira-base: 'https://sessionupcom.atlassian.net'
      prod-env: 'production'
      deploy-strategy: 'workflow_runs:deploy-prod.yml'
      month: previous
    secrets:
      jira-email: ${{ secrets.JIRA_EMAIL }}
      jira-token: ${{ secrets.JIRA_TOKEN }}
      jira-ai-usage-field: ${{ secrets.JIRA_AI_USAGE_FIELD }}
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}
      jira-ai-tool-field: ${{ secrets.JIRA_AI_TOOL_FIELD }}
      jira-ai-time-saved-field: ${{ secrets.JIRA_AI_TIME_SAVED_FIELD }}

  quarterly-check:
    if: github.event_name == 'schedule' && github.event.schedule == '45 1 1 1,4,7,10 *'
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/quarterly-check.yml@main
    with:
      project: TeacherZone
      gh-repo: ${{ github.repository }}
    secrets:
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}

  manual-input:
    if: github.event_name == 'workflow_dispatch' && inputs.manual_period != ''
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/manual-input.yml@main
    with:
      project: TeacherZone
      period: ${{ inputs.manual_period }}
      fields: ${{ inputs.manual_fields }}
      entered-by: ${{ github.actor }}
    secrets:
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}
EOF
```

- [x] **Step 2: Create `ai-sdlc-label-check.yml`** (verbatim copy from agent-platform — project-agnostic, no placeholders)

```bash
cat > .github/workflows/ai-sdlc-label-check.yml << 'EOF'
name: AI SDLC — PR Label Check

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, edited]

jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/github-script@v9
        with:
          script: |
            const body = context.payload.pull_request.body || '';
            const isChecked = (marker) =>
              new RegExp(`-\\s*\\[[xX]\\]\\s*[^\\n]*${marker}`, 'i').test(body);

            const agentCreated = isChecked('agent created');
            const aiAssisted = isChecked('ai assisted');

            const desired = [];
            if (aiAssisted || agentCreated) desired.push('ai-assisted');
            if (agentCreated) desired.push('ai-agent');

            const existing = context.payload.pull_request.labels.map(l => l.name);
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;
            const usesAI = desired.length > 0
              || existing.includes('ai-assisted') || existing.includes('ai-agent');

            // Post a reminder at most once per PR, keyed by a hidden marker
            // comment, so re-runs on synchronize/edited don't spam the thread.
            const commentOnce = async (marker, lines) => {
              const { data: comments } = await github.rest.issues.listComments({
                owner, repo, issue_number, per_page: 100,
              });
              if (comments.some(c => c.body && c.body.includes(marker))) return;
              await github.rest.issues.createComment({
                owner, repo, issue_number,
                body: [marker, ...lines].join('\n'),
              });
            };

            // 1) Sync labels from the checkboxes, or nag if none are set.
            if (desired.length === 0) {
              if (!usesAI) {
                await commentOnce('<!-- ai-label-reminder -->', [
                  '⚠️ **AI label missing** — please check a box in the PR template\'s "AI usage" section:',
                  '- `ai-assisted` if AI helped with any part of this PR',
                  '- `ai-assisted` **+ `ai-agent`** if an agent (Claude Code) created this PR',
                  '',
                  'This keeps the AI SDLC metrics accurate. You can merge without it — this is a reminder only.',
                ]);
              }
            } else {
              const toAdd = desired.filter(l => !existing.includes(l));
              if (toAdd.length > 0) {
                await github.rest.issues.addLabels({ owner, repo, issue_number, labels: toAdd });
              }
            }

            // 2) For AI PRs, nudge for the "AI time saved (hours)" line — it
            // feeds the Jira AI Time Saved field and the ROI dashboard. Same
            // regex the collector uses (collector/ticket_extract.py), so the
            // reminder fires exactly when the collector would find no value.
            if (usesAI) {
              const hasHours = /ai time saved\s*\(hours\)\s*:\s*[0-9]+(\.[0-9]+)?/i.test(body);
              if (!hasHours) {
                await commentOnce('<!-- ai-time-saved-reminder -->', [
                  '💡 **AI time saved not recorded** — this PR is AI-assisted but the',
                  '"AI time saved (hours)" line in the description is blank. Add it, e.g.:',
                  '',
                  '> AI time saved (hours): 3',
                  '',
                  'It flows to the Jira ticket and the ROI dashboard. Optional — a reminder only.',
                ]);
              }
            }
EOF
```

- [x] **Step 3: Create `ai-sdlc-jira-sync.yml`** (adapted from agent-platform: `JIRA_PROJECT: SU`, `JIRA_BASE` hardcoded to the SU site instead of read from `vars.JIRA_BASE`, since SessionUp has no reason to also set up that repo variable)

```bash
cat > .github/workflows/ai-sdlc-jira-sync.yml << 'EOF'
name: AI SDLC — Jira Field Sync (TeacherZone)

on:
  pull_request:
    types: [closed]

jobs:
  update-ticket:
    runs-on: ubuntu-latest
    if: github.event.pull_request.merged == true
    permissions:
      pull-requests: read
    steps:
      - name: Checkout ai-sdlc-metrics
        uses: actions/checkout@v7
        with:
          repository: Seta-International/ai-sdlc-metrics
          path: ai-sdlc-metrics

      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: ai-sdlc-metrics/requirements.txt

      - run: pip install -r ai-sdlc-metrics/requirements.txt

      - name: Update Jira ticket AI fields
        working-directory: ai-sdlc-metrics
        env:
          METRICS_GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
          JIRA_AI_USAGE_FIELD: ${{ secrets.JIRA_AI_USAGE_FIELD }}
          JIRA_AI_TOOL_FIELD: ${{ secrets.JIRA_AI_TOOL_FIELD }}
          JIRA_AI_TIME_SAVED_FIELD: ${{ secrets.JIRA_AI_TIME_SAVED_FIELD }}
          GH_REPO: ${{ github.repository }}
          JIRA_BASE: 'https://sessionupcom.atlassian.net'
          JIRA_PROJECT: SU
        run: python -m collector.update_ticket --pr ${{ github.event.pull_request.number }}
EOF
```

- [x] **Step 4: Validate all three files parse as YAML**

```bash
for f in .github/workflows/ai-sdlc-metrics.yml .github/workflows/ai-sdlc-label-check.yml .github/workflows/ai-sdlc-jira-sync.yml; do
  python3 -c "import yaml, sys; yaml.safe_load(open(sys.argv[1])); print(sys.argv[1], 'OK')" "$f"
done
```

Expected: three `<path> OK` lines, no exceptions.

- [x] **Step 5: Commit**

```bash
git add .github/workflows/ai-sdlc-metrics.yml .github/workflows/ai-sdlc-label-check.yml .github/workflows/ai-sdlc-jira-sync.yml
git commit -m "feat: SU-XXXX onboard TeacherZone onto AI SDLC metrics collector"
```

(Replace `SU-XXXX` with a real Jira ticket key per this repo's commit convention if one exists for this chore — otherwise drop the ticket prefix.)

---

### Task 5: Push branch and open a PR

**Files:** none

**Interfaces:**
- Consumes: the 3 commits from Tasks 1, 3, 4 on `chore/SU-000-ai-sdlc-metrics-onboarding`.
- Produces: an open PR on `SETA-International-Vietnam/SessionUp` ready for review/merge.

- [x] **Step 1: Stop and confirm with the user before pushing** — this pushes a branch and opens a PR on a real, shared repo. Do not proceed without an explicit go-ahead in this session. Confirmed 2026-07-08.

- [x] **Step 2: Push and open the PR** — done 2026-07-08: https://github.com/SETA-International-Vietnam/SessionUp/pull/4094

```bash
cd /Users/canh/Projects/TeacherZone/SessionUp/.worktrees/chore-ai-sdlc-onboarding
git push -u origin chore/SU-000-ai-sdlc-metrics-onboarding
gh pr create --repo SETA-International-Vietnam/SessionUp \
  --title "chore: onboard TeacherZone onto AI SDLC metrics" \
  --body "$(cat <<'EOF'
## Summary
- Adds the `ai-assisted`/`ai-agent` PR-template checklist and label sync
- Adds the three thin-caller workflows that report into the shared AI SDLC metrics collector (`Seta-International/ai-sdlc-metrics`)
- Production-deploy signal: successful runs of `deploy-prod.yml` (no GitHub Deployments/Releases in use here)

## Test plan
- [ ] Repo secrets set (JIRA_EMAIL/JIRA_TOKEN/JIRA_AI_*_FIELD/REPORTING_DB_URL) — tracked separately, workflows will fail on missing secrets until then
- [ ] Manually dispatch "AI SDLC — Metrics Collection (TeacherZone)" once secrets land and confirm a row appears in the Grafana TeacherZone dashboard
EOF
)"
```

Expected: `gh pr create` prints the new PR URL.

---

### Task 6: Create Jira custom fields + Incident issue type on `SU`

**Blocked on:** a Jira API token for `https://sessionupcom.atlassian.net`. **Ask the user for this before starting** — they said they'd provide it later. Do not invent or reuse Future's token; it is for a different Jira site and will not work here.

**Files:** none (Jira Cloud REST API + browser steps)

**Interfaces:**
- Produces: three `customfield_XXXX` IDs (AI Usage, AI Time Saved, AI Tool) and a new `Incident` issue type on the `SU` project — consumed by Task 7.

- [x] **Step 1: Get credentials from the user and export them** — done 2026-07-08; token+email saved to `privates/teacherzone/jira.md`, `myself` check returned "Canh Ta".

Ask the user for the Jira email + API token that administers `sessionupcom.atlassian.net`. Have them run this in their own shell (do not have them paste the token into chat):

```bash
export JIRA_EMAIL="<their email>"
export JIRA_TOKEN="<their API token>"
export JIRA_BASE="https://sessionupcom.atlassian.net"
```

Then verify:

```bash
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" "$JIRA_BASE/rest/api/3/myself" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Logged in as:', d['displayName'])"
```

Expected: `Logged in as: <name>`.

- [ ] **Step 2: Check whether `SU` is team-managed or company-managed**

```bash
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" "$JIRA_BASE/rest/api/3/project/SU" | python3 -c "import sys,json; d=json.load(sys.stdin); print('simplified (team-managed):', d['simplified'])"
```

Expected: prints `True` or `False`. The design spec assumed team-managed (matching Future's `FUT` project) — if this prints `False` (company-managed), the scripted `issuetypescheme`/`screens` API approach in `docs/jira-setup.md`'s original (non-manual) plan applies instead of the manual browser steps below; re-derive those calls from that project's own screen/scheme IDs before continuing, since `docs/jira-setup.md` only documents the team-managed manual path in full.

- [ ] **Step 3: Create the 3 custom fields**

Run `docs/jira-setup.md` Steps 1–3 exactly as written (they already use `$JIRA_EMAIL`/`$JIRA_TOKEN`/`$JIRA_BASE` from Step 1 above — no substitution needed beyond having exported `JIRA_BASE` to the SU site). Record the three resulting IDs.

Expected: `AI_USAGE_FIELD_ID=customfield_XXXX`, `AI_TIME_SAVED_ID=customfield_XXXX`, `AI_TOOL_ID=customfield_XXXX` echoed for each.

- [ ] **Step 4: Manual browser steps (if team-managed, per Step 2)**

In `sessionupcom.atlassian.net`, on the `SU` project:
1. **Project settings → Fields** → search box → add "AI Usage", "AI Time Saved", "AI Tool" (repeat per issue type if prompted).
2. **Project settings → Issue types → Add issue type** → name it `Incident`.
3. **Project settings → Workflows** → edit the active workflow → **Done** transition → **Validators** → **Add validator** → **Field Required** → select **AI Usage** → **Add** → **Publish**.

- [ ] **Step 5: Verify the AI Tool field has no default value**

Per `docs/jira-setup.md`: if the AI Tool field context has a default, clear it in the browser (`SU` → Project settings → Fields → "AI Tool" → its context → **Edit default value** → clear → **Save**). A default would make every new ticket look pre-attributed.

Record the three field IDs from Step 3 — they're the input to Task 7.

---

### Task 7: Set GitHub Actions secrets on SessionUp — DONE 2026-07-08

DB credentials retrieved via `ssh future 'cd ~/ai-sdlc-metrics && cat infra/docker/.env'` (per Canh's direction) rather than asked for directly — same shared `seta-reporting` RDS instance host used by agent-platform. All 8 secrets confirmed present via `gh secret list --repo SETA-International-Vietnam/SessionUp`. Note: Task 6's manual browser steps (attach fields, add `Incident` issue type, Done validator) are **still not done** ("I dont for the board" — Canh hasn't gotten to them yet) — collection will still run without erroring, just with weaker AI-usage signal until the fields are attached, and no B3/B4 data until `Incident` exists.

~~**Blocked on:** Task 6's three field IDs, plus the existing `seta-reporting` DB credentials (`REPORTING_DB_URL`, `REPORTING_DB_HOST`, `REPORTING_DB_PASSWORD`) and a Jira API token for the `SU` site — **ask the user for the DB credential values**; they are not stored anywhere in this repo or its local checkout (verified: no `privates/` DB file, no local `infra/docker/.env`). Reuse the exact same values already set as secrets on the agent-platform repo — the user has those.~~

**Files:** none

**Interfaces:**
- Consumes: `AI_USAGE_FIELD_ID`, `AI_TIME_SAVED_ID`, `AI_TOOL_ID` from Task 6.
- Produces: the 8 repo secrets `ai-sdlc-metrics.yml`/`ai-sdlc-jira-sync.yml` (Task 4) read from.

- [x] **Step 1: Get the DB credential values and Jira token from the user, export locally, then set the secrets**

```bash
gh auth switch --user seta-canhta

gh secret set JIRA_EMAIL            --body "<SU site email>"            --repo SETA-International-Vietnam/SessionUp
gh secret set JIRA_TOKEN            --body "<SU site API token>"        --repo SETA-International-Vietnam/SessionUp
gh secret set JIRA_AI_USAGE_FIELD   --body "<AI_USAGE_FIELD_ID>"        --repo SETA-International-Vietnam/SessionUp
gh secret set JIRA_AI_TOOL_FIELD    --body "<AI_TOOL_ID>"               --repo SETA-International-Vietnam/SessionUp
gh secret set JIRA_AI_TIME_SAVED_FIELD --body "<AI_TIME_SAVED_ID>"      --repo SETA-International-Vietnam/SessionUp
gh secret set REPORTING_DB_URL      --body "<same value as agent-platform>" --repo SETA-International-Vietnam/SessionUp
gh secret set REPORTING_DB_HOST     --body "<same value as agent-platform>" --repo SETA-International-Vietnam/SessionUp
gh secret set REPORTING_DB_PASSWORD --body "<same value as agent-platform>" --repo SETA-International-Vietnam/SessionUp
```

- [x] **Step 2: Verify all 8 are set (names only — `gh` cannot read values back)**

```bash
gh secret list --repo SETA-International-Vietnam/SessionUp
```

Expected: `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD`, `JIRA_AI_TOOL_FIELD`, `JIRA_AI_TIME_SAVED_FIELD`, `REPORTING_DB_URL`, `REPORTING_DB_HOST`, `REPORTING_DB_PASSWORD` all listed.

---

### Task 8: Create/confirm the `pm-teacherzone` Grafana viewer account

**Blocked on:** SSH access to the Grafana host (`ssh future`, per existing deploy convention) and the Grafana admin password (`GF_ADMIN_PASSWORD`) — **ask the user for these**; this touches the shared production Grafana instance, so confirm with the user before running, even though the script is idempotent.

**Files:** none (this repo's `infra/grafana/setup_access.py` already exists and is unchanged — TeacherZone is already in `infra/grafana/projects.json`)

**Interfaces:**
- Produces: a `pm-teacherzone` Grafana login scoped to the TeacherZone dashboard folder (or confirms it already exists — the script is idempotent).

- [ ] **Step 1: Confirm the TeacherZone dashboard folder already exists in prod**

```bash
ssh future 'cd ~/ai-sdlc-metrics && git log --oneline -1'
```

Expected: shows a commit at or after `66df606` (this repo's current `main` tip as of this plan) — confirms the host already has the `TeacherZone` entry in `projects.json` (added in commit `6799d57`, long since merged).

- [ ] **Step 2: Run `setup_access.py` on the host**

```bash
ssh future 'cd ~/ai-sdlc-metrics && python3 infra/grafana/setup_access.py --base http://localhost:3030 --admin-password "$GF_ADMIN_PASSWORD" --pm-password "<pm initial password>"'
```

(Ask the user to supply `GF_ADMIN_PASSWORD` — it should already be set in the host's shell/`.env` per existing deploy docs — and a PM initial password for the new `pm-teacherzone` login, or reuse `pm-future`'s if the user wants matching credentials across PMs.)

Expected: prints `created user pm-teacherzone` (or nothing, if it already exists — idempotent) and no errors.

- [ ] **Step 3: Verify folder permissions are locked to the PM**

```bash
ssh future 'curl -s -u admin:"$GF_ADMIN_PASSWORD" http://localhost:3030/api/folders' | python3 -m json.tool
```

Expected: a `TeacherZone` folder is listed. (Full permission verification requires logging in as `pm-teacherzone` in a browser — out of scope for a scripted check, but the same idempotent script already does this correctly for Future.)

---

### Task 9: End-to-end verification — trigger a manual collection run

**Blocked on:** Tasks 5 (workflows merged), 7 (secrets set).

**Update 2026-07-08:** First dispatch attempt failed with `startup_failure` (zero jobs ever created — a GitHub validation-time rejection, not a runtime error) on both the `pull_request` auto-trigger and a manual `gh workflow run`. Root cause: `ai-sdlc-metrics.yml`'s `uses: Seta-International/ai-sdlc-metrics/.github/workflows/collect.yml@main` reusable-workflow calls — agent-platform's identical pattern works because it's same-org + public; SessionUp is a different org (`SETA-International-Vietnam`) + private, and something (org/enterprise policy, not visible via the `admin:org`-gated billing/permissions APIs available to this token) blocks external reusable workflows despite `allowed_actions: all` at the repo level. Canh chose to inline the collector steps rather than chase the org policy — see PR [#4095](https://github.com/SETA-International-Vietnam/SessionUp/pull/4095), which rewrites all 4 jobs to checkout+run the collector directly (the same pattern `ai-sdlc-jira-sync.yml` already uses successfully). Merge that PR before re-running Step 1 below. Trade-off recorded in that file's own header comment: future changes to `collect.yml`/`quarterly-check.yml`/`manual-input.yml` upstream need a matching manual update here since the logic is now duplicated, not delegated.

**Files:** none

**Interfaces:**
- Consumes: everything above.
- Produces: confirmation that `reporting.metric_counts` has a `project = 'TeacherZone'` row sourced from SessionUp, visible on the Grafana TeacherZone dashboard.

- [x] **Step 1: Manually dispatch the metrics workflow** — done 2026-07-08.

- [x] **Step 2: Watch the run** — run [28917395916](https://github.com/SETA-International-Vietnam/SessionUp/actions/runs/28917395916), `collect-current-month` succeeded (39s).

- [x] **Step 2b: Second real bug found and fixed** — the `workflow_runs:deploy-prod.yml` deploy-strategy 403'd (`GET .../actions/workflows/deploy-prod.yml/runs`) because the job's `permissions:` block never granted `actions: read` — a latent bug in upstream `collect.yml` too (never exercised before; Future uses the `deployments` strategy, not `workflow_runs:`). Fixed in this repo's `collect.yml` (commit `31cfdf3`, pushed to `main`) and in SessionUp's inlined copy (PR [#4096](https://github.com/SETA-International-Vietnam/SessionUp/pull/4096), merged). Re-dispatch after that succeeded clean.

- [x] **Step 3: Confirm data landed** — confirmed via job logs (DB access not directly available to the assistant): `[TeacherZone] 2026-07: 2026-07-01 -> 2026-07-08 (1.0 weeks)` / `Upserted 22 metric rows: {'ai_prs': 0, 'total_prs': 39, ..., 'deploys': 5, 'incidents': 0, ...}`. `deploys: 5` confirms the `workflow_runs:` strategy is correctly counting `deploy-prod.yml` runs. `ai_prs`/`incidents` are 0 as expected (labels/template just added, no `Incident` issue type yet — Task 6 manual steps still pending). Grafana dashboard visual confirmation still worth doing when convenient, but the DB row is the ground truth and it's there.

---

### Task 10: Backfill the last 2 complete calendar months

Canh asked to backfill PR/Jira history "back 2 months" in addition to normal forward collection. Interpreting this as the **2 most recently completed calendar months** relative to when this plan was written (2026-07-08, current month July in progress) — i.e. **May 2026 and June 2026**. July itself is already covered by the `collect-current-month` job (Task 4/9) and needs no backfill. If Canh actually meant a different window when this task runs, confirm before dispatching.

**Blocked on:** Tasks 5 (workflow merged) and 7 (secrets set) — uses the same `ai-sdlc-metrics.yml` workflow_dispatch `month` input already built into Task 4's caller, so no local DB credentials are needed (the GitHub Actions run has `REPORTING_DB_URL` from Task 7's secrets).

**Files:** none

**Interfaces:**
- Consumes: the `month` workflow_dispatch input on `ai-sdlc-metrics.yml` (`collector/collect.py --month YYYY-MM`, already generic — no code change needed).
- Produces: two additional `reporting.metric_counts` rows for `project = 'TeacherZone'`, `period = '2026-05'` and `period = '2026-06'`.

- [x] **Step 1: Dispatch May 2026** — done 2026-07-08, run [28917446527](https://github.com/SETA-International-Vietnam/SessionUp/actions/runs/28917446527): `Upserted 22 metric rows: {'ai_prs': 0, 'total_prs': 98, ..., 'engineers_active': 6, 'deploys': 22, ...}`.

- [x] **Step 2: Watch it, then dispatch June 2026** — done 2026-07-08, run [28917517829](https://github.com/SETA-International-Vietnam/SessionUp/actions/runs/28917517829): `Upserted 22 metric rows: {'ai_prs': 0, 'total_prs': 175, ..., 'engineers_active': 10, 'deploys': 44, ...}`.

- [x] **Step 3: Confirm both months landed** — confirmed via job logs (real `Upserted` counts above); Grafana visual check still pending, not blocking.

**Correction to the note originally here:** it claimed a "Co-authored-by trailer fallback" would partially cover backfilled months' `ai_prs` — **that's wrong**, verified by reading the actual code. `collector/metrics.py`'s `_is_ai_pr`/`ai_prs` counting is **label-only** (`AI_LABELS = {"ai-assisted", "ai-agent"}`, checked against `pr.get("labels", [])`) — there is no trailer fallback anywhere in the metrics-counting path. The `Co-authored-by: Claude/Copilot` trailer fallback that CLAUDE.md describes only exists in `collector/ticket_extract.py`, used by `update_ticket.py` for the *Jira ticket field* sync direction (PR → Jira), not for `collect.py`'s PR-counting direction. That's why `ai_prs: 0` for both May and June despite SessionUp's git history actually containing **404 commits with `Co-authored-by: Claude ...` trailers and 62 with `Co-authored-by: Copilot`** in that window (`git log --since=2026-05-01 --until=2026-07-01 --grep=... | grep -c "Co-authored-by"` — see Task 11) — none of those PRs ever got the `ai-assisted`/`ai-agent` label because the labels didn't exist on this repo until Task 2 today. This is real signal being lost, not a hypothetical undercount — see Task 11.

---

### Task 11: Backfill AI-usage labels + Jira fields on May–June merged PRs

Canh asked to retroactively apply AI-usage evidence to already-merged May/June PRs, since they predate the labels/PR template (Task 2/3). Decisions made with Canh:
- Trailer → label mapping: **both** Claude and Copilot commit trailers map to `ai-assisted` only (never `ai-agent` — too uncertain from a trailer alone that an agent, not a human, drove the PR).
- Both labels **and** PR body edits (not labels-only) — body gets a clearly-marked `## AI usage` section.
- `AI time saved (hours)` has no real historical data, so it's an **explicit estimate** from PR diff size (`additions + deletions`), tiered: ≤20→0.5h, ≤100→1.5h, ≤300→3h, ≤800→5h, >800→8h. Marked in the PR body as backfilled/estimated (`<!-- backfilled 2026-07-08, estimated from PR diff size (N lines changed), not measured -->`) — but the **Jira "AI Time Saved" field itself is just a number once written and can't carry that caveat**; this is a real, roughly permanent tradeoff, flagged to Canh before running.

**Files:**
- Scratch script (not committed, not part of this repo): `<scratchpad>/backfill_ai_usage.py` — reuses `collector.ticket_extract.detect_ai_tool` for trailer detection (so it matches production logic exactly) and shells out to the existing `python -m collector.update_ticket --pr N --repo ... --jira-project SU` for the Jira write (best-effort/non-blocking by that script's own design — no new Jira-writing code needed).

**Mechanics per qualifying PR:**
1. Search API finds merged PRs in `2026-05-01..2026-06-30` (**544**, not the ~270 originally assumed — see Task 12, the number was wrong because of a real collector bug).
2. For each with a Claude/Copilot commit trailer: add `ai-assisted` label (idempotent), append the AI-usage body section with the estimated hours (idempotent — marked with a `<!-- ai-usage-backfill-2026-07-08 -->` marker comment so re-runs skip the edit and only retry the Jira sync step).
3. Run `update_ticket` for it (resolves the Jira ticket from the PR title/branch, writes AI Usage=Assisted + AI Tool + AI Time Saved via the existing merge policy in `ticket_extract.compute_field_updates` — usage never downgrades, tool set once, hours accumulate).

**Scope decision:** Canh chose to include "Release/x.x.x"/"Sync ..." branch-merge-back PRs in the backfill (544 total, not filtered down to "real" feature PRs), matching `collect.py`'s own methodology exactly — it doesn't filter these out of `total_prs` either, so excluding them from the AI backfill would have been inconsistent with what the metric actually counts, even though it means some AI-authored commits could in principle be represented by two PR numbers (their original feature PR and a later release-sync PR that bundles it). This is a pre-existing quirk of the repo's git flow / this metric's methodology, not something Task 11 introduces.

**Bugs hit and fixed while running the script** (both in the scratch script, not the shared collector):
- `subprocess.run(["python", ...])` — no bare `python` binary on this Mac, only `python3`/`sys.executable`. Fixed. Left 12 PRs (#3375, #3402, #3434, #3435, #3439, #3440, #3443, #3444, #3454, #3456, #3465, #3471) correctly labeled/body-edited but without their Jira sync — script is idempotent (checks for its own marker comment in the body) so re-running finishes just the Jira step for those without re-touching the label/body.
- Second bug: the "already backfilled, only retry Jira sync" branch didn't set `hours`/`total_changed` before the function's summary-line f-string referenced them → crash on every already-backfilled PR. Fixed (defaults to `"n/a"` in that branch; the real values were already written to the PR body on first pass, this only affected the log line).

- [ ] **Step 1: Run the backfill script** (env: `METRICS_GH_TOKEN`, `JIRA_EMAIL`/`JIRA_TOKEN`/`JIRA_BASE` from `privates/teacherzone/jira.md`, `JIRA_AI_USAGE_FIELD=customfield_10145`, `JIRA_AI_TOOL_FIELD=customfield_10147`, `JIRA_AI_TIME_SAVED_FIELD=customfield_10146`) — in progress as of this edit, run in background (task `bqvq7yhw8`), ~544 PRs, expect ~10-15 min.

- [x] **Step 1 (script run):** done 2026-07-08 — `total=544 labeled=95 no_trailer=449 errors=0`. 95 PRs got the `ai-assisted` label + body section; their Jira tickets got AI Usage/Tool/Time Saved via `update_ticket` (some skipped with a warning where the PR had no resolvable Jira key, e.g. `SU-000`-titled or untitled — expected, best-effort by design).

- [x] **Step 2: Re-dispatch May and June collection** — done 2026-07-08, runs [28919128337](https://github.com/SETA-International-Vietnam/SessionUp/actions/runs/28919128337) (May) and [28919133733](https://github.com/SETA-International-Vietnam/SessionUp/actions/runs/28919133733) (June).

- [ ] **Step 3: Spot-check a handful of backfilled PRs and their Jira tickets** for sanity (label present, body section present, Jira AI Usage/Tool/Time Saved populated) before considering this done.

---

### Task 12: Fix `get_merged_prs`'s pagination-order bug (found while investigating Task 11's PR-count mismatch)

**Root cause:** `collector/github_client.py`'s `get_merged_prs` paginated `/pulls?state=closed&sort=updated&direction=desc` and returned as soon as it saw one PR with `merged_at < since`, assuming `updated` order tracks `merged_at` order. It doesn't — a PR merged well before the window but commented on/relabeled recently sorts *above* a PR genuinely merged inside the window but untouched since. Verified empirically on SessionUp: paginating pages 1-15 this way found only 273 in-window PRs before hitting page 5's first out-of-window PR and returning, while pages 6-12 alone contained 190 more genuinely in-window PRs that would've been silently dropped. The Search API's `merged:` date filter (which Task 11's script already used) returned the correct **544**.

**Impact:** every project's every already-collected month is potentially undercounted for `total_prs`, `ai_prs`, `lead_time_*`, `pr_size_*`, `rework_prs`, `ai_prs_reviewed` — anything derived from `get_merged_prs`'s output. Not limited to TeacherZone.

**Fix** (commit `a944b69`, pushed to `main`): `get_merged_prs` now queries the Search API (`repo:{repo} is:pr is:merged merged:{since:%Y-%m-%d}..{until:%Y-%m-%d}`) for the exact set of in-window PR numbers, then hydrates each via the existing `get_pr()`. Exact, no ordering assumption. Rewrote `tests/test_github_client.py`'s two `get_merged_prs` tests to mock the Search endpoint instead of `/pulls`, and added a pagination test. All 194 tests pass (`test_db.py` excluded, needs Docker).

**Not done (explicitly out of scope for this plan):** re-collecting Future's (or TeacherZone's own already-backfilled May/June, before Task 11 re-runs it) historical months with the fixed code. Every already-collected month across every project is now suspect. This needs its own decision (which months, which projects, whether to just let the next scheduled run silently correct going forward vs. deliberately re-run `--month` for specific past months) — flagged here so it isn't lost, not executed.

- [ ] **Follow-up (not part of this plan):** decide whether/how to re-collect Future's historical months now that `get_merged_prs` is fixed.

---

### Task 13: Manual inputs — headcount, tool cost, blended rate correction

Canh supplied these directly in chat; stored via `python -m collector.manual_input` (Task 7's REPORTING_DB_URL, same credentials as everything else):

- [x] `total_engineers=6` for TeacherZone 2026-05, 2026-06, 2026-07.
- [x] `ai_tool_cost_monthly=150` for TeacherZone 2026-07 only (6 × $25 Claude Team Pro seats) — **not backfilled to May/June**, unconfirmed whether that seat count was active then. Ask Canh if it should be.
- [x] `blended_hourly_rate` corrected from the stale default `12` to `5.77` (= $1000/dev/month ÷ 173.33 standard monthly hours, 40h/week × 52 ÷ 12) in both `infra/grafana/projects.json` (the live config) and `infra/grafana/generate.py`'s `DEFAULTS` (dead fallback, kept in sync for hygiene) — commit `b46cb6b`, pushed to `main`, auto-deployed via `deploy-dashboards.yml` (run `28918924369`, succeeded). This is a **shared default** — since neither project has a `blended_hourly_rate` override, this also corrects Future's ROI dollar figures, not just TeacherZone's. Flagged to Canh that the $1000/month→hourly conversion assumption may need adjusting if their intended basis differs.

---

### Task 14: Clear the maturity-level gates (currently stuck at Level 1)

Canh asked why TeacherZone still shows Level 1 after all the above. Root cause: `reporting.v_levels`'s `overall = LEAST(governance_level, quality_level, round(avg of 5 dimensions))` — Governance (E) and Quality (C) are hard gates, and both require Yes/No judgment flags (`g1`-`g8`, `c3`-`c9` etc.) that had **never been set for TeacherZone at all** — the quarterly auto-check (`collector/quarterly.py`) had never run for this project (its only trigger is a cron hitting 1 Jan/Apr/Jul/Oct, and TeacherZone onboarded 2026-07-08, one week after that quarter's window).

- [x] Ran `python -m collector.quarterly --project TeacherZone --repo SETA-International-Vietnam/SessionUp --quarter 2026-Q3` manually (first run) — auto-derived from real repo facts: `g1_agents_md=Yes` (SessionUp has one), `g3_required_review=No`, `g6_security_controls=No`, `c3_scan_ci=No`, `a2_dashboard=Yes`, `d4_cycle_measured=No`. `b4_dora_improving` not suggested (needs 2 quarters of DORA history, TeacherZone only has partial Q3).
- [x] Enabled GitHub **Code Security** + **CodeQL default setup** (`javascript-typescript`) on SessionUp via API (`PATCH /repos/.../code-scanning/default-setup`) — first scan run `28919083312`, kicked off automatically.
- [x] Enabled **secret scanning** + **push protection** via the same `security_and_analysis` PATCH.
- [x] Enabled **branch protection on `main`** requiring 1 approving review (`required_pull_request_reviews.required_approving_review_count=1`, `enforce_admins=false`, force-push/delete disabled) — a real workflow change for the team, explicitly confirmed with Canh first since it blocks direct-to-main pushes.
- [x] Re-ran the quarterly auto-check immediately after — `g3_required_review` flipped to `Yes` right away (branch protection is read live via the API). `c3_scan_ci`/`g6_security_controls` still `No` as of this edit — waiting on CodeQL's first scan to finish (`/code-scanning/alerts` 404s until at least one analysis exists; `security_scanning_status()` in `github_client.py` checks that endpoint returns 200). Re-run `collector.quarterly` again once run `28919083312` completes.
- [x] **Governance answers from Canh** — done 2026-07-08: `g2_ai_policy=Yes` (devs required to use company-provided Claude/Copilot paid subscriptions + a trusted-tools allowlist), `g4_eval_suite=No`, `g5_shared_library=Yes`, `g7_traceability=Yes` ("check it on Claude console"), `g8_model_governance=Yes` (inferred from the g2 answer — forcing a specific tool allowlist is itself model/tool governance; flagged to Canh as an inference, not stated outright). Stored as manual_inputs for `2026-Q3` along with an `evidence_e` note.
- [x] **Result: `reporting.v_levels` for TeacherZone 2026-Q3 moved from Level 1 → Level 2** (`lvl_a=1, lvl_b=2, lvl_c=2, lvl_d=1, lvl_e=3, overall=2`) as soon as the governance answers + `g3_required_review` (branch protection) landed — Quality gate (`lvl_c`) cleared via `g3 OR c3` (g3 alone was enough). Verified via direct `psql` query against `reporting.v_levels`, not guessed.
- [ ] `c3_scan_ci`/`g6_security_controls` still pending CodeQL's first scan (run `28919083312`, in progress as of this edit) — once it completes, re-run `collector.quarterly` and recheck `v_levels`; Quality could reach 3 (needs `g3 AND c3 AND c2`, where `c2` is auto-derived from metric data — unconfirmed whether TeacherZone already has enough data for `c2` to be true).
