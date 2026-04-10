# 01. Business Overview

## What The System Appears To Be

`timesheet-app` appears to be an internal workforce operations system for attendance tracking, attendance exception handling, leave management, approval routing, and related administrative controls. It is designed for desktop use, with separate views for employees, managers, and administrators.

Confidence: `Confirmed`

Evidence: `src/helper/constants.js`, `src/routeMap.js`, `src/App.js`, `src/pages/UnsupportedMobile/index.js`, `flyway/sql/V1__baseline.sql`, `flyway/sql/V1_7__create_user_leave_table.sql`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`

## Business Domain / Industry Context

The business domain is internal people operations / attendance management. The system sits between day-to-day employee attendance behavior and higher-control administrative processes such as leave entitlement tracking, holiday maintenance, request reason policy, and org-wide attendance export.

Confidence: `Confirmed`

Evidence: `src/pages/Timesheet/index.js`, `src/pages/DayLeaves/index.js`, `src/pages/ConfirmRequest/index.js`, `src/pages/ReviewRequest/index.js`, `src/pages/UserLeaveManager/index.jsx`, `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`, `src/pages/TimesheetAllUser/index.js`

## Core Business Problem Solved

The system solves a set of connected business problems:

- the company needs a daily attendance ledger per employee
- employees need a way to correct missing or late attendance events
- employees need a formal leave-request process tied to entitlement balances
- managers need a first-stage approval workflow for team requests
- admins need final review, policy maintenance, user maintenance, and exportable attendance data
- the business wants biometric identity support for login and attendance-related workflows

Confidence: `Confirmed`

Evidence: `server/routes/timesheet.js`, `server/routes/request.js`, `server/routes/userLeave.js`, `server/routes/auth.js`, `server/routes/engine.js`, `src/pages/MyRequest/index.js`, `src/pages/DayLeaves/index.js`, `src/pages/TimesheetAllUser/index.js`

## Target Users / Actors

| Actor                              | Business role in the system                                                                                                       | Confidence         | Evidence                                                                                                                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee / member                  | Views own timesheet, checks in online, submits justification and leave requests, manages own profile, registers biometric         | `Confirmed`        | `src/helper/constants.js`, `src/pages/Timesheet/index.js`, `src/pages/MyRequest/index.js`, `src/pages/DayLeaves/index.js`, `src/pages/RegisterBiometric/index.js`, `src/pages/Info/index.js`                                                                      |
| Manager                            | Reviews member timesheets, approves first-stage requests, manages team work schedules and member visibility                       | `Confirmed`        | `src/helper/constants.js`, `src/pages/ConfirmRequest/index.js`, `src/pages/MemberManagement/index.js`, `src/pages/TimesheetAllMember/index.js`                                                                                                                    |
| Line manager                       | Appears to have visibility into requests but is explicitly prevented from taking manager review action in the manager approval UI | `Confirmed`        | `flyway/sql/V1_10__add_line_manager_for_user.sql`, `server/query/request.query.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ConfirmRequestComponent/ConfirmLeaveRequestComponent.js`                           |
| Admin                              | Final reviewer and policy/operator role for users, holidays, request reasons, leave balances, and org-wide timesheet export       | `Confirmed`        | `src/helper/constants.js`, `src/pages/ReviewRequest/index.js`, `src/pages/UserManagement/index.js`, `src/pages/UserLeaveManager/index.jsx`, `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`, `src/pages/TimesheetAllUser/index.js` |
| External biometric engine / device | Supplies biometric validation and check-in/out events that materially affect authentication and attendance flows                  | `Confirmed`        | `server/routes/auth.js`, `server/routes/engine.js`, `server/services/engine.js`, `server/query/engine.js`                                                                                                                                                         |
| HR / payroll-style operator        | Not named as a separate role, but the admin role appears to carry these operational responsibilities                              | `Strong inference` | `src/pages/UserLeaveManager/index.jsx`, `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`, `src/pages/TimesheetAllUser/index.js`, `server/services/userLeave.service.js`                                                             |

## Business Value Provided

The system provides business value by turning attendance and leave handling into a controlled, reviewable workflow instead of an ad hoc manual process.

- Employees get self-service attendance visibility and formal request submission.
- Managers get queue-based team oversight and first-stage approval.
- Admins get policy controls, entitlement controls, and a single place to manage attendance operations.
- The business gets auditability through status-driven requests, comments, approver identities, and exports.

Confidence: `Confirmed`

Evidence: `src/pages/Timesheet/index.js`, `src/pages/MyRequest/index.js`, `src/pages/DayLeaves/index.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ReviewRequestComponent/ReviewLeaveRequestComponent.js`, `src/pages/TimesheetAllUser/index.js`

## Scope Boundaries

### Inside The System

- employee authentication by badge number, password, and biometric image
- biometric profile registration
- personal timesheet viewing
- online check-in / work-from-home check-in
- attendance exception requests for missing punches and late/early compensation
- leave request creation and entitlement checks
- first-stage manager review and final admin review
- user, schedule, holiday, reason, and leave-balance administration
- timesheet export

Confidence: `Confirmed`

Evidence: `server/routes/auth.js`, `server/routes/request.js`, `server/routes/timesheet.js`, `server/routes/user.js`, `server/routes/userLeave.js`, `server/routes/admin.js`, `server/routes/memberSchedule.js`, `src/routeMap.js`

### Outside Or Not Clearly Inside The System

- payroll calculation and payslip generation
- recruiting, performance, or broader HRIS functions
- accounting or invoicing
- mobile usage
- a complete downstream processing path from raw device punches to final daily timesheet rows

Confidence: `Strong inference`

Evidence: `src/App.js`, `src/pages/UnsupportedMobile/index.js`, `server/query/engine.js`, `flyway/sql/V1_6__create_bio_check_in_out_table.sql`, `src/pages/TimesheetAllUser/index.js`

Note: salary impact is referenced in warning email text, but an actual payroll-calculation implementation is not visible in the inspected repository.

Confidence: `Unknown`

Evidence: `server/services/timesheet.js`

## Major Business Concepts And Terminology

| Term                                  | Meaning in this system                                                                                                                           | Confidence         | Evidence                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timesheet                             | A daily attendance ledger row for one user and one date                                                                                          | `Confirmed`        | `flyway/sql/V1__baseline.sql`, `src/pages/Timesheet/index.js`                                                                                                  |
| Justification                         | Employee-submitted attendance exception request, covering at least forget and late/early compensation                                            | `Confirmed`        | `src/helper/constants.js`, `src/pages/MyRequest/index.js`, `server/helper/constants.js`                                                                        |
| My Leave                              | Employee leave request area tied to leave reasons and entitlement balances                                                                       | `Confirmed`        | `src/pages/DayLeaves/index.js`, `server/routes/request.js`, `server/services/userLeave.service.js`                                                             |
| Work Time                             | The dated working-hours definition used to calculate lateness, lack, overtime, and leave hours                                                   | `Confirmed`        | `flyway/sql/V1__baseline.sql`, `server/utils/timesheet.js`, `server/helper/calculation.js`, `src/components/UserManagementComponent/WorkingScheduleSetting.js` |
| Work Offline Schedule / Work Schedule | The weekday recurrence pattern used to decide whether online check-in is aligned with the user's expected schedule                               | `Confirmed`        | `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`, `src/components/UserManagementComponent/AddWorkSchedule.js`, `server/services/timesheet.js`      |
| Request Reason                        | A policy-controlled reason attached to a request type, including a maximum allowed request day count                                             | `Confirmed`        | `src/pages/RequestReasonSetting/index.js`, `server/routes/request.js`, `flyway/sql/V1__baseline.sql`                                                           |
| Carry-over leave                      | A leave type with January-to-March restrictions and a separate remaining balance                                                                 | `Confirmed`        | `server/helper/constants.js`, `server/services/request.service.js`, `src/components/DayLeavesComponents/DayLeavesCRUD.js`                                      |
| Confirm By / Review By                | UI labels for first-stage manager action and final admin action; the naming is inconsistent with field names but the two-stage workflow is clear | `Strong inference` | `src/pages/MyRequest/index.js`, `src/pages/DayLeaves/index.js`, `server/routes/request.js`, `flyway/sql/V1__baseline.sql`                                      |

## Major Conclusions And Confidence

| Conclusion                                                                                          | Confidence         | Why                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| This is an internal attendance and leave operations system, not a general HR platform               | `Confirmed`        | The route map, drawer, schema, and main screens all center on timesheets, requests, leave, users, holidays, reasons, and approvals |
| The system uses a two-stage approval model: manager first, admin final                              | `Confirmed`        | Request status handling, manager/admin screens, and update logic all encode this flow                                              |
| Admin likely acts as the business operations back office for attendance and leave                   | `Strong inference` | Admin owns org-wide review, export, leave balances, users, holidays, and reasons                                                   |
| The exported timesheet is likely consumed downstream for payroll or attendance control              | `Strong inference` | Export columns are payroll-style, and schedule-violation emails mention salary consequences                                        |
| Line manager is intentionally not equal to direct manager for first-stage approval                  | `Confirmed`        | Queries include line-manager visibility, but the review action is explicitly disabled when the reviewer is not the direct manager  |
| The exact payroll consequence of invalid online check-in is not fully knowable from this repo alone | `Unknown`          | Warning text exists, but no visible payroll engine or deduction workflow was found                                                 |

Evidence: `src/helper/constants.js`, `src/routeMap.js`, `server/routes/request.js`, `server/services/request.service.js`, `server/services/timesheet.js`, `src/pages/TimesheetAllUser/index.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`
