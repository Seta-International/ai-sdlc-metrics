# Planner E2E Tests

## Prerequisites

- Full docker-compose stack running: `docker compose up` from the repo root
- API + web-planner + web-shell services healthy

## Required env vars

| Variable              | Description                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `E2E_SESSION_TOKEN`   | A valid JWT session. In CI, minted by `seed-e2e-session.ts`. Locally, copy from a magic-link login. |
| `E2E_ACTOR_ID`        | UUID of the primary test actor (used as tenant admin)                                               |
| `E2E_TENANT_ID`       | UUID of the test tenant                                                                             |
| `E2E_MEMBER_ACTOR_ID` | UUID of a second actor to add as plan member (falls back to `E2E_ACTOR_ID` if unset)                |

## Running locally

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3011 \
E2E_SESSION_TOKEN=<jwt> \
E2E_ACTOR_ID=<uuid> \
E2E_TENANT_ID=<uuid> \
E2E_MEMBER_ACTOR_ID=<uuid> \
playwright test --config apps/web-planner/e2e/playwright.config.ts
```

## CI

The seed script (`apps/api/scripts/seed-e2e-session.ts`) runs before the test suite and
populates `E2E_SESSION_TOKEN`, `E2E_ACTOR_ID`, `E2E_TENANT_ID`, and `E2E_MEMBER_ACTOR_ID`
as GitHub Actions environment variables.
