# Scaffolding a new module

To start a new module:

```bash
bunx turbo gen module --name <name> --with-zone
```

This produces a fully runnable vertical slice: API DDD module with CRUD on a sample entity, plus a Next.js zone with a working list+detail page hitting real tRPC. After running, follow the next-step checklist printed by the CLI.

To remove what you generated:

```bash
bunx turbo gen remove --kind module --name <name> --with-zone
```

To preview without writing:

```bash
TURBO_GEN_DRY_RUN=1 bunx turbo gen module --name <name>
```

For sub-pieces inside an existing module:

```bash
bunx turbo gen entity  --module <name> --name <Entity>
bunx turbo gen command --module <name> --name <verb-noun>
bunx turbo gen query   --module <name> --name <verb-noun>
```
