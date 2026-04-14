---
module: { module-name }
source: { source-path/module-location }
created: { date }
updated: { date }
status: refined | in-progress | completed
---

# Clone Brief: {module-name}

## Business Purpose

{What this module solves for users/business}

## Business Flows by Role

<!-- If the module has no roles or a single role, note that explicitly -->

| Role   | Can Do            | Cannot Do      | Notes        |
| ------ | ----------------- | -------------- | ------------ |
| {role} | {list of actions} | {restrictions} | {any nuance} |

## Source Analysis

- **Key files:** {list}
- **Dependencies:** {other modules it relies on}
- **External integrations:** {APIs, services, etc.}

## Decisions

| Feature   | Decision                | Rationale |
| --------- | ----------------------- | --------- |
| {feature} | keep / reimagine / skip | {why}     |

## Architecture Mapping

{How source patterns map to target conventions}

## Risks & Assumptions

- {risk or assumption}

## Tasks

- [ ] 001 — {task-name}
- [ ] 002 — {task-name}
