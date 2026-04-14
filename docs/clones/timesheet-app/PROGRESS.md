# Migration Progress: timesheet-app → future/time

**Source:** `/Users/canh/Projects/Seta/legacy/timesheet-app`
**Target:** `/Users/canh/Projects/Seta/future` — `apps/api/src/modules/time`
**Updated:** 2026-04-14

## Summary

| Phase       | Count        |
| ----------- | ------------ |
| Discovered  | 6 modules    |
| Refined     | 6 / 6        |
| Implemented | 0 / 21 tasks |
| Verified    | 0 / 21 tasks |

---

## Modules

### work-time — refined | 0/3 tasks done

| Task                                   | File                                                                 | Status  |
| -------------------------------------- | -------------------------------------------------------------------- | ------- |
| schema + entity + AttendanceCalculator | `modules/work-time/tasks/2026-04-14-001-schema-entity-calculator.md` | pending |
| commands (create, update, delete)      | `modules/work-time/tasks/2026-04-14-002-commands.md`                 | pending |
| query + tRPC router                    | `modules/work-time/tasks/2026-04-14-003-query-and-router.md`         | pending |

### holidays — refined | 0/2 tasks done

| Task                         | File                                                                | Status  |
| ---------------------------- | ------------------------------------------------------------------- | ------- |
| schema + entity + repository | `modules/holidays/tasks/2026-04-14-001-schema-entity-repository.md` | pending |
| handlers + tRPC router       | `modules/holidays/tasks/2026-04-14-002-handlers-and-router.md`      | pending |

### member-schedule — refined | 0/3 tasks done

| Task                          | File                                                                | Status  |
| ----------------------------- | ------------------------------------------------------------------- | ------- |
| schema + entity               | `modules/member-schedule/tasks/2026-04-14-001-schema-and-entity.md` | pending |
| commands (assign, deactivate) | `modules/member-schedule/tasks/2026-04-14-002-commands.md`          | pending |
| queries + TimeQueryFacade     | `modules/member-schedule/tasks/2026-04-14-003-queries.md`           | pending |

### attendance — refined | 0/5 tasks done

| Task                                   | File                                                           | Status  |
| -------------------------------------- | -------------------------------------------------------------- | ------- |
| schema + entity + AttendanceCalculator | `modules/attendance/tasks/2026-04-14-001-schema-and-entity.md` | pending |
| read queries (my/team/all timesheets)  | `modules/attendance/tasks/2026-04-14-002-read-queries.md`      | pending |
| export CSV                             | `modules/attendance/tasks/2026-04-14-003-export.md`            | pending |
| check-in online                        | `modules/attendance/tasks/2026-04-14-004-check-in-online.md`   | pending |
| recalculation event handler            | `modules/attendance/tasks/2026-04-14-005-recalculation.md`     | pending |

### leave — refined | 0/3 tasks done

| Task                                                 | File                                                       | Status  |
| ---------------------------------------------------- | ---------------------------------------------------------- | ------- |
| schema + domain entities                             | `modules/leave/tasks/2026-04-14-001-schema-and-domain.md`  | pending |
| commands (submit, approve, cancel, reasons, balance) | `modules/leave/tasks/2026-04-14-002-commands.md`           | pending |
| queries + tRPC router                                | `modules/leave/tasks/2026-04-14-003-queries-and-router.md` | pending |

### requests — refined | 0/5 tasks done

| Task                          | File                                                                     | Status  |
| ----------------------------- | ------------------------------------------------------------------------ | ------- |
| schema + entities             | `modules/requests/tasks/2026-04-14-001-schema-and-entities.md`           | pending |
| forget request commands       | `modules/requests/tasks/2026-04-14-002-forget-request-commands.md`       | pending |
| compensation request commands | `modules/requests/tasks/2026-04-14-003-compensation-request-commands.md` | pending |
| queries + quota               | `modules/requests/tasks/2026-04-14-004-queries-and-quota.md`             | pending |
| bulk update + tRPC router     | `modules/requests/tasks/2026-04-14-005-bulk-update-and-router.md`        | pending |
