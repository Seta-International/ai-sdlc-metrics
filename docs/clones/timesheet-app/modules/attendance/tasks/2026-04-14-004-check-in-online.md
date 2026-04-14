# Task 004: Online Check-In Command

**Module:** attendance  
**Sequence:** 4 of 5  
**Depends on:** Task 001 (schema-and-entity)  
**Estimated size:** medium

---

## Scope

Implement the online check-in flow:

1. `CheckInOnlineCommand` — command class
2. `CheckInOnlineHandler` — command handler with full business logic
3. `AttendanceViolationDetected` domain event (replaces `sendMailNotification`)
4. Write methods on `DrizzleTimesheetEntryRepository` (`insert`, `findTodayEntry`)
5. tRPC mutation `time.attendance.checkInOnline`

---

## Business Context

Online check-in lets staff check in from a browser or mobile when working from home or at a client site. Unlike biometric check-in (handled by an external engine), online check-in must:

1. Be idempotent: if the user already has a check-in row for today, return the existing row — don't create a duplicate
2. Validate against the user's registered RRule work schedule (BR-08): if today is a scheduled in-office day, the online check-in is a violation (`inAccordance = false`)
3. When a violation occurs, emit a domain event `AttendanceViolationDetected` (replaces the legacy `sendMailNotification` direct-call pattern)
4. Compute late, lack, and work_time at the moment of check-in using the user's current work-time config
5. Set `checkOut` to the scheduled end-of-day time (projected) so the row has a reasonable in-office estimate

**check_in_type = 1** means online (as opposed to 0 = biometric).

---

## Source Reference

- `server/services/timesheet.js` — `checkInOnlineService` (lines 311–433)
- `server/services/timesheet.js` — `sendMailNotification` (lines 247–309) → SKIP; replaced by domain event
- `server/query/timesheet.js` — `checkUserCheckInQuery`, `checkInOnlineQuery`, `getUserWorkingTimeQuery`
- `server/query/memberSchedule.query.js` — `getMemberSchedule`

**Key logic to port:**

```
inAccordance = listSchedule.length === 0
// i.e., no scheduled occurrences today → user is online when they should be in office
// → inAccordance = false → violation
```

This logic is correct. Keep it exactly.

---

## Target Location

```
apps/api/src/modules/time/
  application/commands/
    check-in-online.command.ts
    check-in-online.handler.ts
    check-in-online.handler.spec.ts
  domain/events/
    attendance-violation-detected.event.ts
  infrastructure/repositories/
    drizzle-timesheet-entry.repository.ts   ← add insert + findTodayEntry
  interface/trpc/time.router.ts             ← add checkInOnline mutation
```

---

## Command Shape

```ts
export class CheckInOnlineCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string, // userId checking in
    public readonly comment?: string, // optional comment from the user
  ) {}
}
```

**Return type:** `TimesheetEntry` (the created or existing row)

---

## Handler Logic

```ts
@CommandHandler(CheckInOnlineCommand)
export class CheckInOnlineHandler implements ICommandHandler<CheckInOnlineCommand, TimesheetEntry> {
  constructor(
    @Inject(TIMESHEET_ENTRY_REPOSITORY)
    private readonly timesheetRepo: ITimesheetEntryRepository,
    private readonly peopleFacade: PeopleQueryFacade,
    private readonly eventBus: EventBus, // NestJS CQRS EventBus
  ) {}

  async execute(command: CheckInOnlineCommand): Promise<TimesheetEntry> {
    const today = new Date()
    const todayDate = today.toISOString().slice(0, 10) // YYYY-MM-DD

    // Step 1: Idempotency — if already checked in today, return existing row
    const existing = await this.timesheetRepo.findTodayEntry(command.actorId, command.tenantId)
    if (existing) return existing

    // Step 2: Get user's work-time config
    //   work-time is intra-module (time.*) — get via WorkTimeQueryService or repository
    //   The work_time table is owned by the work-time sub-module within time.
    //   Access via IWorkTimeRepository (injected) — see Cross-Module note below.
    const workTime = await this.workTimeRepo.findActiveForUser(command.actorId, command.tenantId)
    if (!workTime) {
      throw new NotFoundException(`Work-time config not found for user ${command.actorId}`)
    }

    // Step 3: Get user's RRule member schedule
    const schedule = await this.memberScheduleRepo.findActiveForUser(
      command.actorId,
      command.tenantId,
    )
    const workScheduleStr = schedule?.schedule ?? ''

    // Step 4: RRule validation (BR-08)
    let inAccordance = true
    if (workScheduleStr) {
      const rruleSet = RRule.fromString(workScheduleStr)
      const startOfDay = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      )
      const endOfDay = new Date(startOfDay.getTime() + 86_400_000)
      const occurrences = rruleSet.between(startOfDay, endOfDay)
      // If there are occurrences today, user SHOULD be in office → online check-in = violation
      inAccordance = occurrences.length === 0
    }

    // Step 5: Compute check-in time and projected check-out
    const checkInTime = new Date() // now (UTC)
    const checkOutTime = buildCheckOutTime(today, workTime.toTime) // today at toTime

    const inOfficeMs = Math.max(checkOutTime.getTime() - checkInTime.getTime(), 0)
    const inOffice = formatMs(inOfficeMs)

    // Step 6: Compute late / lack / work_time using AttendanceCalculator
    const late = getLate({
      startTime: workTime.fromTime,
      endTime: formatTimeFromDate(checkInTime),
      startBreakTime: workTime.startBreakTime,
      endBreakTime: workTime.endBreakTime,
    })
    const lack = getLack(late)
    const workTimeStr = getWorkTime({
      fromTime: workTime.fromTime,
      toTime: workTime.toTime,
      startBreakTime: workTime.startBreakTime,
      endBreakTime: workTime.endBreakTime,
      lack,
    })

    // Step 7: Persist
    const entry = await this.timesheetRepo.insert({
      tenantId: command.tenantId,
      userId: command.actorId,
      date: todayDate,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      actualIn: checkInTime,
      actualOut: checkOutTime,
      late,
      early: null, // no early at check-in time
      lack,
      workTime: workTimeStr,
      overTime: null, // computed later when actual check-out is known
      inOffice,
      comp: null,
      holidayId: null,
      inAccordance,
      workSchedule: workScheduleStr,
      checkInType: 'online',
      comment: command.comment ?? null,
      modifiedBy: command.actorId,
      modifiedDateTime: checkInTime,
    })

    // Step 8: Emit violation event if applicable
    if (!inAccordance) {
      this.eventBus.publish(
        new AttendanceViolationDetectedEvent({
          tenantId: command.tenantId,
          userId: command.actorId,
          date: todayDate,
          workSchedule: workScheduleStr,
          comment: command.comment ?? null,
          timesheetEntryId: entry.id,
        }),
      )
    }

    return entry
  }
}
```

---

## Domain Event

```ts
// domain/events/attendance-violation-detected.event.ts
export class AttendanceViolationDetectedEvent {
  constructor(
    public readonly payload: {
      tenantId: string
      userId: string // who violated
      date: string // YYYY-MM-DD
      workSchedule: string // RRule string for context
      comment: string | null // user's comment
      timesheetEntryId: string
    },
  ) {}
}
```

**Consumer:** An event handler in the `notifications` or `time` module (out of scope for this task) will read this event and emit an outbox event for email delivery. The violation event must be published via NestJS CQRS `EventBus` — it is then handled by any registered `IEventHandler<AttendanceViolationDetectedEvent>`.

**Do not implement the email sending in this task.** Create a stub event handler `OnAttendanceViolationHandler` that logs the event and has a TODO comment. The outbox integration is a separate concern.

---

## Cross-Module / Intra-Module Notes

- `work-time` and `member-schedule` are sub-modules of the same `time` module boundary. Their repositories may be injected directly into `CheckInOnlineHandler`.
- Do NOT import from `people/domain/` or `people/infrastructure/`. If you need user info for the violation event payload, use `PeopleQueryFacade`.
- The `rrule` npm package is already used by the legacy app. Add it to `apps/api` if not already present: `bun add rrule`.

---

## tRPC Procedure

```ts
checkInOnline: protectedProcedure
  .input(z.object({
    comment: z.string().max(500).optional(),
  }))
  .mutation(({ ctx, input }) =>
    svc().command(new CheckInOnlineCommand(ctx.tenantId, ctx.actorId, input.comment))
  ),
```

**Roles:** all authenticated users (staff, manager, hrm) — no special permission needed beyond authentication.

---

## Acceptance Criteria

- [ ] `CheckInOnlineCommand` and `CheckInOnlineHandler` created
- [ ] Handler returns existing entry without error when user already checked in today (idempotent)
- [ ] Handler throws `NotFoundException` when no work-time config found
- [ ] `inAccordance = false` when user has RRule occurrences today (in-office day, checking in online)
- [ ] `inAccordance = true` when user has no occurrences today (WFH day) or no schedule registered
- [ ] `AttendanceViolationDetectedEvent` published via EventBus when `inAccordance = false`
- [ ] `AttendanceViolationDetectedEvent` NOT published when `inAccordance = true`
- [ ] `late` computed correctly using `AttendanceCalculator.getLate` (BR-01 grace period applies)
- [ ] `lack` = `late` when no early departure at check-in time
- [ ] `checkInType` stored as `'online'` (integer 1 in DB, string in entity)
- [ ] `workSchedule` snapshot stored on the entry (RRule string at time of check-in)
- [ ] Stub `OnAttendanceViolationHandler` event handler created (logs only, with TODO comment)
- [ ] Unit spec covers: already checked in (idempotency), no work-time (throws), schedule violation, no schedule (no violation), happy path in-accordance
- [ ] tRPC mutation added under `time.attendance.checkInOnline`
- [ ] No `.js` extensions in relative imports
- [ ] No `moment` imports — use native Date
- [ ] `rrule` package added via `bun add rrule` if not present
