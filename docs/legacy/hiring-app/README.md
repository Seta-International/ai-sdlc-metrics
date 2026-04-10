# Hiring App Business Reverse-Engineering

This spike treats `hiring-app-api-nest` and `hiring-app-ui-react` as one business system and uses `hiring-app` as the spike folder name. The combined evidence points to an internal hiring management platform for SETA that covers recruitment planning, candidate operations, interview coordination, talent pools, blacklist control, reporting, and external sourcing.

## Documents

- `01-business-overview.md`: what the system appears to be, who it serves, what problem it solves, and the business boundaries and terminology that define it.
- `02-capabilities-and-use-cases.md`: the main business capabilities and the user-facing use cases that express them.
- `03-workflows-rules-and-domain.md`: end-to-end workflows, business rules, actor boundaries, domain objects, and lifecycle/state behavior.
- `04-clone-critical-understanding.md`: the preservation-oriented view of what must remain true to clone the current system faithfully.

## Recommended Reading Order

1. `01-business-overview.md`
2. `02-capabilities-and-use-cases.md`
3. `03-workflows-rules-and-domain.md`
4. `04-clone-critical-understanding.md`

## Important Interpretation Note

The UI repository exposes a broader business surface than the currently visible Nest modules. This documentation therefore follows the integrated business behavior evidenced by the frontend routes, forms, API contract, translations, and the backend entities/migrations that support them, not only the subset of backend modules visible in `apps/seta-hrm-api/src/app/app.module.ts`.
