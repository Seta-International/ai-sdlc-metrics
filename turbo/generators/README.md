# Turbo Generators — `@future/generators`

Internal CLI for scaffolding new modules, zones, and pieces. Run from the repo root.

## Quick Start

```bash
bun run gen --help                                                 # full usage
bun run gen module  --name billing --with-zone
bun run gen zone    --name billing
bun run gen command --module billing --name approve-invoice
bun run gen query   --module billing --name list-invoices
bun run gen entity  --module billing --name invoice
bun run gen remove  --kind module --name billing --with-zone
```

## Flags

| Flag                   | Effect                                   |
| ---------------------- | ---------------------------------------- |
| `--dry-run`            | Print the plan; write nothing.           |
| `--name <kebab>`       | Required for every generator.            |
| `--module <kebab>`     | Required for `command`/`query`/`entity`. |
| `--kind module\|zone`  | Required for `remove`.                   |
| `--with-zone` (module) | Also generate `apps/web-<name>/`.        |

The CLI lives at `scripts/gen.ts` — a thin Bun wrapper that parses args with
`node:util parseArgs`, runs the same validators as the plop config, and invokes
each generator's `apply(tree, args)` directly. We bypass `bunx turbo gen`
because turbo 2.x intercepts `--dry-run` as a top-level flag and shells out to
`npx`, which isn't on PATH in this Bun-only repo.

## After running `module --with-zone`

```bash
bun run db:generate --name initial && bun run db:down -v && bun run db:up && bun run db:migrate
bun install
bun run dev
# Visit http://localhost:3000/<name>
```

## Post-write checks

After flushing files to disk (i.e., not in `--dry-run` mode), the CLI runs `turbo run typecheck` against the touched workspaces (`api` always; `@future/web-<name>` if a zone was generated). If typecheck fails, the CLI prints a hint and exits non-zero. To undo: `git restore .` and re-run with `--dry-run` to inspect what would be written.

## Verifying end-to-end

```bash
bun run gen module --name smoketest --with-zone
bun install
bun run db:generate --name initial && bun run db:down -v && bun run db:up && bun run db:migrate
bun run --filter=api typecheck
bun run --filter=@future/web-smoketest typecheck
bun run dev
# Visit http://localhost:3000/smoketest — should render an empty list
bun run gen remove --kind module --name smoketest --with-zone
git diff --exit-code   # should print nothing
```

## Maintenance

Templates clone real reference modules. CI runs `drift:check` to nag on drift.
To re-sync after editing the reference: `bun run --filter @future/generators drift:sync`.
