# BOD Board Complete Refactor — Design

**Date:** 2026-07-07
**Status:** Draft for review
**Scope:** Complete refactor of the BOD (Board of Directors) portfolio dashboard
(`build_bod_dashboard` in `infra/grafana/generate.py`), plus the read-only
`reporting.` views it needs. No changes to the per-project or raw dashboards.

## 1. Why this board exists (the frame the refactor is built on)

The board does not manage engineering. It owns four decisions, and every panel
must serve one of them:

| Board's job | The question they are actually asking |
|---|---|
| Capital allocation | "Is this AI spend paying off — fund more, hold, or cut?" |
| Risk oversight (fiduciary + AI-governance duty) | "Is this exposing us — security, quality erosion, over-reliance, compliance?" |
| Strategic positioning | "Are we keeping pace, improving, or stalling?" |
| Accountability | "Is management's story credible, or vanity metrics?" |

Consequences that drive the whole design:

- **Company overview, not per-project rows.** The board reviews the *whole
  company*. It cannot read 50 project rows to form a portfolio view. The board
  page shows aggregates + an attention list; per-project detail lives on the
  existing project boards, reached by drill-down.
- **Decision-first, not metric-bucket-first.** Today's board is organised like
  an engineer's model (Adoption / DORA / Quality / Agent). The refactor
  reorganises around the board's questions (§0–§4 below): verdict → minimal
  evidence → counter-metric → direction.
- **Direction over snapshot.** Every headline carries value + ▲▼ vs prior
  period + target line + a short sparkline. A bare current number is an
  anti-pattern for a board.
- **Every claim is counter-balanced.** Velocity is never shown without a
  quality counter-metric; adoption is labelled *context*, never *success*. This
  is the METR / DORA-2025 guardrail (AI lifts throughput but can erode
  stability; developers *feel* faster while measurably slower) made visible.
- **No faking.** A panel exists only if a real signal backs it (GitHub, Jira, or
  manual input). Anything without a signal is dropped, never filled with a
  placeholder value. This preserves the repo's NULL-not-0 discipline.

### Research basis
DORA 2025 ("AI as amplifier"; throughput↑ but stability can↓; retired
Elite/High/Medium/Low tiers for archetypes; added rework rate), DX Core 4
(Speed / Effectiveness / Quality / Business-Impact; adoption is diagnostic
telemetry not an outcome; anti-gaming counter-metrics), SPACE (≥3 dimensions,
never activity at the individual level), METR RCT (experienced devs 19% *slower*
with AI while feeling 20% faster — the credibility guardrail), and executive
/ board-reporting best practice (6–8 top KPIs, verdict-first, ≤2 filters,
targets + trend on every KPI, a ≤3-item decisions box, stable layout
quarter-over-quarter). Full synthesis captured in the brainstorming session.

## 2. Filters (exactly the controls a board should have)

Grafana template variables, wired into every panel's `WHERE`:

- **`$from` / `$to`** — date range (defaults: last ~4 periods → now).
- **`$granularity`** — `month` | `quarter`. Selects `period_type` for the
  period-keyed panels. (Sprint stays the unit only on project boards.)
- **`$project`** — multi-select, `includeAll=true`, default **All**. Lets a
  director scope to a division/subset. Query populated from distinct projects.

No third filter. More sliders let two directors reach different conclusions and
debate the data instead of the business.

## 3. Board layout (decision-first sections)

Ordering is fixed and stable release-to-release. Altitude: ~6 headline KPIs +
supporting evidence, one screen, scannable top-down.

### §0 — Verdict & Decisions
- **Portfolio verdict** (RAG): keep the existing `v_levels`-derived verdict,
  re-scoped to `$project`.
- **Needs a decision** (data-driven, ≤3 items): auto-generated from data, never
  static prose. Rules, in priority order, emit at most 3:
  - any project with a governance/quality gate at Level 1 (E or C) →
    "Remediate governance/quality gate on N project(s)."
  - portfolio AI net value negative for ≥2 consecutive periods →
    "AI ROI negative N periods — review investment."
  - autonomy claimed above verification evidence (autonomy high while eval/test
    coverage gate unmet) → "Autonomy exceeds verification on N project(s)."
  - adoption rising while rework/CFR rising → "Quality eroding as AI adoption
    grows — investigate."
  Each item tagged *for decision* / *for awareness*. If no rule fires: "No board
  action required this period."
- **Attention list**: the few projects to act on (gate red / ROI negative /
  regressed), ranked worst-first, each row linking to that project's board.
  This is the only per-project detail on the page and the drill-down entry.

### §1 — Is it paying off? (Capital)
- **Cumulative AI net $ to date** (TCO-adjusted) + **payback** indicator.
  = Σ over months of (`ai_time_saved_h` × project blended rate) −
  `ai_tool_cost_monthly`. Payback = first period where cumulative ≥ 0.
- **Capacity unlocked** in engineer-equivalents = cumulative hours saved ÷
  (hours per engineer per period). Board language, not raw hours.
- **Spend-vs-return** over the selected range: two series (cumulative value,
  cumulative cost) so the gap is the running net.
- KPIs carry ▲▼ vs prior period + target.

### §2 — Is it safe? (Risk / Governance) — all from existing signals
- **Security posture**: open `security_alerts` (portfolio) + AI-code scan
  coverage from quarterly flags `c3_scan_ci`, `c6_sast_pii_required`,
  `c9_prompt_leak_pii`. Red when critical alerts open or scanning absent.
- **Governance gates**: policy `g2_ai_policy`, required human review
  `g3_required_review`, traceability/audit `g7_traceability`, model governance
  `g8_model_governance`. Presented as a small posture strip (met / gap per gate,
  counted across projects).
- **Quality-erosion early warning**: a flag panel — rework% and CFR% trend
  *against* AI-adoption trend; amber/red when quality degrades as adoption
  climbs.
- **Tool-concentration risk**: portfolio tool-mix (existing Jira tool counts);
  flag when a single tool dominates (vendor / price / single-point-of-failure
  risk).
- Explicitly **dropped** (no honest signal): skill-atrophy / over-reliance as a
  named metric. Not fabricated; may be revisited only if a real proxy emerges.

### §3 — Is it working, honestly? (Credibility)
- **Velocity ↔ quality** paired: lead time next to change-fail% / rework% — never
  velocity alone.
- **Adoption ↔ impact** paired: AI adoption% labelled *context* next to an
  outcome (cost per merged PR / cycle time).
- **AI vs non-AI evidence** (portfolio-aggregated, one row) with sample-size
  caveat text: a slower-but-safer AI lead time is a legitimate finding, read
  with the quality columns.

### §4 — Are we maturing? (Trajectory)
- **Maturity distribution**: count of projects at each A–E level (portfolio
  shape), not 50 rows. Scales to N projects.
- **Adoption penetration**: how many projects are on the AI program over time
  (an S-curve), distinct from intensity within adopters.
- **Autonomy gated by verification**: autonomy% shown with the eval/test
  verification gate; the board sees earned autonomy, not claimed.
- Direction across the selected range (sparklines / trend lines).

## 4. New read-only views (`infra/db/views.sql`)

No new collection. Four aggregate views keep `generate.py` SQL small and make
the board scale to many projects:

1. **`v_portfolio_roi`** — per (period_type, period_key): summed value, summed
   cost, and a window cumulative running total, per project and portfolio.
   Feeds §1.
2. **`v_level_distribution`** — per (period_type, period_key, dimension, level):
   count of projects. Feeds §4 distribution.
3. **`v_attention`** — one row per project with its worst active gate / ROI sign
   / regression flag and a severity rank. Feeds §0 attention list.
4. **`v_penetration`** — per period: distinct projects with AI activity vs total
   tracked. Feeds §4 S-curve.

All follow existing conventions: NULL when no data, `DROP VIEW` before
`CREATE` (column reorder), read-time only.

## 5. Aggregation math (so a tiny project can't skew the portfolio)

- **Additive** ($ value, cost, hours saved, PR/task counts, alerts, project
  counts): summed.
- **Rates** (adoption%, lead time, autonomy%, CFR%, rework%): volume-weighted,
  not a naive average of per-project averages. Weight by the natural denominator
  (PRs or tasks). Documented per metric in the view.
- **Levels**: distribution (counts per level) + portfolio gate = MIN across
  projects for gated dimensions (C, E), consistent with existing
  `OVERALL = MIN(E, C, round(avg))`.

## 5a. Thresholds — one central, documented source

Targets/benchmarks are **research-based** and live in **one place**, easy to
change later. Today thresholds are split between the `TH` dict in `generate.py`
(panel colours) and the `reporting.thresholds` DB table (A–E gates). The
refactor consolidates board KPI benchmarks into a single canonical store with
each value annotated by its source, so a future change is one edit:

- **Canonical store:** extend `reporting.thresholds` (already seeded in
  `init.sql`) to hold every board KPI's green/amber/red bands as named keys,
  each row carrying a `note` citing its basis (e.g. DORA tier, DX ~8%
  throughput, usage ≥80%). `generate.py` reads these at generate time so the
  JSON is never the source of truth. (Final mechanism — DB read vs a single
  annotated config block — pinned in the plan; the requirement is *one*
  documented, editable place.)
- **Research anchors to seed:** DORA metrics → DORA tier bands (directional,
  post-2025 archetypes noted); throughput/velocity → DX realistic ~8% lift
  (not vendor 10×); engineer usage → framework ≥80%; ROI → net-positive after
  TCO; security → 0 open critical; governance gates → all required flags met.

## 6. What is explicitly out of scope

- No forecast / break-even projection / modelled bands (board's call: show
  direction, let them read it).
- No new data collection from GitHub/Jira/manual this round; the risk section is
  powered by flags and alerts already captured.
- No changes to project or raw dashboards, collector, or exporter.
- No skill-atrophy metric (uncollectable).

## 7. Testing

- Golden-value tests for the four new views against seeded data
  (`infra/db/seed.sql`), mirroring existing view tests.
- `generate.py` output assertions: BOD JSON contains the §0–§4 sections, the
  three template variables, and no per-project 50-row table.
- Local-first verification: bring up `infra/docker/compose.local.yml`, confirm
  filters drive every panel, deltas/sparklines/targets render, attention list
  links resolve, and no panel shows a fabricated value where data is absent
  (greyed/NULL instead). Prod deploy only after local sign-off.

## 8. Open questions for review

- **Decided:** targets are research-based and centralised in one documented
  store (see §5a).
- "Needs a decision" rule thresholds (e.g. "negative ≥2 periods") — confirm the
  exact numbers when pinning threshold values in the plan.
- Whether §2 governance posture counts gates across *all* projects or only
  `$project`-selected ones (proposed: follows `$project`).
