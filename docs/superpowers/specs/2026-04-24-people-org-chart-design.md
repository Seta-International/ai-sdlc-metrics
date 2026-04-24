# People Org Chart UI/UX Rebuild + Data Correctness Design

## Problem

The Org Chart feature does not match the approved mockup and currently shows incomplete card data (for example: unnamed employee, missing title, missing org details). Hierarchy links between leaders and reports are also not consistently rendered as a connected structure.

This pass targets the **Org Chart content area only** and must:

1. Match the approved visual direction from the mockup.
2. Preload and render at least 2+ levels with visible reporting connectors.
3. Fix card data reliability by sourcing authoritative person/job/org fields.
4. Make **Team filter functional** and keep **Location filter visual-only**.
5. Support both light and dark themes.

## Scope

### In scope

- Org Chart content-area UI/UX rebuild.
- New backend tree query for preload hierarchy.
- Correct node field hydration for employee cards.
- Connector rendering based on explicit parent-child maps.
- Team filter behavior.
- Light/dark mode support.
- Test updates for backend, frontend, and E2E paths.

### Out of scope

- Whole-zone shell/sidebar redesign.
- Replacing existing directory search behavior.
- Full functional location filtering in this pass.

## Recommended Approach (Selected)

Use an **API-first hierarchy DTO** and switch Org Chart initial rendering to a dedicated tree endpoint. Keep deeper expansion available via children loading if needed, but preload enough depth for mockup-like first paint.

## Architecture

### Frontend boundary

- Keep `OrgChartTree` and `OrgChartNode` as main UI surface components.
- Replace current initial data source with new `people.orgChart.tree` query response.
- Continue to use normalized client structures:
  - `nodesById`
  - `childrenByParentId`
  - `rootEmploymentIds`

### Backend boundary

- Add `people.orgChart.tree` query with input:
  - `teamId?: string`
  - `depth: number` (default 2 or 3 in server-side handler)
- Keep `people.orgChart.children` available for optional expansion beyond preload depth.

## Data Flow & Field Mapping

### Hierarchy construction

1. Build manager-report graph from current job assignments (`managerId` relationships).
2. Resolve initial roots for selected context/team.
3. Expand tree to configured preload depth.
4. Return deterministic ordering for children so connectors and card rows are stable.

### Node hydration source of truth

Org Chart card identity and org details must come from authoritative module data (not from `directory_search_index` dependency):

- `fullName` ← person profile computed display name
- `jobTitle` ← current job profile title
- `departmentName` ← department read
- `locationName` ← location read
- `avatarUrl` ← person profile photo when present

### DTO shape (conceptual)

- `rootIds: string[]`
- `nodesById: Record<string, OrgChartNode>`
- `childrenByParentId: Record<string, string[]>`
- `focusEmploymentId: string | null`

This shape is connector-friendly and avoids client-side inference errors.

## UI/UX Design (Content Area)

1. Toolbar in chart content includes:
   - Team filter (**functional**)
   - Location chip (**visual-only**)
   - Compact view toggle styling retained
2. Card style follows mockup density:
   - Horizontal compact pills
   - Avatar/initials + name + role
3. Connectors:
   - Explicit vertical/horizontal lines between manager and reports
   - No visually detached nodes
4. Initial render:
   - Starts from top leadership context
   - Shows 2+ levels without manual expand
5. Theming:
   - Dark mode uses dark canvas
   - Light mode uses light canvas
   - Shared structure and spacing in both themes

## Error Handling & Edge Cases

1. Missing partial fields show explicit fallback labels (for example: `Unknown title`) instead of collapsing to generic missing identity when person exists.
2. Orphan nodes (missing manager in current slice) are grouped under deterministic fallback root label (`Unassigned chain`) so records remain visible.
3. Team filter with no matches shows contextual empty state.
4. Tree query failure shows destructive alert + retry at canvas level.

## Testing Strategy

### Backend

- Unit/integration tests for tree query:
  - Parent-child graph correctness
  - Node field hydration correctness
  - Orphan handling behavior
  - Tenant isolation

### Frontend

- Unit tests for:
  - Connector rendering from normalized maps
  - Theme-aware rendering (light/dark)
  - Team filter behavior in tree visibility

### E2E

- Update org chart flow to verify:
  - Initial preload renders connected hierarchy
  - Cards show employee identity and role/org details
  - Team filter changes visible tree result set

## Implementation Notes

- Preserve existing design-system component usage (`@future/ui` primitives).
- Keep behavior deterministic and testable by avoiding implicit hierarchy reconstruction in UI.
- Avoid new dependency on stale search-index rows for core org-chart identity fields.
