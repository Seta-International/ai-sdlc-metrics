# AIDC on the Future App — From Sprint Ticket to Measured Merge

How the Future team runs AI-Driven Coding (AIDC) on the `agent-platform` repository, end to end: a developer picks up a sprint ticket, an AI agent (Claude Code) does the heavy lifting under a hard harness of rules and gates, and the result is a reviewed, merged change whose AI usage and time saved are recorded automatically. **This is the process running today** — every rule file, gate, template, and workflow referenced below exists in the repo.

**Scope.** The flow starts *after* the PO/PM has broken work down: the ticket is sprint-planned in Jira with acceptance criteria, story points, and links to the PRD/SRS on Confluence. How tickets get to that state is covered in [How We Apply AI Across the SDLC](ai-sdlc-per-stage.md) (Stage 1).

**Principle.** *AI drafts, a human decides.* The agent produces specs, plans, code, tests, and PRs — but four gates are always held by people:

| # | Human gate | Where |
|---|---|---|
| 1 | Spec approval | end of Phase 1 |
| 2 | Plan approval | end of Phase 2 |
| 3 | PR review & merge | Phase 4 |
| 4 | QA acceptance on UAT | Phase 5 |

---

## 0. The harness — built before any session starts

A coding agent is only as good as the context and guardrails around it. Before a single ticket is prompted, the project invests in a harness so that *every* developer's agent behaves the same way and *no* agent output reaches a human reviewer without passing machine checks first.

| Component | What it is (in the repo) | Why it is needed |
|---|---|---|
| Project rules | `CLAUDE.md` + `.claude/rules/` split by module (`frontend.md`, `backend.md`, `agent.md`) | Loaded into every session automatically, so the agent follows team conventions from turn one — architecture constraints, naming, commit rules are enforced by context, not tribal knowledge. |
| Pre-installed skills | superpowers (brainstorm → spec → plan → execute), frontend-design, playwright, context7 | Turns "prompting" into a repeatable process. Every dev's agent walks the same disciplined workflow instead of improvising, so output quality does not depend on individual prompt skill. |
| On-demand docs | `docs/agent/architecture.md`, module guides, DB & domain design, infra briefs | Keeps the always-loaded context small and cheap; the agent pulls deep detail only when the task needs it, which is both faster and more accurate than stuffing everything in up front. |
| Design handoff | UI/UX mockups handed off to Claude as design files | The agent builds to the approved mockup instead of inventing its own UI — removes an entire class of "looks wrong" review rounds. |
| Hard local gates | lefthook hooks: commitlint, branch-name check, biome format/lint, typecheck, dependency-cruiser (DDD module boundaries), unit & integration tests | A machine-enforced quality floor. A red gate sends the work back to the *agent* to fix, not to a human — people only ever review code that machines could not reject. |
| Estimation guide | `docs/guides/estimation.md` — story-point anchors, team velocity constant (recalibrated quarterly), and the time-saved formula | Makes "AI time saved" a derived, defensible number (`points × velocity − actual hours`, cross-checked against the real diff) instead of a self-reported guess. |
| Review routing | `.github/CODEOWNERS` + review tiers T1/T2/T3 in the PR template | Review depth follows risk automatically: a feature module goes to its owner, anything touching core / identity / shared-ui / migrations / CI auto-requests the tech lead. |
| PR template + label check | `.github/pull_request_template.md` with AI-usage labels and AI-time-saved field; a CI check enforces the labels | Every PR declares its AI usage the same way, so adoption metrics are complete as a by-product of working — no extra paperwork. |
| CI + metrics pipeline | CI workflows (build, integration, e2e, security & quality scans) plus `ai-sdlc-jira-sync.yml` and the scheduled metrics collector feeding Grafana | Independent verification after merge, and automatic ROI reporting to leadership without anyone filling in a spreadsheet. |

---

## The workflow at a glance

```mermaid
flowchart LR
    classDef phase fill:#E0E7FF,stroke:#4F46E5,color:#111;
    classDef gate fill:#EDE9FE,stroke:#7C3AED,color:#111;

    P1["P1 · Context & Spec<br/>ticket + docs → spec.md"]
    G1["Human:<br/>spec review"]
    P2["P2 · Plan<br/>spec → plan.md (TDD)"]
    G2["Human:<br/>plan approval"]
    P3["P3 · Implementation<br/>tasks → code + tests,<br/>local gates green"]
    P4["P4 · PR & Review<br/>auto PR → CI → human review"]
    G3["Human:<br/>approve & merge"]
    P5["P5 · Metrics & Release<br/>Jira sync → Grafana → UAT"]
    G4["Human:<br/>QA on UAT"]

    P1 --> G1 --> P2 --> G2 --> P3 --> P4 --> G3 --> P5 --> G4

    class P1,P2,P3,P4,P5 phase;
    class G1,G2,G3,G4 gate;
```

Each phase below has a step table (`Actor · Action · Precondition · Output · Why`) and its own sequence diagram.

---

## Phase 1 — Context & Spec

The most expensive failure in software is building the wrong thing. This phase spends its effort *before* code: the agent assembles the full requirement context and brainstorms with the developer until intent is unambiguous, then freezes it as a spec.

| # | Actor | Action | Precondition / Input | Output / Gate | Why |
|---|---|---|---|---|---|
| 1 | Dev | Picks a planned ticket (FUT-n) from the sprint board and starts a Claude Code session with the ticket id | Ticket has AC, story points, PRD/SRS links | Session started | The ticket key is the thread that ties spec, branch, PR, and metrics together later. |
| 2 | Claude Code | Automatically loads `CLAUDE.md` and the relevant `.claude/rules/*` | Harness in place (§0) | Conventions in context | The agent starts constrained — it cannot "forget" team rules because they load on every session. |
| 3 | Claude Code | Pulls the Jira ticket and linked Confluence PRD/SRS via Atlassian MCP | Ticket id from step 1 | Requirement context in session | No copy-paste: context comes from the live source of truth, so the agent works from the same documents the PO signed off. |
| 4 | Claude Code | Reads architecture and module guides on demand (`docs/agent/architecture.md`, guides) | On-demand docs exist | System context | The solution fits the existing architecture instead of fighting it — this is what prevents plausible-but-wrong designs. |
| 5 | Dev + Claude Code | Brainstorming (superpowers skill): the agent asks clarifying questions one at a time against AC, codebase, and docs | Steps 2–4 done | Ambiguities resolved | Every unclear requirement caught here costs minutes; caught in review it costs a rework cycle; caught in UAT it costs days. |
| 6 | Claude Code | *(optional)* Fetches current library docs via context7 or web search | A technical unknown surfaces | Up-to-date technical facts | Model training data ages; live docs prevent building on deprecated APIs. |
| 7 | Claude Code | Writes the spec to `docs/superpowers/specs/` (SDD style: requirements, approach, impact, test strategy) | Brainstorm converged | `spec` file committed | A written spec is reviewable and diffable — the decision is captured, not lost in a chat log. |
| 8 | Dev | **Human gate 1:** reviews the spec line by line, loops with the agent until final | Spec draft | Approved spec | This is the highest-leverage review in the whole flow: everything downstream (plan, code, tests, PR) is generated from this document. |

```mermaid
sequenceDiagram
    actor Dev
    participant CC as Claude Code
    participant ATL as Jira + Confluence<br/>(Atlassian MCP)
    participant C7 as Context7 / Web

    Note over CC: Session start: CLAUDE.md +<br/>.claude/rules load automatically
    Dev->>CC: 1. Ticket id (FUT-n)
    CC->>ATL: 2. Pull ticket (AC, points) + PRD/SRS
    ATL-->>CC: Requirement context
    Note over CC: 3. Read architecture.md,<br/>module guides on demand
    loop 4. Brainstorming, one question at a time
        CC->>Dev: Clarifying question
        Dev-->>CC: Decision
    end
    opt Technical unknown
        CC->>C7: 5. Fetch current library docs
        C7-->>CC: Live documentation
    end
    CC->>Dev: 6. Draft spec (SDD)
    loop Until final
        Dev->>CC: Review comments
        CC-->>Dev: Revised spec
    end
    Note over Dev: 7. HUMAN GATE 1<br/>Spec approved
```

---

## Phase 2 — Plan

An approved spec says *what*; the plan says *exactly how*. The agent analyses the codebase and produces a TDD implementation plan small enough to verify step by step.

| # | Actor | Action | Precondition / Input | Output / Gate | Why |
|---|---|---|---|---|---|
| 1 | Claude Code | Analyses the codebase against the approved spec: which files change, which are created or deleted, what can break | Approved spec (gate 1) | Impact analysis | Grounding the plan in the real code prevents the classic AI failure of planning against an imagined codebase. |
| 2 | Claude Code | Writes `plan.md` (in `docs/superpowers/plans/`): ordered small tasks, and for each — the failing test to write first, then the change (TDD) | Impact analysis | Plan file | Small, test-first tasks are independently verifiable — if a step goes wrong, it is caught at that step, not at the end. |
| 3 | Dev | **Human gate 2:** reviews and approves the plan | Plan draft | Approved plan | The plan is the contract for the autonomous implementation session — approving it here is what makes hands-off execution safe. |

```mermaid
sequenceDiagram
    actor Dev
    participant CC as Claude Code
    participant Repo as Codebase

    CC->>Repo: 1. Analyse impact of approved spec
    Repo-->>CC: Files to change / create / delete
    CC->>Dev: 2. plan.md — ordered TDD tasks<br/>(test first, then change)
    loop Until approved
        Dev->>CC: Adjust scope / ordering
        CC-->>Dev: Revised plan
    end
    Note over Dev: 3. HUMAN GATE 2<br/>Plan approved
```

---

## Phase 3 — Implementation

A **fresh session** executes the plan — clean context means the plan file is the single source of truth, with no leftover assumptions from brainstorming. Work is split into small tasks; each task passes an implement round and a review round before the next starts, and nothing leaves the machine until every local gate is green.

| # | Actor | Action | Precondition / Input | Output / Gate | Why |
|---|---|---|---|---|---|
| 1 | Dev | Opens a new Claude Code session pointed at the approved plan | Approved plan (gate 2) | Execution session | A clean session executes exactly what was approved — the plan is the contract, not the chat history. |
| 2 | Claude Code (orchestrator) | Breaks the plan into small bounded tasks; parallel tasks run in isolated git worktrees | Plan file | Task list | Small tasks keep each unit inside what an agent can hold reliably in context; worktrees stop parallel work colliding. |
| 3 | Implementation agent | Per task: writes the failing test first, then the code to make it pass (TDD) | Task definition | Code + passing test | The test pins the requirement before the code exists — the agent cannot "declare success" without proof. |
| 4 | Review agent | Per task: a second pass checks the change against the spec and quality rules; bug-fix rounds follow until clean | Task implemented | Task accepted | Implementer and reviewer are separated even inside the AI — the same separation of duties we require of people. |
| 5 | Claude Code | Runs the full local gate stack (pre-commit / pre-push): commitlint, branch name, biome format + lint, typecheck, dependency-cruiser DDD boundaries, tests | All tasks done | All gates green | Machines reject mechanical defects for free; a red gate loops back to the agent, so humans never spend review time on what a linter can catch. |
| 6 | Claude Code | Self-corrects anything a gate flags and re-runs until everything passes | Any red gate | Green working tree | The fix loop is automatic — failures cost agent cycles, not developer attention. |

```mermaid
sequenceDiagram
    actor Dev
    participant Orch as Claude Code<br/>(orchestrator)
    participant Impl as Implementation<br/>agent
    participant Rev as Review<br/>agent
    participant Gate as Local gates<br/>(lefthook)

    Dev->>Orch: 1. New session: execute plan.md
    Note over Orch: 2. Break into small tasks<br/>(worktrees if parallel)
    loop Per task
        Orch->>Impl: Task brief
        Note over Impl: 3. Failing test first,<br/>then code (TDD)
        Impl-->>Orch: Implemented
        Orch->>Rev: 4. Spec + quality review
        Rev-->>Orch: Findings
        opt Findings exist
            Orch->>Impl: Bug-fix round(s)
        end
    end
    loop 5. Until all green
        Orch->>Gate: pre-commit / pre-push:<br/>lint, format, typecheck,<br/>depcruise (DDD), tests
        Gate-->>Orch: Red gates → self-fix
    end
```

---

## Phase 4 — Pull Request & Review

The agent assembles the PR the same way every time — template, tier, AI-usage declaration, derived time-saved figure, auto-assigned reviewers — then CI verifies independently and a human makes the merge decision.

| # | Actor | Action | Precondition / Input | Output / Gate | Why |
|---|---|---|---|---|---|
| 1 | Claude Code | Computes AI usage (labels `ai-assisted` / `ai-agent`) and AI time saved per `docs/guides/estimation.md`: `baseline = story points × team velocity`, reconciled against the real diff size, minus actual hours spent | Ticket points; work done | Declared AI metrics | The ROI number is derived from a calibrated formula and cross-checked against the real code — defensible in front of anyone, unlike a self-reported guess. A human can still override it in Jira, and the human value wins. |
| 2 | Claude Code | Fills the PR template: Jira key, tier (T1/T2/T3), risk & affected modules, hot/cold review map for big diffs, evidence of verification | Template in repo | Complete PR description | Reviewers get the same decision-ready structure on every PR — review time goes to judgment, not archaeology. |
| 3 | Claude Code | Assigns reviewers via CODEOWNERS and the tier rules — core / identity / shared-ui / migrations / CI auto-request the tech lead | CODEOWNERS in repo | Right reviewers requested | Review depth scales with blast radius automatically; nobody has to remember who owns what. |
| 4 | Claude Code | Opens the PR on GitHub | Gates green (Phase 3) | PR created | — |
| 5 | GitHub CI | Runs the pre-merge suite: build, integration tests, e2e tests, security scan, code-quality scan (duplication / code smells), Sentry check, AI-label check | PR opened | Checks green or red | An environment the agent does not control re-verifies everything — local green is a claim, CI green is evidence. |
| 6 | Reviewer | **Human gate 3:** reads the diff (hot files closely), requests changes or approves | Checks green | Approved PR | No agent-written code ships without a person reading it — the merge decision is never delegated to the machine. |
| 7 | Claude Code | Fixes review comments; reviewer re-checks | Change requests | Updated PR | The fix loop stays with the agent; the reviewer's time is spent only on judgment. |
| 8 | Dev | Merges the PR | Approval | Merged to main | — |

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant GH as GitHub
    participant CI as GitHub CI
    actor Rev as Reviewer<br/>(via CODEOWNERS)

    Note over CC: 1. Compute AI usage + time saved<br/>(estimation.md formula)
    Note over CC: 2. Fill PR template:<br/>tier, risk, evidence
    CC->>GH: 3. Create PR, labels ai-assisted / ai-agent,<br/>reviewers auto-assigned by tier
    GH->>CI: 4. Trigger pre-merge suite
    Note over CI: build · integration · e2e ·<br/>security · quality scan ·<br/>Sentry · AI-label check
    CI-->>GH: Checks green
    GH->>Rev: 5. Review request
    alt Changes requested
        Rev->>CC: Comments
        CC->>GH: Fixes pushed
        GH->>Rev: Re-review
    else Approved
        Note over Rev: 6. HUMAN GATE 3<br/>Approve
    end
    Rev->>GH: 7. Merge
```

---

## Phase 5 — Metrics & Release

After merge, the pipeline closes the loop without human effort: AI metrics flow back to the Jira ticket, a scheduled collector aggregates them into the shared reporting database behind Grafana, and the build ships to UAT for QA acceptance.

| # | Actor | Action | Precondition / Input | Output / Gate | Why |
|---|---|---|---|---|---|
| 1 | GitHub CI (`ai-sdlc-jira-sync`) | On merge, runs the collector's `update_ticket`: writes AI Usage, AI Tool, and AI Time Saved to the Jira ticket | PR merged with labels + template fields | Jira fields updated | Metrics are captured at the moment of merge, by the pipeline — nobody has to remember to fill them in later, so the data stays complete. Best-effort by design: a sync failure never blocks the merge pipeline. |
| 2 | Jira | Merge policy applies: usage never downgrades, tool set once, hours accumulate; a human edit always wins | Sync ran | Consistent ticket data | Multiple PRs per ticket do not corrupt each other's data, and people keep the final say over the numbers. |
| 3 | Dev / anyone | For non-code tasks (analysis, docs, design), sets AI Usage and Time Saved manually on the Jira ticket | Non-code work done with AI | Jira fields set | Code work is measured automatically; non-code work still counts — one manual path keeps coverage honest without building tooling for every task type. |
| 4 | Scheduled collector (`ai-sdlc-metrics`) | Periodically queries GitHub + Jira and upserts per-project monthly metrics into the shared reporting database | Merged PRs, Jira fields | `reporting.metric_counts` rows | One shared pipeline and schema across projects — numbers are comparable and re-runs are safe. |
| 5 | Grafana | Shared dashboards visualise AI adoption, time saved, DORA, and quality metrics | Reporting DB populated | Leadership dashboard | Leadership watches trends from live data, not slide-deck claims assembled by hand. |
| 6 | Dev | Deploys the merged build to UAT (or the QA environment) | Merged to main | Build on UAT | — |
| 7 | QA | **Human gate 4:** runs acceptance test cases against the ticket's AC, passes or fails the feature | Build on UAT | Accepted feature | Final independent check against the *original requirement* — the loop that started at the ticket ends at its acceptance criteria. |

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant CI as CI job<br/>(ai-sdlc-jira-sync)
    participant Jira
    participant Col as Scheduled collector<br/>(ai-sdlc-metrics)
    participant Graf as Reporting DB<br/>+ Grafana
    actor QA

    GH->>CI: 1. PR merged
    CI->>Jira: 2. Write AI Usage / Tool / Time Saved<br/>(human edits always win)
    Note over Jira: Non-code tasks:<br/>fields set manually
    Col->>GH: 3. Periodic: read PRs, labels, deployments
    Col->>Jira: Read tickets, incidents, AI fields
    Col->>Graf: 4. Upsert monthly metrics per project
    Note over Graf: AI adoption · time saved ·<br/>DORA · quality
    GH->>QA: 5. Build deployed to UAT
    Note over QA: 6. HUMAN GATE 4<br/>Acceptance against the ticket's AC
```

---

## What leadership sees

Every number on the Grafana dashboard is a by-product of the process above, not a survey: AI usage comes from PR labels the pipeline enforces, time saved from a calibrated formula a human can override, and delivery/quality signals (DORA, incidents, review coverage) from GitHub and Jira directly. The same harness that makes the agent safe is what makes the metrics trustworthy — and the whole loop, from sprint ticket to measured merge, runs today on the Future app.
