# @future/schedule

Domain-agnostic day-granular calendar for the Future monorepo.

Built on FullCalendar (MIT standard plugins only: `core`, `react`, `daygrid`, `interaction`).

## Usage

```tsx
import '@future/schedule/styles.css'
import { ScheduleCalendar, type ScheduleView } from '@future/schedule'

// Map your domain items to ScheduleItem
const items = tasks.map((t) => ({
  id: t.id,
  title: t.title,
  startDate: t.startDate,
  dueDate: t.dueDate,
}))

<ScheduleCalendar
  items={items}
  view="dayGridWeek"
  onViewChange={(v) => setView(v)}
  onChange={(ev) => handleDateChange(ev)}
/>
```

## Pin semantics (MS Planner compatibility)

By default (`preservePinSemantics={true}`), items with only a `startDate` (no `dueDate`) are treated as **unscheduled** — matching MS Planner's "start date only" behavior where the item stays in the backlog until given a due date.

Set `preservePinSemantics={false}` to render start-only items as single-day pins on their start date instead.

## Unscheduled Panel

Items with neither `startDate` nor `dueDate` appear in the Unscheduled panel and can be dragged onto the calendar to schedule them for a specific day.
