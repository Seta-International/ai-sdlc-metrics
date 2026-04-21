# 15 — Governance: Authoring Lints + PR Review Protocol

**Design §§:** §2.2 EI-10 (governance lints are pattern-matched), §7 ("Key invariants" — authoring drift tests), §17 (Open Seams — sub-agent authoring process + authoring tenet).

**Phase:** MVP.

**Status:** Pending.

---

## 1. Scope

### In

- Authoring-time lint rules over the static surface under `modules/*/agent/**` (EI-10):
  - `.meta({ agent })` blocks on tRPC procedures — `whenToUse` / `whenNotToUse` / `examples` quality.
  - `defineSubAgent` declarations — description + `whenToUse` + `promptTemplate.variables` content quality layered over compile-time shape.
  - Intent-slug registry files under `modules/*/agent/intents/*.ts` — uniqueness across modules.
  - Flow-policy registry files under `modules/*/agent/flow-policies/*.ts` — key uniqueness across modules.
- Typed lint-rule shape + CI-invocable lint runner.
- PR review protocol: review-checklist bot comment posted on PRs touching `modules/*/agent/**`.
- Override-comment grammar + quarterly override audit.
- Authoring tenet (§17) surfaced in the review checklist so reviewers apply it consistently.

### Out

- Runtime behavior checks — owned by plan 10 (declared-intent drift scorer replays real traces).
- Semantic correctness of tool descriptions ("does this `whenToUse` accurately describe the tool?") — owned by domain review at PR time; lints cannot judge semantics.
- Shape-level compile checks already enforced by the TypeScript declarations (§7 TypeScript-enforced template) — this plan layers quality on top, not shape.
- Uniqueness of sub-agent keys (EI-1) — owned by the build aggregator, not this lint runner.
- Tool-meta drift tests (a)-(e) in §7 — owned by plan 01's drift test suite. Only (f) — the `whenToUse` / `whenNotToUse` / `examples` authoring lint — lives here.

---

## 2. Design Context

**Why lint at all, given compile-time enforcement?** TypeScript guarantees the fields exist; it cannot guarantee the content is useful. At 200 flows / 12+ modules / ~15-20 sub-agents authored across multiple teams, description quality and ownership hygiene degrade without automated enforcement. Anthropic's 2025 tool-use studies (referenced in §7's rationale for the typed template) report per-parameter description quality moves agent tool-selection accuracy from ~72% to ~90%; public literature does not publish declared-intent-vs-observed-behavior drift checks of the kind plan 10 runs. This plan exploits existing declarations that are underused — turning a "compile passes" signal into a "compile passes AND the description is strong enough for the router to actually route correctly" signal.

**Why pattern-matched over `modules/\*/agent/**`(EI-10)?** New modules must pick up coverage with zero central edits — adding module 13's`agent/` folder means the next CI run lints its sub-agents, tools, intents, and flow-policies automatically. Any lint rule that requires a central registration step violates EI-10.

**Why a PR review checklist on top of lints?** Lints catch mechanical failures (missing field, empty string). They cannot catch "this `whenToUse` is technically non-empty but describes the wrong tool." The checklist names the judgment calls a human reviewer must sign off on, keyed to the authoring tenet (§17).

**Why warning → error escalation?** MVP ships the three integration modules (planner / people / projects, §2.3). Their existing tool-meta blocks were authored before this lint existed; a hard-error rollout would block every early PR. Two-week grace period gives authors time to uplift descriptions without halting delivery.

**Why override-with-justification over suppression?** Suppression comments are invisible to the reviewer. An override comment + quarterly audit means a rule firing repeatedly on overrides (rising override count per rule) signals the rule is miscalibrated and needs tuning, not that the author is wrong.

---

## 3. Data Model

No DB tables. Governance outputs are:

- **Lint report** — structured CI artifact (JSON + human summary) per run; keys: `ruleId`, `severity`, `file`, `locator`, `message`, `overrideJustification?`.
- **PR review checklist** — markdown template stored in the repo (e.g. `tools/lint/agent-authoring/review-checklist.md`); bot posts the rendered checklist as a PR comment on touch.
- **Lint configuration** — single source-of-truth config (e.g. `tools/lint/agent-authoring/config.ts`) declaring tunables: minimum character counts, action-verb dictionary, severity level per rule, escalation date.
- **Override log** — derived at audit time by scanning override comments across the repo; no persistent storage beyond Git history.

The three governance outputs replace any runtime tables the plan might otherwise need; governance is authoring-time, not runtime.

---

## 4. Interface Contracts

### `LintRule`

```
{
  id: string,                          // stable; referenced by override comments
  scope: 'tool-meta' | 'sub-agent' | 'intent' | 'flow-policy',
  severity: 'error' | 'warning',
  check(context: LintContext): LintResult
}
```

### `LintContext`

Per-file parse result appropriate to `scope`:

- `tool-meta` — resolved `.meta({ agent })` object + the backing procedure's `.query()` / `.mutation()` flag.
- `sub-agent` — the `defineSubAgent` call-site's declared fields.
- `intent` — the module's aggregated intent-slug declarations.
- `flow-policy` — the module's aggregated flow-policy declarations.

### `LintResult`

```
{
  passed: boolean,
  findings: Array<{ locator, message, suggestion? }>
}
```

### Lint runner surface

- CI entry point: `bun run lint:agent-authoring` — enumerates files under the EI-10 glob, applies every rule for the matching scope, exits non-zero on any `error`-severity finding.
- Editor-integration entry point: single-file mode — runs all rules on a single file for fast local iteration.
- Report output: stdout human summary + JSON artifact for CI annotations.

### PR review bot surface

- Triggers on any PR whose diff touches `modules/*/agent/**`.
- Posts the checklist template (see §3) as a comment.
- Re-posts only if dismissed; never overrides reviewer state.

### Override grammar

- Inline comment immediately above the offending line: `// lint-override: <rule-id> — <justification>`.
- `<justification>` is free-text, min 20 chars; bot flags overrides without justification as a separate finding.

---

## 5. Control Flow

### CI lint run

1. Lint runner enumerates files under `modules/*/agent/**` (EI-10).
2. For each file, resolves its `scope` (tool-meta / sub-agent / intent / flow-policy).
3. Applies every rule matching that scope.
4. Collects findings; any `error`-severity finding fails the build.
5. Emits JSON report + human summary.
6. On failure, report lists rule IDs and file locators; author runs the lint locally to iterate.

### PR review bot

1. GitHub Action fires on PR open / synchronize.
2. Computes diff; if any path under `modules/*/agent/**` is touched, proceeds; otherwise exits silently.
3. Renders the review checklist template with the PR's sub-agent / tool / intent / flow-policy touch-list inlined.
4. Posts or updates a single bot comment on the PR.

### Override audit

1. Quarterly cron job (or manual one-shot) scans the repo for `lint-override:` comments.
2. Groups by rule ID; emits a per-rule count report.
3. Rules with override rates above a threshold (TBD, tuned from MVP observation) surface for tuning.
4. Audit output reviewed by the agent-runtime owner; outcomes captured in `docs/agents/repeat-issues.md`.

---

## 6. Requirements

| #       | Requirement                                                                                                                                                                                                                                                     | Design §§        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R-15.1  | `.meta({ agent }).whenToUse` length ≥ N characters AND contains ≥1 action verb (verb dictionary configurable). Tunable N locked at plan-finalization (see §18).                                                                                                 | §7 invariant (f) |
| R-15.2  | `.meta({ agent }).whenNotToUse` non-empty; placeholder strings (e.g. `"n/a"`, `"none"`, `"TBD"`) fail the rule.                                                                                                                                                 | §7 invariant (f) |
| R-15.3  | `.meta({ agent }).examples` includes ≥1 negative case — at least one example whose input context would fall outside the tool's `whenToUse` scope. Prevents "always applicable" smell that defeats router selection.                                             | §7 invariant (f) |
| R-15.4  | `defineSubAgent` — `description` + `whenToUse` + `promptTemplate.variables` are present (TS-compile-enforced) AND content-quality lints mirror R-15.1 / R-15.2 on the sub-agent surface.                                                                        | §3, §17          |
| R-15.5  | Intent-slug uniqueness across aggregated `modules/*/agent/intents/*.ts` — lint surfaces duplicates with locator pointing at both declaration sites. (Build aggregator already fails on collision per EI-3; this lint catches collisions earlier, at PR review.) | §2.2 EI-3        |
| R-15.6  | Flow-policy key uniqueness across `modules/*/agent/flow-policies/*.ts`. Same dual-locator output as R-15.5.                                                                                                                                                     | §2.2             |
| R-15.7  | Lint rule-set applies via glob `modules/*/agent/**`; a new module's `agent/` folder is picked up on the next CI run with zero central edits.                                                                                                                    | §2.2 EI-10       |
| R-15.8  | PR review checklist is posted on every PR touching `modules/*/agent/**`. Checklist explicitly requires sign-off on: `whenToUse` clarity, `whenNotToUse` adequacy, taint declaration completeness (`tenantAuthoredFreeText`), `compositionSensitive` question.   | §2.2, §7, §17    |
| R-15.9  | `whenToUse` / `whenNotToUse` contradiction heuristic — warning severity. Surfaces cases where both claim to cover the same situation (lint fires; author acknowledges via override or rewrite).                                                                 | §7 invariant (f) |
| R-15.10 | New-sub-agent gate — if a PR introduces a new file under `modules/*/agent/sub-agents/`, a matching golden-trace row must land in the same PR (enforced by CI rule: file count in `sub-agents/` increased → corresponding fixture row required in plan 10).      | §17, plan 10     |
| R-15.11 | Override comments require min-20-char justification; overrides without justification fail the rule themselves.                                                                                                                                                  | §17              |
| R-15.12 | Quarterly override audit aggregates per-rule override counts; rules above threshold surface for tuning review.                                                                                                                                                  | §17              |

---

## 7. Failure Modes & Recovery

| Failure                                           | Symptom                                                   | Recovery                                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint false-positive                               | Author believes rule fires incorrectly                    | Author adds `lint-override: <rule-id> — <justification>` on the offending line. Override surfaces in quarterly audit; recurring overrides trigger rule tuning.            |
| CI lint runner outage / job failure               | CI unable to complete lint step                           | Block merge — no skip-on-outage. Preserving the gate is load-bearing; a silent skip is a governance hole. Fix the runner, re-run.                                         |
| Rule author ships regression (new rule too noisy) | Build failure rate spikes on unchanged agent code         | Rule rollback procedure: lower severity to `warning` via config-only change, push a fix PR; audit captures the event so the lint rule-set itself has a paper trail.       |
| Override abuse                                    | Same rule overridden across many PRs with weak text       | Quarterly audit catches; rule owner reviews justifications; outcome is either rule tune (threshold change) or rule removal.                                               |
| EI-10 glob miss                                   | A new module's `agent/` directory is somehow not matched  | Glob check is itself tested (see §11 synthetic-module fixture). Miss is a bug; add the module's fixture to the test suite and re-verify.                                  |
| Golden-trace gate (R-15.10) false trigger         | Refactor moves a sub-agent file without introducing a new | Gate checks for net-new files, not file moves; rename / relocate is not a new sub-agent. Implementation detects via Git rename detection (file-move-not-file-add).        |
| Rule-severity escalation misfires                 | Warning-era PRs merge then error era trips on same code   | Authors must uplift descriptions before escalation date (see §13). Escalation date is communicated via PR review-bot comment banner for the two weeks before the cutover. |

---

## 8. Observability Surface

- **Per-rule firing frequency** (per month, rolling). Emitted from CI as a structured metric; dashboarded alongside plan 07's agent-runtime surface even though this is an authoring-time concern — operators want the same grep vocabulary.
- **Override count per rule** (per month). Rising overrides = rule is misaligned with author intent; target for tuning.
- **PR-review-checklist post rate** — percent of PRs touching `modules/*/agent/**` that received the bot comment. Target 100%; any dip signals bot outage.
- **Checklist completion rate** — percent of the above PRs where every checklist item was acknowledged (checked, commented, or explicitly waived) before merge. Tracked as a PR-review quality signal, not a hard gate (gate is human approval).
- **Mean lint runtime** — §10 budget observability.
- **Rule-definition change frequency** — PRs touching `tools/lint/agent-authoring/` per quarter; high churn means rules are unstable and likely mis-specified.

---

## 9. Security Considerations

- **Lints are strengthening-only.** No rule can weaken a tool-meta or sub-agent declaration; overrides only suppress findings, never mutate the declaration itself.
- **Override audit trail.** Every override is a Git-history artifact; removal of an override is visible in blame; quarterly audit creates explicit review cadence on the set of standing overrides.
- **No attack surface introduced at runtime.** Lints execute in CI against source; they do not read production data, do not touch tenant stores, do not run tenant-supplied input.
- **PR review bot posts a fixed template** — content is authored in-repo, not generated from user input; no injection surface.
- **Lint config is reviewed as code.** Tunables (character minimums, verb dictionary) live in the repo; changing them is a reviewed PR, not a runtime knob.

---

## 10. Performance Budget

- Full-repo lint run: **< 30s** wallclock on CI, parallelizable per file.
- Single-file lint (editor integration): **< 500ms** to preserve typing cadence.
- PR review bot comment post: **< 5s** from PR open event.
- Override audit (quarterly): **< 5min** to scan + aggregate across the full repo; runs out-of-band, not on PR critical path.

Rule authors: if a new rule exceeds 200ms per file in isolation, it needs optimization or splitting before landing. Aggregate budget is load-bearing — slow lints bypass via `--no-verify` and the gate becomes theater.

---

## 11. Testing Strategy

- **Unit tests per rule.** Every rule ships with positive-fixture (clean code, lint passes) + negative-fixture (violation, lint fires with the expected locator + message). Fixtures co-located: `rule-<id>.spec.ts` next to the rule (CLAUDE.md TDD rule; no `__tests__/`).
- **Integration tests via synthetic module fixture.** A synthetic `modules/_synthetic/agent/**` fixture exercises the EI-10 glob: sub-agents / tools / intents / flow-policies present. Verifies a freshly added module is linted without central registration — this is the EI-10 acceptance test.
- **Property test.** For any module name conforming to the `modules/<X>/agent/**` shape, the lint runner covers it; synthetic names generated and verified.
- **PR review bot tests.** Dry-run against a seeded test PR; assert comment content + re-post-on-synchronize behavior.
- **Override grammar tests.** Fixture comments with valid + invalid justification; assert the override-without-justification rule fires on the invalid cases.
- **Contradiction heuristic tests.** Hand-curated positive cases (clear contradictions) and negative cases (surface-similar phrasing that is not a contradiction) to calibrate the R-15.9 heuristic.
- **Golden-trace gate tests (R-15.10).** Fixture PRs: (a) adds sub-agent + golden row — passes; (b) adds sub-agent without row — fails; (c) renames sub-agent file — passes (no net-new).

Meta-test: the repo's three MVP modules (planner / people / projects) are themselves the largest real-world fixture; a full lint run against them must pass before this plan's rollout enters the warning phase (§13).

---

## 12. Acceptance Criteria

- All twelve R-15.x rules enabled in CI.
- Full lint run completes < 30s on the repo (§10).
- Lint run passes cleanly on all three MVP modules after the warning phase.
- PR review bot posts the checklist on a seeded test PR.
- Override-audit tooling produces a per-rule count report against a fixture with seeded overrides.
- Synthetic-module fixture demonstrates a new module is linted without central registration (EI-10 acceptance).
- New-sub-agent gate (R-15.10) demonstrably blocks a PR that adds a sub-agent without a matching golden-trace row.
- Rule-severity config change (warning ↔ error) ships without touching rule-check code.

---

## 13. Rollout Plan

**Two-week warning grace period.**

1. Land this plan's implementation with every rule at `severity: 'warning'`.
2. PR review bot begins posting the checklist immediately.
3. Existing offending code (notably in the three MVP modules' early tool-meta blocks) produces warnings visible in CI but does not block merge.
4. Agent-runtime owner broadcasts the escalation date via the review-bot comment banner.
5. On the escalation date (locked at implementation-PR review; see §16), every rule flips to `severity: 'error'` via config-only change. No rule-check code change required.
6. Backout: if escalation causes unanticipated breakage, revert the config change — rule checks remain installed, severity drops back to warning.

**No backward compatibility shim.** The severity flip is a hard transition; authors uplift descriptions during the grace period, not forever.

---

## 14. Dependencies

- **Plan 01** — gateway pipeline + tool-meta schema — defines the `.meta({ agent })` shape this plan lints.
- **Plan 02** — sub-agent declaration + intent-slug registry — defines the `defineSubAgent` shape + intent-slug files this plan lints.
- **Plan 08** — drafts + approval — defines the flow-policy key surface (flow-policy registry lives adjacent to drafts/approval domain).
- **Plan 10** — golden-trace CI set — R-15.10's "golden-trace row in the same PR" gate depends on the golden-trace fixture path being canonical.

---

## 15. Integration Points

- **CI workflow** — `.github/workflows/` step invoking `bun run lint:agent-authoring`.
- **PR review bot** — GitHub Action triggered on `pull_request` events; reads the diff, posts the checklist comment.
- **Lint runner** — lives at `tools/lint/agent-authoring/`; pure TypeScript; no NestJS dep; zero runtime module imports (reads source via TypeScript compiler API).
- **Config** — `tools/lint/agent-authoring/config.ts` for tunables + severity map.
- **Checklist template** — `tools/lint/agent-authoring/review-checklist.md`.
- **Override audit script** — `tools/lint/agent-authoring/audit-overrides.ts`, invokable manually or via quarterly cron.
- **`docs/agents/repeat-issues.md`** — destination for audit-cycle findings.

---

## 16. Activation Gate

- **MVP, first production turn.** Every rule enabled at `severity: 'warning'` on MVP ship.
- **Two-week warning grace period** from MVP ship date.
- **Escalation to `severity: 'error'`** at the end of the grace period; escalation date is pinned in the implementation PR and broadcast via the PR review bot banner.
- **No separate GA gate** — the rules are production-ready at MVP by design; the warning window is a grace for existing code, not a confidence window.
- **Override audit cadence** — quarterly, starting the first quarter after escalation.

---

## 17. Out of Scope

- **Semantic correctness of tool descriptions.** "Does this `whenToUse` accurately describe the tool?" is a human-reviewer judgment, not a lint. The checklist surfaces the question; the lint does not attempt to answer it.
- **Runtime drift detection.** Whether observed behavior matches declared `whenToUse` / `whenNotToUse` is owned by plan 10's declared-intent drift scorer, not this plan. This plan enforces the authoring surface; plan 10 enforces the runtime surface.
- **LLM-based lint checks.** An LLM-judge rule ("this `whenToUse` is high quality") is tempting but ruled out: it drifts silently, introduces cost into CI, and violates the rule-author's ability to read and reason about rule output. Deterministic checks only.
- **Code formatting / prettier-style rules.** Orthogonal toolchain; covered by existing repo formatters.
- **Enforcement of the authoring tenet ("proliferation is default; consolidation is deliberate", §17).** The tenet appears in the review checklist as a reviewer prompt; it is not mechanizable as a lint. Human reviewers enforce; the checklist keeps them honest.
- **Lint rule marketplace / third-party rules.** Rule set is in-repo and reviewed as code. No plugin mechanism.

---

## 18. Open Questions

- **Minimum `whenToUse` character count (R-15.1).** 80, 120, or 200? Anthropic's public guidance does not fix a number; internal calibration on the three MVP modules should pick the lowest value that catches the degenerate cases without firing on reasonable descriptions. Lock at implementation PR review.
- **Action-verb dictionary (R-15.1).** Seed with a domain-neutral set ("list", "create", "update", "search", "compute", "approve", "reject", "schedule", "send", ...) or module-scoped dictionaries? Domain-neutral is simpler and avoids the new-module-bootstrapping tax; revisit if false-positive rate is high.
- **Intent-slug naming convention.** Should slugs follow `<domain>.<verb>_<noun>` (e.g. `planner.create_task`) or a flatter scheme? Convention is enforceable as a lint (R-15.5 extension) but the choice is product, not architectural. Owner: agent-runtime lead + three MVP-module leads.
- **Override expiration.** Are overrides time-bounded (auto-expire after N months, requiring re-justification) or permanent-until-removed? Time-bounded is stronger but adds ceremony; permanent-with-quarterly-audit is lighter but risks standing overrides that nobody re-examines. MVP: permanent-with-audit; revisit at first quarterly audit.
- **Contradiction heuristic (R-15.9) precision.** Heuristic will have false positives; warning severity is the right default, but the exact heuristic (term-overlap ratio, semantic similarity over embeddings, or hand-curated phrase pairs) is tunable. Calibrate during MVP warning phase using observed overrides.
- **Golden-trace gate exemption (R-15.10).** Should refactor PRs that rename a sub-agent without changing its behavior be exempt? Git rename detection handles the common case; corner cases (split one sub-agent into two) need manual override. Document in the override-justification guidance.
