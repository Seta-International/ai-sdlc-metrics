# 04. Clone-Critical Understanding

This section focuses on what must be preserved if another team rebuilds the system and needs to clone the existing business behavior rather than merely recreate a generic timesheet app.

## Core Business Capabilities That Cannot Be Lost

- Preserve the app as a combined attendance, leave, and approval system.
  The system is not just a clock-in UI. It combines daily attendance, attendance exceptions, leave requests, approvals, schedule compliance, and admin policy maintenance into one operating model.
  Evidence: `src/routeMap.js`, `src/helper/constants.js`, `server/routes/request.js`, `server/routes/timesheet.js`
  Confidence: `Confirmed`

- Preserve the employee self-service surface.
  Employees must be able to see their own timesheet, submit justification requests, submit leave requests, register biometric data, and manage selected profile/security settings.
  Evidence: `src/pages/Timesheet/index.js`, `src/pages/MyRequest/index.js`, `src/pages/DayLeaves/index.js`, `src/pages/RegisterBiometric/index.js`, `src/pages/Info/index.js`
  Confidence: `Confirmed`

- Preserve the manager oversight surface.
  Managers need member timesheet visibility, an approval queue, and the ability to assign work schedules to members.
  Evidence: `src/pages/TimesheetAllMember/index.js`, `src/pages/ConfirmRequest/index.js`, `src/pages/MemberManagement/index.js`
  Confidence: `Confirmed`

- Preserve the admin back-office surface.
  Admin needs org-wide review, timesheet export, user maintenance, leave-balance maintenance, holiday maintenance, and request-reason maintenance.
  Evidence: `src/pages/ReviewRequest/index.js`, `src/pages/TimesheetAllUser/index.js`, `src/pages/UserManagement/index.js`, `src/pages/UserLeaveManager/index.jsx`, `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`
  Confidence: `Confirmed`

## Essential Workflows To Preserve

- Preserve the two-stage request workflow.
  Employee requests are not complete after submission. The current business process is manager first, admin final. A clone that collapses this into one step would materially change business control.
  Evidence: `server/routes/request.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ReviewRequestComponent/ReviewLeaveRequestComponent.js`, `src/state/modules/requests/reducer.js`
  Confidence: `Confirmed`

- Preserve the distinction between request families.
  Forget requests, late/early compensation requests, and leave requests have different business rules, different validations, and different effects on data. They should not be treated as the same workflow with cosmetic differences.
  Evidence: `server/helper/constants.js`, `server/services/request.service.js`, `src/pages/Timesheet/index.js`, `src/components/DayLeavesComponents/DayLeavesCRUD.js`
  Confidence: `Confirmed`

- Preserve schedule-aware online check-in.
  Online check-in is not merely a convenience attendance action. It also checks compliance against assigned work schedule and can mark the day as invalid against policy.
  Evidence: `server/services/timesheet.js`, `src/pages/Timesheet/index.js`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`
  Confidence: `Confirmed`

- Preserve leave-balance deduction on final approval, not on submission.
  The repository deducts leave when approval is finalized. Moving that deduction earlier or later would change business behavior.
  Evidence: `server/routes/request.js`, `server/services/userLeave.service.js`
  Confidence: `Confirmed`

- Preserve onboarding side effects.
  Creating a user also creates working-time and leave-ledger state. A clone that only creates identity records would leave the user operationally incomplete.
  Evidence: `server/routes/user.js`
  Confidence: `Confirmed`

- Preserve effective-dated working-time history.
  The current system does not treat working hours as a single static preference. It keeps dated work-time records and recalculates matching time-sheet rows when those rules change.
  Evidence: `src/components/UserManagementComponent/WorkingScheduleSetting.js`, `server/services/admin.service.js`, `server/routes/admin.js`
  Confidence: `Confirmed`

## Critical Business Rules To Preserve

- Preserve request status semantics: `new`, `confirmed`, `approved`, `rejected`.
  These statuses are foundational to workflow, UI, and reporting.
  Evidence: `flyway/sql/V1__baseline.sql`, `src/state/modules/requests/reducer.js`, `server/routes/request.js`
  Confidence: `Confirmed`

- Preserve edit/delete restrictions to `new` requests only.
  This is part of the control model and prevents employees from changing records already in review.
  Evidence: `src/pages/MyRequest/index.js`, `src/pages/DayLeaves/index.js`, `server/routes/request.js`
  Confidence: `Confirmed`

- Preserve the direct-manager vs line-manager distinction.
  The current business intent appears to be: line manager may have visibility, but only the direct manager performs manager-stage approval.
  Evidence: `server/query/request.query.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ConfirmRequestComponent/ConfirmLeaveRequestComponent.js`
  Confidence: `Confirmed`

- Preserve monthly quota controls.
  Forget requests default to 3 per month; late/early compensation defaults to 6 request days and 3 compensation days per month.
  Evidence: `server/helper/constants.js`, `server/services/request.service.js`, `server/routes/request.js`
  Confidence: `Confirmed`

- Preserve time-calculation rules.
  The system includes a six-minute grace threshold for late/early calculations, excludes break time, and calculates leave hours against working time rather than naive wall-clock difference.
  Evidence: `server/utils/timesheet.js`, `server/helper/calculation.js`, `src/helper/helper.js`
  Confidence: `Confirmed`

- Preserve carry-over leave restrictions.
  Carry-over leave is a separate balance and is restricted to early-year use.
  Evidence: `server/helper/constants.js`, `server/services/request.service.js`, `src/components/DayLeavesComponents/DayLeavesCRUD.js`, `server/services/userLeave.service.js`
  Confidence: `Confirmed`

## Essential Actors And Permission Boundaries

- Member
  Must remain the self-service actor only, with access to own attendance, leave, requests, and profile-related operations.
  Evidence: `src/helper/constants.js`, `src/routeMap.js`
  Confidence: `Confirmed`

- Manager
  Must remain the first-stage approver and team operator, not the final approver.
  Evidence: `src/helper/constants.js`, `src/pages/ConfirmRequest/index.js`, `server/routes/request.js`
  Confidence: `Confirmed`

- Admin
  Must remain the final approver and business-operations controller for user, policy, and export functions.
  Evidence: `src/helper/constants.js`, `src/pages/ReviewRequest/index.js`, `src/pages/UserManagement/index.js`, `src/pages/TimesheetAllUser/index.js`
  Confidence: `Confirmed`

- Line manager
  Must be explicitly clarified before cloning, because the current repository gives them data visibility but blocks certain actions.
  Evidence: `flyway/sql/V1_10__add_line_manager_for_user.sql`, `server/query/request.query.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ConfirmRequestComponent/ConfirmLeaveRequestComponent.js`
  Confidence: `Confirmed`

## Key Domain Entities And State Models

- `time_sheet` must remain the daily source of truth for attendance behavior.
  It is the ledger that joins raw attendance facts, request consequences, holiday marking, work-from-home signaling, and schedule compliance.
  Evidence: `flyway/sql/V1__baseline.sql`, `flyway/sql/V1_8__alter_time_sheet_table_add_fields.sql`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`
  Confidence: `Confirmed`

- `request` must remain a unified object with type-specific behavior.
  The system depends on a common request object plus request-type-specific validations and effects.
  Evidence: `flyway/sql/V1__baseline.sql`, `server/services/request.service.js`, `server/routes/request.js`
  Confidence: `Confirmed`

- `user_leave` must remain a year-based entitlement ledger.
  It is not just a computed report; it is mutable operational state and can be edited or recalculated.
  Evidence: `flyway/sql/V1_7__create_user_leave_table.sql`, `server/routes/userLeave.js`, `server/services/userLeave.service.js`
  Confidence: `Confirmed`

- `work_time` and `work_schedule` must remain separate concepts.
  `work_time` defines hours and break windows for calculations. `work_schedule` defines expected weekdays for schedule compliance. Merging them would distort current business behavior.
  Evidence: `flyway/sql/V1__baseline.sql`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`, `server/services/timesheet.js`, `src/components/UserManagementComponent/AddWorkSchedule.js`
  Confidence: `Confirmed`

## Operational Processes That Appear Necessary

- Someone in the business must maintain policy masters.
  Holiday definitions and request reasons are active business controls and are not static fixtures.
  Evidence: `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`, `server/services/admin.service.js`, `server/routes/request.js`
  Confidence: `Confirmed`

- Someone in the business must maintain working-time policy history.
  User working hours are effective-dated and can retroactively affect time-sheet calculations over matching periods.
  Evidence: `src/components/UserManagementComponent/WorkingScheduleSetting.js`, `server/services/admin.service.js`
  Confidence: `Confirmed`

- Someone must maintain leave balances.
  The app includes both recalculation and manual leave editing, which implies an operational leave-administration process.
  Evidence: `src/pages/UserLeaveManager/index.jsx`, `server/routes/userLeave.js`, `server/services/userLeave.service.js`
  Confidence: `Confirmed`

- Managers must maintain work schedules.
  Missing schedules are surfaced as warnings, and team changes explicitly require new schedule assignment.
  Evidence: `src/containers/AuthenticatedContainer/index.js`, `server/services/user.service.js`, `server/services/memberSchedule.service.js`
  Confidence: `Confirmed`

- The exported org timesheet likely serves a downstream operational process.
  The export is delivered as an Excel/XLSX spreadsheet with payroll-style columns and should be treated as part of the system boundary until proven otherwise.
  Evidence: `src/pages/TimesheetAllUser/index.js`
  Confidence: `Strong inference`

## External Dependencies That Materially Affect Behavior

- External biometric engine
  Needed for biometric registration and biometric login behavior.
  Evidence: `server/routes/auth.js`, `server/services/user.service.js`
  Confidence: `Confirmed`

- External check-in/out source
  The repository accepts raw external check-in/out posts into `bio_check_in_out`, so external hardware or an external engine is part of the operating model.
  Evidence: `server/routes/engine.js`, `server/query/engine.js`, `flyway/sql/V1_6__create_bio_check_in_out_table.sql`
  Confidence: `Confirmed`

- Email and Firebase notification infrastructure
  Notifications are part of approval, warning, and team-transfer flows.
  Evidence: `server/routes/firebase.js`, `server/services/request.service.js`, `server/services/timesheet.js`, `server/services/user.service.js`
  Confidence: `Confirmed`

- Setup-state alerting inside the authenticated app shell
  Missing biometric setup and missing work-schedule setup are treated as active operational conditions that the UI surfaces to users and managers.
  Evidence: `src/containers/AuthenticatedContainer/index.js`
  Confidence: `Confirmed`

## What Seems Configurable Vs Fixed

### Configurable

- holiday dates and descriptions
- request reasons and max-request-day policy
- per-user working-time definitions
- per-user recurring work schedules
- yearly leave balances
- carry-over cap through environment configuration

Evidence: `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`, `src/components/UserManagementComponent/WorkingScheduleSetting.js`, `src/components/UserManagementComponent/AddWorkSchedule.js`, `server/services/userLeave.service.js`

Confidence: `Confirmed`

### Fixed Or Hard-Coded In Current Behavior

- role set: `member`, `manager`, `admin`
- request status names
- default forget quota of 3 per month
- default compensation quotas of 6 request days and 3 compensation days per month
- carry-over and annual-leave reason identifiers embedded in code
- desktop-only / mobile-unsupported behavior
- some export semantics and values, including fixed export columns and hardcoded department text
- spreadsheet export format and many downstream-facing column semantics

Evidence: `src/helper/constants.js`, `server/helper/constants.js`, `src/App.js`, `src/pages/UnsupportedMobile/index.js`, `src/pages/TimesheetAllUser/index.js`

Confidence: `Confirmed`

## What Is Still Unclear From The Repo

- Whether the "80% salary" consequence for wrong-schedule online check-in is merely a warning or is enforced by another downstream system
- The exact seeded catalog of request types and reasons, because usage is visible but seed data was not obvious in inspected migrations
- The exact business cutoff for carry-over expiry, because the request rule says January-March while leave recalculation code flips behavior when month `>= 3`
- The exact downstream consumer and strict contractual shape of the exported timesheet
- The exact process that turns raw external device punches into the daily `time_sheet` ledger, because raw capture is visible but the full consolidation path was not obvious
- Whether line-manager visibility-only behavior is intentional business policy or an implementation compromise

Evidence: `server/services/timesheet.js`, `server/services/request.service.js`, `server/routes/userLeave.js`, `server/services/userLeave.service.js`, `src/pages/TimesheetAllUser/index.js`, `server/query/engine.js`

Confidence: `Unknown`

## Questions That Need Confirmation Before Cloning

1. Is the manager/admin two-stage approval flow a mandatory business control, or can some cases be admin-only in production operations?
2. Should line managers remain visibility-only, or should they be true alternate approvers?
3. What exact leave-reason catalog and max-day policies are active in production?
4. What is the definitive carry-over expiry rule: end of February, end of March, or another cutoff?
5. Does the exported attendance file feed payroll, attendance auditing, or both?
6. Is the salary-impact warning for invalid online check-in enforced anywhere outside this repo?
7. What process ingests raw biometric/device punches into the timesheet ledger used by employees and admins?

These questions do not block understanding the current repository at a high level, but they do matter if the goal is a faithful business clone rather than a best-effort imitation.
