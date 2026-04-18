# 04 — Frontend (`web-planner` zone) + Board Interactions

## Routing

```
apps/web-planner/src/app/
├── layout.tsx                       # shell + <GlobalNav/> from @future/ui
├── page.tsx                         # -> /plans
└── plans/
    ├── page.tsx                     # plan list
    ├── new/page.tsx                 # create flow
    └── [planId]/
        ├── layout.tsx               # loads plan membership + labels, provides context
        ├── page.tsx                 # -> /board
        └── board/
            ├── page.tsx             # Board view
            └── tasks/[taskId]/page.tsx   # intercepting route (modal)
```

## State management

- Server cache: React Query via `@trpc/react-query`. Same pattern as other zones.
- UI state: React local + URL search params (`?group=bucket&filter=due:today&task=<id>`). Deep-linkable. No Redux / Zustand.
- Task detail uses Next.js **intercepting routes** — side-panel modal on client navigation, full page on direct hit / refresh.

## Components

```
components/
├── board/           BoardColumn, TaskCard, TaskCardCover, QuickAddTask, AddBucketButton, BoardDragContext
├── task-detail/     TaskDetailPanel, TaskPropertyStrip, TaskDescription, TaskChecklist,
│                    TaskAttachments, TaskComments, TaskEvidence
├── labels/          LabelPill, LabelPicker, LabelEditor
├── assignees/       AssigneeAvatarStack, AssigneePicker
└── primitives/      PriorityIcon, ProgressIcon, DueBadge
lib/
├── trpc.ts
├── hooks/           useBoardSnapshot, useTaskDetail, useOptimisticMove, usePlanMembership
├── order-hint.ts    # client-side MsOrderHint.between() helper
└── ms-order-hint-format.ts  # shared logic with api domain
```

## Drag-and-drop — `@dnd-kit`

Chosen over deprecated `react-beautiful-dnd` and older `react-dnd`. Accessible (keyboard drag), tree-shakable, works with virtualization.

Flow:

1. `onDragEnd` computes `orderHintAfter` / `orderHintBefore` from neighbor cards.
2. Optimistic React Query cache patch (card moves immediately).
3. Fire `tasks.move` (or the field-mutation equivalent for other groupings).
4. Success: cache replaced with authoritative response. Failure: rollback + toast.

Single hook `useOptimisticMove` encapsulates the pattern.

## Virtualization

Not in Phase 1. Target plans <200 tasks. Document the limit. If QA finds jank, add `@tanstack/react-virtual` per column in a Sub-project #2 spike.

## Optimistic update policy

- **Optimistic:** task create, move, assign, label, progress toggle, checklist toggle, priority change, date change, delete.
- **Non-optimistic** (spinner OK): attachment upload, evidence upload, plan creation, member add/remove.
- Error recovery: cache rollback + toast. No intrusive modals.

## Design tokens (from `DESIGN.md`)

- Page bg `#0f1011`; column `rgba(255,255,255,0.02)`; card `rgba(255,255,255,0.02)` with `1px solid rgba(255,255,255,0.08)`, radius 8px.
- Inter Variable. Card title weight 510, 14/20. Properties weight 450, 12/16.
- Indigo accent `#5e6ad2` bg / `#7170ff` interactive. Drag-over, primary buttons, focused borders (ring-3 per FINDING-007).
- Status: `#27a644` in-progress, `#10b981` completed. Overdue pill `#e5484d` with `#e5484d22` bg.
- Label palette: 25 Radix UI dark-palette scales mapped to `category1..category25` (pink, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, plum, slate, sand, mauve, and 5 additional). All accessibility-checked against card bg.
- 8px spacing grid. Column gutter 12, card padding 12.

## Accessibility (non-negotiable)

- `@dnd-kit` keyboard drag (space pick-up, arrows move, space drop). `aria-live` announcements.
- Interactive targets ≥36px hit area.
- Focus rings: ring-3 indigo.
- Color never sole signal: due dates use icon + text, progress uses shape + color, labels have text + color.

## Not in Phase 1

- Filter bar / group-by picker UI (Sub-project #2)
- Bulk selection
- Drag across plans
- Real-time presence / cursors

---

## Board Interaction Details

### Quick-add task

- `+ Add task` at the **top** of each bucket (MS pattern).
- Inline input; Enter creates + keeps input open; Escape closes.
- Shift+Enter surfaces inline due-date picker before submit.
- Optimistic prepend. Title length indicator at 240/255; hard block at 255.

### Card checkmark

- Small checkmark top-left, visible on hover (desktop) / always (touch).
- Toggles NotStarted/InProgress → Completed; second click reverts to InProgress (not NotStarted).
- Completed: 60% opacity, strike-through title, sorted to bottom of bucket by `completedAt desc`, "Completed Xh ago" footer.

### Card cover

- If `coverAttachmentId` points at an image attachment: render 16:9 header on card, content below.
- Non-image cover ID: ignored visually.
- "Set as cover" menu in task detail attachments.

### Label pills on cards

- Up to 4 pills + `+N` overflow chip.
- Pill click → filters Board to that label (consistent with Sub-project #2 filter bar).
- `+N` hover → popover with all labels.

### Label picker in task detail

- Popover lists **all 25 slots** (plan-scoped), even uncustomized ones (with default names/colors).
- Checkbox for applied state; pencil-on-hover for inline rename + color picker (plan-scoped write).
- Teaches users the slot model.

### Due date

- Badge color:
  - Overdue (`dueDate < today`, progress ≠ 100): `#e5484d` red
  - Today: amber
  - This week: neutral outline
  - Future: subtle gray text, no pill
- Click → inline date picker with "Clear" option.

### Task detail panel — autosave + concurrency

- Text inputs: autosave on blur.
- Dropdowns, dates, assignees, labels: autosave on change.
- "Saving…" / "Saved" indicator in panel header.
- On `CONFLICT`: toast with "Refresh" button; refetch replaces panel state, preserving user edits on untouched fields; conflicting-field-only UI shows "Keep mine / Keep theirs."

### Checklist

- Click checkbox: instant optimistic toggle. Counter updates in cache.
- Enter on item title: creates item below + focus.
- Drag to reorder (vertical `@dnd-kit`).
- At 20 items: input disabled with "Maximum 20 items (Microsoft Planner limit)" hint.

### Bucket rename / reorder

- Click title: contenteditable, Enter saves, Escape cancels.
- Drag bucket header horizontally to reorder.
- `+ Add bucket` rightmost; inline.
- Delete: context menu; confirm if bucket has tasks ("5 tasks will be deleted. Continue?"). No "move elsewhere" option in Phase 1.

### Comments

- Enter posts (not Shift+Enter; matches Slack/Teams).
- ≤4000 chars; countdown at 3800.
- Optimistic append with pending indicator.
- Author-only soft delete; "Comment deleted" gravestone remains.

### Evidence

- Section below Comments.
- "Add evidence" composer: kind selector (file/link/note), content, **caption required**, optional notes.
- Rendered as card stack: submitter avatar, kind icon, caption, timestamp, preview, verified badge when applicable.
- Verify button present but disabled with tooltip "Verification workflow in Phase 5."

### Rich content paste

- When user pastes rich text (from Word, Slack, etc.) into description: silently strip formatting; one-time toast "Rich text is not supported — formatting was removed."

### Loading states

- Board: shell layout + skeleton columns on first load.
- Task detail: skeleton while loading, but title from Board cache immediately.
