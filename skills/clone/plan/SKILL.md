---
name: clone-plan
description: |
  Use when migrating features from one project to another. Entry point for the
  clone skill pipeline. Shows migration status dashboard and routes to sub-skills:
  clone-discover, clone-refine, clone-implement, clone-verify.
  Use when asked to "clone", "migrate", "port features", "migration status",
  or "what's left to migrate".
---

# Clone Plan — Migration Orchestrator

Entry point for the clone pipeline. Reads migration state from `docs/clones/` and routes to the right sub-skill.

## Pipeline

```dot
digraph clone_pipeline {
    "clone-plan" [shape=doublecircle];
    "clone-discover" [shape=box];
    "clone-refine" [shape=box];
    "clone-implement" [shape=box];
    "clone-verify" [shape=box];

    "clone-plan" -> "clone-discover" [label="no inventory"];
    "clone-plan" -> "clone-refine" [label="unrefined modules"];
    "clone-plan" -> "clone-implement" [label="refined tasks"];
    "clone-plan" -> "clone-verify" [label="implemented tasks"];
    "clone-verify" -> "clone-implement" [label="needs revision"];
}
```

## Behavior

1. **Collect paths** — ask user for source and target project directories if not provided
2. **Derive source name** — slugify the source directory name for `docs/clones/{source-name}/`
3. **Read migration state** — scan `docs/clones/{source-name}/` for existing files
4. **Display status dashboard** — show counts and checklists (see format below)
5. **Route to next action** based on state:

```dot
digraph routing {
    "Read docs/clones/{source}/" [shape=box];
    "Inventory exists?" [shape=diamond];
    "Unrefined modules?" [shape=diamond];
    "Unimplemented tasks?" [shape=diamond];
    "Unverified tasks?" [shape=diamond];
    "Guide: /clone-discover" [shape=box];
    "Guide: /clone-refine" [shape=box];
    "Guide: /clone-implement" [shape=box];
    "Guide: /clone-verify" [shape=box];
    "All done — summary" [shape=doublecircle];

    "Read docs/clones/{source}/" -> "Inventory exists?";
    "Inventory exists?" -> "Guide: /clone-discover" [label="no"];
    "Inventory exists?" -> "Unrefined modules?" [label="yes"];
    "Unrefined modules?" -> "Guide: /clone-refine" [label="yes"];
    "Unrefined modules?" -> "Unimplemented tasks?" [label="no"];
    "Unimplemented tasks?" -> "Guide: /clone-implement" [label="yes"];
    "Unimplemented tasks?" -> "Unverified tasks?" [label="no"];
    "Unverified tasks?" -> "Guide: /clone-verify" [label="yes"];
    "Unverified tasks?" -> "All done — summary" [label="no"];
}
```

## Status Dashboard Format

Present the dashboard as a markdown summary:

```markdown
## Migration: {source-name} → {target-name}

| Phase       | Count             |
| ----------- | ----------------- |
| Discovered  | {n} modules       |
| Refined     | {n}/{total}       |
| Implemented | {n}/{total} tasks |
| Verified    | {n}/{total} tasks |

### Pending Refinement

- [ ] {module-name}

### Ready to Implement

- [ ] {module}/{task-name}

### Awaiting Verification

- [ ] {module}/{task-name}
```

## Multi-Source Support

Multiple sources can coexist under `docs/clones/`:

```
docs/clones/
  {source-a}/
    {date}-000-inventory.md
    modules/...
  {source-b}/
    {date}-000-inventory.md
    modules/...
```

When multiple sources exist, show a summary of each and ask the user which one to work on.

## File Naming Convention

All output files follow: `{YYYY-MM-DD}-{sequence}-{descriptive-name}.md`

- `000` — reserved for inventory and brief files
- `001`+ — tasks, ordered by execution/dependency sequence
- Verification reports: same name as task, suffixed with `-verify`

## Resuming Across Sessions

Use `/clone` for quick session start — it reads `PROGRESS.md` and gives a one-line recommendation.

Use `/clone-plan` when you want the full status dashboard with all counts and checklists.

## This Skill Does NOT

- Scan or analyze code (that's `clone-discover`)
- Make design decisions (that's `clone-refine`)
- Generate implementation context (that's `clone-implement`)
- Verify implementations (that's `clone-verify`)

It is intentionally thin — a router and dashboard only.
