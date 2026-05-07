# Scaffolding a new module

To start a new module:

```bash
bun run gen module --name <name> --with-zone
```

This produces a fully runnable vertical slice: API DDD module with CRUD on a sample entity, plus a Next.js zone with a working list+detail page hitting real tRPC. After running, follow the next-step checklist printed by the CLI.

To remove what you generated:

```bash
bun run gen remove --kind module --name <name> --with-zone
```

To preview without writing:

```bash
bun run gen module --name <name> --with-zone --dry-run
```

For sub-pieces inside an existing module:

```bash
bun run gen entity  --module <name> --name <Entity>
bun run gen command --module <name> --name <verb-noun>
bun run gen query   --module <name> --name <verb-noun>
```

> The CLI is `turbo/generators/scripts/gen.ts` — a thin Bun wrapper around the
> generator's `apply()` functions. We don't go through `bunx turbo gen` because
> turbo 2.x intercepts `--dry-run` as its own top-level flag and shells out to
> `npx`, which isn't on PATH in a Bun-only environment.
