# Future — Platform Standard Table Design

**Date:** 2026-04-10
**Status:** Approved
**Project:** Seta Future AaaS
**Scope:** Platform-wide operational table standard for all Future zones

---

## Goal

Replace the current low-level table-only approach with a shared `Future Standard Table` that supports enterprise-grade list workflows across every zone: search, filtering, sorting, pagination, expansion, bulk selection, sticky columns, saved personal views, export, density controls, and virtualization-ready rendering.

The output of this design is not one page-specific table. It is a platform standard in `@future/ui` plus a matching server-side query contract in `apps/api` so all module list pages behave consistently.

---

## Research Summary

Current repo state:

- `packages/ui` currently exports a styled `Table` primitive only.
- There is no shared data-table system in the monorepo yet.
- `packages/ui` is explicitly constrained to presentational behavior only: no API calls, no auth, no backend imports.

External research:

- shadcn's `Table` component is a low-level responsive table primitive, not a full data-grid product.
- shadcn's `Data Table` documentation is a composition guide built on top of `@tanstack/react-table`, not a finished enterprise table system.
- TanStack Table supports controlled server-side sorting, filtering, pagination, and expandable rows, which matches Future's requirement for server-driven operational lists.

Conclusion:

- Future should keep the current `Table` primitive for simple static tables.
- Future should add a shared `DataTable` system on top of TanStack Table for operational list pages.
- Future should not adopt a heavier grid product as the default platform standard at this stage.

---

## Approaches Considered

### Approach A — Thin wrapper per page

Each module builds its own search, filters, sorting, expansion, view persistence, and export flow around the current `Table` primitive.

Pros:

- Lowest initial effort
- Maximum flexibility per page

Cons:

- Guarantees fragmentation across zones
- Duplicates state handling and toolbar patterns
- Makes saved views and export inconsistent
- Creates avoidable design drift in a product that needs a strong enterprise UI baseline

Decision: reject.

### Approach B — Shared `Future Standard Table` on shadcn + TanStack

Keep `Table` as the visual primitive. Build a controlled `DataTable` system in `@future/ui` on top of TanStack Table and standardize the backend list contract in `apps/api`.

Pros:

- Fits the current stack and `packages/ui` rules
- Keeps visual consistency with the existing shadcn-based UI layer
- Supports server-side data operations cleanly
- Gives Future one standard list language across zones

Cons:

- Requires a real upfront design instead of ad-hoc page work
- Needs a cross-cutting saved-view persistence capability

Decision: recommended.

### Approach C — Adopt AG Grid or MUI Data Grid as the default

Replace the current table direction with a heavier grid product and wrap that as the platform standard.

Pros:

- More features out of the box
- Faster access to advanced grid behavior

Cons:

- Higher abstraction and styling cost
- Worse fit with the current design-system direction
- Potential licensing and product-surface complexity
- Introduces a bigger platform dependency than the current repo needs

Decision: reject for the platform default.

---

## Design Principles

- `packages/ui` remains presentational only. It owns rendering, interaction patterns, and state contracts, but never data fetching or persistence.
- Server-side behavior is the default for search, filters, sorting, and pagination.
- Every operational list page should feel like the same product, not a different local invention.
- Saved views are personal-only in v1. Shared team views are explicitly out of scope.
- Bulk selection is included, but cross-query "select all matching rows" is not part of the default baseline.
- Virtualization must be possible later without breaking the public API, but it is not enabled by default in v1.

---

## Component Architecture

`@future/ui` should expose two layers:

### 1. Primitive Layer

The existing `Table` family stays in place for simple read-only or static tabular content.

### 2. Standard Data Table Layer

Add a new shared `DataTable` kit for operational list pages:

- `DataTable<TData, TValue>` — controlled table renderer
- `DataTableToolbar` — top-level toolbar shell
- `DataTableSearch` — debounced global search input
- `DataTableFilters` — filter controls rendered from a filter schema
- `DataTableColumnHeader` — sortable, pinnable, hideable header UI
- `DataTableViewOptions` — density, column visibility, sticky-column toggles
- `DataTableBulkActions` — bulk action region for selected rows
- `DataTablePagination` — page controls, page size, result count
- `DataTableExpandedRow` — standard detail-panel container
- `DataTableEmpty` — no-data and no-results states
- `DataTableLoading` — loading skeleton state
- `DataTableError` — inline retryable error state

The standard should be composable, not a single black-box component. Pages should be able to opt into the full standard layout or compose the same parts in a page-specific arrangement without changing behavior.

---

## Table State Contract

The platform standard should use one normalized state shape across all zones.

```ts
type FutureTableDensity = 'compact' | 'comfortable' | 'spacious'

type FutureTableSort = {
  field: string
  direction: 'asc' | 'desc'
}

type FutureTableFilter = {
  field: string
  operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'starts_with'
    | 'ends_with'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'is_empty'
    | 'is_not_empty'
  value:
    | string
    | number
    | boolean
    | null
    | Array<string | number | boolean>
    | {
        from: string | number
        to: string | number
      }
}

type FutureTablePagination = {
  pageIndex: number
  pageSize: 25 | 50 | 100
}

type FutureTableState = {
  search: string
  filters: FutureTableFilter[]
  sorting: FutureTableSort[]
  pagination: FutureTablePagination
  columnVisibility: Record<string, boolean>
  columnPinning: {
    left: string[]
    right: string[]
  }
  density: FutureTableDensity
  activeViewId: string | null
  rowSelection: Record<string, boolean>
  expanded: Record<string, boolean>
}
```

Control rules:

- `search`, `filters`, `sorting`, `pagination`, `columnVisibility`, `columnPinning`, `density`, and `activeViewId` are controlled inputs/outputs.
- `rowSelection` and `expanded` are also controlled by the page, but they are transient UI state by default and are not persisted into saved views.
- The table emits state changes upward. It never fetches data directly.

Persistence rules:

- Saved personal views persist `search`, `filters`, `sorting`, `pagination.pageSize`, `columnVisibility`, `columnPinning`, and `density`.
- Saved views do not persist current page index, row selection, expanded rows, or temporary loading state.

Filter value rules:

- `eq`, `neq`, `contains`, `starts_with`, `ends_with`, `gt`, `gte`, `lt`, and `lte` use scalar values
- `in` and `not_in` use arrays of scalar values
- `between` uses `{ from, to }`
- `is_empty` and `is_not_empty` use `null`
- date values are serialized as ISO 8601 strings

---

## URL And Page Data Flow

For operational list pages, the shareable URL state is the source of truth.

Shareable URL state:

- `search`
- `filters`
- `sorting`
- `pageIndex`
- `pageSize`
- `activeViewId`

Non-shareable local state:

- `rowSelection`
- `expanded`
- popover open state
- transient loading and refresh indicators

Page flow:

1. Zone page reads URL params into `FutureTableState`
2. Zone page passes controlled state into `DataTable`
3. `DataTable` emits `onStateChange`
4. Zone page updates URL state
5. Zone page converts table state into one tRPC list query
6. API returns rows plus standardized pagination metadata
7. Table re-renders from the returned dataset

Why this is the default:

- back/forward navigation works correctly
- filtered views are linkable and reviewable
- personal saved views restore predictably
- server-side list behavior stays aligned with what the URL says

Saved view resolution rules:

- initial page load precedence is deterministic:
  - load saved view state first when `activeViewId` is present and valid
  - then apply explicit URL params on top of that state field by field
- `pageIndex` is never restored from saved views and only comes from the URL or in-page interaction
- selecting a saved view from the live UI is a different action from initial page load:
  - apply the saved view state
  - reset `pageIndex` to `0`
  - update the URL to match the newly applied state
- if `activeViewId` is missing, invalid, deleted, or belongs to a different actor, the page ignores it and uses raw URL state only
- pages must not fail rendering because a saved view cannot be resolved

Canonical URL serialization:

- `search` and `activeViewId` use plain string query params
- `pageIndex` and `pageSize` use plain numeric query params
- `filters` is a single URI-encoded JSON array of `FutureTableFilter`
- `sorting` is a single URI-encoded JSON array of `FutureTableSort`
- saved views persist exactly the same `filters` and `sorting` JSON shapes inside `state_json`
- the backend receives the already-decoded filter and sorting arrays through typed tRPC input

---

## Backend List Contract

Every operational list endpoint should converge on one common query and response shape, even when row payloads differ by module.

### Query Contract

```ts
type FutureListQuery = {
  resourceKey: string
  search: string
  filters: FutureTableFilter[]
  sorting: FutureTableSort[]
  pagination: {
    pageIndex: number
    pageSize: number
  }
}
```

`resourceKey` naming convention:

- `{module}.{resource}`
- Examples: `people.directory`, `time.leave-requests`, `hiring.candidates`

Validation rules:

- No endpoint may accept arbitrary sort or filter field names blindly.
- Each resource defines an allowlist of sortable fields, filterable fields, and valid operators.
- The application layer maps those validated fields onto Drizzle query logic.
- Invalid fields or operators fail validation before query construction.
- Saved-view resolution does not happen inside list endpoints.
- Zone pages resolve `activeViewId` through `kernel.savedView.*`, apply the saved state client-side, and send already-applied list state to the resource endpoint.

### Result Contract

```ts
type FutureListResult<TRow> = {
  rows: TRow[]
  totalCount: number
  pageCount: number
  pageIndex: number
  pageSize: number
  availableFilters?: Record<string, unknown[]>
  meta?: Record<string, unknown>
}
```

Result contract rules:

- `rows` always contain stable row ids
- `totalCount` and `pageCount` are always included for standard paginated lists
- `availableFilters` is optional and used only when a page exposes faceted filter choices
- `meta` is reserved for page-specific counts or summary values and must never replace the standard fields

Pagination decision:

- The platform standard uses index-based pagination in v1 for predictable URL state, export semantics, and standard page controls.
- Cursor-based pagination remains valid for non-table feeds and can be introduced later for specific list surfaces if needed.

---

## Expansion Model

The standard must support two expansion patterns:

- `detail-panel` — a separate full-width expanded row for richer contextual content
- `sub-rows` — hierarchical child rows that share the table column model

Default pattern:

- `detail-panel` is the default expansion mode for v1 because it works better for enterprise operational pages that need context, notes, summaries, or embedded actions.

Rules:

- Expansion UI is always explicit and keyboard accessible
- Expanded content must be rendered through a standard `DataTableExpandedRow` shell
- Expanded rows are not saved as part of personal views
- Pages can disable expansion entirely

---

## Sticky Columns, Density, And Visibility

The standard baseline includes:

- sticky left and right pinned columns
- user-controlled column visibility
- three density modes: `compact`, `comfortable`, `spacious`

Rules:

- The first identifying column should usually be pinnable left
- Action columns should usually be pinnable right
- Density changes affect vertical spacing only, not typography scale
- Hidden columns remain available in column settings unless the page marks them as non-hideable

---

## Bulk Selection And Bulk Actions

Bulk selection is part of the standard, but the default behavior is intentionally bounded.

Default v1 behavior:

- row selection is page-local
- bulk actions operate on explicitly selected loaded rows
- a page may define its own bulk actions, but the shell behavior is standardized

Explicitly out of scope for the standard baseline:

- query-wide "select all matching rows across all pages"

That capability can be added later only where the business case is strong enough to justify the added backend and UX complexity.

---

## Saved Personal Views

Saved views are personal-only in v1 and persist server-side.

Decision:

- Store saved views in the kernel as a cross-cutting actor-scoped capability.
- Add a new kernel-owned table: `core.saved_view`.

Rationale:

- saved views are not domain-specific business data
- they are actor-scoped, cross-zone product preferences
- duplicating the capability across modules would create unnecessary fragmentation

Required fields:

- `id`
- `tenant_id`
- `actor_id`
- `resource_key`
- `name`
- `is_default`
- `state_json`
- `created_at`
- `updated_at`

Required constraints:

- one default view per actor + resource key
- `state_json` stores only the persisted subset of `FutureTableState`
- no shared/team visibility flag in v1

Required restore rules:

- selecting a saved view applies its persisted state, then resets `pageIndex` to `0`
- changing filters, search, or sorting after a saved view is applied mutates live table state only until the user explicitly saves the view
- copying a URL with explicit search or filters must remain useful even if the recipient cannot resolve the sender's `activeViewId`

Required tRPC surface:

- `kernel.savedView.list`
- `kernel.savedView.create`
- `kernel.savedView.update`
- `kernel.savedView.delete`
- `kernel.savedView.setDefault`

---

## Export

Export is included in the platform baseline, but it must reuse the standard validated query contract.

Default export behavior:

- export the full filtered and sorted result set, not just the current page
- use the same `search`, `filters`, and `sorting` contract as the table
- CSV is the default export format in v1

Export query contract:

```ts
type FutureExportQuery = {
  resourceKey: string
  search: string
  filters: FutureTableFilter[]
  sorting: FutureTableSort[]
  columns?: string[]
}
```

Execution modes:

- exports with `totalCount <= 1000` rows return synchronously as CSV
- exports with `totalCount > 1000` rows are queued as background jobs and notify the user when the file is ready

Rules:

- export does not bypass field validation
- export must honor tenant isolation and row visibility exactly like the on-screen list
- export ignores `pageIndex` and `pageSize`
- export configuration is page-defined, but the toolbar affordance is standardized

---

## Virtualization Readiness

The standard must be designed so row virtualization can be added without changing the public page contract.

V1 decision:

- do not enable virtualization by default

Rationale:

- server-side pagination reduces immediate need
- sticky columns, expanded detail rows, and variable row heights make virtualization easier to get wrong
- the first milestone is a reliable enterprise baseline, not a maximally optimized grid

Implementation constraint for later:

- rendering seams should allow a future `VirtualizedDataTableBody` without forcing pages to change query or state contracts

---

## Accessibility And Error Handling

Accessibility requirements:

- all sort, filter, column, selection, and expansion controls are keyboard reachable
- visible focus treatment on all interactive controls
- proper `aria-sort` and labels for header actions
- no unlabeled icon-only controls
- density modes preserve usable hit targets

Non-happy path requirements:

- initial loading skeleton
- background refresh without blanking the current rows
- distinct empty states for "no data yet" vs "no results"
- inline retryable error state
- row action failures do not collapse the entire table

---

## Testing And Verification

This is the first real platform component in `packages/ui`, so isolated verification becomes part of the workstream.

Required coverage:

- unit tests for state serialization and helper logic
- component tests for sorting toggles, filters, view options, expansion, and selection
- Playwright coverage for at least one reference page using the standard table

Recommended supporting work:

- add Storybook to `packages/ui` in the same workstream as the first real `DataTable` implementation
- create a demo/reference story for the standard table states: loading, empty, error, selected, expanded, dense

---

## Rollout Plan

Rollout should be phased.

### Phase 1 — Shared table foundation

- add the `DataTable` component family to `@future/ui`
- define the common table state and list query/result contracts
- add Storybook and component-level verification

### Phase 2 — First reference page

- adopt the standard on one demanding operational list page in the first active module
- validate toolbar layout, saved view behavior, expansion, export, and API ergonomics against real usage

### Phase 3 — Platform adoption

- migrate additional zone list pages onto the shared standard
- prohibit new one-off operational tables unless they are simpler than the standard and truly static

---

## Non-Goals

Explicitly out of scope for this standard:

- shared or team-level saved views
- query-wide cross-page bulk selection as a default feature
- spreadsheet-style inline cell editing
- tree-grid or grouped analytics views as the default operational table mode
- enabling virtualization by default in v1

---

## Success Criteria

This design is successful when:

- every Future zone can build operational lists from one shared table system
- search, filtering, sorting, pagination, and saved views behave the same way across modules
- `@future/ui` remains presentational and reusable
- backend list endpoints converge on one validated contract instead of page-local inventions
- the first real table implementation can be adopted without inventing new table UX patterns
