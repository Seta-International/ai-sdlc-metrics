# People Org Chart UI/UX Pass — Design Spec

## Problem

The Org Chart content area does not match the approved mockup. The current implementation has:

- A "Reporting context" panel with descriptive text, a raw `<select>` team filter, a Location text badge, zoom buttons, and a "Back to my context" button — none of which match the mockup
- Individual vertical connector lines per child with no horizontal rail between siblings
- No compact view mode
- No export capability
- A "Drag canvas to pan" hint strip that is not in the mockup

## Scope

### In scope

- `OrgChartToolbar` — new component replacing the current "Reporting context" panel
- `OrgChartZoomControls` — new floating component replacing the top-panel zoom buttons
- `OrgChartNode` compact mode — `compact` prop switches the dense card to a 1-line pill
- Connector line fix — horizontal rail + vertical drops replacing isolated per-child verticals
- Export — PNG capture via `html2canvas`
- Test updates for all changed components

### Out of scope

- Backend changes (tree query API already implemented)
- Location filter functionality (visual-only this pass)
- PDF export
- Scroll-to-zoom
- Page-level heading block (`page.tsx` h1 + subtitles)
- Whole-zone shell/sidebar redesign

---

## Component Design

### 1. `OrgChartToolbar` (new file)

Replaces the "Reporting context" `div` block in `OrgChartTree`.

**Props:**

```ts
type OrgChartToolbarProps = {
  teams: { id: string; name: string }[]
  selectedTeamId: string | null
  isCompact: boolean
  isExporting: boolean
  onTeamChange: (teamId: string | null) => void
  onCompactToggle: () => void
  onExport: () => void
}
```

**Layout:** Single flex row, space-between.

**Left side — filter chips:**

- **Team chip (active):** Dismissible pill showing `Team · {name}` with an `×` button that calls `onTeamChange(null)`. When no team selected, renders a ghost "Team" chip that opens a `Popover` + `Command` list to pick a team.
- **Location chip:** Static pill reading `Location · All`. No interaction. Styled with `text-fg-subtle` to signal visual-only status. No dismiss button.

**Right side:**

- **Compact view toggle:** `Button variant="outline" size="sm"` with a grid icon. Active state: `variant="secondary"`. Label: `"Compact view"`. Calls `onCompactToggle`.
- **Export button:** `Button variant="default" size="sm"` with a download icon. Label: `"Export"` / `"Exporting…"` (with `<Spinner />`). Disabled when `isExporting`. Calls `onExport`.

**Removes:** The current "Reporting context" heading, `<p>` subtitles, raw `<select>` team dropdown, Location text badge, "Back to my context" button.

---

### 2. `OrgChartZoomControls` (new file)

Floating pill anchored `absolute bottom-3.5 right-3.5` inside the canvas `div`.

**Props:**

```ts
type OrgChartZoomControlsProps = {
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}
```

**Layout:** Pill with `bg-background/80 backdrop-blur-sm border border-sidebar-border rounded-full px-2.5 py-1.5`. Contains: zoom-out button, zoom % span (tabular-nums, `w-10 text-center`), zoom-in button, divider, reset button. All buttons use `Button variant="ghost" size="sm"`.

**Pointer events:** No special CSS needed. The canvas `handlePointerDown` already bails out when `target.closest('button')` matches, so zoom control button clicks never trigger panning.

**Removes from top panel:** Zoom in/out buttons, zoom % span, reset/Maximize2 button.

---

### 3. `OrgChartNode` — compact mode

**Prop added:** `compact?: boolean` to `OrgChartNodeProps`.

**Compact render (when `compact=true`):**

- Replace the `<Card>` with a pill: `flex items-center gap-2 px-3 py-1.5 rounded-full border`.
- Content: avatar (size-7, same initials/image logic), name (`text-sm font-510`), You badge (if `relationshipToViewer === 'self'`).
- Title, dept·location line, report count badge, profile button, and expand/collapse button are hidden.
- The entire pill is wrapped in a `<button>` that calls `onExpand` / `onCollapse`.
- Self highlight: `border-primary/50 ring-1 ring-primary/20` (same as dense card).

**Dense card (when `compact=false` or undefined):** Unchanged.

**Prop threading:** `compact` is lifted to `OrgChartTree` state as `isCompact: boolean`, passed through `OrgChartCanvasContent` → `OrgChartNodeComponent` (and recursively to child nodes).

---

### 4. Connector lines

**Change:** Replace the current isolated per-child vertical connectors with a horizontal rail + vertical drops.

**Before (current):**

```tsx
<div className="mt-4 flex flex-col items-center">
  <div className="h-4 w-px bg-sidebar-border" />   {/* stem from parent */}
  <div className="flex gap-6">
    {childIds.map((childId) => (
      <div key={childId} className="flex flex-col items-center">
        <div className="h-4 w-px bg-sidebar-border" />  {/* isolated vertical */}
        <OrgChartNodeComponent ... />
      </div>
    ))}
  </div>
</div>
```

**After (proposed):**

```tsx
<div className="mt-4 flex flex-col items-center">
  <div className="h-4 w-px bg-sidebar-border" />   {/* stem from parent to rail */}
  <div className="flex gap-6 border-t border-sidebar-border">  {/* horizontal rail */}
    {childIds.map((childId) => (
      <div key={childId} className="flex flex-col items-center">
        <div className="h-4 w-px bg-sidebar-border" />  {/* drop from rail to child */}
        <OrgChartNodeComponent ... />
      </div>
    ))}
  </div>
</div>
```

**Single child:** When `childIds.length === 1`, the rail is a single-point `border-t` which renders as a straight vertical — visually identical to the current single-child connector, no special case needed.

**Colour:** `border-sidebar-border` / `bg-sidebar-border` — already used, adapts to light/dark theme automatically.

---

### 5. Export (PNG)

**Library:** `html2canvas` (`bun add html2canvas`).

**Flow:**

1. User clicks Export → `isExporting` set to `true`; button shows `<Spinner />` + "Exporting…", disabled.
2. `OrgChartTree` saves current zoom/pan, then sets zoom to `1` and pan to `{ x: 0, y: 0 }`.
3. Wait for React to flush and the browser to repaint: `await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`. This ensures the DOM reflects zoom=1 before capture.
4. `html2canvas(canvasRef.current, { scale: 2 })` captures the canvas wrapper div (toolbar and floating controls are outside this ref and are excluded automatically).
5. Canvas converts to PNG data URL. An invisible `<a download="org-chart.png">` is clicked and removed.
6. Zoom and pan restored to saved values. `isExporting` reset to `false`.
7. On failure: zoom/pan restored, `isExporting` reset, destructive toast shown: "Export failed — try again."

**Ref:** `canvasRef = useRef<HTMLDivElement>(null)` attached to the pannable/zoomable inner `div` in `OrgChartTree`. Passed to `OrgChartToolbar` as `onExport` callback closure.

---

## File Changes

| File                                       | Change                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `components/OrgChartToolbar.tsx`           | **Create** — filter chips, compact toggle, export button                                                          |
| `components/OrgChartToolbar.spec.tsx`      | **Create** — unit tests                                                                                           |
| `components/OrgChartZoomControls.tsx`      | **Create** — floating zoom pill                                                                                   |
| `components/OrgChartZoomControls.spec.tsx` | **Create** — unit tests                                                                                           |
| `components/OrgChartNode.tsx`              | **Modify** — add `compact` prop, compact pill render branch                                                       |
| `components/OrgChartNode.spec.tsx`         | **Modify** — add compact mode tests                                                                               |
| `components/OrgChartTree.tsx`              | **Modify** — wire toolbar + zoom controls, add `isCompact` + `isExporting` state, fix connectors, add `canvasRef` |
| `components/OrgChartTree.spec.tsx`         | **Modify** — add compact toggle + connector tests                                                                 |
| `apps/e2e/tests/people-org-chart.spec.ts`  | **Modify** — verify toolbar chips, compact toggle, connector presence                                             |

---

## Error Handling

| Scenario                       | Behaviour                                                             |
| ------------------------------ | --------------------------------------------------------------------- |
| Export capture fails           | `isExporting` reset; destructive toast "Export failed — try again."   |
| Team filter returns no results | Existing empty state in canvas ("No org placement found") — unchanged |
| No team selected               | Team chip renders as ghost pill; clicking opens team picker popover   |

---

## Testing Strategy

### Unit (`OrgChartToolbar`)

- Renders Team chip with name + dismiss button when `selectedTeamId` is set
- Renders ghost Team chip when `selectedTeamId` is null
- Calls `onTeamChange(null)` when × clicked
- Renders Location chip as non-interactive
- Compact toggle calls `onCompactToggle`; active state when `isCompact=true`
- Export button disabled + shows spinner when `isExporting=true`

### Unit (`OrgChartZoomControls`)

- Zoom-in disabled when `canZoomIn=false`; zoom-out disabled when `canZoomOut=false`
- Calls correct callbacks on button clicks
- Displays `zoom` as rounded percentage

### Unit (`OrgChartNode`)

- Dense card renders title, dept/location, badge, profile + expand buttons
- Compact pill renders avatar + name only; hides title, dept, badge, buttons
- Compact pill: You badge shown when `relationshipToViewer === 'self'`
- Compact pill: clicking calls `onExpand` / `onCollapse`

### Unit (`OrgChartTree`)

- Compact toggle flips `isCompact` state and passes it to nodes
- Connector wrapper has `border-t` class when children are expanded
- `canvasRef` is attached to the canvas div

### E2E

- Toolbar renders Team chip and Location chip
- Dismissing Team chip clears the filter
- Compact toggle switches node rendering to pills
- Horizontal connector rail is present between siblings
- Export button triggers file download (mocked in E2E)
