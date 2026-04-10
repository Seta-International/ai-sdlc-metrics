# Future

Agent-native enterprise OS by SETA.

## Dev Setup

```bash
bun install

# Create local env vars for DB-backed commands
cp .env.example .env

# Start local Postgres (creates future, future_dev, future_test on first boot)
bun run db:up

# Tail Postgres logs
bun run db:logs

# API + one zone (most common)
bun run dev --filter=@future/api --filter=@future/web-people

# Type-check everything
bun run typecheck

# DB migrations
bun run db:generate
bun run db:migrate

# Unit tests
bun run test:unit

# Integration tests (requires TEST_DATABASE_URL)
bun run test:integration

# E2E (requires staging)
bun run test:e2e
```

When you're done with local development, stop the database with `bun run db:down`.

See `docs/` for full architecture and tech stack docs.
