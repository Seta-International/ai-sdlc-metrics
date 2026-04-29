# Member Details Redesign — Plan Index

> **Spec:** `docs/superpowers/specs/2026-04-24-member-details-redesign.md`

Execute plans in order. Each plan produces passing tests before the next begins.

| #   | Plan                                                              | Key deliverable                                              |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| 01  | [Foundation](./01-foundation.md)                                  | Types, ProfilePage.tsx, thin page.tsx shell                  |
| 02  | [ProfileHero + RehireDialog](./02-hero.md)                        | Avatar, meta, tab strip, terminated banner                   |
| 03  | [Card Primitives](./03-cards.md)                                  | ProfileCard + SideCard shared components                     |
| 04  | [Backend Stubs + SideRail](./04-backend-stubs-and-rail.md)        | getDirectReports, getActivityFeed, SideRail                  |
| 05  | [TabOverview](./05-tab-overview.md)                               | 2-col layout with ProfileCards + SideRail                    |
| 06  | [TabJobHistory](./06-tab-job-history.md)                          | Timeline rewrite using existing getJobHistory                |
| 07  | [TabDocuments](./07-tab-documents.md)                             | Grouped-by-kind, multi-select, bulk actions                  |
| 08  | [TabCompensation + Stub Tabs](./08-tab-compensation-and-stubs.md) | Compensation rewrite + TabChangeRequests + TabActivity stubs |

**Test command:** `cd apps/web-people && bun run test:unit`

**Dependency chain:** 01 → 02 → 03 → 04 → 05 (need 01–04) → 06, 07, 08 (independent after 01)
