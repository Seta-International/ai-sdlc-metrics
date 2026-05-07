# Turbo Generators — `@future/generators`

Internal CLI for scaffolding new modules, zones, and pieces. Run from the repo root.

## Quick Start

```bash
bunx turbo gen                       # interactive picker
bunx turbo gen module --name billing
bunx turbo gen zone --name billing
bunx turbo gen command --module billing --name approve-invoice
bunx turbo gen query   --module billing --name list-invoices
bunx turbo gen entity  --module billing --name invoice
bunx turbo gen remove  --kind module --name billing
```

## Flags

| Flag                   | Effect                            |
| ---------------------- | --------------------------------- |
| `TURBO_GEN_DRY_RUN=1`  | Print the plan; write nothing.    |
| `--name <kebab>`       | Skip the prompt.                  |
| `--with-zone` (module) | Also generate `apps/web-<name>/`. |

## After running `module --with-zone`

```bash
bun run db:generate --name initial && bun run db:down -v && bun run db:up && bun run db:migrate
bun install
bun run dev
# Visit http://localhost:3000/<name>
```

## Verifying end-to-end

```bash
bunx turbo gen module --name smoketest --with-zone
bun install
bun run db:generate --name initial && bun run db:down -v && bun run db:up && bun run db:migrate
bun run --filter=api typecheck
bun run --filter=@future/web-smoketest typecheck
bun run dev
# Visit http://localhost:3000/smoketest — should render an empty list
bunx turbo gen remove --kind module --name smoketest --with-zone
git diff --exit-code   # should print nothing
```

## Maintenance

Templates clone real reference modules. CI runs `drift:check` to nag on drift.
To re-sync after editing the reference: `bun run --filter @future/generators drift:sync`.
