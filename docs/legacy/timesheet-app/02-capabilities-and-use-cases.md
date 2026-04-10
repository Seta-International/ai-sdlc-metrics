# 02. Capabilities And Use Cases

## Employee Self-Service

### 1. Sign In To The Internal System

- Name: Sign in with badge number, password, and biometric image
- Business purpose: Let an active employee access the system using company identity data rather than public self-registration.
- Primary actor(s): Employee
- Trigger: User opens the sign-in page and attempts authentication.
- Main business flow: The user identifies themselves by badge number. They can authenticate with password, and the repository also supports biometric image-based login against a stored biometric reference.
- Outcome: An authenticated user session is created and the user is routed into role-based application areas.
- Exceptions / failure cases: Inactive users are denied. Wrong badge/password pairs are denied. Biometric login depends on stored biometric data and an external engine callback.
- Related screens / routes / entities: `/signin`, `user`, `session`, `biometric`
- Evidence from repo: `src/pages/Signin/index.js`, `server/routes/auth.js`, `flyway/sql/V1__baseline.sql`
- Confidence level: `Confirmed`

### 2. Register Or Re-register Biometric Identity

- Name: Register biometric profile
- Business purpose: Create or refresh the biometric identity record used for biometric login and related attendance workflows.
- Primary actor(s): Employee
- Trigger: User opens the biometric registration page from their profile area.
- Main business flow: The employee captures five face images, uploads them, and the system sends them through the external biometric engine. The resulting biometric reference is stored against the user.
- Outcome: The user has a refreshed biometric profile.
- Exceptions / failure cases: Fewer than five images are rejected. Engine processing can fail or return an invalid result. Users may need to retake images.
- Related screens / routes / entities: `/register_bimetric`, `biometric`, `session`, `user.biometric_url`
- Evidence from repo: `src/pages/RegisterBiometric/index.js`, `server/routes/auth.js`, `server/services/user.service.js`, `flyway/sql/V1__baseline.sql`
- Confidence level: `Confirmed`

### 3. Review Personal Attendance And Check In Online

- Name: View personal timesheet and perform online check-in
- Business purpose: Give employees day-level visibility into attendance and a way to record attendance when online check-in is allowed.
- Primary actor(s): Employee
- Trigger: User opens `My Timesheet`; on a valid day they may press `Online check in`.
- Main business flow: The employee sees daily entries with check-in, check-out, late, early, overtime, work time, lack, admin note, work-from-home flag, wrong-schedule warning, and request-related actions. If online check-in is available, the user can submit a work-from-home note/comment and create that day's check-in row.
- Outcome: The daily timesheet is visible and, when used, online attendance is recorded.
- Exceptions / failure cases: The check-in button is hidden for full-week schedule cases, disabled after the user already checked in, and fails when working time is missing. Wrong-schedule online check-ins are flagged and generate warning emails.
- Related screens / routes / entities: `/timesheet`, `time_sheet`, `work_time`, `work_schedule`
- Evidence from repo: `src/pages/Timesheet/index.js`, `src/components/WorkFromHomeModal/index.jsx`, `server/services/timesheet.js`, `server/query/timesheet.js`, `flyway/sql/V1_9__create_time_sheet_add_member_schedule.sql`
- Confidence level: `Confirmed`

### 4. Submit And Manage Forget Requests

- Name: Request correction for missing check-in or check-out
- Business purpose: Let employees formally explain missing attendance punches and request correction through the approval chain.
- Primary actor(s): Employee
- Trigger: A timesheet day has missing punches or related attendance gaps.
- Main business flow: The employee opens the forget-request modal from a timesheet row, enters comment and corrected times, and submits the request. The request then enters the approval workflow and later appears in `Justification`.
- Outcome: A new attendance-exception request is created and tracked by status.
- Exceptions / failure cases: Duplicate non-rejected requests are blocked. Monthly quota logic limits usage. The UI restricts how far back a request can be created. Approved or confirmed requests cannot be edited from the employee view.
- Related screens / routes / entities: `/timesheet`, `/request`, `request`, `time_sheet`
- Evidence from repo: `src/pages/Timesheet/index.js`, `src/pages/MyRequest/index.js`, `server/services/request.service.js`, `server/routes/request.js`, `server/helper/constants.js`
- Confidence level: `Confirmed`

### 5. Submit And Manage Late/Early Compensation Requests

- Name: Use overtime on another day to compensate late or early attendance loss
- Business purpose: Let employees offset attendance shortage with available overtime from a compensation day.
- Primary actor(s): Employee
- Trigger: A timesheet day shows lack time and the employee has an eligible overtime day.
- Main business flow: The employee opens the late/early modal, picks the affected day and a compensation date, adds a comment, and submits. The system checks available overtime and stores the linkage by updating the request and the affected timesheet row.
- Outcome: A compensation request enters the approval flow and reserves compensation time on the affected attendance day.
- Exceptions / failure cases: Duplicate non-rejected requests are blocked. Requests fail if the compensation day lacks enough overtime. Monthly request-day and compensation-day quotas apply. Approved or confirmed requests cannot be edited from the employee view.
- Related screens / routes / entities: `/timesheet`, `/request`, `request`, `time_sheet.comp`
- Evidence from repo: `src/pages/Timesheet/index.js`, `src/pages/MyRequest/index.js`, `server/services/request.service.js`, `server/routes/request.js`, `server/helper/constants.js`
- Confidence level: `Confirmed`

### 6. Submit And Manage Leave Requests

- Name: Request leave against leave balance and leave reason policy
- Business purpose: Let employees request leave within policy, reason, and entitlement constraints.
- Primary actor(s): Employee
- Trigger: User opens `My Leave` and creates or edits a leave request.
- Main business flow: The employee chooses start date/time, end date/time, reason, and comment. The system calculates off-time hours against working hours, checks remaining entitlement or reason limits, computes back-to-work date, and creates the request.
- Outcome: A leave request enters the approval flow with calculated off-time hours.
- Exceptions / failure cases: Duplicate overlapping leave requests are blocked. Off-time below one hour is rejected. Carry-over leave is limited to January through March. Leave exceeding remaining balance is rejected. Weekend days are excluded from date selection in the UI.
- Related screens / routes / entities: `/leaves`, `request`, `reason`, `user_leave`, `work_time`
- Evidence from repo: `src/pages/DayLeaves/index.js`, `src/components/DayLeavesComponents/DayLeavesCRUD.js`, `server/services/request.service.js`, `server/routes/request.js`, `server/services/userLeave.service.js`
- Confidence level: `Confirmed`

### 7. Manage Personal Profile And Credentials

- Name: Maintain personal profile details and security settings
- Business purpose: Let employees keep basic personal data current and manage access-related settings.
- Primary actor(s): Employee
- Trigger: User opens `Info`.
- Main business flow: The user can view identity and employment details, edit selected profile fields, change password, navigate to biometric registration, and reset local alert state.
- Outcome: User profile data or access settings are updated.
- Exceptions / failure cases: The page is edit-limited to selected fields; most employment attributes remain read-only.
- Related screens / routes / entities: `/info`, `user`
- Evidence from repo: `src/pages/Info/index.js`, `src/components/UserInfoComponent/index.js`, `server/routes/user.js`
- Confidence level: `Confirmed`

## Manager Oversight

### 8. Review Member Attendance

- Name: View member timesheets
- Business purpose: Give managers visibility into team attendance behavior and exceptions.
- Primary actor(s): Manager
- Trigger: Manager opens `Member Timesheet`.
- Main business flow: The manager filters member attendance by date and person and reviews attendance fields similar to the employee timesheet, including request overlays and wrong-schedule indicators.
- Outcome: The manager can monitor team attendance and identify cases needing review.
- Exceptions / failure cases: Visibility appears limited to the manager's team.
- Related screens / routes / entities: `/member-timesheet`, `time_sheet`, `user`
- Evidence from repo: `src/helper/constants.js`, `src/routeMap.js`, `server/services/timesheet.js`, `server/query/timesheet.js`
- Confidence level: `Confirmed`

### 9. Perform First-Stage Request Approval

- Name: Approve or reject team justification and leave requests
- Business purpose: Give the employee's direct manager the first formal review step before admin action.
- Primary actor(s): Manager
- Trigger: Manager opens `Approve Request` or receives request notifications.
- Main business flow: The manager reviews leave requests and justification requests in separate queues, adds a manager comment, and either confirms or rejects. Bulk review exists for at least justification requests.
- Outcome: The request moves from `new` to `confirmed` or `rejected`, or stays pending if untouched.
- Exceptions / failure cases: A line manager can appear in the queue but is explicitly blocked from taking the review action in the manager UI. Notification counts highlight outstanding items.
- Related screens / routes / entities: `/request-management`, `request`, `manager_comment`, `approve_by`
- Evidence from repo: `src/pages/ConfirmRequest/index.js`, `src/components/ConfirmRequestComponent/ConfirmJustificationComponent.js`, `src/components/ConfirmRequestComponent/ConfirmLeaveRequestComponent.js`, `server/routes/request.js`, `server/query/request.query.js`, `src/components/MyDrawer/DrawerSubcomponent.js`
- Confidence level: `Confirmed`

### 10. Maintain Team Work Schedules

- Name: Assign or remove work offline schedules for team members
- Business purpose: Define expected recurring office/offline attendance patterns that affect online check-in compliance.
- Primary actor(s): Manager, Admin
- Trigger: Manager or admin selects users in member/user management and opens schedule assignment.
- Main business flow: The reviewer chooses weekdays, stores the recurrence as a schedule rule, and replaces any existing active schedule. The system also warns when users or managers have missing schedules.
- Outcome: Each selected user has an active expected work schedule or an inactive one after removal.
- Exceptions / failure cases: Managers must choose at least three weekdays; admins can choose at least one. Moving users between teams deactivates the current schedule and prompts the new manager to create a new one.
- Related screens / routes / entities: `/member-management`, `/all-user`, `work_schedule`
- Evidence from repo: `src/components/UserManagementComponent/AddWorkSchedule.js`, `src/pages/MemberManagement/index.js`, `src/pages/UserManagement/index.js`, `server/services/memberSchedule.service.js`, `server/services/user.service.js`
- Confidence level: `Confirmed`

## Admin Operations

### 11. Perform Final Review Of Requests

- Name: Review organization-wide requests after manager stage
- Business purpose: Provide final business control over leave and attendance-exception requests.
- Primary actor(s): Admin
- Trigger: Admin opens `Review Request`.
- Main business flow: Admin reviews leave and justification queues, records admin comment, and approves or rejects after manager handling. For approved leave, the user's leave balance is reduced.
- Outcome: The request becomes `approved` or `rejected`, and leave entitlement is updated when applicable.
- Exceptions / failure cases: Entitlement updates can fail if remaining leave is insufficient at approval time.
- Related screens / routes / entities: `/user-request`, `request`, `admin_comment`, `confirm_by`, `user_leave`
- Evidence from repo: `src/pages/ReviewRequest/index.js`, `src/components/ReviewRequestComponent/ReviewJustificationComponent.js`, `src/components/ReviewRequestComponent/ReviewLeaveRequestComponent.js`, `server/routes/request.js`, `server/services/userLeave.service.js`
- Confidence level: `Confirmed`

### 12. Manage Users, Roles, And Team Assignment

- Name: Create, update, deactivate, recover, and transfer users
- Business purpose: Maintain the workforce roster and reporting structure that drives permissions and approval routing.
- Primary actor(s): Admin
- Trigger: Admin opens `User Management`.
- Main business flow: Admin creates users with role, manager, line manager, badge number, and identity/contact fields; edits existing users; can set inactive status or recover accounts; and can change manager assignment, which triggers a team-move process.
- Outcome: User master data, reporting lines, and account status are maintained.
- Exceptions / failure cases: Duplicate badge number or email is blocked. Team transfer triggers schedule deactivation and outbound notifications. Some admin-password actions are visibly restricted in the UI.
- Related screens / routes / entities: `/all-user`, `user`, `role`, `user_role`, `work_time`, `user_leave`
- Evidence from repo: `src/pages/UserManagement/index.js`, `src/components/UserManagementComponent/UserCRUD.js`, `server/routes/user.js`, `server/services/user.service.js`
- Confidence level: `Confirmed`

### 13. Manage Effective-Dated Working Hours

- Name: Maintain working-time history for each user
- Business purpose: Control the working-hour windows that attendance and leave calculations depend on.
- Primary actor(s): Admin
- Trigger: Admin opens a user's working-schedule history from user management.
- Main business flow: Admin creates, edits, or deletes dated work-time entries with start date, optional end date, start/end working hour, break window, and description. When a new entry is inserted, the previous latest entry is closed by setting its end date. Matching timesheet rows are recalculated from the new work-time definition.
- Outcome: The user has an effective-dated working-time history that drives attendance and leave-hour calculations.
- Exceptions / failure cases: Duplicate work-time ranges are blocked. Invalid date/time ranges are blocked in the UI. Recalculation depends on existing actual attendance values.
- Related screens / routes / entities: `/all-user`, `work_time`, `time_sheet`
- Evidence from repo: `src/components/UserManagementComponent/WorkingScheduleSetting.js`, `server/routes/admin.js`, `server/services/admin.service.js`
- Confidence level: `Confirmed`

### 14. Manage Leave Balances And Carry-Over

- Name: Maintain yearly employee leave balances
- Business purpose: Keep leave entitlements aligned with hiring date, current-year usage, and carry-over policy.
- Primary actor(s): Admin
- Trigger: Admin opens `User Leave Management` or runs leave recalculation.
- Main business flow: Admin lists leave records, can update balances manually, and can trigger recalculation/carry-over logic for all or selected users.
- Outcome: `user_leave` records hold total leave, remaining leave, carry-over, and carry-over remain for a user-year pair.
- Exceptions / failure cases: Carry-over behavior after March is encoded but not completely self-explanatory. Leave deduction only happens for specific leave-reason types on final approval.
- Related screens / routes / entities: `/user-leave`, `user_leave`
- Evidence from repo: `src/pages/UserLeaveManager/index.jsx`, `server/routes/userLeave.js`, `server/services/userLeave.service.js`, `flyway/sql/V1_7__create_user_leave_table.sql`
- Confidence level: `Confirmed`

### 15. Maintain Holidays And Request Reasons

- Name: Administer shared policy masters
- Business purpose: Keep the holiday calendar and request-reason catalog aligned with business policy.
- Primary actor(s): Admin
- Trigger: Admin opens `Holiday Setting` or `Request Reason Setting`.
- Main business flow: Admin creates, updates, filters, and deletes holiday definitions and request reasons. Holiday changes update related timesheet rows. Reason changes govern how requests are categorized and constrained.
- Outcome: Shared policy masters remain current and affect downstream request or attendance behavior.
- Exceptions / failure cases: Duplicate holiday overlap is blocked. Duplicate reason names within a request type are blocked. Deleting a reason nulls linked request references first.
- Related screens / routes / entities: `/holiday-setting`, `/request-reason-setting`, `holiday`, `reason`, `request_type`
- Evidence from repo: `src/pages/HolidaySetting/index.js`, `src/pages/RequestReasonSetting/index.js`, `server/routes/admin.js`, `server/services/admin.service.js`, `server/routes/request.js`
- Confidence level: `Confirmed`

### 16. View And Export Organization-Wide Attendance

- Name: Export user timesheets for downstream operations
- Business purpose: Give admin a consolidated attendance data set that can be consumed outside the app.
- Primary actor(s): Admin
- Trigger: Admin opens `User Timesheet` and uses export.
- Main business flow: Admin filters attendance across users and dates, views org-wide rows, and exports an Excel/XLSX file with attendance, overtime, leave/off-time, holiday, work-from-home, and invalid-check-in columns.
- Outcome: The organization gets a structured spreadsheet extract for downstream use.
- Exceptions / failure cases: Exact downstream consumer is not visible in the repo. Some export values are fixed or hardcoded.
- Related screens / routes / entities: `/user-timesheet`, `time_sheet`
- Evidence from repo: `src/pages/TimesheetAllUser/index.js`, `server/services/timesheet.js`, `server/query/timesheet.js`
- Confidence level: `Confirmed`

## External And Operational Integration Capabilities

### 17. Integrate With Biometric, Notification, And Email Infrastructure

- Name: Notify reviewers and support biometric/device workflows
- Business purpose: Connect the attendance process to external services that make the business flow operational.
- Primary actor(s): External engine/device, employee, manager, admin
- Trigger: Biometric registration/login, new request creation, request status change, wrong-schedule online check-in, or engine check-in event.
- Main business flow: The system exchanges data with the biometric engine, stores Firebase tokens for push notifications, sends email notifications for request and schedule events, and accepts external device check-in/out posts.
- Outcome: Attendance and approval activity reaches the right human actors and external device events can enter the system boundary.
- Exceptions / failure cases: These flows depend on external services and callbacks. The exact transformation from raw device events to final timesheet rows is not obvious from the inspected repo.
- Related screens / routes / entities: `session`, `biometric`, `bio_check_in_out`, `firebase`
- Evidence from repo: `server/routes/auth.js`, `server/routes/engine.js`, `server/routes/firebase.js`, `server/services/request.service.js`, `src/containers/AuthenticatedContainer/index.js`, `flyway/sql/V1_6__create_bio_check_in_out_table.sql`
- Confidence level: `Confirmed`
