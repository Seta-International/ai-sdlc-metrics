# Claude Model Selection Guide for SDLC

A practical reference for choosing the right Claude model at each stage of the Software Development Life Cycle when using Claude Max (20x).

---

## Core Principle: Plan with Opus, Execute with Sonnet

```
1. Opus    → Write detailed plan (architecture, approach, edge cases)
2. Review  → Approve the plan
3. Sonnet  → Implement based on the plan
```

This pattern preserves weekly quota while maintaining output quality.

---

## Model Selection by SDLC Phase

| Phase                    | Model      | Reason                                                                         |
| ------------------------ | ---------- | ------------------------------------------------------------------------------ |
| Requirements / Planning  | **Opus**   | Complex problem analysis, multi-step reasoning, high-level architecture design |
| System Design            | **Opus**   | DB schema, API contracts, critical technical decisions                         |
| Feature Development      | **Sonnet** | Daily coding, boilerplate, business logic — best cost/quality sweet spot       |
| Unit / Integration Tests | **Sonnet** | Test cases, mock data, coverage — smart enough without needing Opus            |
| Code Review / Refactor   | **Opus**   | Catching hidden bugs, optimizing logic, architecture-level review              |
| Complex Debugging        | **Opus**   | Race conditions, tangled dependencies, hard-to-reproduce production bugs       |
| Documentation / Comments | **Haiku**  | Repetitive, high-volume, no deep reasoning needed                              |
| CI/CD Scripts            | **Haiku**  | Dockerfiles, simple scripts, YAML configs                                      |
| Deployment / Monitoring  | **Sonnet** | Log analysis, alert triage, post-mortems                                       |

---

## Model Profiles

### Opus — Deep Thinker

- Use for: Architecture, complex debugging, final code review
- Strength: Multi-step reasoning, catching subtle errors, strategic decisions
- Warning: Consumes quota ~5x faster than Sonnet — use intentionally

### Sonnet — Daily Driver ✅

- Use for: Feature development, testing, monitoring
- Strength: ~90% of Opus capability at ~60% cost
- Covers ~80% of everyday development work

### Haiku — Speed Runner

- Use for: Docs, scripts, repetitive generation tasks
- Strength: ~5x more cost-efficient than Opus for high-volume tasks
- Ideal when calling AI multiple times in a pipeline (classify, extract, summarize)

---

## Tips for Claude Max 20x Users

- **Avoid "Auto" mode** — Claude tends to over-select Opus, burning quota silently
- **Default to Sonnet** unless the task clearly requires deep reasoning
- **Reserve Opus** for high-stakes outputs: final review before merge/deploy
- **Use Haiku** for anything repetitive or structural (not semantic)

---

## Quick Decision Flowchart

```
Is this a one-time strategic/architecture decision?
  └─ YES → Opus

Is this a high-volume or repetitive task (docs, scripts)?
  └─ YES → Haiku

Everything else (daily dev, tests, debug, monitoring)?
  └─ YES → Sonnet (default)
```

---

_Reference: Claude Max 20x usage limits — Session resets every 5 hours, Weekly limits are separate for "All Models" and "Sonnet Only"._
