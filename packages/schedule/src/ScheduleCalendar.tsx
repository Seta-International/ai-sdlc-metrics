'use client'
import {
  useImperativeHandle,
  useMemo,
  useRef,
  forwardRef,
  type ForwardedRef,
  type ReactNode,
} from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  EventInput,
  EventApi,
  DropArg,
  EventDropArg,
  EventResizeDoneArg,
} from '@fullcalendar/core'
import { partitionItems } from './schedule-render'
import { itemToFcEvent } from './item-to-fc-event'
import { resolveFcChange } from './fc-event-to-dates'
import { UnscheduledPanel, type UnscheduledPanelProps } from './UnscheduledPanel'
import { ScheduleToolbar } from './ScheduleToolbar'
import { FilterFirstEmptyState } from './FilterFirstEmptyState'
import type { DragKind, ScheduleChange, ScheduleClear, ScheduleItem, ScheduleView } from './types'

export type ScheduleCalendarProps<TPayload = unknown> = {
  items: ScheduleItem<TPayload>[]
  view: ScheduleView
  onViewChange: (v: ScheduleView) => void
  onChange: (ev: ScheduleChange<TPayload>) => void
  onClear?: (ev: ScheduleClear<TPayload>) => void
  onItemClick?: (item: ScheduleItem<TPayload>) => void

  availableViews?: ScheduleView[]
  headerSlot?: ReactNode
  renderUnscheduledItem?: UnscheduledPanelProps<TPayload>['renderItem']
  unscheduledPanelTitle?: string
  hideUnscheduledPanel?: boolean
  readOnly?: boolean
  filterFirstThreshold?: number
  hasFilterApplied?: boolean
  preservePinSemantics?: boolean
  calendarProps?: Record<string, unknown>
}

export type ScheduleCalendarRef = { getApi: () => ReturnType<FullCalendar['getApi']> | undefined }

export const ScheduleCalendar = forwardRef(function ScheduleCalendar<TPayload>(
  props: ScheduleCalendarProps<TPayload>,
  ref: ForwardedRef<ScheduleCalendarRef>,
) {
  const {
    items,
    view,
    onViewChange,
    onChange,
    onClear: _onClear,
    onItemClick,
    availableViews,
    headerSlot,
    renderUnscheduledItem,
    unscheduledPanelTitle,
    hideUnscheduledPanel = false,
    readOnly = false,
    filterFirstThreshold,
    hasFilterApplied = false,
    preservePinSemantics = true,
    calendarProps = {},
  } = props

  const calendarRef = useRef<FullCalendar | null>(null)
  useImperativeHandle(ref, () => ({ getApi: () => calendarRef.current?.getApi() }), [])

  const { bars, pins, unscheduled } = useMemo(
    () => partitionItems(items, { preservePinSemantics }),
    [items, preservePinSemantics],
  )

  const events = useMemo<EventInput[]>(
    () =>
      [...bars, ...pins]
        .map((it) => itemToFcEvent(it, { preservePinSemantics }))
        .filter((e): e is EventInput => e !== null),
    [bars, pins, preservePinSemantics],
  )

  const exceedsThreshold =
    typeof filterFirstThreshold === 'number' &&
    !hasFilterApplied &&
    items.length > filterFirstThreshold

  if (exceedsThreshold) {
    return (
      <FilterFirstEmptyState
        itemCount={items.length}
        threshold={filterFirstThreshold!}
        onShowAll={() => {
          /* host flips hasFilterApplied via headerSlot */
        }}
      />
    )
  }

  const handleEventChange = (fcEvent: EventApi, kind: DragKind) => {
    const end = fcEvent.end ?? new Date(fcEvent.start!.getTime() + 86_400_000)
    const next = resolveFcChange({ kind, newStart: fcEvent.start!, newEnd: end })
    onChange({
      id: fcEvent.extendedProps.itemId as string,
      version: fcEvent.extendedProps.version as string | undefined,
      payload: fcEvent.extendedProps.payload as TPayload | undefined,
      kind,
      next,
    })
  }

  const handleExternalDrop = (arg: DropArg) => {
    const payload = JSON.parse(arg.draggedEl.getAttribute('data-event') ?? '{}')
    const id = payload.extendedProps?.itemId as string | undefined
    if (!id) return
    const next = resolveFcChange({
      kind: 'unscheduled-drop',
      newStart: arg.date,
      newEnd: new Date(arg.date.getTime() + 86_400_000),
    })
    onChange({
      id,
      version: payload.extendedProps?.version,
      payload: payload.extendedProps?.payload,
      kind: 'unscheduled-drop',
      next,
    })
  }

  const handleEventClick = (arg: { event: EventApi }) => {
    if (!onItemClick) return
    const id = arg.event.extendedProps.itemId as string
    const source = items.find((x) => x.id === id)
    if (source) onItemClick(source)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <ScheduleToolbar
            view={view}
            onViewChange={onViewChange}
            calendarRef={calendarRef}
            views={availableViews}
          />
          {headerSlot}
        </div>
        <div className="flex-1 overflow-auto">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView={view}
            headerToolbar={false}
            height="100%"
            editable={!readOnly}
            droppable={!readOnly}
            events={events}
            eventDrop={(info: EventDropArg) =>
              handleEventChange(info.event, info.event.extendedProps.kind as DragKind)
            }
            eventResize={(info: EventResizeDoneArg) => handleEventChange(info.event, 'bar')}
            drop={handleExternalDrop}
            eventClick={handleEventClick}
            firstDay={1}
            weekNumbers={false}
            eventDisplay="block"
            {...calendarProps}
          />
        </div>
      </div>
      {!hideUnscheduledPanel && (
        <UnscheduledPanel<TPayload>
          items={unscheduled}
          title={unscheduledPanelTitle}
          renderItem={renderUnscheduledItem}
        />
      )}
    </div>
  )
}) as <TPayload = unknown>(
  props: ScheduleCalendarProps<TPayload> & { ref?: ForwardedRef<ScheduleCalendarRef> },
) => ReactNode
