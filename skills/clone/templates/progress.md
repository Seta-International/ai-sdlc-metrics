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

| Module        | Status             | Priority | Tasks | Strategy                        |
| ------------- | ------------------ | -------- | ----- | ------------------------------- |
| {module-name} | pending-refinement | high     | —     | —                               |
| {module-name} | refined            | medium   | 0/4   | sequential                      |
| {module-name} | in-progress        | high     | 2/5   | parallel (3 independent tracks) |
| {module-name} | completed          | low      | 3/3   | —                               |

<!-- Strategy options: sequential | parallel (n independent tracks) | hybrid -->

## Tasks

### {module-name}

**Execution phases:**

| Phase | Tasks                                | Parallelizable                    |
| ----- | ------------------------------------ | --------------------------------- |
| 1     | {date}-001-{task}, {date}-002-{task} | yes — no shared dependencies      |
| 2     | {date}-003-{task}                    | no — depends on phase 1           |
| 3     | {date}-004-{task}, {date}-005-{task} | yes — both depend on phase 2 only |

**Task details:**

| Task                   | Status                | Priority | Depends On |
| ---------------------- | --------------------- | -------- | ---------- |
| {date}-001-{task-name} | pending               | high     | —          |
| {date}-002-{task-name} | pending               | high     | —          |
| {date}-003-{task-name} | in-progress ← CURRENT | high     | 001, 002   |
| {date}-004-{task-name} | pending               | medium   | 003        |
| {date}-005-{task-name} | pending               | medium   | 003        |
| {date}-006-{task-name} | pending               | low      | 004, 005   |

### {module-name}

**Execution phases:**

| Phase | Tasks                                                   | Parallelizable        |
| ----- | ------------------------------------------------------- | --------------------- |
| 1     | {date}-001-{task}, {date}-002-{task}, {date}-003-{task} | yes — all independent |

**Task details:**

| Task                   | Status   | Priority | Depends On |
| ---------------------- | -------- | -------- | ---------- |
| {date}-001-{task-name} | verified | high     | —          |
| {date}-002-{task-name} | verified | medium   | —          |
| {date}-003-{task-name} | verified | medium   | —          |

## Excluded

| Module        | Reason   |
| ------------- | -------- |
| {module-name} | {reason} |
