# Sheet: Track-CoreFrontend

> Horizontal track. Next.js multi-zone setup, design system tokens, `@future/ui`, `@future/app-layout`, theme toggle, notifications popover, shared tRPC client, SSE client, zone scaffolding generator, shared FE commons. **No Planner-specific UI lives here.**

## Block 1 — Purpose

Deliver the foundational frontend slice that every Future zone will reuse. Multi-zone architecture, design system aligned to DESIGN.md, common components, layout primitives — enough to unblock Planner's UI work and to provide a scaffolding pattern for the remaining 10 module zones.

## Block 2 — Scope

### 2.1 In scope

`03-Scope` Block 1 WBS rows `W-F01` .. `W-F19`:

- Multi-zone Next.js setup (11 zones + shell; routing conventions; zone proxy).
- Design system tokens + Tailwind v4 + CSS variables + dark (default) + light.
- `@future/ui` component library (Button · Input · Textarea · Alert · Skeleton · Spinner · Dialog · Drawer · Card · Table · DataTable · Dropdown · Select · Tabs · Tooltip · Badge).
- `@future/app-layout` (AppLayout · SidebarProvider · SidebarRenderer · NavbarRenderer · NavGroup static/dynamic · PermissionProvider).
- Auth (FE) — session hydration from httpOnly cookie · session context · redirect-to-shell on 401 · token-aware tRPC client.
- Permission-aware rendering (`useCanAccess` hook · PermissionContext · permission-filtered NavGroups).
- Theme toggle + next-themes + cookie persistence.
- Real in-app notifications popover (no stub).
- Shared tRPC client + React Query wrapper.
- SSE streaming client primitive.
- Zone scaffolding generator.
- Responsive + mobile layouts (sidebar collapse · viewport-aware dialogs/drawers).
- Storybook + visual regression + axe a11y audit.
- Shared FE commons (date / time / currency formatters · permissions hook · toast · form helpers).

### 2.2 Out of scope

- Planner-specific UI (views, HITL queue, admin console, conversational UI) — lives in the Planner track.
- Any module-specific page or widget — those belong to their module tracks.
- Backend logic — Core Backend track owns.
- AI-specific runtime — Core AI Agent track owns.
- Internationalisation (i18n) — English only per constraint.

### 2.3 Dependencies

- Core Backend delivers `kernel.getMyPermissions` tRPC endpoint by end of W1 so PermissionProvider can hydrate.
- Core Backend delivers session cookie + SSO redirect pattern by end of W1.
- Designer-Lead provides finalised tokens for any components not already locked in DESIGN.md.

## Block 3 — Deliverables & Acceptance

| #     | Deliverable                         | Acceptance                                                                                           | Evidence                        | Milestone |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| D-F01 | Multi-zone scaffold                 | Every zone boots independently; cross-zone hard-link lint rule enforced; shell owns SSO + magic-link | Zone sign-in + navigation proof | M01       |
| D-F02 | Design tokens + Tailwind            | Tokens drive every component; lint flags hardcoded colors; theme tokens validated                    | Storybook snapshot              | M01       |
| D-F03 | `@future/ui` core set               | 16 components documented in Storybook; a11y audit clean; variants match design                       | Storybook deploy                | M01       |
| D-F04 | `@future/app-layout`                | Zones mount AppLayout with own nav config; static vs dynamic NavGroup enforced (no dual-shape)       | Storybook + zone integration    | M01       |
| D-F05 | Session + Permission + Theme wiring | Unauth redirects to shell; permission-filtered nav; theme toggle persists                            | Integration test across 2 zones | M01 / M02 |
| D-F06 | Notifications popover               | Real live events render; unread count; mark-as-read via SSE                                          | Integration test                | M02       |
| D-F07 | Shared tRPC + SSE + FE commons      | Typed end-to-end; optimistic mutation helpers documented                                             | Unit tests                      | M01       |
| D-F08 | Zone scaffolding generator          | `turbo gen workspace` creates a runnable zone matching the pattern                                   | Manual generation proof         | M01       |
| D-F09 | Responsive + mobile                 | Mobile / tablet visual QA across zones; touch targets ≥ 44px                                         | Visual regression suite         | M03       |
| D-F10 | Storybook + visual regression       | Storybook at internal URL; visual regression baseline green                                          | CI status                       | M02       |

## Block 4 — WBS (task-level)

Full WBS on `03-Scope` Block 1 rows `W-F01` .. `W-F19`. Top 5 by effort:

| Rank | ID    | Feature                     | Effort High (MD) | Confidence | Owner |
| ---- | ----- | --------------------------- | ---------------- | ---------- | ----- |
| 1    | W-F03 | `@future/ui` core set       | 8                | H          | FS#1  |
| 2    | W-F04 | `@future/app-layout`        | 7                | H          | FS#1  |
| 3    | W-F01 | Next.js multi-zone setup    | 5                | H          | FS#1  |
| 4    | W-F09 | React Query / tRPC client   | 5                | H          | FS#1  |
| 5    | W-F12 | Responsive + mobile layouts | 5                | M          | FS#1  |

Track totals (indicative): ~47–81 MD across 19 rows.

## Block 5 — Sprint Plan (Core FE)

| Sprint     | Core FE goal                                                                                                                     | Exit criterion                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| S1 (W1–W2) | Multi-zone + tokens + `@future/ui` core + `@future/app-layout` + session + permission + shared tRPC + commons + zone scaffolding | `D-F01`..`D-F05`, `D-F07`, `D-F08` green; Planner team unblocked for views |
| S2 (W3–W4) | Theme toggle + notifications popover + SSE primitive + Storybook + visual regression                                             | `D-F06` + `D-F10` green                                                    |
| S3 (W5–W6) | Responsive + mobile layouts · a11y audit sweep across zones                                                                      | `D-F09` green; axe audit clean                                             |
| S4 (W7–W8) | Polish · lint rules (hardcoded colors, design-token adherence) · performance sweep                                               | Lint blocks non-token colors; FE Lighthouse passes                         |

## Block 6 — Track-specific Risks

| ID    | Risk                                                                     | P   | I   | Mitigation                                                                          | Owner           | Status |
| ----- | ------------------------------------------------------------------------ | --- | --- | ----------------------------------------------------------------------------------- | --------------- | ------ |
| RF-01 | Design-token lint doesn't catch all hardcoded colors                     | L   | M   | Combine ESLint + Stylelint rule + Storybook check; review in code review            | FS#1 + Designer | Open   |
| RF-02 | Notifications popover behind SSE has reconnect / backpressure edge cases | M   | M   | Unit test reconnect + cancel; staging soak test pre-M04                             | FS#1            | Open   |
| RF-03 | Permission-filtered nav lags after permission change (cache staleness)   | M   | M   | Cache invalidation on permission-change event; fallback to re-fetch on route change | FS#1            | Open   |
| RF-04 | Responsive breakpoints chosen without designer pass                      | M   | M   | Designer-Lead reviews responsive breakpoints in S3                                  | Designer + FS#1 | Open   |
| RF-05 | Storybook deploy URL not reachable for Designer                          | L   | L   | Internal S3 static bucket; Designer gets access by Kickoff                          | FS#1 + DevOps   | Open   |

## Block 7 — Definition of Done (track-level)

- All `D-F01` .. `D-F10` deliverables accepted.
- Coverage ≥ 70% on `@future/ui` and `@future/app-layout`.
- Axe a11y audit clean on Storybook and on representative zone pages.
- Visual regression suite green.
- Cross-zone `<a>` lint rule blocks `<Link>` between zones.
- DESIGN.md fully implemented; no deviations without designer sign-off.
- At least two zones (Planner + admin) consume the foundations without modification.

## Block 8 — Open Questions

| Question                                                                                   | Owner           | Needed by |
| ------------------------------------------------------------------------------------------ | --------------- | --------- |
| Storybook deployment target (internal S3 · GitHub Pages · other)                           | FS#1 + DevOps   | W1        |
| Does Planner admin console get a separate zone (`web-admin`) or live inside `web-planner`? | PM + FS#1       | W2        |
| Theme toggle placement (global header vs user menu)                                        | Designer + FS#1 | W2        |
| Notifications popover transport — SSE vs polling fallback for environments that block SSE? | FS#1 + SRE      | W3        |
| Virtualisation for large lists (Grid view) — shared primitive or per-zone?                 | FS#1            | W3        |
| Do we need a `<DataTable>` with server-side pagination primitive, or per-zone custom?      | FS#1            | W2        |
