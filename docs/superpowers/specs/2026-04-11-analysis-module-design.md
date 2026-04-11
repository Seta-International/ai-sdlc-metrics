# Analysis Module Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Module:** `insights` (schema: `insights`)
**Zone:** `web-insights`
**Package:** `packages/charts`

---

## Overview

The analysis module is a BI layer that renders interactive charts from the lakehouse, lets users fully customize dashboards with drag-and-drop layouts, and is architecturally ready for a future LLM-based copilot that creates dashboards and answers ad-hoc analytical questions via natural language.

### Goals

1. Render the full Apache ECharts catalog (20+ chart types) driven by JSON option metadata
2. User-customizable dashboards with drag-and-drop grid layouts (React-Grid-Layout)
3. Three-tier dashboard ownership: personal, department, system
4. Embeddable chart widgets across all frontend zones
5. Copilot-ready architecture (deferred — not implemented in this phase)

### Out of Scope

- BI copilot agent topic implementation
- MCP tool definitions for insights
- Natural language to Cube query translation
- Inline chart rendering in the agent chat UI

---

## Architecture: Approach B — Split Chart Package + Insights Module

### Topology

| Component          | Location       | Responsibility                                                             |
| ------------------ | -------------- | -------------------------------------------------------------------------- |
| `packages/charts`  | Shared package | ECharts wrapper, widget renderer, config panel, dashboard grid, hooks      |
| `modules/insights` | Backend module | Dashboard/widget CRUD, Cube query proxy, template registry, access control |
| `web-insights`     | Frontend zone  | Dashboard list, viewer, editor, sharing pages                              |
| `packages/ui`      | Shared package | Recharts removed; base design system tokens only                           |

**Cross-zone embedding:** Any zone imports `<WidgetCard />` and `useWidgetData()` from `@future/charts`, calls `trpc.insights.getWidgetData` for data. Zero dependency on web-insights code.

---

## Widget Spec — The Shared Contract

The widget spec is the central data structure bridging backend persistence, frontend rendering, and future copilot generation.

```typescript
interface WidgetSpec {
  // Identity
  id: string // UUID v7
  dashboardId: string // parent dashboard

  // Data binding
  dataSource: {
    mode: 'cube' | 'template'
    // For mode: 'cube' — raw Cube query parts
    cube?: {
      measures: string[] // e.g., ["LeaveRequest.count"]
      dimensions?: string[] // e.g., ["Employment.department"]
      timeDimensions?: CubeTimeDimension[]
      filters?: CubeFilter[]
      order?: Record<string, 'asc' | 'desc'>
      limit?: number
    }
    // For mode: 'template' — reference a predefined template
    templateId?: string
    templateOverrides?: Record<string, unknown>
  }

  // Visualization
  chartType: string // ECharts series type: 'line', 'bar', 'pie', etc.
  chartOptions: {
    // ECharts option overrides merged on top of auto-generated options
    [key: string]: unknown
  }

  // Layout (React-Grid-Layout item)
  layout: {
    x: number
    y: number
    w: number
    h: number
    minW?: number
    minH?: number
  }

  // Display
  title?: string
  description?: string
}
```

### Data flow

1. **Build:** Widget config panel or template gallery assembles a `WidgetSpec`
2. **Preview:** `trpc.insights.getWidgetData({ spec })` with inline spec for live preview
3. **Save:** `trpc.insights.saveDashboardLayout({ widgets[] })` persists all specs + layout in one transaction
4. **Load:** `trpc.insights.getWidgetData({ widgetId })` resolves spec, runs Cube query, returns `{ spec, data, echartsOption }`
5. **Render:** `<WidgetRenderer spec={spec} data={data} />` maps to ECharts option and renders
6. **Future copilot:** Agent generates a `WidgetSpec` from natural language — same pipeline

**Key rule:** Cube queries are built and executed server-side only. The frontend never talks to Cube directly.

---

## Database Schema (`insights` schema)

### `insights.dashboard`

| Column                 | Type                 | Notes                                           |
| ---------------------- | -------------------- | ----------------------------------------------- |
| `id`                   | UUID v7 PK           |                                                 |
| `tenant_id`            | UUID NOT NULL        | RLS                                             |
| `title`                | TEXT NOT NULL        |                                                 |
| `description`          | TEXT                 |                                                 |
| `owner_type`           | TEXT NOT NULL        | `'personal' \| 'department' \| 'system'`        |
| `owner_id`             | UUID NOT NULL        | actor_id / department_id / tenant_id (soft ref) |
| `global_filters`       | JSONB                | Default filter state for the dashboard          |
| `refresh_interval_sec` | INTEGER              | null = no auto-refresh                          |
| `visibility`           | TEXT NOT NULL        | `'private' \| 'shared' \| 'public'`             |
| `created_by`           | UUID NOT NULL        | Soft ref to core.actor                          |
| `created_at`           | TIMESTAMPTZ NOT NULL | DEFAULT now()                                   |
| `updated_at`           | TIMESTAMPTZ NOT NULL | DEFAULT now()                                   |

### `insights.widget`

| Column          | Type                 | Notes                                              |
| --------------- | -------------------- | -------------------------------------------------- |
| `id`            | UUID v7 PK           |                                                    |
| `tenant_id`     | UUID NOT NULL        | RLS                                                |
| `dashboard_id`  | UUID NOT NULL        | FK → insights.dashboard(id) ON DELETE CASCADE      |
| `data_source`   | JSONB NOT NULL       | `{ mode, cube?, templateId?, templateOverrides? }` |
| `chart_type`    | TEXT NOT NULL        | ECharts series type                                |
| `chart_options` | JSONB NOT NULL       | DEFAULT `'{}'`                                     |
| `layout`        | JSONB NOT NULL       | `{ x, y, w, h, minW?, minH? }`                     |
| `title`         | TEXT                 |                                                    |
| `description`   | TEXT                 |                                                    |
| `sort_order`    | INTEGER NOT NULL     | DEFAULT 0                                          |
| `created_at`    | TIMESTAMPTZ NOT NULL | DEFAULT now()                                      |
| `updated_at`    | TIMESTAMPTZ NOT NULL | DEFAULT now()                                      |

### `insights.widget_template`

| Column           | Type                 | Notes                                                                  |
| ---------------- | -------------------- | ---------------------------------------------------------------------- |
| `id`             | UUID v7 PK           |                                                                        |
| `tenant_id`      | UUID                 | null = system-wide template                                            |
| `slug`           | TEXT NOT NULL        | UNIQUE per (tenant_id, slug) — composite unique constraint             |
| `title`          | TEXT NOT NULL        |                                                                        |
| `description`    | TEXT                 |                                                                        |
| `category`       | TEXT NOT NULL        | `'people' \| 'time' \| 'hiring' \| 'finance' \| 'goals' \| 'projects'` |
| `data_source`    | JSONB NOT NULL       | Pre-configured cube query                                              |
| `chart_type`     | TEXT NOT NULL        |                                                                        |
| `chart_options`  | JSONB NOT NULL       | DEFAULT `'{}'`                                                         |
| `default_layout` | JSONB NOT NULL       | Suggested w/h                                                          |
| `created_at`     | TIMESTAMPTZ NOT NULL | DEFAULT now()                                                          |

### `insights.dashboard_share`

| Column         | Type                 | Notes                                         |
| -------------- | -------------------- | --------------------------------------------- |
| `id`           | UUID v7 PK           |                                               |
| `tenant_id`    | UUID NOT NULL        | RLS                                           |
| `dashboard_id` | UUID NOT NULL        | FK → insights.dashboard(id) ON DELETE CASCADE |
| `grantee_type` | TEXT NOT NULL        | `'actor' \| 'department' \| 'role'`           |
| `grantee_id`   | UUID NOT NULL        |                                               |
| `permission`   | TEXT NOT NULL        | `'view' \| 'edit'`                            |
| `created_by`   | UUID NOT NULL        |                                               |
| `created_at`   | TIMESTAMPTZ NOT NULL | DEFAULT now()                                 |
|                | UNIQUE               | `(dashboard_id, grantee_type, grantee_id)`    |

### Schema decisions

- **Soft references** — `created_by`, `owner_id`, `grantee_id` reference `core.actor` or `core.department` without cross-schema FKs
- **CASCADE** on widget → dashboard — deleting a dashboard removes its widgets
- **All tables have `tenant_id`** — RLS enforced via `set_config('app.tenant_id', id, false)`
- **All IDs:** UUID v7

---

## Backend Module Structure (Hexagonal)

```
modules/insights/
  domain/
    entities/
      dashboard.entity.ts
      widget.entity.ts
      widget-template.entity.ts
      dashboard-share.entity.ts
    value-objects/
      data-source.vo.ts            -- Cube query or template reference
      chart-config.vo.ts           -- chart_type + chart_options
      dashboard-visibility.vo.ts   -- private | shared | public
      owner-ref.vo.ts              -- owner_type + owner_id
    ports/
      dashboard.repository.ts
      widget.repository.ts
      widget-template.repository.ts
      dashboard-share.repository.ts
      cube-query.client.ts         -- port for Cube.js REST calls

  application/
    commands/
      create-dashboard.handler.ts
      update-dashboard.handler.ts
      delete-dashboard.handler.ts
      save-widget.handler.ts       -- create or update (upsert)
      remove-widget.handler.ts
      save-dashboard-layout.handler.ts  -- bulk layout update (drag-drop)
      share-dashboard.handler.ts
      revoke-share.handler.ts
    queries/
      get-dashboard.handler.ts
      list-dashboards.handler.ts   -- personal + shared + system, filtered by access
      get-widget-data.handler.ts   -- resolves spec → Cube query → returns data
      list-templates.handler.ts
    facades/
      insights-query.facade.ts     -- exposed to other modules

  infrastructure/
    repositories/
      drizzle-dashboard.repository.ts
      drizzle-widget.repository.ts
      drizzle-widget-template.repository.ts
      drizzle-dashboard-share.repository.ts
    cube/
      cube-rest.client.ts          -- HTTP client to Cube.js /v1/load
      cube-query.mapper.ts         -- maps dataSource → Cube query JSON
    schema/
      insights.schema.ts

  interface/
    trpc/
      insights.router.ts

  insights.module.ts               -- exports: [InsightsQueryFacade] ONLY
```

### Key handlers

- **`get-widget-data`** — takes widget ID or inline spec, resolves templates, builds Cube query, calls Cube REST, returns `{ spec, data, echartsOption }`
- **`cube-query.mapper`** — translates `dataSource` VO into Cube.js query JSON, injects `tenant_id`
- **`save-dashboard-layout`** — accepts batch `{ widgetId, layout }[]` for single-transaction drag-drop saves
- **`list-dashboards`** — filters by ownership, shares (actor/department/role), and system visibility

---

## `packages/charts` — Shared Chart Package

```
packages/charts/
  src/
    core/
      echarts-setup.ts             -- register all ECharts components
      theme.ts                     -- SETA dark/light themes (DESIGN.md aligned)
      types.ts                     -- WidgetSpec, WidgetData, ChartType types

    components/
      EChart.tsx                   -- base echarts-for-react wrapper
      WidgetRenderer.tsx           -- spec + data → ECharts option → EChart
      WidgetCard.tsx               -- title, description, skeleton, error, empty state
      WidgetConfigPanel.tsx        -- chart type picker, measure/dimension selectors, style
      DashboardGrid.tsx            -- React-Grid-Layout responsive wrapper
      GlobalFilterBar.tsx          -- date range, department, custom filters
      TemplateGallery.tsx          -- browse/search widget templates

    mappers/
      data-to-option.ts           -- Cube rows + chart config → ECharts option JSON
      chart-type-registry.ts      -- metadata per chart type (axes, stacking, validation)
      template-defaults.ts        -- default chartOptions per template category

    hooks/
      use-widget-data.ts           -- tRPC query hook for widget data
      use-dashboard-layout.ts      -- layout state + persistence
      use-global-filters.ts        -- filter state + propagation
      use-auto-refresh.ts          -- polling interval management

  package.json                     -- deps: echarts, echarts-for-react, react-grid-layout
```

### Design rules

- **Purely presentational** — no direct API calls inside components; hooks call tRPC, components receive props
- **`EChart.tsx`** is the only file touching echarts directly; everything else works with option JSON
- **Tree-shaking** via `echarts/core` with explicit `use()` — all 20+ chart types registered
- **`data-to-option.ts`** handles axis inference, series construction, legend generation from Cube result rows
- **`chart-type-registry.ts`** defines per-type metadata for the config panel (required axes, data shape, valid options)
- **Themes** follow DESIGN.md: accent `#1D4ED8`, dark bg `#0A0F1E`, Geist Mono for data labels

### Cross-zone embedding

```tsx
import { WidgetCard, useWidgetData } from '@future/charts'

function HeadcountWidget({ widgetId }: { widgetId: string }) {
  const { spec, data, isLoading } = useWidgetData(widgetId)
  return <WidgetCard spec={spec} data={data} loading={isLoading} />
}
```

---

## `web-insights` — Frontend Pages

```
apps/web-insights/src/app/
  (dashboard)/
    page.tsx                       -- dashboard list (my / shared / system tabs)
    new/page.tsx                   -- create dashboard
    [id]/
      page.tsx                     -- dashboard viewer (read-only)
      edit/page.tsx                -- dashboard editor/builder
      share/page.tsx               -- manage sharing
  templates/
    page.tsx                       -- browse widget templates
```

### Dashboard list

- Three tabs: My Dashboards, Shared with Me, System Dashboards
- Cards: title, description, widget count, last updated, owner
- Search and category filter
- "New Dashboard" button gated by `insights:dashboard:create` permission

### Dashboard viewer

- `<DashboardGrid>` with widgets in read-only mode
- `<GlobalFilterBar>` at top
- Auto-refresh indicator if polling enabled
- "Edit" button if user has edit permission
- Full-screen toggle per widget

### Dashboard editor

- `<DashboardGrid>` with drag-drop and resize enabled
- Side panel: template gallery + custom widget builder (`<WidgetConfigPanel>`)
- Click existing widget to open its config panel
- Preview mode toggle
- Save persists all specs + layout via `save-dashboard-layout`
- Auto-save draft to localStorage

### UX requirements

- Widgets always created/edited in dashboard context (no separate widget CRUD)
- Responsive layouts stored per breakpoint (lg/md/sm)
- Empty state: "Add your first widget" with template suggestions
- Skeleton loaders per widget card while data loads
- Error messages specific and actionable (per DESIGN.md)

---

## Access Control & Multi-Tenancy

### Permissions (via `core.role_grant`)

| Permission                  | Scope              | Purpose                                        |
| --------------------------- | ------------------ | ---------------------------------------------- |
| `insights:dashboard:create` | global, department | Create new dashboards                          |
| `insights:dashboard:manage` | global, department | Edit/delete any dashboard in scope             |
| `insights:dashboard:view`   | global, department | View all dashboards in scope (bypasses shares) |
| `insights:template:manage`  | global             | Create/edit/delete widget templates            |

### Ownership rules

- **Personal:** Any user with `insights:dashboard:create` can create. Owner has full control.
- **Department:** Requires `insights:dashboard:create` scoped to that department. Department members view by default.
- **System:** Requires `insights:dashboard:manage` at global scope. Visible to all tenant users.

### Sharing

- Owner can share with actors, departments, or roles (view or edit permission)
- `dashboard_share` table tracks grants
- No permission grant needed — ownership implies share ability

### Multi-tenancy

1. tRPC request → extract `tenant_id` from auth context
2. `set_config('app.tenant_id', id, false)` → RLS on `insights.*` tables
3. Cube query includes `tenant_id` via `queryTransformer` (already implemented in `cube.ts`)

### Delegation

- `core.delegation` checked before `role_grant` — no insights-specific delegation logic needed

---

## Data Flow

### Widget preview (editor)

```
WidgetConfigPanel assembles WidgetSpec
  → trpc.insights.getWidgetData({ spec })
  → CubeQueryMapper → Cube REST /v1/load (tenant JWT)
  → data-to-option mapper → ECharts option JSON
  → Returns { spec, data, echartsOption }
  → WidgetRenderer renders
```

### Dashboard load (viewer)

```
Navigate to /dashboards/:id
  → trpc.insights.getDashboard({ id })
  → Returns metadata + widget specs
  → Each widget: useWidgetData → trpc.insights.getWidgetData (parallel)
  → DashboardGrid renders WidgetCards in layout positions
  → GlobalFilterBar state propagates as additional filters
```

### Global filter propagation

```
User changes filter in GlobalFilterBar
  → useGlobalFilters updates state
  → Each useWidgetData receives new filters as dependency
  → Refetch with merged filters (widget AND global, AND logic)
  → Widgets re-render
```

### Auto-refresh

```
Dashboard has refresh_interval_sec = 60
  → useAutoRefresh invalidates widget queries every 60s
  → tRPC refetch, Cube cache dedup
  → Widgets re-render only if data changed
```

---

## Recharts Removal

1. Delete `packages/ui/src/components/ui/chart.tsx`
2. Remove `recharts` from `packages/ui/package.json` via `bun remove`
3. Verify no imports reference the deleted component
4. ECharts in `packages/charts` becomes the sole charting engine

New dependencies in `packages/charts`:

- `echarts`
- `echarts-for-react`
- `react-grid-layout`
- `@types/react-grid-layout`

---

## Future Copilot Readiness

Architecture supports future BI copilot without code changes:

| Seam                     | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `WidgetSpec`             | Generation target — copilot produces same JSON as UI builder              |
| `CubeQueryMapper`        | Copilot reuses server-side query validation and execution                 |
| `InsightsQueryFacade`    | Agent topic calls facade for widget data                                  |
| MCP tool slots           | `insights_query_data`, `insights_create_dashboard`, `insights_add_widget` |
| Template registry        | Copilot references templates by slug                                      |
| `chart-type-registry.ts` | Copilot uses metadata to pick chart types for query results               |

**Deferred:** Agent topic, MCP tool definitions, NL→Cube translation, inline chat charts.
