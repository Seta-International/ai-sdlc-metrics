/** Domain-agnostic schedule item. Host apps map their own entities to this shape. */
export type ScheduleItem<TPayload = unknown> = {
  id: string
  title: string
  /** ISO 8601 datetime string, or null if unscheduled. */
  startDate: string | null
  /** ISO 8601 datetime string, or null if unscheduled. */
  dueDate: string | null
  /** Optional CSS color value (e.g., `var(--chart-priority-urgent)` or `#ff6b6b`). */
  color?: string
  /** Optional per-item opaque token for optimistic-concurrency. Passed back unchanged on changes. */
  version?: string
  /** Arbitrary host payload ferried through to event handlers. Never touched by the package. */
  payload?: TPayload
}

/** View identifiers accepted by ScheduleCalendar + ScheduleToolbar. */
export type ScheduleView =
  | 'dayGridMonth'
  | 'dayGridWeek'
  | 'dayGridDay'
  | 'dayGridYear'
  | 'dayGridCustom'

/** Kind of user-initiated change from a drag or resize gesture. */
export type DragKind = 'bar' | 'pin' | 'unscheduled-drop'

/** Result of resolving a FullCalendar drag/resize back to domain dates. */
export type DragResolution = { startDate: string | null; dueDate: string }

/** Emitted by ScheduleCalendar when the user changes an item's dates. */
export type ScheduleChange<TPayload = unknown> = {
  id: string
  version?: string
  payload?: TPayload
  kind: DragKind
  next: DragResolution
}

/** Emitted when the user drags a scheduled item back onto the Unscheduled panel. */
export type ScheduleClear<TPayload = unknown> = {
  id: string
  version?: string
  payload?: TPayload
}

/** Classification used internally; exported for consumers that want to pre-partition. */
export type ScheduleClass = 'bar' | 'pin' | 'unscheduled'
