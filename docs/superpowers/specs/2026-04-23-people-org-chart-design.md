# People Org Chart V1 Design

## Purpose

Implement the read-only Org chart feature in `apps/web-people`, reached from the existing `Org Chart` sidebar item below `Directory`.

V1 focuses on visualizing reporting relationships from the current user's context. It is not an org-management tool. Users can expand and collapse nodes, pan and zoom the canvas, and open employee profile cards. Searching, editing, exports, and drag-and-drop are future scope.

## Source Context

- Prototype: `docs/raws/design/project/people/workflows.jsx`
- Current page: `apps/web-people/src/app/org-chart/page.tsx`
- Current components: `apps/web-people/src/components/OrgChartTree.tsx`, `apps/web-people/src/components/OrgChartNode.tsx`
- Current sidebar config: `apps/web-people/src/navigation.ts`
- Design rules: `DESIGN.md`

The current implementation is a placeholder-style full-tree UI with local fetch state, a manager/department toggle, search, expand-all/collapse-all, and zoom controls. V1 should replace that behavior with a focused context-window org browser.

## Goals

- Render an org context centered on the current user's position.
- Show the user's manager, peers, and direct reports on initial load.
- Fall back to the top company root when the current user has no org placement.
- Let users navigate the hierarchy by expanding and collapsing nodes.
- Lazy-load direct reports for expanded nodes instead of rendering the whole company.
- Provide basic pan, zoom, and fit/reset controls for the canvas.
- Let users open employee profile pages from node profile affordances.
- Preserve the existing app sidebar ownership in `@future/app-layout`.

## Non-Goals

- In-canvas search. Users who need to find a person by name should use People Directory.
- Department-mode org chart.
- Full-tree expand-all or collapse-all controls.
- Reassign manager or edit reporting relationships.
- Drag-and-drop node movement.
- Export, print, or share-link workflows.
- Cross-zone navigation changes.
- Storing org chart viewport state in URL, localStorage, or sessionStorage.

## User Entry Point

The existing `peopleNavConfig` sidebar item remains the entry point:

- Label: `Org Chart`
- Route: `/org-chart`
- Permission: `people:org:read`

No new sidebar group or zone-local sidebar should be introduced. The sidebar stays owned by `AppLayout`.

## Data Contract

Expose read-only tRPC queries under the People router.

### `people.orgChart.context`

Returns the initial visible graph for the current viewer:

- The viewer's current employment node.
- The viewer's manager node when one exists.
- Peers who share the same manager.
- The viewer's immediate direct reports.
- Top company root node(s) when the viewer has no org placement.

The response should include enough structure for the client to render parent, sibling, and child relationships without requesting the full company tree.

### `people.orgChart.children`

Returns immediate direct reports for a selected node. The client calls this when the user expands a node whose children are not already loaded.

Input:

- `employmentId`: selected employment node id.

Output:

- Array of immediate child nodes.

### Node Shape

Each node should include display-safe fields only:

```ts
type OrgChartNode = {
  employmentId: string
  personProfileId: string
  fullName: string
  jobTitle: string | null
  departmentName: string | null
  locationName: string | null
  avatarUrl: string | null
  managerEmploymentId: string | null
  directReportCount: number
  hasDirectReports: boolean
  relationshipToViewer?: 'self' | 'manager' | 'peer' | 'direct_report' | 'root'
}
```

The API must not expose compensation, documents, private identifiers, personal contact data, or private profile fields.

## Backend Design

Add People application query handlers for org-chart reads. The handlers should use People-owned repositories or query services and stay inside the People module boundaries.

Rules:

- Require `people:org:read` for both tRPC queries.
- Scope all reads to the current tenant.
- Respect existing People field visibility rules before returning profile display fields.
- Keep query handlers read-only.
- Avoid `Promise.all` for DB reads inside handlers because request-bound DB access uses a single client.
- Return stable, deterministic ordering for peers and direct reports, such as by display name or effective org order if one exists.

Error handling:

- Permission failure returns the standard unauthorized/forbidden tRPC error.
- Missing current employment returns the top-root fallback when possible.
- Missing selected node for `children` returns a not-found error.
- Data cycles should be guarded against so a bad hierarchy cannot recursively render forever.

## Frontend Design

The `/org-chart` page should use the existing app layout and render an internal org-chart surface only. It must follow `DESIGN.md`: dark-mode-first surfaces, subtle borders, Inter typography, and `@future/ui` components for interactive controls.

### Page Structure

- Header with title `Org chart`.
- Short description explaining that the view starts from the user's reporting context.
- Secondary hint that name search lives in People Directory.
- Toolbar with zoom out, zoom percentage, zoom in, fit/reset view, and `Back to my context`.
- Canvas with pan and zoom behavior.
- Org nodes rendered as compact employee profile cards.

### Node Card

Each node card shows:

- Avatar or initials.
- Full name.
- Job title.
- Department and/or location when available.
- Direct-report count.
- Expand/collapse affordance when `hasDirectReports` is true.
- Profile affordance that navigates to `/profile/{employmentId}`.

The node itself should not imply editability. Profile navigation should be explicit enough to avoid accidental navigation during pan/zoom interactions.

### Expansion Behavior

- Initial load expands only the default context returned by `people.orgChart.context`.
- Expanding a node calls `people.orgChart.children` only if the node's children are not already cached.
- Collapsing hides descendants but keeps loaded children in local cache.
- Per-node loading and error states should be shown near the node being expanded.
- Re-expanding a cached node should not refetch unless the user retries after an error or the implementation adds an explicit refresh.

### Canvas Behavior

- Pan should work within the chart canvas, not the whole page.
- Zoom controls should clamp to 50% through 150%.
- Fit/reset returns the user to a readable centered view.
- The current user's node should be visually distinguished without using excessive color.
- The chart should remain usable on narrow screens through horizontal scrolling or touch panning.

## Client State

Keep state local to the org chart component or a co-located hook:

- Loaded nodes by `employmentId`.
- Parent-to-children relationships.
- Expanded node ids.
- Selected or focused node id, if needed for visual focus.
- Canvas transform state.
- Initial context loading/error state.
- Per-node child loading/error state.

V1 does not require URL state. Do not read `window.location`, `localStorage`, or `sessionStorage` in component bodies or `useState` initializers.

## Permissions And Privacy

- Sidebar visibility remains controlled by `people:org:read`.
- Backend queries must independently enforce `people:org:read`.
- The API returns only display-safe org chart fields.
- The chart must not bypass profile visibility rules.
- Tenant isolation must be covered by backend integration tests.

## Accessibility

- Interactive controls use `@future/ui` primitives.
- Expand/collapse controls have accessible names that include the employee name.
- Zoom controls expose the current zoom percentage.
- Keyboard users can tab through toolbar controls and node profile/expand actions.
- Loading and error states are visible as text, not color alone.

## Testing

Follow repository testing rules: write tests first, co-locate tests, and do not use `__tests__/` directories.

Backend tests:

- Unit test current-user context: manager, peers, self, and direct reports.
- Unit test no-placement fallback to company root.
- Unit test leaf node children response.
- Unit test permission denial.
- Unit test missing selected node for children.
- Unit test cycle protection or depth guarding.
- Integration test hierarchy traversal against the real DB.
- Integration test tenant isolation.

Frontend tests:

- Page renders title, description, and Directory-search hint.
- Loading state uses design-system loading primitives.
- Error state uses a destructive alert and retry path.
- Empty state is clear when no org root can be resolved.
- Initial context renders manager, self, peers, and direct reports.
- Expand fetches children lazily and then renders them.
- Collapse hides descendants without clearing cached children.
- Per-node expansion errors can be retried.
- Zoom controls update the canvas transform and displayed percentage.
- Fit/reset returns to the default transform.
- Profile affordance navigates to the existing profile route.

E2E coverage:

- Open `/org-chart` from the People sidebar.
- Verify the current-user context appears.
- Expand a node with direct reports.
- Navigate from a node to its profile page.

## Future Scope

- Name search inside the chart.
- Department or location grouping modes.
- Export/print/share workflows.
- Reassign manager workflows.
- Drag-and-drop org editing.
- Saved viewport or deep-linked org focus.
- Larger graph performance features such as virtualization or minimap navigation.

## Implementation Notes

- If existing People visibility services cannot provide the required display-safe filtering, add a focused query-layer adapter rather than exposing raw repository rows.
