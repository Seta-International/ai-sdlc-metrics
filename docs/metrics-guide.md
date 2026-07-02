# AI SDLC Metrics — How We Measure, and What the Numbers Mean

*A guide for PMs and the BOD. No engineering background needed.*

---

## 1. What this system does

We measure how our teams apply AI across the software development lifecycle —
and whether it is actually paying off. The system collects data automatically
from the tools teams already use (GitHub and Jira), stores one set of numbers
per sprint and per month for each project, and shows them in two dashboards:

- **Project dashboard** — one per project. The PM uses it to steer the sprint
  and to report upward. Engineers see the same view (team numbers only — we
  deliberately do not track individuals).
- **BOD portfolio dashboard** — all projects side by side, for investment,
  training, and tooling decisions.

Every panel on these dashboards answers one of five questions ("stories").
If a number doesn't help answer one of them, we don't show it.

| # | The question | Who acts on it |
|---|--------------|----------------|
| 1 | **Is AI paying off?** | BOD |
| 2 | **Is AI work faster — and as good?** | BOD + team |
| 3 | **Is delivery healthy?** | BOD + PM |
| 4 | **Are we climbing the maturity ladder?** | BOD |
| 5 | **Where should we invest or train next?** | BOD |

---

## 2. Where the data comes from

**Automatic (no one types anything):**

- **GitHub** — every merged pull request (PR = one reviewed change to the
  code). PRs are labeled `ai-assisted` (a person used AI to help) or
  `ai-agent` (an AI agent did the work and a person reviewed it). We also read
  review activity, changed files, deployments, and security alerts.
- **Jira** — every task moved to Done, with three AI fields the system fills
  in automatically when the related PR merges: **AI Usage** (None / Assisted /
  Agent), **AI Tool** (Claude Code, Copilot, Cursor…), and **AI Time Saved**
  (hours the engineer estimates AI saved on that ticket). Incidents are Jira
  issues of type *Incident*.

**Manual (PM enters once a month, ~2 minutes):** team size, AI coverage,
cost baseline / actual, and **AI tool cost** (licenses *plus* API usage —
this is what the ROI math subtracts).

**Cadence:** sprint numbers refresh hourly; monthly numbers on the 1st;
a quarterly governance check runs automatically and suggests answers a human
confirms.

---

## 3. Story 1 — Is AI paying off? (ROI)

**The headline number:**

> **AI Net $** = (AI hours saved × blended hourly rate) − monthly AI tool cost

- *AI hours saved* — the sum of the "AI Time Saved" estimates on every ticket
  finished in the period. Engineers enter this per ticket, so it is an
  estimate — treat the trend as more meaningful than any single month.
- *Blended hourly rate* — a fixed rate (default **$25/h**) set in the system's
  configuration per project.
- *Tool cost* — the monthly manual input (seats + API spend).

**Green** when net-positive. Supporting evidence, because one estimate alone
shouldn't carry the story:

| Metric | What it means | Why it matters |
|---|---|---|
| Throughput / engineer | Tasks completed ÷ active engineers | If AI truly saves time, this should trend up as adoption grows |
| AI tasks by tool | Done tickets per AI tool | Shows *which* tool's licenses produce — informs renewal decisions |

---

## 4. Story 2 — Is AI work faster, and as good?

This is the strongest evidence we have, because it compares AI-assisted work
and non-AI work **inside the same team, in the same sprint**. Same people,
same codebase, same process — only the AI usage differs.

| Metric | What it means |
|---|---|
| Lead time — AI vs non-AI | How long AI-labeled PRs take vs the rest |
| Hours to first review | How long a PR waits before a human starts reviewing it |
| PR size — AI vs non-AI | Median lines changed. Much larger AI PRs are harder to review well |
| Review rounds | How often reviewers send AI PRs back for changes — the "verification burden" |
| Rework from AI % | Of all fixes that redo recent work, how many were fixing AI-authored changes |
| AI PR review % / test % | Are AI changes actually reviewed, and do they come with tests? |

**Important — read this panel with an open mind.** Industry research (the METR
study, 2026) found experienced developers were sometimes *slower* with AI,
because verifying AI output takes time. If our AI lead time is higher than
non-AI, that is a real finding about where verification effort goes — not a
dashboard error, and not necessarily bad. What *would* be bad: AI work that is
both slower **and** causing more rework.

---

## 5. Story 3 — Is delivery healthy? (DORA)

These are the four industry-standard "DORA" delivery metrics plus sprint
predictability. They answer: *as AI adoption grows, is delivery getting better
or worse?*

| Metric | Plain meaning | 🟢 Green | 🟡 Watch | 🔴 Act |
|---|---|---|---|---|
| Lead time | Hours from code approved to running in production | ≤ 72h | 72–168h | > 168h |
| Deploy frequency | Production releases per week | ≥ 1/week | < 1/week | — |
| Change failure rate | Incidents per deploy (proxy) | ≤ 15% | 15–30% | > 30% |
| MTTR | Hours to resolve an incident | ≤ 8h | 8–24h | > 24h |
| Sprint predictability | Committed tasks actually finished | ≥ 80% | 60–80% | < 60% |

Thresholds are configurable per project. **Projects without a production
environment yet** (e.g. Future) don't show deploy frequency or change failure
rate, and their lead time is labeled *"Merge Lead Time"* — an honest partial
measure, not a fake DORA number.

Other quality guards shown alongside: rework % (🟢 ≤10 / 🔴 >20), security
alerts (🟢 0 / 🔴 ≥4), incidents per sprint (🟢 0 / 🔴 ≥3).

---

## 6. Story 4 — The maturity ladder (stages 1–4)

Each project sits at a stage per sprint, computed from the numbers — nobody
self-declares a stage.

| Stage | Name | You are here when… |
|---|---|---|
| 1 | **Assisted** | Any AI usage at all (first AI-labeled PR or ticket) |
| 2 | **Adopted** | ≥ 50% of active engineers use AI weekly AND ≥ 30% of PRs are AI-assisted |
| 3 | **Agentic** | AI agents author ≥ 10% of PRs — *and the verification gate holds* |
| 4 | **Autonomous** | ≥ 50% of agent PRs ship without human fixes — *gate still holds* |

**The verification gate (why a busy team can still be capped at Stage 2):**
stages 3 and 4 additionally require, in the same period:

- ≥ **80%** of AI PRs got a human review, and
- ≥ **50%** of AI PRs came with test changes.

The reasoning (from Google's 2026 SDLC whitepaper): what separates mature AI
engineering from "vibe coding" is not *how much* AI you use, but *how outputs
get verified*. A team producing lots of unreviewed, untested agent code is
accumulating risk, not maturity — so the dashboard says Stage 2 and shows
which gate failed (e.g. *"gated: review coverage 60% < 80%"*).

Supporting panels: the agent funnel (agent PRs → merged → untouched by humans)
and autonomy % (blue shading marks maturity level, not health).

---

## 7. Story 5 — Where to invest or train next

The BOD table sorts projects by **adoption breadth** — the share of active
engineers who actually use AI in a typical week (🟢 ≥ 80%, 🟡 50–80%,
🔴 < 50%). A project with low breadth but good results from its few AI users
is the clearest training opportunity. The tool-mix chart shows whether a
project's AI usage is broad or carried by one power user on one tool.

---

## 8. How to read the dashboards honestly

- **Color code:** 🟢 on target · 🟡 watch · 🔴 act. **Blue** is never an alarm —
  it marks maturity/intensity (e.g. autonomy %).
- **Empty cells are not zeros.** The system never writes a 0 when it has no
  data — an empty cell means "not measured yet" (often a missing monthly
  manual input; the panel description says which one).
- **Trends beat snapshots.** Every stat tile carries a small history line.
  One bad sprint is noise; three in the same direction is a signal.
- **Small numbers wobble.** A project merging 10 PRs a sprint will see
  percentages jump around. Judge direction, not decimals.
- **These are proxies, honestly labeled.** AI detection relies on PR labels
  and Jira fields (enforced by automation, but people can forget); time saved
  is self-estimated; change failure rate approximates incidents/deploys.
  Good enough to steer by — not a court exhibit.

---

## 9. Who does what

| Role | Responsibility |
|---|---|
| Engineers | Label PRs (`ai-assisted` / `ai-agent`) — automation checks this; fill AI fields on tickets when prompted |
| PM | Enter 5 monthly inputs (team size, coverage, cost baseline/actual, AI tool cost); confirm the quarterly governance check; use the project dashboard in sprint review |
| BOD | Read the portfolio dashboard; decide on tooling spend, training targets, and where to push maturity |
| Platform (this repo) | Owns collection, thresholds, and dashboard generation; teams change per-project settings via a small config file (`infra/grafana/projects.json`) |

**Excel export:** every dashboard has a "Download Excel" link producing the
AI SDLC Maturity workbook for offline review or client reporting.

---

*Metric definitions and thresholds live in code (`infra/grafana/generate.py`,
`infra/db/views.sql`) and per-project config (`infra/grafana/projects.json`);
this document explains them. If they ever disagree, the config is the truth —
and this document has a bug to fix. Design rationale:
`docs/superpowers/specs/2026-07-02-value-story-dashboards-design.md`.*
