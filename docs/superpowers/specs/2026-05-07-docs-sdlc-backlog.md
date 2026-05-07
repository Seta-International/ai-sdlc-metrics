# Docs / SDLC Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.7 + §7 hardening column.
**Tickets:** 3 Epics, ~26 Tasks across SDLC documentation, process hygiene, and S6 hardening.
**Personas served:**

- Engineering team (process docs, ADRs, runbooks)
- Tenant administrator (referenced in runbooks)
- Auditor (RTM verification, SRS amendments)
- QA / DevOps (S6 hardening verification)

---

## [EPIC] DOC-1 Architecture, ADRs, runbooks

ID: DOC-1
Status: Backlog
Sprint: Sprint-3 to Sprint-6
Release: docs
Priority: P0
Story Point: 20
Rank: 100
Jira Key:
Confluence Link:

### Summary

Capture all architectural decisions made during Phase-1 in ADRs and all operational procedures in runbooks, so that the engineering team and auditors have a traceable record of design rationale and operational playbooks by S6 close.

### Goal

By S6 close, every architectural decision made during Phase-1 has an ADR and every operational procedure has a runbook.

### Scope

- SRS amendment for MVP scope and date defect
- ADR for cross-module facade pattern (QueryFacade + audit facade convention)
- ADR for outbox event delivery and idempotency contract
- ADR for parallel-track contract publication discipline
- Runbook for production cutover
- Runbook for incident response
- Runbook for GDPR erasure (deferred — cascade from PEOPLE-2)

### Out of Scope

- Architecture diagrams beyond what the ADRs need (deferred to Phase-1.5)
- System-level C4 diagrams (out of Phase-1 scope)

### SRS Coverage

n/a — documentation work, not user-visible behaviour.

### Acceptance Criteria

- [ ] All ADR files exist under `docs/adr/` and follow the project ADR template.
- [ ] Both SRS files have correct MVP demo date (2026-05-31) and updated launch gates.
- [ ] Prod-cutover and incident-response runbooks exist and have been reviewed by the DevOps engineer.

### Child Tickets

- DOC-1.T1 SRS amendment for MVP scope and date defect (Task)
- DOC-1.T2 ADR for cross-module facade pattern (Task)
- DOC-1.T3 ADR for outbox event delivery (Task)
- DOC-1.T4 ADR for parallel-track contract publication (Task)
- DOC-1.T5 Runbook for prod cutover (Task)
- DOC-1.T6 Runbook for incident response (Task)
- DOC-1.T7 Runbook for GDPR erasure (Task)

### Definition of Done

- All child Tasks are Done (or `Sprint: Backlog` for deferred items with documented reason).
- ADRs follow the template and are cross-linked from the relevant backlog tickets.
- Runbooks have been dry-run by at least one engineer.

---

### [TASK] DOC-1.T1 SRS amendment for MVP scope and date defect

ID: DOC-1.T1
Status: Backlog
Epic: DOC-1
Sprint: Sprint-3
Release: docs
Priority: P0
Story Point: 3
Rank: 110
Jira Key:
Confluence Link:

#### Summary

The source SRSs contain a demo date of 2026-05-20 which is inconsistent with the agreed MVP demo date of 2026-05-31 and with the project-start date of 2026-04-23 given a three-engineer team. Both SRS files must be amended to reflect the May-31 MVP demo milestone, updated success criteria, and revised launch gates that correctly distinguish MVP demo from Phase-1 GA.

#### Requirements

- Update `docs/architecture/agents-srs.md` §1.5: change demo date from 2026-05-20 to 2026-05-31; revise success criteria to reflect the MVP cut (Backlog items explicitly called out as Phase-1 GA, not MVP demo).
- Update `docs/architecture/planner-srs.md` §1.5.3: update launch gates to reflect that Backlog items (e.g. PEOPLE-2 placements, GDPR pipeline, role-scoped reads) are deferred to Phase-1 GA rather than MVP demo.
- Add a `## MVP Cut` callout section in both SRS §1.5 documents identifying which requirements are MVP-in vs Phase-1-GA-only.
- Cross-reference decision D13 from `2026-05-07-sdlc-backlog-design.md` §9.

#### Acceptance Criteria

- [ ] `docs/architecture/agents-srs.md` §1.5 date reads 2026-05-31 with no remaining reference to 2026-05-20.
- [ ] `docs/architecture/planner-srs.md` §1.5.3 launch gates distinguish MVP demo (May-31) from Phase-1 GA (later date set by user).
- [ ] Both SRSs have a `## MVP Cut` section that itemises deferred requirements with explicit `Sprint: Backlog` rationale.
- [ ] **E2E** — A reviewer reading either SRS §1.5 can determine unambiguously which requirements must pass at MVP demo vs. which are deferred to Phase-1 GA.

#### AI Execution Notes

**Built artefact:** `docs/architecture/agents-srs.md` (§1.5 updated), `docs/architecture/planner-srs.md` (§1.5.3 updated).

**References:** design doc §8 risk #3, §9 decision D13.

#### Testing Notes

- Manual review: two engineers confirm the date change and launch-gate revision are consistent with portfolio overview.
- Happy path: SRS reviewer reads the amended §1.5 sections and finds no contradictions with the portfolio backlog.
- Main error path: date change is applied to §1.5 but not to appendix launch-gate tables — catch by full-text search for `2026-05-20`.

#### Dependencies

- Blocked by: none
- Blocks: DOC-1.T5

#### Definition of Done

- Inherits project DoD.
- Both SRS files reviewed and approved by the project lead.
- No occurrence of `2026-05-20` remains in either SRS §1.5 or launch-gate tables.

---

### [TASK] DOC-1.T2 ADR for cross-module facade pattern

ID: DOC-1.T2
Status: Backlog
Epic: DOC-1
Sprint: Sprint-4
Release: docs
Priority: P1
Story Point: 2
Rank: 120
Jira Key:
Confluence Link:

#### Summary

Document the architectural decision to enforce cross-module communication exclusively through exported QueryFacades and audit facades, prohibiting direct imports of another module's `domain/` or `infrastructure/` paths. This ADR provides a durable rationale record so future contributors understand why the rule exists and what the consequences of violating it are.

#### Requirements

- Create `docs/adr/0001-cross-module-facade-pattern.md` following the standard ADR template (title, date, status, context, decision, consequences).
- ADR must cite CLAUDE.md §"DDD Module Boundaries" as the operative rule.
- ADR must explain: QueryFacade for sync reads, write facade for cross-module writes, domain events for async decoupling.
- ADR must document the enforcement mechanism: `ddd-boundaries` lefthook pre-commit hook.
- Status: Accepted.

#### Acceptance Criteria

- [ ] `docs/adr/0001-cross-module-facade-pattern.md` exists and follows the ADR template.
- [ ] ADR covers: context (why cross-module direct imports are harmful), decision (facade-only), consequences (positive: isolation + testability; negative: extra indirection layer).
- [ ] ADR references the three permitted cross-module interaction patterns (QueryFacade, write facade, domain events via `packages/event-contracts`).
- [ ] **E2E** — A new engineer reading the ADR understands in under 5 minutes why `import { UserEntity } from '../../people/domain/entities/user.entity'` would fail the pre-commit hook.

#### AI Execution Notes

**Built artefact:** `docs/adr/0001-cross-module-facade-pattern.md` (new file; `docs/adr/` directory may not yet exist — create it).

#### Testing Notes

- Manual review: one engineer who did not author it reads the ADR and confirms the rationale is clear.
- Happy path: ADR explains the decision with enough context that a new hire can follow the rule without needing to ask.
- Main error path: ADR references a module export API that doesn't match the actual code — cross-check against `people.module.ts` and `planner.module.ts` exports arrays.

#### Dependencies

- Blocked by: none
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- ADR file exists at the specified path with Status: Accepted.
- `docs/adr/` directory is created if it did not exist, with a `README.md` index entry added.

---

### [TASK] DOC-1.T3 ADR for outbox event delivery

ID: DOC-1.T3
Status: Backlog
Epic: DOC-1
Sprint: Sprint-4
Release: docs
Priority: P1
Story Point: 2
Rank: 130
Jira Key:
Confluence Link:

#### Summary

Document the architectural decision to use an `outbox_event` table plus polling relay for async domain event delivery, including the idempotency contract and failure-handling guarantees. This ADR is the permanent record for why a message broker (e.g. SQS, Kafka) was not chosen for Phase-1.

#### Requirements

- Create `docs/adr/0002-outbox-event-delivery.md` following the standard ADR template.
- ADR must document: the `outbox_event` table schema, the polling-relay mechanism, the idempotency contract (deduplication key = `event_id`), and the at-least-once delivery guarantee.
- ADR must explain the trade-off: simpler operational footprint vs. polling latency; no broker dependency in Phase-1.
- ADR must note the upgrade path: if polling latency becomes unacceptable, the relay can be replaced with a broker without changing publishers or consumers.
- Status: Accepted.

#### Acceptance Criteria

- [ ] `docs/adr/0002-outbox-event-delivery.md` exists and follows the ADR template.
- [ ] ADR covers the idempotency contract explicitly: consumer must deduplicate on `event_id` before processing.
- [ ] ADR explains failure mode: if relay crashes, pending events replay on next relay startup with no duplicate side effects (due to idempotency key).
- [ ] **E2E** — A new engineer implementing a domain event handler reads the ADR and understands what fields are guaranteed on the event envelope and how to handle duplicate delivery.

#### AI Execution Notes

**Built artefact:** `docs/adr/0002-outbox-event-delivery.md`.

#### Testing Notes

- Manual review: confirm the ADR is consistent with the actual `outbox_event` schema in `0000_initial.sql`.
- Happy path: ADR and schema agree; new handler is written correctly on first read.
- Main error path: ADR describes a field that does not exist in the table schema — cross-check the Drizzle schema file.

#### Dependencies

- Blocked by: none
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- ADR file exists at the specified path with Status: Accepted.
- Schema fields in the ADR match `0000_initial.sql` at time of merge.

---

### [TASK] DOC-1.T4 ADR for parallel-track contract publication

ID: DOC-1.T4
Status: Backlog
Epic: DOC-1
Sprint: Sprint-4
Release: docs
Priority: P2
Story Point: 2
Rank: 140
Jira Key:
Confluence Link:

#### Summary

Document the architectural decision to publish all four cross-module contracts on Sprint-3 day-1 so parallel tracks can mock against each other and Sprint-6 linking does not fail due to API drift. The four contracts are: Planner read-facade, Planner write-facade, PeopleQueryFacade, and Agents internal FE/BE contract.

#### Requirements

- Create `docs/adr/0003-parallel-track-contract-publication.md` following the standard ADR template.
- ADR must list all four contracts with their interface location and the track that owns each.
- ADR must explain the consequence of late publication: S6 linking failures and integration drift between FE/BE within the Agents track.
- ADR must document the weekly contract-sync gate at S3/S4/S5 retrospectives.
- ADR must reference design doc decision D11 (§9).
- Status: Accepted.

#### Acceptance Criteria

- [ ] `docs/adr/0003-parallel-track-contract-publication.md` exists and follows the ADR template.
- [ ] ADR lists all four contracts with their TypeScript interface / facade method signatures.
- [ ] ADR documents the enforcement mechanism: mock-validation gate before S6 (design §8 risk #8).
- [ ] **E2E** — A track lead reading the ADR can identify which contract they are responsible for publishing on S3 day-1 and where to put it in the codebase.

#### AI Execution Notes

**Built artefact:** `docs/adr/0003-parallel-track-contract-publication.md`.

**References:** design doc §9 D11, §8 risk #8.

#### Testing Notes

- Manual review: confirm the four contract interface locations match the actual code paths established by S3 tasks.
- Happy path: ADR and actual interface files align; new track engineers reference the ADR to find the mock.
- Main error path: ADR references an interface that has since been renamed — update ADR on any facade rename.

#### Dependencies

- Blocked by: none
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- ADR file exists at the specified path with Status: Accepted.
- Contract interface locations cited in the ADR are verified to match the codebase at time of merge.

---

### [TASK] DOC-1.T5 Runbook for prod cutover

ID: DOC-1.T5
Status: Backlog
Epic: DOC-1
Sprint: Sprint-5
Release: docs
Priority: P0
Story Point: 3
Rank: 150
Jira Key:
Confluence Link:

#### Summary

Create an operational runbook for the production cutover procedure: the step-by-step checklist a DevOps engineer follows to promote the staging deployment to production, verify the result, and roll back if a launch gate fails. This runbook is required before the MVP demo can be considered go/no-go.

#### Requirements

- Create `docs/runbooks/prod-cutover.md` with sections: Prerequisites, Pre-cutover Checklist, Cutover Steps, Verification Steps, Rollback Procedure.
- Prerequisites section must list: Terraform plan reviewed, all S5 launch gates green, dual-tenant probe passing (DEPLOY-3.S1), DNS TTL pre-lowered.
- Cutover Steps must list every AWS CLI / Terraform command in execution order with expected output.
- Verification Steps must cover: ALB health check, smoke-test suite execution, dual-tenant probe run, cost alert threshold confirmation.
- Rollback Procedure must describe how to revert ECS service to the previous task definition within 10 minutes.

#### Acceptance Criteria

- [ ] `docs/runbooks/prod-cutover.md` exists with all five required sections.
- [ ] A DevOps engineer has dry-run the checklist against the staging environment and annotated any divergence.
- [ ] Rollback procedure is tested: a deliberate bad deployment is rolled back in under 10 minutes using the runbook steps.
- [ ] **E2E** — The on-call engineer on MVP demo day can execute the full cutover and verification sequence using only this runbook without needing to ask any team member.

#### AI Execution Notes

**Built artefact:** `docs/runbooks/prod-cutover.md`.

**Cross-link:** DEPLOY-3 (Sprint-5) — the deployment hardening tasks that establish the launch gates referenced in this runbook.

#### Testing Notes

- Manual: DevOps engineer dry-runs the runbook against staging before S6.
- Happy path: cutover completes; all verification checks green; runbook needs no correction.
- Main error path: a verification step fails; DevOps engineer follows the rollback procedure; previous task definition is active within 10 minutes.

#### Dependencies

- Blocked by: DOC-1.T1
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Runbook dry-run completed and sign-off recorded in the PR description.
- Rollback path verified end-to-end.

---

### [TASK] DOC-1.T6 Runbook for incident response

ID: DOC-1.T6
Status: Backlog
Epic: DOC-1
Sprint: Sprint-5
Release: docs
Priority: P1
Story Point: 3
Rank: 160
Jira Key:
Confluence Link:

#### Summary

Create an operational runbook for incident response: severity classification, communication flow, escalation path, and post-incident review process. The runbook ensures that any engineer on call has a clear procedure to follow when an incident is declared, independent of who is available.

#### Requirements

- Create `docs/runbooks/incident-response.md` with sections: Severity Levels, Detection, Triage, Communication, Escalation, Resolution, Post-Incident Review.
- Severity Levels section must define P0 (all tenants impacted, data at risk), P1 (degraded service for subset of tenants), P2 (non-critical feature broken), P3 (cosmetic / low-impact).
- Communication section must include: internal Slack channel, external status page update cadence, tenant communication template.
- Escalation section must name on-call rotation and fallback contacts (placeholder names for Phase-1).
- Post-Incident Review section must reference the blameless PIR template and 5-why format.

#### Acceptance Criteria

- [ ] `docs/runbooks/incident-response.md` exists with all seven required sections.
- [ ] Severity level definitions are clear enough that any engineer can classify an incident in under 2 minutes.
- [ ] Communication templates are copy-paste-ready with `{{placeholders}}` for dynamic content.
- [ ] **E2E** — An engineer woken at 3am can open the runbook and know within 5 minutes what their immediate next actions are for a P0 incident.

#### AI Execution Notes

**Built artefact:** `docs/runbooks/incident-response.md`.

#### Testing Notes

- Manual: engineering team tabletop exercise using the runbook against a simulated P1 scenario.
- Happy path: simulated incident is classified, communicated, and resolved following only the runbook steps.
- Main error path: on-call engineer cannot reach the primary escalation contact — runbook covers the fallback path.

#### Dependencies

- Blocked by: none
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Runbook reviewed by at least two engineers.
- Tabletop exercise completed and any gaps addressed before S6.

---

### [TASK] DOC-1.T7 Runbook for GDPR erasure

ID: DOC-1.T7
Status: Backlog
Epic: DOC-1
Sprint: Backlog
Release: docs
Priority: P2
Story Point: 5
Rank: 170
Jira Key:
Confluence Link:

#### Summary

Create an operational runbook for the GDPR right-to-erasure procedure: the steps an operator follows to process a subject access / erasure request, including how to trigger the audit-preserving anonymisation pipeline and verify completion across all tenant-scoped tables. This runbook is deferred because the underlying GDPR erasure pipeline (PEOPLE-2) is itself deferred to Sprint: Backlog.

#### Requirements

- Create `docs/runbooks/gdpr-erasure.md` with sections: Prerequisites, Triggering an Erasure Request, Verification Steps, Audit Trail, Escalation.
- Prerequisites section must reference: PEOPLE-2 GDPR pipeline deployed, Planner UN-PL-10 right-to-erasure Story done, Agents NFR-017 Story done.
- Triggering section must document the admin API endpoint and required payload.
- Verification Steps must confirm: subject PII replaced with anonymised tokens in every tenant-scoped table, audit event emitted to `kernel.audit_event`, erasure confirmation email sent to data subject.
- Audit Trail section must explain how anonymisation preserves analytical integrity (counts, aggregates remain valid; PII fields set to synthetic tokens).

#### Acceptance Criteria

- [ ] `docs/runbooks/gdpr-erasure.md` exists with all five required sections.
- [ ] Runbook cites the specific table columns that are anonymised (populated when PEOPLE-2 is implemented).
- [ ] Verification step includes a SQL query an operator can run to confirm no PII remains for the given subject ID.
- [ ] **E2E** — An operator using only this runbook can submit an erasure request, verify completion, and produce an audit record for a data subject within 30 minutes.

#### AI Execution Notes

**Built artefact:** `docs/runbooks/gdpr-erasure.md` (deferred — skeleton with placeholder sections acceptable until PEOPLE-2 is implemented).

**Backlog reason:** Cascade from PEOPLE-2 GDPR pipeline → Backlog (per design §13 D14).

#### Testing Notes

- Manual: test against a staging tenant once PEOPLE-2 is implemented.
- Happy path: erasure request processed; all PII replaced; audit event emitted; operator can verify via the SQL query in the runbook.
- Main error path: erasure pipeline fails mid-run; runbook covers the partial-erasure detection and retry path.

#### Dependencies

- Blocked by: PEOPLE-2 GDPR pipeline (Sprint: Backlog)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Runbook complete and verified against a real erasure request in staging.
- Legal / compliance sign-off recorded before Phase-1 GA.

---

## [EPIC] DOC-2 SDLC process & PR/CI hygiene

ID: DOC-2
Status: Backlog
Sprint: Sprint-3 to Sprint-6
Release: docs
Priority: P1
Story Point: 7
Rank: 200
Jira Key:
Confluence Link:

### Summary

Establish and document the team's SDLC process conventions so that every pull request is structured consistently, pre-commit and CI hooks enforce quality gates automatically, and contributors have a single reference for how to work in this codebase.

### Goal

By S6 close, every PR in the repository is governed by a consistent template, pre-commit hooks catch typecheck and test regressions before CI, and a CONTRIBUTING.md guides new contributors without needing to ask existing team members.

### Scope

- PR template with AC checkbox and DoD reference
- Lefthook hooks extended with typecheck and test-on-changed-files
- CONTRIBUTING.md with contribution guidelines
- Release-notes template for MVP and subsequent releases

### Out of Scope

- Full CI pipeline definition (DEPLOY-2)
- Code review assignment automation
- Changelog generation tooling

### SRS Coverage

n/a — process / tooling work.

### Acceptance Criteria

- [ ] `.github/pull_request_template.md` exists and is used by all PRs after Sprint-3.
- [ ] `lefthook.yml` includes `typecheck` and `test` hooks on changed files.
- [ ] `CONTRIBUTING.md` covers: branch naming, commit style, PR checklist, definition of done.

### Child Tickets

- DOC-2.T1 PR template enforcing AC checkbox + DoD reference (Task)
- DOC-2.T2 lefthook hooks for typecheck / lint / test (Task)
- DOC-2.T3 CONTRIBUTING.md updates (Task)
- DOC-2.T4 Release-notes template (Task)

### Definition of Done

- All child Tasks are Done.
- The PR template has been used by at least one merged PR from each track.
- Lefthook hooks pass on the main branch before S4 starts.

---

### [TASK] DOC-2.T1 PR template enforcing AC checkbox + DoD reference

ID: DOC-2.T1
Status: Backlog
Epic: DOC-2
Sprint: Sprint-3
Release: docs
Priority: P1
Story Point: 2
Rank: 210
Jira Key:
Confluence Link:

#### Summary

Create a pull request template for the repository that prompts contributors to confirm acceptance criteria are met, reference the relevant ticket ID, and acknowledge the project Definition of Done before requesting review. The template reduces review round-trips caused by missing context.

#### Requirements

- Create `.github/pull_request_template.md`.
- Template must include: ticket ID field, summary of changes, AC checklist section (with guidance to copy ACs from the ticket), DoD acknowledgement checkbox, testing notes section.
- DoD acknowledgement must reference `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §5.6.
- Template must include a reminder that every Story needs at least one E2E AC item ticked.

#### Acceptance Criteria

- [ ] `.github/pull_request_template.md` exists and renders correctly in a GitHub PR draft.
- [ ] Template includes a `## Ticket` section, a `## Changes` section, an `## Acceptance Criteria` section, a `## Testing` section, and a `## Definition of Done` checkbox.
- [ ] DoD checkbox references the project DoD definition location.
- [ ] **E2E** — Opening a new PR on the repository shows the template pre-populated in the description field.

#### AI Execution Notes

**Built artefact:** `.github/pull_request_template.md`.

#### Testing Notes

- Manual: open a draft PR and confirm the template appears.
- Happy path: template pre-populates; contributor fills in all sections; reviewer has enough context to approve without back-and-forth.
- Main error path: template file is placed in the wrong directory (`docs/` instead of `.github/`) and GitHub does not pick it up — verify by opening an actual draft PR.

#### Dependencies

- Blocked by: none
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Template verified to appear on a real PR in the GitHub repository.

---

### [TASK] DOC-2.T2 lefthook hooks for typecheck / lint / test

ID: DOC-2.T2
Status: Backlog
Epic: DOC-2
Sprint: Sprint-3
Release: docs
Priority: P1
Story Point: 2
Rank: 220
Jira Key:
Confluence Link:

#### Summary

Extend the existing `lefthook.yml` pre-commit configuration (which already enforces format-check, ddd-boundaries, design-tokens, and ui-components from FOUND-1.T3) with two additional hooks: `typecheck` and `test`, both scoped to changed files only. This prevents broken types and failing unit tests from reaching CI.

#### Requirements

- Extend `lefthook.yml` with a `typecheck` hook: runs `turbo run typecheck --filter=<changed packages>` on staged TypeScript files.
- Extend `lefthook.yml` with a `test` hook: runs `turbo run test:unit --filter=<changed packages>` on staged files.
- Both hooks must use lefthook's `glob` or `files` feature to scope execution to changed packages only (avoid full-repo typecheck on every commit).
- Hooks must not run on docs-only commits (`.md` changes only).
- Document the hook configuration in `lefthook.yml` comments so engineers understand how to bypass for emergency commits.

#### Acceptance Criteria

- [ ] `lefthook.yml` contains `typecheck` and `test` hook entries.
- [ ] Introducing a TypeScript type error in a staged file causes the `typecheck` hook to fail before the commit is created.
- [ ] Introducing a failing unit test in a staged file causes the `test` hook to fail before the commit is created.
- [ ] A commit touching only `.md` files completes without triggering typecheck or test hooks.
- [ ] **E2E** — A developer committing a file with a type error sees the hook rejection message referencing the specific type error within 30 seconds.

#### AI Execution Notes

**Built artefact:** `lefthook.yml` (extends existing configuration from FOUND-1.T3; do not replace — append the new hook entries).

**Note:** lefthook is already installed as a dev dependency. This task only extends the hook configuration, not the installation.

#### Testing Notes

- Manual: stage a file with a deliberate type error; attempt commit; confirm rejection.
- Happy path: typecheck and test hooks run only on changed packages; clean commit succeeds within normal pre-commit latency.
- Main error path: full-repo typecheck runs on every commit, blocking all engineers — verify the `glob`/`files` scoping is active.

#### Dependencies

- Blocked by: FOUND-1.T3
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Both hooks documented in `lefthook.yml` with bypass instructions (e.g. `LEFTHOOK=0 git commit`).
- Pre-commit latency for a single-file change remains under 60 seconds.

---

### [TASK] DOC-2.T3 CONTRIBUTING.md updates

ID: DOC-2.T3
Status: Backlog
Epic: DOC-2
Sprint: Sprint-4
Release: docs
Priority: P2
Story Point: 2
Rank: 230
Jira Key:
Confluence Link:

#### Summary

Create or update `CONTRIBUTING.md` at the repository root with the contribution guidelines specific to this project: branch naming conventions, commit message style, PR workflow, the definition of ready and done, how to run the local development stack, and pointers to the key design documents a new contributor needs to read first.

#### Requirements

- Create or update `CONTRIBUTING.md` at the repo root.
- Must include sections: Getting Started, Branch Naming, Commit Style, PR Workflow, Definition of Ready, Definition of Done, Key Documents.
- Branch naming: `feat/{ticket-id}` or `fix/{ticket-id}` off `main`.
- Commit style: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- PR Workflow: must reference the PR template (DOC-2.T1) and the lefthook hooks (DOC-2.T2).
- Key Documents section must link: `CLAUDE.md`, `DESIGN.md`, `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md`.
- Must document the no-backward-compatibility rule from CLAUDE.md.

#### Acceptance Criteria

- [ ] `CONTRIBUTING.md` exists at the repo root with all seven required sections.
- [ ] Branch naming and commit style conventions are stated unambiguously.
- [ ] Key Documents section contains working relative links to `CLAUDE.md` and `DESIGN.md`.
- [ ] **E2E** — A new engineer who has never worked on this project reads `CONTRIBUTING.md` and can open the correct PR by following only the instructions in that file, without needing to ask a team member.

#### AI Execution Notes

**Built artefact:** `CONTRIBUTING.md` (may be a new file; check if one already exists before creating — if it exists, update in place).

#### Testing Notes

- Manual review: one engineer who did not author it reads the file and identifies any gaps.
- Happy path: new engineer follows CONTRIBUTING.md; PR is structured correctly on first attempt.
- Main error path: CONTRIBUTING.md references a tool or step that is not yet installed — cross-check with the actual repo state before merging.

#### Dependencies

- Blocked by: DOC-2.T1, DOC-2.T2
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- `CONTRIBUTING.md` reviewed and approved by at least two engineers.

---

### [TASK] DOC-2.T4 Release-notes template

ID: DOC-2.T4
Status: Backlog
Epic: DOC-2
Sprint: Sprint-6
Release: docs
Priority: P2
Story Point: 1
Rank: 240
Jira Key:
Confluence Link:

#### Summary

Create a release-notes template so that every release (MVP demo at May-31, and any subsequent Phase-1 releases) has a consistent, stakeholder-readable summary of changes, known issues, and upgrade steps. The template is used by the engineer cutting the release.

#### Requirements

- Create `.github/release-notes-template.md`.
- Template must include: Release version and date, Highlights (top 3–5 user-visible changes), What's new (per-epic breakdown), Known issues, Upgrade steps (if any schema migrations or config changes), Acknowledgements.
- Template must include guidance comments (lines starting with `<!--`) explaining how to fill in each section.
- Must reference the portfolio overview for epic IDs used in the per-epic breakdown.

#### Acceptance Criteria

- [ ] `.github/release-notes-template.md` exists with all six required sections.
- [ ] Template renders correctly as a GitHub Release body.
- [ ] **E2E** — The engineer cutting the MVP demo release uses this template to produce the GitHub Release notes in under 30 minutes.

#### AI Execution Notes

**Built artefact:** `.github/release-notes-template.md`.

#### Testing Notes

- Manual: create a draft GitHub Release using the template; confirm all sections render as expected.
- Happy path: release notes are complete, stakeholder-readable, and produced without needing to invent a structure from scratch.
- Main error path: template references a section that is irrelevant for the MVP release (e.g. upgrade steps when there are none) — guidance comments direct the author to omit empty sections.

#### Dependencies

- Blocked by: none
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Template used for at least one real release before Phase-1 GA.

---

## [EPIC] DOC-3 S6 Hardening (cross-cutting)

ID: DOC-3
Status: Backlog
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 47
Rank: 300
Jira Key:
Confluence Link:

### Summary

Sprint-6 hardening sprint: no new features. All Tasks are P0 and address cross-cutting concerns — bug fixes from S5 testing, performance and accessibility tuning, security review, MVP demo preparation, and RTM verification. Sprint-6 is the final gate before the MVP demo on 2026-05-31.

### Goal

By S6 close (2026-05-31), all P0 bugs from S5 testing are resolved, TTFT p95 ≤ 2.5s and KB ingestion p95 ≤ 60s are verified, WCAG 2.1 AA is met, the dual-tenant RLS probe passes, the OWASP LLM Top-10 review is signed off, the MVP demo script is rehearsed, and both RTMs are verified against their Appendix D.

### Scope

- Bug-fix placeholders BF-01 through BF-06 (populated from S5 testing burndown)
- Performance verification: TTFT p95 ≤ 2.5s (agents-srs NFR-001), KB ingestion p95 ≤ 60s (agents-srs NFR-006)
- Accessibility audit: WCAG 2.1 Level AA across all UI surfaces
- Security review: RLS dual-tenant probe pass + OWASP LLM Top-10 walkthrough
- MVP demo script and sample tenant setup
- MVP demo recording and dry-run
- RTM verification: Planner Appendix D and Agents Appendix D walk-through

### Out of Scope

- New features (code freeze at S5 close)
- Backlog items deferred from S3–S5
- Phase-1 GA launch gates not required for MVP demo

### SRS Coverage

- agents-srs NFR-001 (TTFT p95 ≤ 2.5s)
- agents-srs NFR-006 (KB ingestion p95 ≤ 60s)
- agents-srs NFR-020 (WCAG 2.1 AA)
- agents-srs §security threat model (OWASP LLM Top-10)
- planner-srs Appendix D (RTM)
- agents-srs Appendix D (RTM)

### Acceptance Criteria

- [ ] All BF-01..BF-06 bug tickets are resolved and regression tests added.
- [ ] TTFT p95 ≤ 2.5s verified over 100 representative chat turns.
- [ ] KB ingestion p95 ≤ 60s verified for documents ≤ 1 MB.
- [ ] WCAG 2.1 AA audit passed across all UI surfaces.
- [ ] RLS dual-tenant probe passes with zero cross-tenant reads over 24h observation.
- [ ] OWASP LLM Top-10 review signed off.
- [ ] MVP demo dry-run completed with no showstopper issues.
- [ ] All requirements in planner-srs Appendix D and agents-srs Appendix D have a verification artefact.

### Child Tickets

- DOC-3.T1 Bug fix BF-01 placeholder (Task)
- DOC-3.T2 Bug fix BF-02 placeholder (Task)
- DOC-3.T3 Bug fix BF-03 placeholder (Task)
- DOC-3.T4 Bug fix BF-04 placeholder (Task)
- DOC-3.T5 Bug fix BF-05 placeholder (Task)
- DOC-3.T6 Bug fix BF-06 placeholder (Task)
- DOC-3.T7 Performance tuning — TTFT p95 verification (Task)
- DOC-3.T8 Performance tuning — KB ingestion p95 verification (Task)
- DOC-3.T9 Accessibility audit — WCAG 2.1 Level AA (Task)
- DOC-3.T10 Security review — RLS dual-tenant probe pass (Task)
- DOC-3.T11 Security review — OWASP LLM Top-10 walkthrough (Task)
- DOC-3.T12 MVP demo script + sample tenant setup (Task)
- DOC-3.T13 MVP demo recording + dry-run (Task)
- DOC-3.T14 RTM verification — Planner Appendix D walk-through (Task)
- DOC-3.T15 RTM verification — Agents Appendix D walk-through (Task)

### Definition of Done

- All child Tasks are Done before the MVP demo on 2026-05-31.
- No P0 or P1 open bugs at S6 close.
- Demo dry-run sign-off recorded by the project lead.

---

### [TASK] DOC-3.T1 Bug fix BF-01 placeholder

ID: DOC-3.T1
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 2
Rank: 310
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer resolves bug ticket BF-01 surfaced during S5 testing. Specific bug content is carved from the S5 testing burndown at the start of Sprint-6. This placeholder ensures a ranked slot exists on the S6 board before the bug is identified.

#### Requirements

- Populate this ticket with: reproduction steps, root cause, fix location, and regression test reference when the bug is identified from S5 testing.
- Fix must be verified in staging before the ticket is marked Done.
- A regression test (unit or E2E) must be added to prevent recurrence.

#### Acceptance Criteria

- [ ] Bug is reproduced in staging from the documented reproduction steps.
- [ ] Fix is applied and verified in staging.
- [ ] Regression test is added and passing.
- [ ] **E2E** — The user-visible symptom described in BF-01 is no longer reproducible in staging after the fix.

#### AI Execution Notes

**Built artefact:** `(populated when bug surfaces)`.

#### Testing Notes

- Unit / E2E coverage required per bug type (populated when bug is identified).
- Happy path: fix resolves the reported symptom; regression test passes.
- Main error path: fix resolves the symptom but introduces a new regression — caught by the full test suite run in CI.

#### Dependencies

- Blocked by: S5 testing burndown (bug must be identified before fix can start)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Fix verified in staging by a second engineer.
- Regression test merged to main before the MVP demo.

---

### [TASK] DOC-3.T2 Bug fix BF-02 placeholder

ID: DOC-3.T2
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 2
Rank: 320
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer resolves bug ticket BF-02 surfaced during S5 testing. Specific bug content is carved from the S5 testing burndown at the start of Sprint-6. This placeholder ensures a ranked slot exists on the S6 board before the bug is identified.

#### Requirements

- Populate this ticket with: reproduction steps, root cause, fix location, and regression test reference when the bug is identified from S5 testing.
- Fix must be verified in staging before the ticket is marked Done.
- A regression test (unit or E2E) must be added to prevent recurrence.

#### Acceptance Criteria

- [ ] Bug is reproduced in staging from the documented reproduction steps.
- [ ] Fix is applied and verified in staging.
- [ ] Regression test is added and passing.
- [ ] **E2E** — The user-visible symptom described in BF-02 is no longer reproducible in staging after the fix.

#### AI Execution Notes

**Built artefact:** `(populated when bug surfaces)`.

#### Testing Notes

- Unit / E2E coverage required per bug type (populated when bug is identified).
- Happy path: fix resolves the reported symptom; regression test passes.
- Main error path: fix resolves the symptom but introduces a new regression — caught by the full test suite run in CI.

#### Dependencies

- Blocked by: S5 testing burndown (bug must be identified before fix can start)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Fix verified in staging by a second engineer.
- Regression test merged to main before the MVP demo.

---

### [TASK] DOC-3.T3 Bug fix BF-03 placeholder

ID: DOC-3.T3
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 2
Rank: 330
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer resolves bug ticket BF-03 surfaced during S5 testing. Specific bug content is carved from the S5 testing burndown at the start of Sprint-6. This placeholder ensures a ranked slot exists on the S6 board before the bug is identified.

#### Requirements

- Populate this ticket with: reproduction steps, root cause, fix location, and regression test reference when the bug is identified from S5 testing.
- Fix must be verified in staging before the ticket is marked Done.
- A regression test (unit or E2E) must be added to prevent recurrence.

#### Acceptance Criteria

- [ ] Bug is reproduced in staging from the documented reproduction steps.
- [ ] Fix is applied and verified in staging.
- [ ] Regression test is added and passing.
- [ ] **E2E** — The user-visible symptom described in BF-03 is no longer reproducible in staging after the fix.

#### AI Execution Notes

**Built artefact:** `(populated when bug surfaces)`.

#### Testing Notes

- Unit / E2E coverage required per bug type (populated when bug is identified).
- Happy path: fix resolves the reported symptom; regression test passes.
- Main error path: fix resolves the symptom but introduces a new regression — caught by the full test suite run in CI.

#### Dependencies

- Blocked by: S5 testing burndown (bug must be identified before fix can start)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Fix verified in staging by a second engineer.
- Regression test merged to main before the MVP demo.

---

### [TASK] DOC-3.T4 Bug fix BF-04 placeholder

ID: DOC-3.T4
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 2
Rank: 340
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer resolves bug ticket BF-04 surfaced during S5 testing. Specific bug content is carved from the S5 testing burndown at the start of Sprint-6. This placeholder ensures a ranked slot exists on the S6 board before the bug is identified.

#### Requirements

- Populate this ticket with: reproduction steps, root cause, fix location, and regression test reference when the bug is identified from S5 testing.
- Fix must be verified in staging before the ticket is marked Done.
- A regression test (unit or E2E) must be added to prevent recurrence.

#### Acceptance Criteria

- [ ] Bug is reproduced in staging from the documented reproduction steps.
- [ ] Fix is applied and verified in staging.
- [ ] Regression test is added and passing.
- [ ] **E2E** — The user-visible symptom described in BF-04 is no longer reproducible in staging after the fix.

#### AI Execution Notes

**Built artefact:** `(populated when bug surfaces)`.

#### Testing Notes

- Unit / E2E coverage required per bug type (populated when bug is identified).
- Happy path: fix resolves the reported symptom; regression test passes.
- Main error path: fix resolves the symptom but introduces a new regression — caught by the full test suite run in CI.

#### Dependencies

- Blocked by: S5 testing burndown (bug must be identified before fix can start)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Fix verified in staging by a second engineer.
- Regression test merged to main before the MVP demo.

---

### [TASK] DOC-3.T5 Bug fix BF-05 placeholder

ID: DOC-3.T5
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 2
Rank: 350
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer resolves bug ticket BF-05 surfaced during S5 testing. Specific bug content is carved from the S5 testing burndown at the start of Sprint-6. This placeholder ensures a ranked slot exists on the S6 board before the bug is identified.

#### Requirements

- Populate this ticket with: reproduction steps, root cause, fix location, and regression test reference when the bug is identified from S5 testing.
- Fix must be verified in staging before the ticket is marked Done.
- A regression test (unit or E2E) must be added to prevent recurrence.

#### Acceptance Criteria

- [ ] Bug is reproduced in staging from the documented reproduction steps.
- [ ] Fix is applied and verified in staging.
- [ ] Regression test is added and passing.
- [ ] **E2E** — The user-visible symptom described in BF-05 is no longer reproducible in staging after the fix.

#### AI Execution Notes

**Built artefact:** `(populated when bug surfaces)`.

#### Testing Notes

- Unit / E2E coverage required per bug type (populated when bug is identified).
- Happy path: fix resolves the reported symptom; regression test passes.
- Main error path: fix resolves the symptom but introduces a new regression — caught by the full test suite run in CI.

#### Dependencies

- Blocked by: S5 testing burndown (bug must be identified before fix can start)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Fix verified in staging by a second engineer.
- Regression test merged to main before the MVP demo.

---

### [TASK] DOC-3.T6 Bug fix BF-06 placeholder

ID: DOC-3.T6
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 2
Rank: 360
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer resolves bug ticket BF-06 surfaced during S5 testing. Specific bug content is carved from the S5 testing burndown at the start of Sprint-6. This placeholder ensures a ranked slot exists on the S6 board before the bug is identified.

#### Requirements

- Populate this ticket with: reproduction steps, root cause, fix location, and regression test reference when the bug is identified from S5 testing.
- Fix must be verified in staging before the ticket is marked Done.
- A regression test (unit or E2E) must be added to prevent recurrence.

#### Acceptance Criteria

- [ ] Bug is reproduced in staging from the documented reproduction steps.
- [ ] Fix is applied and verified in staging.
- [ ] Regression test is added and passing.
- [ ] **E2E** — The user-visible symptom described in BF-06 is no longer reproducible in staging after the fix.

#### AI Execution Notes

**Built artefact:** `(populated when bug surfaces)`.

#### Testing Notes

- Unit / E2E coverage required per bug type (populated when bug is identified).
- Happy path: fix resolves the reported symptom; regression test passes.
- Main error path: fix resolves the symptom but introduces a new regression — caught by the full test suite run in CI.

#### Dependencies

- Blocked by: S5 testing burndown (bug must be identified before fix can start)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Fix verified in staging by a second engineer.
- Regression test merged to main before the MVP demo.

---

### [TASK] DOC-3.T7 Performance tuning — TTFT p95 verification

ID: DOC-3.T7
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 3
Rank: 370
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer verifies and tunes the Agents chat surface to meet the Time-to-First-Token p95 ≤ 2.5s SLA defined in agents-srs NFR-001. If p95 exceeds 2.5s during the benchmark run, the engineer identifies the bottleneck (SSE streaming setup, model warm-up, RAG retrieval) and applies targeted tuning until the SLA is met.

#### Requirements

- Execute a benchmark of 100 chat turns across a representative mix of output shapes (short answers, list outputs, tool-calling turns, RAG-augmented turns).
- Measure TTFT for each turn from SSE connection established to first content token received by the client.
- Shape declaration (output-shape metadata) must NOT be counted toward TTFT per design §13 A1.
- Record p95 TTFT from the observability backend.
- If p95 > 2.5s: identify bottleneck, apply fix (e.g. connection pool sizing, streaming buffer tuning, RAG chunk-count reduction), and re-run benchmark.
- Document tuning changes made and the final p95 measurement.

#### Acceptance Criteria

- [ ] Benchmark of 100 turns executed against the staging environment.
- [ ] p95 TTFT ≤ 2.5s observed and recorded with observability backend evidence.
- [ ] Output-shape metadata tokens excluded from TTFT measurement per §13 A1.
- [ ] Any tuning changes applied are documented in `docs/runbooks/performance-tuning-notes.md`.
- [ ] **E2E** — Send 100 chat turns of varied output shapes; observe p95 TTFT from the observability backend ≤ 2.5s.

#### AI Execution Notes

**References:** agents-srs NFR-001; design §13 A1 (output-shape metadata-only NOT counted toward TTFT).

#### Testing Notes

- Performance: 100-turn benchmark with p95 measurement.
- Happy path: p95 ≤ 2.5s on first run; no tuning required; result documented.
- Main error path: p95 > 2.5s; bottleneck identified as RAG retrieval latency; chunk-count reduced from 10 to 5; re-run shows p95 ≤ 2.5s.

#### Dependencies

- Blocked by: AGN-3 (RAG), AGN-1 (SSE streaming), DEPLOY-3 (observability wiring)
- Blocks: DOC-3.T12

#### Definition of Done

- Inherits project DoD.
- p95 TTFT ≤ 2.5s confirmed in staging with benchmark evidence attached to this ticket.
- Tuning notes document any configuration changes made.

---

### [TASK] DOC-3.T8 Performance tuning — KB ingestion p95 verification

ID: DOC-3.T8
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 3
Rank: 380
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer verifies that the Knowledge Base ingestion pipeline meets the p95 ≤ 60s SLA for documents of size ≤ 1 MB, as defined in agents-srs NFR-006. If the SLA is exceeded, the engineer identifies the bottleneck (chunking, embedding API latency, index write throughput) and tunes until the SLA is met.

#### Requirements

- Execute a benchmark of 20 document ingestion runs using representative documents (PDFs and plain text) of sizes ranging from 100 KB to 1 MB.
- Measure end-to-end ingestion time from upload completion to document appearing as searchable in RAG queries.
- Record p95 ingestion time.
- If p95 > 60s: identify bottleneck and apply tuning (e.g. parallel chunk embedding within the document, connection pool sizing for the embedding API).
- Document tuning changes and the final p95 measurement.

#### Acceptance Criteria

- [ ] Benchmark of 20 ingestion runs completed with documents ≤ 1 MB.
- [ ] p95 ingestion time ≤ 60s observed and recorded with evidence.
- [ ] Any tuning changes applied are documented in `docs/runbooks/performance-tuning-notes.md`.
- [ ] **E2E** — Upload a 1 MB PDF; verify it is searchable via RAG within 60 seconds.

#### AI Execution Notes

**References:** agents-srs NFR-006.

#### Testing Notes

- Performance: 20-document benchmark with p95 measurement.
- Happy path: p95 ≤ 60s on first run; no tuning required.
- Main error path: p95 > 60s for documents near the 1 MB ceiling; embedding API throttling identified; request batching tuned; re-run shows p95 ≤ 60s.

#### Dependencies

- Blocked by: AGN-3 (KB ingestion pipeline)
- Blocks: DOC-3.T12

#### Definition of Done

- Inherits project DoD.
- p95 ingestion time ≤ 60s confirmed in staging with benchmark evidence attached to this ticket.
- Tuning notes document any configuration changes made.

---

### [TASK] DOC-3.T9 Accessibility audit — WCAG 2.1 Level AA

ID: DOC-3.T9
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 5
Rank: 390
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer performs a full WCAG 2.1 Level AA accessibility audit across all MVP UI surfaces and fixes any failures. The audit covers keyboard navigation, screen reader compatibility, colour contrast, focus management, and ARIA labelling on every user-facing surface shipped in Sprints S3–S5.

#### Requirements

- Audit scope: web-shell (login, session expired), web-planner (Board / Grid / Charts / Schedule views, My Day / My Tasks / My Plans / Personal Charts hubs, task detail modal, evidence panel), web-agents (chat surface, turn history, approval inbox, KB management), web-admin (tenant settings, module toggles, platform-admin view).
- Use an automated audit tool (e.g. axe-core via Playwright) to produce a baseline report.
- Manually verify keyboard navigation (Tab, Shift+Tab, Enter, Escape, Arrow keys) on all interactive surfaces.
- Fix all WCAG 2.1 Level AA violations found; document any Level AAA deviations as known issues.
- Re-run automated audit after fixes and confirm zero Level A and Level AA violations.

#### Acceptance Criteria

- [ ] Automated axe-core audit reports zero Level A or Level AA violations across all surfaces.
- [ ] Keyboard navigation verified manually on all four web-planner view modes and four hub surfaces.
- [ ] All interactive controls have visible focus indicators meeting WCAG 2.1 criterion 2.4.7.
- [ ] Colour contrast ratios meet WCAG 2.1 criterion 1.4.3 (4.5:1 for normal text, 3:1 for large text).
- [ ] **E2E** — A screen reader user can navigate to a task in the Board view and read its title, due date, and assignee without using a mouse.

#### AI Execution Notes

**References:** agents-srs NFR-020; planner-srs equivalent NFR. DESIGN.md governs all colour and spacing decisions — do not override design tokens to fix contrast without checking DESIGN.md first.

#### Testing Notes

- Automated: axe-core via Playwright across all surfaces.
- Manual: keyboard-only navigation test on all interactive surfaces.
- Happy path: automated audit passes; keyboard navigation flows smoothly; screen reader reads content correctly.
- Main error path: high-contrast mode reveals insufficient contrast on secondary text — update design token in `DESIGN.md`-governed palette, not inline styles.

#### Dependencies

- Blocked by: PLAN-3 (view modes), PLAN-4 (hubs), AGN-1 (chat surface), ADMIN-1 (admin shell)
- Blocks: DOC-3.T12

#### Definition of Done

- Inherits project DoD.
- Zero Level A and Level AA WCAG 2.1 violations in the final axe-core report, attached to this ticket.
- Audit report and fix list committed under `docs/runbooks/accessibility-audit-s6.md`.

---

### [TASK] DOC-3.T10 Security review — RLS dual-tenant probe pass

ID: DOC-3.T10
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 3
Rank: 400
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer verifies that the Row-Level Security dual-tenant probe passes across every tenant-scoped table, including the Knowledge Base index, with zero cross-tenant data reads observed over a 24-hour production observation window. This is a hard launch gate: the MVP demo cannot proceed if cross-tenant leakage is detected.

#### Requirements

- Run the synthetic dual-tenant probe (established in DEPLOY-3.S1) against the production environment (or a production-equivalent staging environment).
- Probe must cover: every table with `tenant_id` in `0000_initial.sql`, the KB index, and all tRPC query endpoints.
- Observation window: 24 hours of continuous probe execution.
- Zero cross-tenant rows observed across the full window.
- Document the probe execution log and results.

#### Acceptance Criteria

- [ ] Dual-tenant probe runs for 24 continuous hours against the target environment.
- [ ] Zero cross-tenant reads detected in any tenant-scoped table or KB index.
- [ ] Probe results attached to this ticket as evidence.
- [ ] **E2E** — Tenant A's data is provably inaccessible from Tenant B's session across all tables and API endpoints for the full 24-hour observation window.

#### AI Execution Notes

**Cross-link:** DEPLOY-3.S1 (dual-tenant probe setup).

#### Testing Notes

- Integration: dual-tenant probe against all tenant-scoped tables.
- Happy path: 24-hour run completes with zero leakage; result is a clean pass.
- Main error path: a new table added in S5 is missing `tenant_id` in the Drizzle schema — caught by the probe; fix the schema and re-run.

#### Dependencies

- Blocked by: DEPLOY-3.S1 (probe infrastructure)
- Blocks: DOC-3.T12

#### Definition of Done

- Inherits project DoD.
- 24-hour probe pass log attached to this ticket.
- Zero cross-tenant leakage confirmed before the MVP demo date.

---

### [TASK] DOC-3.T11 Security review — OWASP LLM Top-10 walkthrough

ID: DOC-3.T11
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 5
Rank: 410
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer conducts a structured walkthrough of the OWASP LLM Top-10 (2025 edition) against the Agents module implementation and produces a signed-off review document identifying each risk category, the project's exposure, and the mitigation status for each. This document is required for Phase-1 GA sign-off.

#### Requirements

- Create `docs/security/owasp-llm-top10-review-s6.md`.
- Cover all 10 OWASP LLM Top-10 categories: LLM01 Prompt Injection, LLM02 Insecure Output Handling, LLM03 Training Data Poisoning, LLM04 Model DoS, LLM05 Supply Chain, LLM06 Sensitive Information Disclosure, LLM07 Insecure Plugin Design, LLM08 Excessive Agency, LLM09 Overreliance, LLM10 Model Theft.
- For each category: describe the project's attack surface, rate exposure (Low / Medium / High), and document the mitigation in place (or "none — accepted risk" if no mitigation).
- Review must be signed off by a named engineer before the MVP demo.
- Any High-exposure items with no mitigation block the MVP demo; they must be resolved or explicitly accepted by the project lead.

#### Acceptance Criteria

- [ ] `docs/security/owasp-llm-top10-review-s6.md` exists covering all 10 categories.
- [ ] Each category has an exposure rating and mitigation status.
- [ ] No High-exposure items have status "none — accepted risk" at S6 close (or explicit project-lead sign-off if unavoidable).
- [ ] Review document is signed off by a named engineer and the project lead.
- [ ] **E2E** — An auditor can read the review document and determine the project's risk posture against LLM-specific attack vectors without needing to read the source code.

#### AI Execution Notes

**References:** agents-srs §security threat model. Key areas of concern: LLM01 (Prompt Injection — taint-flag mechanism per §13 B1), LLM08 (Excessive Agency — approval inbox + delegation grants), LLM06 (Sensitive Information Disclosure — RLS + taint flag).

#### Testing Notes

- Manual: structured walkthrough against the agents-srs threat model.
- Happy path: all 10 categories rated Low or Medium with documented mitigations; review signed off.
- Main error path: LLM01 prompt injection rated High with no mitigation — taint-flag implementation (AGN-4) must be verified before sign-off can proceed.

#### Dependencies

- Blocked by: AGN-4 (approval inbox + taint flag), AGN-7 (governance)
- Blocks: DOC-3.T12

#### Definition of Done

- Inherits project DoD.
- Review document committed to `docs/security/` and signed off before the MVP demo.
- Any accepted risks documented with project-lead approval.

---

### [TASK] DOC-3.T12 MVP demo script + sample tenant setup

ID: DOC-3.T12
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 3
Rank: 420
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer creates the MVP demo script and provisions the sample tenant used for the demo, covering the key user flows across Planner and Agents. The demo script is the canonical reference for the dry-run (DOC-3.T13) and ensures the demo can be delivered consistently by any team member.

#### Requirements

- Create `docs/demo/mvp-demo-script.md` with: demo overview, tenant credentials (or reference to Secrets Manager path), step-by-step flow per module, expected outcomes at each step, fallback steps if a live demo fails.
- Demo flows must cover: (a) Planner — create a plan with tasks, assign tasks, mark evidence, view in Board and Schedule; (b) Agents — open chat, ask a task-management question, trigger a KB-augmented response, approve a draft write action from the inbox.
- Sample tenant must be provisioned in staging with realistic-looking seed data (3 users, 2 plans, 10 tasks, 1 KB document).
- Fallback steps must document the pre-recorded demo path if the live environment is unavailable.

#### Acceptance Criteria

- [ ] `docs/demo/mvp-demo-script.md` exists with all required sections.
- [ ] Sample tenant provisioned in staging with seed data; credentials stored in AWS Secrets Manager.
- [ ] All demo flows verified end-to-end in staging before the dry-run.
- [ ] **E2E** — Any team member following only the demo script can deliver the full MVP demo in under 20 minutes without needing to ask another team member for help.

#### AI Execution Notes

**Built artefact:** `docs/demo/mvp-demo-script.md`.

#### Testing Notes

- Manual: two team members independently walk through the demo script in staging.
- Happy path: all flows complete without errors; demo fits within 20 minutes.
- Main error path: live environment is unavailable; fallback to pre-recorded path; audience is informed.

#### Dependencies

- Blocked by: DOC-3.T7, DOC-3.T8, DOC-3.T9, DOC-3.T10, DOC-3.T11
- Blocks: DOC-3.T13

#### Definition of Done

- Inherits project DoD.
- Demo script reviewed by the project lead.
- Sample tenant seed data committed to `apps/api/src/seeds/demo/`.

---

### [TASK] DOC-3.T13 MVP demo recording + dry-run

ID: DOC-3.T13
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 2
Rank: 430
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer conducts the MVP demo dry-run using the demo script (DOC-3.T12), records a walkthrough video as a backup, and documents any issues found. The dry-run is the final gate before the live demo on 2026-05-31.

#### Requirements

- Conduct at least one full dry-run of the demo script with the project lead present.
- Record a screen-capture walkthrough video covering all demo flows as a fallback.
- Document any issues found during the dry-run and resolve them before the live demo.
- Produce a go/no-go recommendation based on the dry-run outcome.

#### Acceptance Criteria

- [ ] At least one full dry-run completed with the project lead.
- [ ] Screen-capture recording produced and accessible to the team.
- [ ] All issues found in the dry-run resolved before the live demo.
- [ ] Go/no-go recommendation documented and acknowledged by the project lead.
- [ ] **E2E** — The project lead observes the dry-run and signs off that the demo is ready to deliver to stakeholders.

#### AI Execution Notes

**Built artefact:** demo recording video (stored in shared team drive or S3 demo bucket).

#### Testing Notes

- Manual: dry-run executed with realistic demo conditions (separate network, no VPN if demo will be on-site).
- Happy path: all flows complete within 20 minutes; project lead signs off.
- Main error path: a flow fails during the dry-run; root cause identified; fix applied; second dry-run scheduled.

#### Dependencies

- Blocked by: DOC-3.T12
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Go/no-go sign-off from the project lead recorded and attached to this ticket.
- Recording accessible to all team members before the live demo date.

---

### [TASK] DOC-3.T14 RTM verification — Planner Appendix D walk-through

ID: DOC-3.T14
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 3
Rank: 440
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer walks through every functional requirement listed in `planner-srs Appendix D` (Requirements Traceability Matrix) and verifies that each has a linked verification artefact — a passing test, a staging observation, or an audit record. Any requirement without a verification artefact is flagged as a gap before the MVP demo.

#### Requirements

- Read `docs/architecture/planner-srs.md` Appendix D in full.
- For each FR-PL-NNN in the RTM: locate the verification artefact (test file, E2E scenario, or audit record) and add its path or reference to the RTM row.
- Requirements marked `Sprint: Backlog` in the portfolio must have their RTM row annotated as `Deferred to Phase-1 GA` with the backlog reason.
- Requirements with no artefact and no deferral annotation are P0 gaps; resolve before MVP demo.
- Produce a gap report: count of verified, deferred, and unverified requirements.

#### Acceptance Criteria

- [ ] Every FR-PL-NNN in `planner-srs Appendix D` has either a verification artefact linked or a `Deferred to Phase-1 GA` annotation.
- [ ] Gap report produced: zero unverified MVP-in requirements at S6 close.
- [ ] RTM annotations committed to `planner-srs.md` Appendix D.
- [ ] **E2E** — An auditor reading `planner-srs Appendix D` can determine the verification status of every requirement without needing to search the codebase manually.

#### AI Execution Notes

**Cross-link:** PLAN-7.T1 (Planner cross-module linking — the last Story to be implemented; its AC checkboxes are the primary source of verification artefacts for FR-PL-060..067).

#### Testing Notes

- Manual: RTM walk-through against the actual test suite and E2E scenarios.
- Happy path: all MVP-in requirements have passing tests; RTM is fully annotated in one session.
- Main error path: a requirement has no test and no E2E scenario — create a minimal verification test or schedule it as a P0 gap before the demo.

#### Dependencies

- Blocked by: PLAN-7 (all Planner Stories must be Done before RTM can be verified)
- Blocks: DOC-3.T13

#### Definition of Done

- Inherits project DoD.
- RTM gap report attached to this ticket.
- Zero unverified MVP-in requirements at S6 close.

---

### [TASK] DOC-3.T15 RTM verification — Agents Appendix D walk-through

ID: DOC-3.T15
Status: Backlog
Epic: DOC-3
Sprint: Sprint-6
Release: docs
Priority: P0
Story Point: 3
Rank: 450
Jira Key:
Confluence Link:

#### Summary

QA / DevOps engineer walks through every requirement listed in `agents-srs Appendix D` (Requirements Traceability Matrix) — covering FR-NNN, UI-NNN, and NFR-NNN — and verifies that each has a linked verification artefact or a documented deferral. This is the final quality gate for the Agents module before the MVP demo.

#### Requirements

- Read `docs/architecture/agents-srs.md` Appendix D in full.
- For each FR-NNN, UI-NNN, and NFR-NNN in the RTM: locate the verification artefact and add its path or reference to the RTM row.
- Requirements marked `Sprint: Backlog` in the portfolio must have their RTM row annotated as `Deferred to Phase-1 GA` with the backlog reason.
- Requirements with no artefact and no deferral annotation are P0 gaps; resolve before MVP demo.
- Produce a gap report: count of verified, deferred, and unverified requirements.

#### Acceptance Criteria

- [ ] Every FR-NNN, UI-NNN, and NFR-NNN in `agents-srs Appendix D` has either a verification artefact linked or a `Deferred to Phase-1 GA` annotation.
- [ ] Gap report produced: zero unverified MVP-in requirements at S6 close.
- [ ] RTM annotations committed to `agents-srs.md` Appendix D.
- [ ] **E2E** — An auditor reading `agents-srs Appendix D` can determine the verification status of every requirement without needing to search the codebase manually.

#### AI Execution Notes

**Cross-link:** AGN-7.T3 (Agents governance + replay — the last Task in the Agents epic; its AC checkboxes are the primary source of verification artefacts for NFR-001..023).

#### Testing Notes

- Manual: RTM walk-through against the actual test suite and E2E scenarios.
- Happy path: all MVP-in requirements have passing tests or staging observations; RTM is fully annotated.
- Main error path: an NFR (e.g. NFR-020 WCAG) has no automated test — link to DOC-3.T9 accessibility audit report as the verification artefact.

#### Dependencies

- Blocked by: AGN-7 (all Agents Stories must be Done before RTM can be verified)
- Blocks: DOC-3.T13

#### Definition of Done

- Inherits project DoD.
- RTM gap report attached to this ticket.
- Zero unverified MVP-in requirements at S6 close.
