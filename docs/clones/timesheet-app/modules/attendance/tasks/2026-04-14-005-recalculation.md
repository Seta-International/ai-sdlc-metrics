# Task 005: Timesheet Recalculation Event Handler

**Module:** attendance  
**Sequence:** 5 of 5  
**Depends on:** Task 001 (schema-and-entity), Task 004 (check-in-online — for `updateComputedFields` on repository)  
**Estimated size:** small

---

## Scope

Implement the cascade recalculation triggered when a user's work-time config changes (BR-09):

1. `WorkTimeConfigChangedEvent` — domain event published by the `work-time` sub-module
2. `OnWorkTimeChangedHandler` — event handler in the attendance module that recomputes all timesheet rows in the affected date range
3. Adds `findByUserInRange` and `updateComputedFields` to `DrizzleTimesheetEntryRepository` (if not already done in Task 004)

---

## Business Context

When HRM changes a user's work schedule (different start/end times, different break window), all previously computed `late`, `early`, `lack`, `work_time`, and `over_time` values become stale. The legacy `admin.service.js` handles this by directly querying and updating timesheet rows after saving the new work-time config. We restructure this as an event-driven flow to respect module boundaries.

**BR-09 exact behavior:**

- When a `work_time` row is created or updated for a user, all `time_sheet` rows for that user whose `date` falls within `[new_work_time.from_date, new_work_time.to_date ?? ∞)` must be recomputed.
- Only rows with `check_in IS NOT NULL` need recomputation (rows with no check-in have no computed values).
- `over_time` requires `actual_out`; if not present, set to null.

---

## Source Reference

- `server/services/admin.service.js` — look for the work-time update section that calls a recalculation of timesheet rows (search for `updateTimesheet` or similar calls after `work_time` INSERT/UPDATE)
- `server/utils/timesheet.js` — same `getLate`, `getEarly`, `getLack`, `getWorkTime`, `getOverTime` functions used here

**Note:** the legacy code does the recalculation synchronously within the HTTP request, which blocks for potentially hundreds of timesheet rows. In Future this runs asynchronously via the event bus.

---

## Target Location

```
apps/api/src/modules/time/
  domain/events/
    work-time-config-changed.event.ts         ← defined here, published by work-time sub-module
  application/event-handlers/
    on-work-time-changed.handler.ts
    on-work-time-changed.handler.spec.ts
  infrastructure/repositories/
    drizzle-timesheet-entry.repository.ts     ← add findByUserInRange + updateComputedFields
```

---

## Domain Event

```ts
// domain/events/work-time-config-changed.event.ts
export class WorkTimeConfigChangedEvent {
  constructor(
    public readonly payload: {
      tenantId: string
      userId: string
      workTimeId: string
      fromTime: string // HH:mm:ss new start time
      toTime: string // HH:mm:ss new end time
      startBreakTime: string // HH:mm:ss
      endBreakTime: string // HH:mm:ss
      fromDate: string // YYYY-MM-DD — effective start of this work-time config
      toDate: string | null // YYYY-MM-DD — null means open-ended
    },
  ) {}
}
```

This event is published by the `work-time` sub-module's command handler when a work-time config is created or updated. The attendance module registers a listener for it.

---

## Event Handler

```ts
// application/event-handlers/on-work-time-changed.handler.ts
@EventsHandler(WorkTimeConfigChangedEvent)
export class OnWorkTimeChangedHandler implements IEventHandler<WorkTimeConfigChangedEvent> {
  constructor(
    @Inject(TIMESHEET_ENTRY_REPOSITORY)
    private readonly timesheetRepo: ITimesheetEntryRepository,
  ) {}

  async handle(event: WorkTimeConfigChangedEvent): Promise<void> {
    const { tenantId, userId, fromTime, toTime, startBreakTime, endBreakTime, fromDate, toDate } =
      event.payload

    // 1. Fetch all timesheet rows for this user in the affected date range
    const entries = await this.timesheetRepo.findByUserInRange(
      userId,
      tenantId,
      fromDate,
      toDate ?? undefined,
    )

    // 2. For each entry that has a check-in, recompute fields
    for (const entry of entries) {
      if (!entry.checkIn) continue // no check-in → nothing to recompute

      const checkInTimeStr = formatTimeFromDate(entry.checkIn) // HH:mm:ss
      const checkOutTimeStr = entry.checkOut ? formatTimeFromDate(entry.checkOut) : toTime // fall back to scheduled end if no actual check-out

      const late = getLate({
        startTime: fromTime,
        endTime: checkInTimeStr,
        startBreakTime,
        endBreakTime,
      })
      const early = entry.actualOut
        ? getEarly({
            startTime: formatTimeFromDate(entry.actualOut),
            endTime: toTime,
            startBreakTime,
            endBreakTime,
          })
        : null
      const lack = getLack(late, early)
      const workTime = getWorkTime({ fromTime, toTime, startBreakTime, endBreakTime, lack })
      const inOffice =
        entry.actualIn && entry.actualOut
          ? formatMs(entry.actualOut.getTime() - entry.actualIn.getTime())
          : null
      const overTime = inOffice
        ? getOverTime({ workTime, inOffice, startBreakTime, endBreakTime })
        : null

      await this.timesheetRepo.updateComputedFields(entry.id, tenantId, {
        late,
        early,
        lack,
        workTime,
        overTime,
        inOffice,
      })
    }
  }
}
```

**Performance note:** for large recalculations (e.g. changing a config effective from Jan 1 for an employee with 100+ rows), consider batching the updates. A simple implementation using sequential `updateComputedFields` calls is acceptable for V1. Add a TODO comment for batch optimization.

---

## Repository Methods to Add

```ts
/** Find all timesheet entries for a user in a date range (inclusive) */
findByUserInRange(
  userId: string,
  tenantId: string,
  fromDate: string,
  toDate?: string,   // undefined = open-ended (no upper bound)
): Promise<TimesheetEntry[]>

/** Update only the computed fields on an existing entry */
updateComputedFields(
  id: string,
  tenantId: string,
  fields: Pick<TimesheetEntry, 'late' | 'early' | 'lack' | 'workTime' | 'overTime' | 'inOffice'>,
): Promise<void>
```

---

## Module Registration

Register `OnWorkTimeChangedHandler` in `time.module.ts`:

```ts
@Module({
  providers: [
    // ... existing providers
    OnWorkTimeChangedHandler,
  ],
})
export class TimeModule {}
```

---

## Acceptance Criteria

- [ ] `WorkTimeConfigChangedEvent` defined in `domain/events/`
- [ ] `OnWorkTimeChangedHandler` implements `IEventHandler<WorkTimeConfigChangedEvent>`
- [ ] Handler skips entries with no `checkIn` (null check-in rows are not recomputed)
- [ ] Handler recomputes `late`, `early`, `lack`, `workTime`, `overTime`, `inOffice` using `AttendanceCalculator` functions (from Task 001)
- [ ] `early` is set to `null` when `actualOut` is not present on the entry
- [ ] `overTime` is set to `null` when `inOffice` is not computable
- [ ] `findByUserInRange` correctly handles open-ended range (`toDate = undefined` → no upper bound filter)
- [ ] `updateComputedFields` updates only the six computed columns — does not touch `checkIn`, `checkOut`, `userId`, `date`, etc.
- [ ] Handler registered in `TimeModule.providers`
- [ ] Unit spec covers: entry with check-in recomputed, entry without check-in skipped, open-ended date range, empty result (no entries in range)
- [ ] TODO comment added for batch optimization
- [ ] No `.js` extensions in relative imports
- [ ] No `moment` imports
