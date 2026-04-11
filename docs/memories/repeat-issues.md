# Repeat Issues

Append only issues that have happened more than once or are clearly likely to recur in this repo.

## Template

### YYYY-MM-DD — Short Title

- `Area:` agents | docs | runtime | evals | governance | other
- `Context:` how the issue repeated
- `Issue:` what keeps going wrong
- `Action:` fix or guardrail added

## Entries

### 2026-04-11 — Deprecated Zod v4 String Format Methods

- `Area:` other
- `Context:` Codebase uses `zod@4.3.6`. VS Code shows "The declaration was marked as deprecated here." on string format validators.
- `Issue:` Zod v4 moved all string format checks off `z.string()` to top-level `z.*` / `z.iso.*`. Using the old chain methods (`z.string().uuid()`, `z.string().email()`, `z.string().datetime()`, etc.) triggers deprecation warnings. Additionally, multi-line chains like `z.string()\n  .datetime()` are not caught by simple single-line `sed` replacements.
- `Action:` Replace deprecated patterns across the codebase. Key mappings:
  - `z.string().uuid()` → `z.uuid()`
  - `z.string().email()` → `z.email()`
  - `z.string().datetime()` → `z.iso.datetime()`
  - `z.string().date()` → `z.iso.date()`
  - `z.string().time()` → `z.iso.time()`
  - `z.string().url()` → `z.url()`
  - `z.string().cuid/cuid2/ulid/nanoid/base64/emoji/ip/cidr` → `z.<method>()`
  - `.superRefine(fn)` → `.check(fn)`
  - `.passthrough()` → `z.looseObject()` / `.loose()`
  - `.merge(B)` → `A.extend(B.shape)`
  - `message:` param in validators → `error:` param
    Fixed files: `admin.router.ts`, `identity.router.ts`, `kernel/identity.router.ts`, `kernel.router.ts`, `people.router.ts`.

### 2026-04-11 — Important Agent Lessons Were Not Searchable

- `Area:` docs
- `Context:` Repo instructions were concentrated in `AGENTS.md`, but repeated decision context and recurring review corrections had no dedicated searchable home under `docs/`.
- `Issue:` Agents and developers could repeat the same discussion because durable lessons were not being written down in a stable, queryable location.
- `Action:` Created `docs/memories/repeat-issues.md` and instructed future agents to log recurring issues here.
