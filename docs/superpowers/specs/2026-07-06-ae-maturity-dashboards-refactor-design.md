# A–E Maturity Model & Two-Audience Dashboard Refactor — Design

**Date:** 2026-07-06
**Status:** Approved (brainstorm with Canh)
**Supersedes:** the value-story dashboard layout in
`2026-07-02-value-story-dashboards-design.md` (the collected metrics from that
spec are kept; the presentation and the maturity computation are replaced).

## Problem

The current dashboards are an operational tool shown to the BOD: they display
numbers without conclusions, and prod proves the cost of that. Live on the RDS
today:

- **Usage% renders 200%** for Future/S1 — it divides `ai_users_weekly_avg (6)`
  by `engineers_active (3)` (active PR authors), not by team size. The real
  cause is deeper: **`total_engineers` (the correct denominator) has never been
  entered.** The only manual value in the entire prod DB is
  `ai_tool_cost_monthly = 220`.
- **The A–E maturity model cannot compute at all**, because its C/E gates run on
  the quarterly Yes/No flags and prod has *zero* quarterly rows.
- There are **two unreconciled maturity notions**: Grafana shows a single-axis
  0–4 "Stage" (`generate.py:_maturity_case`); the real 5-dimension L1–L5 gated
  model lives only in Excel formulas (`exporter/sheets.py`). They disagree.
- No sample-size guards, no verdict, no empty-panel handling — so a single data
  point (Future: n=21 PRs, 1 sprint, n=8 agent PRs) is rendered as if it were a
  trend.

The root cause is **input capture**, not only presentation. The prettiest
verdict panel shows nothing if `total_engineers` and the governance flags are
never entered. So this refactor fixes both: the human-input surface *and* the
presentation, on one shared source of truth.

This design implements the board feedback
(`Refactor_Grafana_Dashboards_BoD_va_Project.docx`) and grounds it in external
best practice (DORA 2024/25 + AI Capabilities Model, DX Core 4, SPACE, METR,
Thoughtworks, ELEKS/Microsoft agentic ladders — see References).

## Goals

1. Capture the missing manual inputs reliably via an **Excel download → fill →
   upload → import** loop, so team_size and the quarterly flags actually land.
2. Move **all** ratio and maturity-level computation into **DB views** so
   Grafana, the exporter, and the Excel workbook read one source of truth
   (board principle P6). Retire the in-Grafana 0–4 stage.
3. Split into **two audience-specific dashboards** — a BOD Executive View
   (quarterly, verdict-first) and a Project Operational View (weekly, A–E
   sections) — every panel obeying the six design principles.
4. Adopt the workbook's **A–E × L1–L5 gated maturity model**
   (`OVERALL = MIN(E, C, round(avg(A..E)))`) verbatim.

**Non-goals:** per-engineer / individual metrics (stays aggregate, as before);
developer-sentiment survey signals (DXI, self-reported friction) — this is a
pure-telemetry pipeline, and adding a survey is a possible later increment, not
this round; a full exporter redesign beyond the new import route and reading the
new views.

## Design principles (board P1–P6, enforced — a panel that violates one is not merged)

| # | Principle | Mechanism |
|---|---|---|
| P1 | Number + reference + direction + n | SQL concatenates `(n=…)`; thresholds from the `thresholds` table; sparkline in Stat panels |
| P2 | Verdict-first | BOD R0 is one data-generated sentence (Business Text or `CASE…AS verdict`) |
| P3 | Delta, not two loose numbers | AI vs non-AI shown as pre-computed delta + good/bad direction |
| P4 | No empty panels | Sentinel (-1) → value mapping "not measured — baseline Qx" |
| P5 | Guard against absurd values | `LEAST(x,1.0)`; `n<20 → NULL` (grey); `|Δ|<5% → grey "equivalent"` |
| P6 | One source of truth | Ratios/levels computed in DB views (`v_metrics`, `v_levels`, `thresholds`); Grafana computes nothing |

## Audiences and cadence

- **BOD Executive View** — BOD/CEO/CDO. **Quarterly** (+ meeting snapshot). One
  screen, readable in <3 minutes: worth it? safe? mature? → ASK.
- **Project Operational View** — PM/TL/QA. **Weekly** (hourly refresh).
  Diagnostic; the A–E operational panels with guards. Doubles as the PM's
  report-upward material.

## Input model — the single source of truth

### The Excel round-trip loop

1. The exporter serves the English workbook (as today) — auto cells pre-filled
   from the collector, manual (yellow) cells blank, a legend "fill yellow only".
2. PM fills the manual cells: monthly (team_size, costs, coverage) and the whole
   quarterly sheet (G1–G8 + A/B/C/D flags + evidence + improvement action).
3. PM uploads it to a **new authenticated `/import` page on the exporter**.
4. The importer reads **only the designated manual cells**, shows a **diff
   preview** (old → new) with a data-quality check (e.g. "usage would be 78% ✓"
   or "usage > 100% ⚠"), PM confirms → writes `reporting.manual_inputs`.
5. Views recompute everything downstream. The collector keeps owning all auto
   cells; an import never touches them.

### Auto vs manual (settling the sheet-3 overlap)

- **Auto (collector owns; never imported):** all PR/review/deploy/incident/agent
  counts, lead time, rework, security alerts, time-saved, tool mix.
- **Manual (import owns):** `total_engineers`, `cost_baseline`, `cost_actual`,
  `coverage_ai`, `ai_tool_cost_monthly`; quarterly `g1–g8`, the A/B/C/D flags,
  `evidence_a–e`, `improvement_action`.
- **"Engineers using AI / week" (usage% numerator)** stays the **auto proxy**
  (distinct AI-PR authors + AI-usage Jira assignees) for now — it undercounts,
  but making PMs count it monthly is not worth it yet. Revisit if it proves too
  low. (Decision recorded so it isn't silently changed.)

## Data model changes

`reporting.metric_counts` and `reporting.manual_inputs` keep their current shape
(raw counts + text manual values). New/changed objects:

- **`v_metrics` (view)** — mirrors workbook sheet «Metrics». All ratios,
  NULL-safe, plus an **`n_*` sample-size column per percentage**. The usage fix
  lives here: `usage_pct = LEAST(ai_users_weekly_avg / NULLIF(total_engineers,0), 1.0)`.
  `total_engineers` joins from `manual_inputs`.
- **`v_levels` (view)** — mirrors workbook sheet «Levels». Per-dimension levels
  `lvl_a..lvl_e` from the qualitative-flag + quantitative-threshold conditions,
  and `overall = MIN(lvl_e, lvl_c, round((lvl_a+lvl_b+lvl_c+lvl_d+lvl_e)/5.0))`.
- **`thresholds` (table)** — mirrors workbook «Thresholds» + display thresholds:
  `pr_L3=0.30, pr_L4=0.50, usage_L2=0.50, aut_L4=0.30, aut_L5=0.60, int_L5=0.20`,
  plus `n_min=20`, `delta_noise=0.05`, `review_gate=1.0`, `usage_target=0.80`,
  `data_months_min=3`. Versioned, manual.
- **`events` (table)** — `(ts, project, title, tag)` for practice-change
  annotations (e.g. "enabled branch protection"), surfaced as Grafana
  annotations on both dashboards so trend jumps are explainable.

The in-Grafana `_maturity_case()` SQL in `generate.py` is **deleted** — maturity
comes only from `v_levels`.

## The maturity model (adopted verbatim from the workbook)

Each project is placed at the highest level whose qualitative flag *and*
quantitative threshold both hold, per dimension:

| Dim | Measures | Key quantitative gates | Best-practice anchor |
|---|---|---|---|
| **A. Adoption** | breadth + AI share | L2 usage ≥50%; L3 %AI-PR ≥30%; L4 >50%; L5 near-universal | usage tier — diagnostic, never a target (SPACE/DX Core 4) |
| **B. Delivery** | DORA + value | 4 DORA measured → improving → cost targets → outcomes | DORA impact metrics |
| **C. Quality ★gate** | verification + AppSec | %AI-PR review, coverage, rework, evals, SAST/PII | "trust but verify" (Thoughtworks/PwC/Checkmarx) |
| **D. Agent** | autonomy ladder | L4 autonomy ≥30%; L5 ≥60% & intervention ≤20% | ELEKS / Microsoft agentic ladder |
| **E. Governance ★gate** | 8-item checklist | L3 = G1–G3 core; L4 = G1–G5; L5 = 8/8 | DORA AI Capabilities Model (the amplifier) |

**`OVERALL = MIN(E-Governance, C-Quality, round(avg(A..E)))`.** A team can be
A=L4 but if governance is L1, overall = L1. This is "AI is an amplifier, not a
lever" (DORA 2025) and DX Core 4 counterbalancing, expressed as arithmetic.

**Folded in from research (optional, low-effort):**
- E's `evidence_e` may cite DORA-2025 readiness capabilities (version-control
  hygiene, small batches, quality internal platform, published AI stance) — the
  8 scored items stay as-is; the gate is not widened.
- A standing **METR footnote** on velocity panels: "measured, not self-reported;
  slower can be a legitimate verification-overhead finding."

## BOD Executive View

- **R0 VERDICT** — one data-generated sentence (🔴/🟡/🟢, ≤40 words) from
  `v_levels` + net $: 🔴 if C/E gate red ("governance L1 caps overall — fix
  before scaling"); 🟡 net-spend but improving ("controlled-investment phase,
  break-even ~Qx"); 🟢 net-positive + gates green. Leads with governance/quality,
  not usage.
- **R1 — three questions:**
  - **Worth it?** AI Net $ = (hours-saved × blended rate) − **TCO (licenses +
    token/API spend)**; sparkline + break-even projection (drawn only with ≥3
    months data). Labeled a *gross, self-estimated* number (METR/Atlassian
    friction caveat in the tooltip).
  - **Safe?** C/E gate status as a 3-row bar: %AI-PR reviewed (target 100%),
    rework delta AI vs non-AI (render only n≥20), open security alerts
    (click-through).
  - **Mature?** OVERALL now → target, blocker line from `improvement_action`.
- **R2 — Evidence delta** (AI vs non-AI, 4 rows): metric, AI, non-AI, delta% +
  direction + n. `|Δ|<5%` → grey "equivalent"; n<20 → "sample too small". A red
  flag like "PR size AI +767%" must stand out.
- **R3 — Portfolio + ASK:** A–E heatmap per project (C/E columns starred),
  **rendered only with ≥2 projects** (hidden today — only Future is live);
  each cell click-throughs to the team dashboard. ASK = 2–3 decisions needing
  board sign-off this quarter (manual).

**Today's honest output:** with only Future live (n=21 PRs, 1 sprint) the view
renders mostly "measuring, baseline forming" — the correct story, made automatic
by the guards.

## Project Operational View

Filters: `$project`, `$sprint`, `$month`.

- **R0 Data Quality Strip (always visible):** `n` PRs · `n` agent tasks ·
  months-of-data · instrument coverage (sources connected of ~8) · Usage% guard
  status · ETL freshness. Every dispute about a number resolves here.
- **Sections A–E** (one color each; C and E badged ★gate) — one-to-one with the
  maturity dimensions:
  - **A. Adoption** — usage% gauge (`LEAST(ai_users/team_size,1.0)`, alert if raw
    >100%), %AI-PR, %agent-task, tasks-by-tool.
  - **B. Delivery** — lead time (labeled "Merge Lead Time (proxy)" while no prod
    env), Merges/wk (not "Deploys" until real prod), CFR, MTTR (sentinel until an
    incident system exists), cost-to-serve Δ.
  - **C. Quality ★** — %AI-PR reviewed (gate: <100% → red banner up top), rework
    AI vs non-AI (2 series + Δ), coverage/vulns (click-through), PR-size AI vs
    non-AI as an explicit red-flag panel.
  - **D. Agent** — autonomy%, success% vs intervention% (definitions spelled out
    so 100%/100% can't look paradoxical), agent cycle, autonomous-vs-human-fixed
    stacked bar. Whole section greys when n<20 (correct today: n_agent=8).
  - **E. Governance ★** — 8-item checklist Yes/No + score; one-line improvement
    action.
- **Guards (P1–P5):** every % carries `(n=…)`; n<20 suppresses+greys the %; no
  empty panels (sentinels); thresholds from the `thresholds` table so a value is
  never two colors on two panels.
- **R6 Level Summary:** A–E levels + OVERALL from `v_levels`, with
  `OVERALL = MIN(E, C, avg)` printed in the caption.
- **Counterbalancing (research):** within each section, speed sits beside quality
  (lead time next to rework/review%), so a "faster" story can't be read without
  its quality cost. Aggregate only — no per-engineer panels.

## Guards, thresholds, filters, plumbing

- **Thresholds & coloring:** panels read min/max/steps from the `thresholds`
  table via Grafana's "Config from query results" transformation — nothing
  hardcoded. Durations stored as **hours**; Grafana formats to days over 48h.
- **Variables:** BOD = `$quarter` only (portfolio; drill-in via heatmap
  click-through, no project dropdown). Team = `$project`, `$sprint`, `$month`.
- **Data links:** every red number click-throughs to source (alerts → vuln list,
  heatmap cell → team dashboard).
- **Annotations:** from the `events` table (tag `practice-change`).
- **Alerting (internal, never shown as wrong numbers):** `usage_raw > 1.0`
  (data-quality), `review_pct < 100%` (gate C), ETL freshness > 24h → Slack/email
  to the metrics owner.
- **Plugin:** Business Text (marcusolsson-dynamictext) for the verdict; fallback
  `CASE … AS verdict` in a Stat panel if we avoid the plugin.

## Rollout — local-first (hard gate: verify in local Grafana before prod)

1. **Schema + views + seed** — `v_metrics` (fixed usage denominator + `n_*`),
   `v_levels`, `thresholds`, `events`. Expand `infra/db/seed.sql` to exercise
   every guard: n<20 suppression, usage>100% capping, a gated project (C or E at
   L1), a sentinel (unmeasured metric), and ≥2 projects for the heatmap. Bring up
   `infra/docker/compose.local.yml`.
2. **Excel import loop** on the exporter (download → fill → upload → diff-preview
   → commit to `manual_inputs`).
3. **Rebuild `generate.py`** — Project Operational View (A–E + guards). Delete
   `_maturity_case`.
4. **Build BoD Executive View** (verdict, three questions, delta table, heatmap,
   ASK).
5. **Manual verification in local Grafana** against the mock data — walk the QA
   checklist below — **then** deploy to prod (`ssh future`), backfill Future, and
   enter real `total_engineers` + the quarterly flags through the new import.

### QA checklist before it can go to the BOD

- No % > 100 anywhere; no empty panels; every % shows `(n=…)`.
- A given value is never two colors on two panels.
- Grafana OVERALL ≡ workbook OVERALL for the same quarter (CSV cross-check).
- Verdict / blocker / ask are for the current quarter; annotations cover the
  quarter's events.
- With today's data (1 project, 1 sprint, n=16–21 PR, n=8 agent) the only
  honest story rendered is "measurement infra built, baseline forming" — a single
  data point is never rendered as a trend.

## Testing

- **Views** (`tests/test_views.py`): usage denominator + `LEAST` cap; NULL-safety
  on zero/missing denominators; `n_*` columns; `v_levels` per-dimension
  conditions and the `MIN` gate (incl. an A=high/E=low project → overall low).
- **Import** (`tests/test_import.py` — new): parses only manual cells; ignores
  auto cells; diff-preview old→new; rejects/renders a warning for usage>100%
  inputs; round-trips a filled workbook into the expected `manual_inputs` rows.
- **Dashboards** (`tests/test_dashboards.py`): guard rendering (n<20 → grey,
  sentinel → "not measured"), threshold-from-table wiring, BOD heatmap hidden
  with <2 projects, `_maturity_case` removed, verdict SQL branches.
- **Seed** — assert the seeded fixtures hit every guard branch.
- Existing collector/exporter tests keep passing with the new views present.

## References

- Board feedback: `Refactor_Grafana_Dashboards_BoD_va_Project.docx` (six
  principles; two-dashboard split; A–E gating; thresholds table).
- Workbook: `AI SDLC Maturity.xlsx` (sheets 3. Monthly, 4. Quarterly, 5. Levels,
  9. Thresholds) — the framework's source of truth.
- DORA 2024 *Accelerate* + 2025 *State of AI-assisted Software Development* &
  *AI Capabilities Model* (amplifier framing; readiness capabilities).
- DX Core 4 (getDX, 2024) — counterbalanced dimensions; hours saved sampled, not
  self-reported.
- SPACE (Forsgren et al., 2021) — ≥3 dimensions; never Activity alone.
- METR (2025) — experienced devs 19% slower while believing +20%; frame velocity
  honestly, with sample guards.
- ELEKS / Microsoft agentic-adoption ladders — the D-dimension autonomy scale.
- Google, *The New SDLC With Vibe Coding* (May 2026) — verification-gate
  rationale; token-economy TCO framing.

## Implementation order (for the plan that follows)

1. Views + thresholds + events + usage fix (+ view tests) — against local seed.
2. Seed data covering every guard branch.
3. Exporter `/import` route + diff-preview + manual-cell parser (+ import tests).
4. `generate.py` rebuild: Project Operational View with guards (+ dashboard
   tests); delete `_maturity_case`.
5. BoD Executive View (verdict, three questions, delta, heatmap, ASK).
6. Local Grafana manual verification against seed (QA checklist).
7. Prod deploy on `ssh future`: apply schema, backfill Future, enter real
   team_size + quarterly flags via import, cross-check Grafana ≡ workbook.
