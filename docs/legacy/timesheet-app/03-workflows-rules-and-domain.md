# 03. Workflows, Rules, And Domain

## End-To-End Workflows

### 1. Daily Attendance And Online Check-In

- What happens: An employee opens `Timesheet`, reviews day-level attendance rows, and may perform `Online check in` with a comment when allowed.
- Who does it: Employee; manager and admin may later see the result, and warning emails can be sent.
- Conditions: The user must have an active session and working-time data. The button is disabled once the employee has checked in for the day. The button is hidden for full-week schedule cases in the UI.
- State changes: A `time_sheet` row is inserted or updated with date, check-in time, check-out target time, late, lack, work time, comment, `check_in_type`, `in_accordance`, and `work_schedule`.
- Business consequence: The day becomes an attendance record. If the check-in conflicts with the assigned work schedule, the day is flagged as invalid against schedule and warning mail is sent.
- Evidence: `src/pages/Timesheet/index.js`, `server/services/timesheet.js`, `server/query/timesheet.js`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`
- Confidence: `Confirmed`

### 2. Forget Request Workflow

- What happens: An employee requests correction of missing check-in and/or check-out information.
- Who does it: Employee creates; direct manager performs first-stage action; admin performs final action.
- Conditions: The request must not duplicate another non-rejected forget request for the same day. Monthly usage is limited. Employee editing and deletion are limited to `new` requests.
- State changes: A `request` row is created with status `new`; manager action sets first-stage fields and can move the request to `confirmed` or `rejected`; admin action can move it to `approved` or `rejected`.
- Business consequence: Attendance exceptions become traceable, commentable, and reviewable instead of informal.
- Evidence: `src/pages/Timesheet/index.js`, `src/pages/MyRequest/index.js`, `server/services/request.service.js`, `server/routes/request.js`, `src/state/modules/requests/reducer.js`
- Confidence: `Confirmed`

### 3. Late/Early Compensation Workflow

- What happens: An employee asks to offset lack time on one day by using overtime from another day.
- Who does it: Employee creates; direct manager confirms/rejects; admin approves/rejects.
- Conditions: The affected day must show lack time, the compensation day must have enough overtime, and monthly quotas apply.
- State changes: A `request` row is created; the affected `time_sheet` row gets a `comp` value; edits or deletion can clear and recompute that `comp` value; approval fields are updated through the two-stage review process.
- Business consequence: The business formally recognizes some late/early attendance gaps as compensable by other work performed.
- Evidence: `server/services/request.service.js`, `server/routes/request.js`, `src/pages/Timesheet/index.js`, `src/pages/MyRequest/index.js`
- Confidence: `Confirmed`

### 4. Leave Request Workflow

- What happens: An employee requests leave for a date/time range and reason.
- Who does it: Employee creates; direct manager confirms/rejects; admin approves/rejects.
- Conditions: The request must not overlap an existing non-rejected leave request of the same reason. Off-time must be at least one hour. The request must fit within remaining leave balance or carry-over balance, depending on the reason.
- State changes: A `request` row is created with calculated `off_time_hour`; on final approval, `user_leave.total_remain` or `user_leave.carry_over_remain` is reduced.
- Business consequence: Leave consumption becomes controlled by entitlement rather than informal manager agreement alone.
- Evidence: `src/components/DayLeavesComponents/DayLeavesCRUD.js`, `server/services/request.service.js`, `server/services/userLeave.service.js`, `server/routes/request.js`
- Confidence: `Confirmed`

### 5. Manager Review Workflow

- What happens: Managers review team requests from the `Approve Request` area.
- Who does it: Direct manager; line manager has visibility but not the same action rights in the manager UI.
- Conditions: The manager queue can include users where the current viewer is manager or line manager, but action buttons are disabled when the viewer is not the direct manager.
- State changes: Requests receive `approve_by`, `manager_comment`, and either `confirmed` or `rejected` status.
- Business consequence: The business preserves line-of-management accountability for first-stage approval.
- Evidence: `server/query/request.query.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ConfirmRequestComponent/ConfirmLeaveRequestComponent.js`, `server/routes/request.js`
- Confidence: `Confirmed`

### 6. Admin Review Workflow

- What happens: Admin reviews org-wide requests in the `Review Request` area after manager handling.
- Who does it: Admin
- Conditions: Final approval is where leave-balance deduction occurs for annual or carry-over leave types.
- State changes: Requests receive `confirm_by`, `admin_comment`, and final `approved` or `rejected` status. Approved leave also updates `user_leave`.
- Business consequence: The system keeps a centralized final gate over attendance and leave decisions.
- Evidence: `src/components/ReviewRequestComponent/ReviewJustificationComponent.js`, `src/components/ReviewRequestComponent/ReviewLeaveRequestComponent.js`, `server/routes/request.js`, `server/services/userLeave.service.js`
- Confidence: `Confirmed`

### 7. New User Setup Workflow

- What happens: Admin creates a new user with role and reporting-line data.
- Who does it: Admin
- Conditions: Badge number and email must be unique.
- State changes: New rows are created in `user`, `user_role`, `work_time`, and `user_leave`.
- Business consequence: A new employee is immediately provisioned for attendance, leave, and approval flows.
- Evidence: `server/routes/user.js`, `src/components/UserManagementComponent/UserCRUD.js`
- Confidence: `Confirmed`

### 8. Team Transfer Workflow

- What happens: An admin changes a user's manager assignment.
- Who does it: Admin, with follow-up actions expected from the new manager.
- Conditions: Triggered when the stored manager changes.
- State changes: The current active work schedule is set inactive. Emails are sent to the employee and new manager.
- Business consequence: The reporting line changes, and the employee is expected to receive a new work schedule from the new team.
- Evidence: `src/components/UserManagementComponent/UserCRUD.js`, `server/services/user.service.js`
- Confidence: `Confirmed`

### 9. Policy Maintenance Workflow

- What happens: Admin updates holidays, request reasons, user leave balances, and work-time definitions.
- Who does it: Admin
- Conditions: Duplicate holiday or reason conflicts are checked. Some changes cascade to attendance data.
- State changes: Holiday changes update related `time_sheet.holiday_id`; reason maintenance updates the policy catalog; leave maintenance updates yearly balances; work-time changes affect attendance and leave-hour calculations.
- Business consequence: Admin policy maintenance changes future operational behavior without redesigning the system.
- Evidence: `server/services/admin.service.js`, `server/routes/admin.js`, `server/routes/request.js`, `server/routes/userLeave.js`
- Confidence: `Confirmed`

### 10. Effective-Dated Work-Time Maintenance Workflow

- What happens: Admin manages a user's work-time history with dated intervals, working hours, and break windows.
- Who does it: Admin
- Conditions: Duplicate overlapping work-time definitions are blocked. The prior latest work-time row is automatically closed when a new later entry is created.
- State changes: `work_time` history is inserted, updated, or deleted; matching `time_sheet` rows can be recalculated from stored actual attendance values.
- Business consequence: A clone must preserve that working hours are managed as dated policy history, not as one static profile field.
- Evidence: `src/components/UserManagementComponent/WorkingScheduleSetting.js`, `server/services/admin.service.js`, `server/routes/admin.js`
- Confidence: `Confirmed`

## Business Rules And Constraints

| Rule                                                                                          | What it means in business terms                                                                                           | Evidence                                                                                                                                                                             | Confidence         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `request.status` is `new`, `confirmed`, `approved`, or `rejected`                             | Requests move through a staged review model, not a single binary approval                                                 | `flyway/sql/V1__baseline.sql`, `src/state/modules/requests/reducer.js`, `server/routes/request.js`                                                                                   | `Confirmed`        |
| Employee can edit or delete only while status is `new`                                        | Once the request enters review or is finalized, the employee loses direct control                                         | `src/pages/MyRequest/index.js`, `src/pages/DayLeaves/index.js`, `server/routes/request.js`                                                                                           | `Confirmed`        |
| Forget requests have a default monthly limit of 3                                             | The business explicitly caps missing-punch correction frequency                                                           | `server/helper/constants.js`, `server/services/request.service.js`                                                                                                                   | `Confirmed`        |
| Compensation requests have default limits of 6 request days and 3 compensation days per month | The business limits how often overtime can be used to offset attendance shortage                                          | `server/helper/constants.js`, `server/routes/request.js`, `server/services/request.service.js`                                                                                       | `Confirmed`        |
| Duplicate non-rejected forget and compensation requests are blocked                           | The same attendance problem should not be open multiple times simultaneously                                              | `server/services/request.service.js`, `server/query/request.query.js`                                                                                                                | `Confirmed`        |
| Leave requests of the same reason cannot overlap if not rejected                              | Overlapping leave for the same category is treated as invalid duplicate intent                                            | `server/query/request.query.js`, `server/services/request.service.js`                                                                                                                | `Confirmed`        |
| Leave duration must be at least one hour                                                      | Very short leave requests are not allowed                                                                                 | `src/components/DayLeavesComponents/DayLeavesCRUD.js`                                                                                                                                | `Confirmed`        |
| Weekend days are excluded from leave date selection and leave-hour calculation                | The system assumes standard Monday-Friday working patterns for leave consumption                                          | `src/components/DayLeavesComponents/DayLeavesCRUD.js`, `src/helper/helper.js`, `server/helper/calculation.js`                                                                        | `Confirmed`        |
| Late/early values under roughly six minutes are treated as zero                               | There is a grace threshold before lateness or early leave becomes business-significant                                    | `server/utils/timesheet.js`                                                                                                                                                          | `Confirmed`        |
| Carry-over leave is restricted to January-March                                               | Carry-over leave is treated as expiring early in the new year                                                             | `server/services/request.service.js`, `src/components/DayLeavesComponents/DayLeavesCRUD.js`                                                                                          | `Confirmed`        |
| Carry-over recalculation after March is ambiguous                                             | The repo encodes an `overThreeMonth` switch when month `>= 3`, which may not exactly match the January-March request rule | `server/routes/userLeave.js`, `server/services/userLeave.service.js`, `server/services/request.service.js`                                                                           | `Unknown`          |
| Direct manager and line manager are not equivalent                                            | Line managers can be included for visibility, but the direct manager is the intended first-stage approver                 | `server/query/request.query.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ConfirmRequestComponent/ConfirmLeaveRequestComponent.js` | `Confirmed`        |
| Wrong-schedule online check-in is flagged and notified                                        | Online check-in is not just attendance capture; it is also a compliance check against assigned schedule                   | `server/services/timesheet.js`, `src/pages/Timesheet/index.js`                                                                                                                       | `Confirmed`        |
| Manager schedule assignment rule differs from admin rule                                      | Managers must assign at least 3 weekdays, while admins can assign at least 1                                              | `src/components/UserManagementComponent/AddWorkSchedule.js`                                                                                                                          | `Confirmed`        |
| Manager review comment is required in the manager review modal                                | The current first-stage review process expects a comment, not just a status decision                                      | `src/components/ConfirmRequestComponent/CommentModalComponent.js`                                                                                                                    | `Confirmed`        |
| Admin review comment is captured but not always required in the admin justification modal     | The final review process records comment when supplied, but the UI does not require it everywhere                         | `src/components/ReviewRequestComponent/ConfirmReviewJustification.js`                                                                                                                | `Confirmed`        |
| Updating holidays changes affected timesheet rows                                             | Holidays are not passive reference data; they actively mark time-sheet rows in the date range                             | `server/services/admin.service.js`                                                                                                                                                   | `Confirmed`        |
| Updating working-time history can recalculate existing timesheet rows                         | Attendance metrics are recalculated when work-time policy changes over dates that already have attendance data            | `server/services/admin.service.js`                                                                                                                                                   | `Confirmed`        |
| Annual leave appears to have an additional "next 2 months" usage idea in the UI               | The UI communicates a forward-use restriction, but matching backend enforcement was not obvious in the inspected code     | `src/components/DayLeavesComponents/DayLeavesCRUD.js`                                                                                                                                | `Strong inference` |

## Permission And Role Boundaries

| Actor        | Business permissions                                                                                                        | Practical boundary                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Member       | Self-service attendance, justification, leave, profile, biometric registration                                              | Does not have manager/admin review or maintenance functions                                               |
| Manager      | Team timesheet visibility, first-stage request review, team-member schedule assignment                                      | Not the final approver; line-manager visibility does not automatically grant direct-manager review rights |
| Admin        | Final review, org-wide visibility, user administration, leave administration, holiday and reason policy maintenance, export | Functions as the highest-control operator role                                                            |
| Line manager | Visibility in some request retrieval logic and displayed in user data                                                       | Explicitly blocked from manager review action where they are not the direct manager                       |

Evidence: `src/helper/constants.js`, `server/middlewares/role-permission.js`, `server/query/request.query.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ConfirmRequestComponent/ConfirmLeaveRequestComponent.js`

Confidence: `Confirmed`

## Core Domain Entities And Their Meaning

| Entity               | Business meaning                                                 | Important business fields / behaviors                                                                                       | Confidence  | Evidence                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`               | Employee or internal actor record                                | badge number, role/title, manager, line manager, status, biometric URL, leave-related fields surfaced in UI                 | `Confirmed` | `flyway/sql/V1__baseline.sql`, `server/routes/user.js`, `src/components/UserInfoComponent/index.js`                                                                    |
| `role` / `user_role` | Role registry and role assignment                                | member, manager, admin                                                                                                      | `Confirmed` | `flyway/sql/V1__baseline.sql`, `src/helper/constants.js`, `server/routes/user.js`                                                                                      |
| `work_time`          | Dated working-hours policy for a person                          | start/end work, break window; used in attendance and leave-hour calculations                                                | `Confirmed` | `flyway/sql/V1__baseline.sql`, `server/utils/timesheet.js`, `server/helper/calculation.js`                                                                             |
| `work_schedule`      | Recurring weekday expectation for work-offline / office schedule | recurrence string, active/inactive state                                                                                    | `Confirmed` | `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`, `src/components/UserManagementComponent/AddWorkSchedule.js`, `server/services/memberSchedule.service.js` |
| `time_sheet`         | One day of attendance facts for one user                         | check-in/out, late, early, overtime, work time, lack, comp, holiday link, comment, work-from-home flag, schedule compliance | `Confirmed` | `flyway/sql/V1__baseline.sql`, `flyway/sql/V1_8__alter_time_sheet_table_add_fields.sql`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`                  |
| `request`            | Unified request object for leave and attendance exceptions       | request type, reason, status, approver identities, comments, dates, off-time hour                                           | `Confirmed` | `flyway/sql/V1__baseline.sql`, `server/routes/request.js`                                                                                                              |
| `request_type`       | Top-level request family                                         | forget, late/early compensation, leave                                                                                      | `Confirmed` | `server/helper/constants.js`, `server/routes/request.js`, `flyway/sql/V1__baseline.sql`                                                                                |
| `reason`             | Policy-controlled reason under a request type                    | name, max_request_day, description                                                                                          | `Confirmed` | `flyway/sql/V1__baseline.sql`, `server/routes/request.js`, `src/pages/RequestReasonSetting/index.js`                                                                   |
| `holiday`            | Holiday master data                                              | name, date range, duration, description                                                                                     | `Confirmed` | `flyway/sql/V1__baseline.sql`, `server/services/admin.service.js`, `src/pages/HolidaySetting/index.js`                                                                 |
| `user_leave`         | Yearly leave entitlement ledger for a user                       | total leave, remaining leave, carry-over, remaining carry-over, year                                                        | `Confirmed` | `flyway/sql/V1_7__create_user_leave_table.sql`, `server/services/userLeave.service.js`                                                                                 |
| `session`            | Async biometric workflow tracker                                 | `valid`, `complete`                                                                                                         | `Confirmed` | `flyway/sql/V1__baseline.sql`, `server/routes/auth.js`                                                                                                                 |
| `firebase`           | Device-token registry for notifications                          | user/token mapping                                                                                                          | `Confirmed` | `flyway/sql/V1__baseline.sql`, `server/routes/firebase.js`                                                                                                             |
| `bio_check_in_out`   | Raw external device check-in/out capture                         | check time, badge number, sensor                                                                                            | `Confirmed` | `flyway/sql/V1_6__create_bio_check_in_out_table.sql`, `server/routes/engine.js`, `server/query/engine.js`                                                              |

## Lifecycle / State Models

### Request Lifecycle

- `new`: employee-created and still awaiting review
- `confirmed`: manager-stage accepted and awaiting final admin action
- `approved`: final accepted state
- `rejected`: final or intermediate refusal state

Evidence: `flyway/sql/V1__baseline.sql`, `src/state/modules/requests/reducer.js`, `server/routes/request.js`

Confidence: `Confirmed`

### Work Schedule Lifecycle

- Active schedule exists for a user
- New assignment inactivates the previous schedule
- Deletion inactivates the current schedule

Evidence: `server/services/memberSchedule.service.js`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`, `server/services/user.service.js`

Confidence: `Confirmed`

### User Account Lifecycle

- Active user can authenticate and participate in workflows
- Inactive user is blocked from login and can later be recovered by admin
- Manager changes trigger team-transfer side effects

Evidence: `server/routes/auth.js`, `src/pages/UserManagement/index.js`, `server/services/user.service.js`

Confidence: `Confirmed`

### Leave Ledger Lifecycle

- User-year leave record is created at onboarding or via recalculation
- Leave balance is consumed on final leave approval
- Admin can update balances manually

Evidence: `server/routes/user.js`, `server/routes/userLeave.js`, `server/services/userLeave.service.js`

Confidence: `Confirmed`

## Operational / Back-Office Processes Implied By The Repo

- Admin or operations staff need to maintain holidays, reasons, and leave balances on an ongoing basis.
- Admin or operations staff need to maintain working-time history on an ongoing basis.
- Managers are expected to assign and refresh work schedules for their members, especially after a team move.
- The business likely relies on exported timesheet files outside the app.
- Email and push notifications are part of the real operating process, not just optional UI decoration.
- Biometric engine availability materially affects registration and biometric login workflows.
- Users and managers are actively prompted to finish required setup such as biometric registration and schedule assignment.

Evidence: `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`, `src/pages/UserLeaveManager/index.jsx`, `src/components/UserManagementComponent/WorkingScheduleSetting.js`, `server/services/user.service.js`, `src/pages/TimesheetAllUser/index.js`, `server/routes/firebase.js`, `server/routes/auth.js`, `src/containers/AuthenticatedContainer/index.js`

Confidence: `Confirmed`
