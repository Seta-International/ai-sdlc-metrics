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

<!-- Module status: pending-refinement | refined | in-progress | completed -->
<!-- Task status: pending | ready-to-implement | in-progress | done | verified | needs-revision -->

- [ ] {module-name} — pending-refinement | priority: high
- [ ] {module-name} — refined | 0/2 tasks done
  - {date}-001-{task-name} — pending
  - {date}-002-{task-name} — pending
- [ ] {module-name} — in-progress | 2/4 tasks done
  - {date}-001-{task-name} — verified
  - {date}-002-{task-name} — done
  - {date}-003-{task-name} — in-progress ← CURRENT
  - {date}-004-{task-name} — pending
- [ ] {module-name} — in-progress | 1/3 tasks done
  - {date}-001-{task-name} — verified
  - {date}-002-{task-name} — needs-revision
  - {date}-003-{task-name} — pending
- [x] {module-name} — completed | 3/3 verified
  - {date}-001-{task-name} — verified
  - {date}-002-{task-name} — verified
  - {date}-003-{task-name} — verified

## Excluded

- {module-name} — {reason}
