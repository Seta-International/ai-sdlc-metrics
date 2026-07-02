# AI SDLC Metrics — Guide for PM and BOD

This page explains how the measurement system works: where the numbers come
from, what each metric means, and how the colors and maturity levels are
decided. Keep it open the first few times you read the dashboards.

## The idea in one paragraph

We collect delivery data automatically from GitHub and Jira for every
project, once per hour. The PM adds a few numbers by hand once a month, and
answers a short checklist once a quarter. From that we build two dashboards:
a project dashboard for each team (PM runs the sprint with it, engineers see
the same numbers - team totals only, never individual people), and a
portfolio dashboard for the BOD. Every panel answers one of five questions:

1. Is AI paying off? (money)
2. Is AI work faster, and is the quality OK?
3. Is delivery healthy overall?
4. How mature is each team's AI usage?
5. Which team needs training or investment next?

## Where the data comes from

**Automatic, from GitHub.** Every merged pull request (PR = one reviewed code
change). Teams label PRs `ai-assisted` (a person used AI) or `ai-agent` (an
AI agent wrote it, a person reviewed). An automation checks the labels are
not forgotten. We also read who reviewed, which files changed, deployments,
and security alerts.

**Automatic, from Jira.** Every task moved to Done. When the related PR
merges, the system fills three fields on the ticket by itself: AI Usage
(None / Assisted / Agent), AI Tool (Claude Code, Copilot, Cursor...), and AI
Time Saved (hours, estimated by the engineer). Incidents are Jira issues of
type "Incident".

**Manual, monthly (PM, about 2 minutes).** Five numbers: total engineers, AI
coverage, cost baseline, cost actual, and AI tool cost for the month
(licenses plus API usage).

**Quarterly review.** A checklist of Yes/No criteria per project (listed at
the end of this guide). The system pre-fills what it can verify by itself;
the PM confirms or corrects the rest at the quarterly review. A human answer
always beats the automatic suggestion.

Sprint numbers refresh hourly. Monthly numbers close on the 1st.

---

## Question 1: Is AI paying off?

The headline:

    AI Net $ = (AI hours saved x hourly rate) - AI tool cost for the month

AI hours saved is the sum of the "AI Time Saved" field over all tickets done
in the period. It is an engineer estimate, so trust the trend more than any
single month. The hourly rate is a fixed blended rate set per project
(default $25/h). Tool cost is the monthly manual input. Green when net
positive.

Supporting evidence, so the story does not rest on estimates alone:

| Metric | Meaning |
|---|---|
| Throughput per engineer | tasks done divided by active engineers. If AI really saves time, this trends up |
| AI tasks by tool | done tickets per AI tool. Shows which licenses actually produce - use it at renewal time |
| Cost improvement % | baseline cost vs actual cost per unit, from the monthly inputs |

## Question 2: Is AI work faster, and is the quality OK?

We compare AI-labeled work against non-AI work in the same team, same sprint,
same codebase. Only the AI usage differs, so this is the fairest comparison
we can make.

| Metric | Meaning |
|---|---|
| Lead time, AI vs non-AI | how long AI PRs take compared to the rest |
| Hours to first review, AI vs non-AI | how long a PR waits before a person starts reviewing |
| PR size, AI vs non-AI | median lines changed. Very large AI PRs are hard to review well |
| Review rounds | how many times reviewers send AI PRs back for changes |
| Rework from AI % | of the fixes that redo recent work, the share that was fixing AI-written code |
| AI PR review % | share of AI PRs that got a human review |
| AI PR test % | share of AI PRs that came with test changes |

One warning before reading this section: it is normal if AI work is sometimes
slower. A 2026 study (METR) found experienced developers can lose time
verifying AI output. Slower AI lead time is real information about where
effort goes, not a broken dashboard. The combination to act on is slower AND
more rework.

## Question 3: Is delivery healthy? (DORA)

The four industry-standard delivery metrics plus sprint predictability.
Thresholds can be tuned per project; these are the defaults.

| Metric | Meaning | Green | Yellow | Red |
|---|---|---|---|---|
| Lead time | hours from code merged to running in production | <= 72h | 72-168h | > 168h |
| Deploy frequency | production releases per week | >= 1/week | < 1/week | - |
| Change failure rate | incidents per deploy (approximation) | <= 15% | 15-30% | > 30% |
| MTTR | hours from incident opened to resolved | <= 8h | 8-24h | > 24h |
| Sprint predictability | committed sprint tasks actually finished | >= 80% | 60-80% | < 60% |

A project with no production environment yet (Future, today) does not show
deploy frequency or change failure rate, and its lead time is labeled "Merge
Lead Time". We show a partial number honestly instead of pretending it is
DORA.

Quality guards shown alongside:

| Metric | Meaning | Green | Yellow | Red |
|---|---|---|---|---|
| Rework % | PRs that revert or re-fix work merged in the last 14 days | <= 10% | 10-20% | > 20% |
| Security alerts | new code/secret scanning alerts this sprint | 0 | 1-3 | >= 4 |
| Incidents | incidents opened this sprint | 0 | 1-2 | >= 3 |

## Question 4: How mature is each team? (stages 1-4)

Each project gets a stage per sprint, computed from the numbers. Nobody
declares their own stage.

| Stage | Name | Condition |
|---|---|---|
| 1 | Assisted | any AI usage at all |
| 2 | Adopted | >= 50% of active engineers use AI weekly AND >= 30% of PRs are AI-assisted |
| 3 | Agentic | AI agents author >= 10% of PRs, and the gate below holds |
| 4 | Autonomous | >= 50% of agent PRs ship without human fixes, gate still holds |

**The verification gate.** Stages 3 and 4 also require, in the same period:
at least 80% of AI PRs reviewed by a human, and at least 50% of AI PRs
including test changes. Heavy AI usage without review and tests is risk, not
maturity - so a team can produce many agent PRs and still be capped at stage
2. The dashboard shows why, for example "gated: review coverage 60% < 80%".

The agent panels behind this stage:

| Metric | Meaning |
|---|---|
| Agent PRs total / merged | how much work agents attempt, and how much lands |
| Autonomy % | agent PRs merged with zero human commits (blue shading = level, not alarm) |
| Intervention % | agent PRs that needed human fixes before merging - lower is better |
| Agent cycle time | median hours from agent PR opened to merged |

## Question 5: Where to invest or train next?

The BOD table sorts projects by adoption breadth: the share of active
engineers who use AI in a normal week. Green >= 80%, yellow 50-80%, red
< 50%. A red project whose few AI users get good results is the best
training candidate. The tool-mix chart shows whether usage is broad or
carried by one or two people on one tool.

Adoption numbers behind this:

| Metric | Meaning |
|---|---|
| AI engineers / week | distinct people using AI per week (from PR authors + Jira assignees) |
| Active contributors | engineers who merged at least one PR this sprint (bots excluded) |
| Engineer usage rate | the two above divided - the breadth number |
| AI PR % / AI task % / Agent task % | share of work with AI involved, from GitHub and Jira |

---

## The quarterly review checklist

Once a quarter each project is scored on Yes/No criteria, grouped by
dimension. The system verifies some automatically (marked *auto*); the PM
answers the judgment ones. These feed the maturity scoring in the Excel
workbook.

**Governance (the 8-item checklist):**

| Code | Criterion |
|---|---|
| G1 | project has an AGENTS.md (working rules for AI in the repo) - *auto* |
| G2 | written AI usage policy exists |
| G3 | code review is required before merge - *auto* |
| G4 | an eval suite exists (automated checks of AI output quality) |
| G5 | shared prompt/skill library in use |
| G6 | security scanning (code + secrets) is on - *auto* |
| G7 | AI-made changes are traceable (labels, fields, history) |
| G8 | model governance: which models are allowed, and who decides |

**Per dimension:**

| Code | Criterion |
|---|---|
| a2 | a tracking dashboard exists - *auto* |
| a4 | AI adoption is near-universal and intentional |
| b4 | DORA metrics improved vs previous quarter - *auto* (3 of 4 must improve) |
| b5 | cost target reached on multiple workflows |
| b6 | AI impact visible in business outcomes |
| b7 | delivery in top quartile for the portfolio |
| b8 | AI results reported to clients regularly |
| c3 | basic security scanning runs in CI - *auto* |
| c4 | AI vs non-AI quality is compared (this dashboard does it) |
| c5 | evals exist for AI-generated work |
| c6 | SAST/PII checks are mandatory |
| c7 | defects from AI code near zero |
| c8 | evals run automatically in CI |
| c9 | prompt-leak / PII checks in place |
| d3 | a defined class of tasks is delegated to agents |
| d4 | agent cycle time is measured - *auto* |
| d5 | multi-agent workflows in use |

Each dimension also has a free-text evidence line and an improvement action
for the quarter.

---

## How to read the numbers correctly

- Green = on target. Yellow = watch. Red = act. Blue is never an alarm - it
  marks maturity level (used on autonomy %).
- An empty cell is not a zero. Empty means "no data yet" - usually a missing
  monthly input. The panel description says which one.
- Look at trends, not single sprints. One bad sprint is noise; three in the
  same direction is a signal.
- Small projects have jumpy percentages. With 10 PRs a sprint, one PR moves a
  number by 10 points. Judge the direction.
- Know the limits: AI detection depends on labels and Jira fields (automation
  checks them, people still forget sometimes), time saved is self-estimated,
  change failure rate is an approximation. Good enough to decide on training,
  tooling and process. Not audit-grade accounting.

## Who does what

- **Engineers** - label PRs, fill the AI fields on tickets when prompted.
- **PM** - enter the 5 monthly inputs, confirm the quarterly checklist, bring
  the project dashboard to sprint review.
- **BOD** - read the portfolio dashboard; decide on tool spend, training
  targets, and where to push maturity next.
- **Platform team** - owns the collection, thresholds, and dashboards.
  Projects request threshold or setting changes from the platform team.

Every dashboard has a "Download Excel" link that produces the AI SDLC
Maturity workbook for offline review or client reporting.

---

*If a number on the dashboard and this document ever disagree, tell the
platform team - one of the two has a bug, and we will fix it.*
