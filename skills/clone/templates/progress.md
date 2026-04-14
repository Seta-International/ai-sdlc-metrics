# Migration Progress: {source-name} → {target-name}

**Source:** {source-path}
**Target:** {target-path}
**Started:** {date}
**Updated:** {date}

## Summary

| Phase       | Progress        |
| ----------- | --------------- |
| Discovered  | {n} modules     |
| Refined     | {n}/{t} modules |
| Implemented | {n}/{t} tasks   |
| Verified    | {n}/{t} tasks   |

## Modules

- [ ] {module-name} — pending-refinement | priority: high
- [ ] {module-name} — refined, 0/{t} tasks done
  - [ ] {date}-001-{task-name} — pending
  - [ ] {date}-002-{task-name} — pending
- [ ] {module-name} — in-progress, 1/{t} tasks done
  - [x] {date}-001-{task-name} — verified
  - [ ] {date}-002-{task-name} — in-progress ← CURRENT
  - [ ] {date}-003-{task-name} — pending
- [x] {module-name} — completed
  - [x] {date}-001-{task-name} — verified
  - [x] {date}-002-{task-name} — verified

## Excluded

- {module-name} — {reason}
