## Agent Authoring Review Checklist

This PR modifies files under `modules/*/agent/**`. Please review the following items before approving:

### Tool Meta (`.meta({ agent })` blocks)

- [ ] **`whenToUse` clarity** — Does the description precisely identify when an agent _should_ route to this tool? A reviewer should be able to predict exactly which user utterances would match.
- [ ] **`whenNotToUse` adequacy** — Does the description enumerate at least one meaningful exclusion case? Phrases like "n/a" or "none" are not acceptable.
- [ ] **Examples coverage** — Does at least one example represent a scenario _outside_ the `whenToUse` scope (a negative case)?
- [ ] **Taint declaration** (`tenantAuthoredFreeText`) — If any input field carries user-authored free text (e.g. task titles, notes, descriptions), is `tenantAuthoredFreeText` declared?
- [ ] **Composition sensitivity** (`compositionSensitive`) — If this tool returns aggregate data (averages, counts, distributions), is `compositionSensitive.minGroupSize` declared?

### Sub-Agents (`defineSubAgent` declarations)

- [ ] **Description quality** — Is the sub-agent description ≥80 characters and meaningful to the router?
- [ ] **`whenToUse` quality** — Contains an action verb; describes a specific user scenario, not a generic capability.
- [ ] **Prompt template variables** — Are all variables declared in `promptTemplate.variables`? No hardcoded values in the template body?
- [ ] **New sub-agent golden-trace** — If this PR introduces a new sub-agent file, does a matching golden-trace fixture row land in the same PR?

### Intents and Flow Policies

- [ ] **Slug uniqueness** — If new intent slugs or flow-policy `intent_slug` values are added, are they unique across all modules?
- [ ] **Slug format** — Slugs follow `domain.verb-noun` or `domain.verb_noun` convention.

### Authoring Tenet (§17)

> _"Proliferation is default; consolidation is deliberate."_
>
> Adding a new sub-agent is the default choice. Merging two existing sub-agents requires explicit justification.

- [ ] **Proliferation default** — If new sub-agent(s) are added, is there a clear domain reason for a new sub-agent rather than extending an existing one?
- [ ] **No silent scope expansion** — If an existing sub-agent's `toolScope` is expanded, is the expansion intentional and documented?

### Overrides

- [ ] **Override justifications** — All `lint-override:` comments in this diff have ≥20-character justifications explaining why the rule does not apply.

---

_This checklist is posted automatically by the agent-authoring review bot._
_Lint rules R-15.1–R-15.12 run as part of CI._
