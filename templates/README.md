# Onboarding a project to AI SDLC metrics

1. Copy `ai-metrics-caller.yml` to `<your-repo>/.github/workflows/ai-metrics.yml`
   and fill the `<PLACEHOLDERS>` (project name, Jira key, sprint anchor,
   deploy environments/strategy, optional Jira board id).
2. Add repo secrets: `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD`,
   `REPORTING_DB_URL`.
3. Adopt the labeling conventions: `ai-assisted` / `ai-agent` PR labels and the
   Jira AI-usage field (`None | Assisted | Agent`).
4. Make deploys countable (pick one):
   - GitHub Actions with `environment:` on the deploy job — nothing to do;
   - other CI/CD: call the `record-deployment` action
     (`uses: Seta-International/ai-sdlc-metrics/actions/record-deployment@main`)
     or POST to the Deployments API (see below);
   - can't touch the pipeline: set `deploy-strategy` to `releases`,
     `tags:<pattern>`, or `workflow_runs:<file>.yml`.
5. In `Seta-International/ai-sdlc-metrics` → Settings → Actions, ensure
   "Accessible from repositories in the organization" is enabled so
   `workflow_call` works across repos.

Raw API call for non-Actions CI/CD:

    curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
      https://api.github.com/repos/<owner>/<repo>/deployments \
      -d '{"ref":"<sha>","environment":"production","auto_merge":false,"required_contexts":[]}'

Monthly manual input (first business day): run the "AI SDLC Metrics" workflow
with `manual_period` = last month (e.g. `2026-06`) and `manual_fields` =
`total_engineers=18; cost_baseline=45; cost_actual=30; coverage_ai=0.55`.

Quarterly review (first week of quarter): the auto-check has pre-filled what it
can; enter judgment flags and evidence the same way with `manual_period` =
`2026-Q3` and fields like `g2_ai_policy=Yes; evidence_a=Broad adoption, live dashboard`.
