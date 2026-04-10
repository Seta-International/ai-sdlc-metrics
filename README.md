# Future

Agent-native enterprise OS by SETA.

## Dev Setup

```bash
bun install

# API + one zone (most common)
bun turbo dev --filter=api --filter=web-people

# Type-check everything
bun turbo typecheck

# DB migrations
bun db:generate
bun db:migrate

# Unit tests
bun vitest run --project unit

# Integration tests (requires TEST_DATABASE_URL)
bun vitest run --project integration

# E2E (requires staging)
bun playwright test
```

See `docs/` for full architecture and tech stack docs.
