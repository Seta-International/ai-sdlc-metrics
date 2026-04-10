# Capabilities And Use Cases

## Access And Identity

### 1. SSO-Gated Access To The Review Workspace

- Business purpose: Allow approved employees to enter the review system using corporate identity providers.
- Primary actor(s): Employee, reviewer, PM, admin.
- Trigger: User opens the login page and clicks Google or Microsoft SSO.
- Main business flow:
  - User chooses an SSO provider.
  - Callback exchanges the code for identity data.
  - Backend matches the returned email to a locally active employee record.
  - System issues an access token and loads the current user profile.
- Outcome: Only locally recognized active employees can enter the review workspace.
- Exceptions / failure cases if visible:
  - Invalid code or callback state fails login.
  - Missing local employee record fails login with `Email not exist`.
  - Inactive employee is blocked.
- Related screens / routes / entities:
  - `/auth/login`
  - `/auth/sso/callback`
  - `Employee`
- Evidence:
  - `resource-insight/frontend/src/routes/auth/login.tsx`
  - `resource-insight/frontend/src/routes/auth/sso/callback.tsx`
  - `resource-insight/backend/app/api/routes/auth.py`
  - `resource-insight/backend/app/services/sso.py`
- Confidence: `Confirmed`

## Employee Self-Service

### 2. View My Performance History

- Business purpose: Let employees see reviews that have been submitted about them.
- Primary actor(s): Employee.
- Trigger: Employee opens `My Performances`.
- Main business flow:
  - Employee filters by project, frequency, and report date.
  - System returns submissions where the employee is the reviewed person.
  - Employee expands a row to read feedback details attached to that review.
- Outcome: Employee can track received reviews over time.
- Exceptions / failure cases if visible:
  - No history simply results in an empty table.
  - Employee-facing detail intentionally hides scoring/level detail and focuses on feedback text.
- Related screens / routes / entities:
  - `/my-performances`
  - `Submission`
  - `SubmissionRecord`
  - `Project`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/my-performances.tsx`
  - `resource-insight/frontend/src/components/MyPerformanceTable.tsx`
  - `resource-insight/frontend/src/components/Common/MyPerformanceEvaluationDetail.tsx`
  - `resource-insight/backend/app/services/submissions.py` method `get_user_performances`
- Confidence: `Confirmed`

### 3. View My Projects And Reporting Structures

- Business purpose: Let employees understand where they sit in company and project hierarchies.
- Primary actor(s): Employee, PM, leader.
- Trigger: User opens `My Projects & Org Charts`.
- Main business flow:
  - User views projects they belong to.
  - User can open project member lists with role, report frequency, and `reports_to` relationships.
  - User can inspect company org chart and project org chart visualizations.
- Outcome: Users can understand team structure and who reports to whom.
- Exceptions / failure cases if visible:
  - Empty states appear when no project is selected or a project has no members.
- Related screens / routes / entities:
  - `/my-projects`
  - `/org-chart`
  - `/project-org-chart`
  - `Project`
  - `ProjectMember`
  - `Employee`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/my-projects.tsx`
  - `resource-insight/frontend/src/components/MyProjects/ProjectTable.tsx`
  - `resource-insight/frontend/src/components/MyProjects/ProjectMembersViewModal.tsx`
  - `resource-insight/frontend/src/components/OrgChart/CompanyOrgChartPanel.tsx`
  - `resource-insight/frontend/src/components/OrgChart/ProjectOrgChartPanel.tsx`
- Confidence: `Confirmed`

### 4. Submit General Employee Feedback

- Business purpose: Capture employee feedback outside the formal review form.
- Primary actor(s): Employee.
- Trigger: User opens `My Feedbacks` and clicks `Add your feedback`.
- Main business flow:
  - User selects a feedback type.
  - User enters free-text content.
  - System stores the feedback under the current employee.
  - Admins can later review feedback across users.
- Outcome: The organization receives structured employee feedback of several types.
- Exceptions / failure cases if visible:
  - Type and content are both required before submission.
- Related screens / routes / entities:
  - `/employee-feedbacks`
  - `/admin/feedbacks`
  - `EmployeeFeedback`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/employee-feedbacks.tsx`
  - `resource-insight/frontend/src/utils/options.ts`
  - `resource-insight/backend/app/models/feedbacks.py`
  - `resource-insight/backend/app/api/routes/employees.py` routes `/me/feedbacks`, `/me/get-feedbacks`, `/admin/get-feedbacks`
- Confidence: `Confirmed`

## Review Authoring

### 5. Submit Daily Evaluations

- Business purpose: Let reviewers record day-level performance evaluations for the people currently routed to them.
- Primary actor(s): Leader / reviewer.
- Trigger: Reviewer opens `Evaluation Reports` on a daily reporting view.
- Main business flow:
  - System loads daily-frequency employees from the current reviewer queue.
  - In current code, that queue includes both direct reports and project subordinates who report to the reviewer.
  - Reviewer sees today’s review slot and, before 18:00, the previous working day’s slot.
  - Reviewer fills criteria, evidence, and feedback.
  - Reviewer can save draft or submit.
- Outcome: A daily review submission is stored and becomes part of history/progress.
- Exceptions / failure cases if visible:
  - Daily review cannot be submitted on weekends.
  - Previous working day can only be submitted before 18:00.
  - Duplicate submission for the same employee/day/project is blocked.
  - Submission requires all main criteria; UI also enforces feedback completion and notes.
  - The loader for existing current daily submissions only uses direct-manager relationships, so project-subordinate behavior on this screen is not fully symmetrical in code.
- Related screens / routes / entities:
  - `/evaluation-reports`
  - `Submission`
  - `Criteria`
  - `Level`
- Evidence:
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/submissions.py` methods `_validate_records`, `create_or_update_submission`, `_apply_date_filter_for_daily_report`
  - `resource-insight/backend/app/models/submissions.py`
- Confidence: `Confirmed`

### 6. Submit Monthly Evaluations

- Business purpose: Let reviewers record monthly performance evaluations on a full-month period basis for the people currently routed to them.
- Primary actor(s): Leader / reviewer.
- Trigger: Reviewer opens `Evaluation Reports` on a monthly reporting view.
- Main business flow:
  - System loads monthly-frequency employees routed to that reviewer.
  - In current code, that queue includes both direct reports and project subordinates who report to the reviewer.
  - Reviewer fills main criteria, sub criteria, and feedback criteria.
  - Reviewer saves or submits the month’s evaluation.
  - In the first week of a month, the UI also exposes the previous month’s review window.
- Outcome: A month-bounded evaluation is stored with `from_date` and `to_date`.
- Exceptions / failure cases if visible:
  - Monthly period must be the full calendar month boundary.
  - Only current month is allowed, except previous month is still open during the first 7 days.
  - Duplicate monthly submission for the same employee and month is blocked.
  - All main criteria are required on submit; UI additionally enforces feedback and evidence completeness.
  - The loader for existing current monthly submissions only uses direct-manager relationships, so project-subordinate behavior on this screen is not fully symmetrical in code.
- Related screens / routes / entities:
  - `/evaluation-reports`
  - `Submission`
  - `SubmissionRecord`
  - `Criteria`
  - `Level`
- Evidence:
  - `resource-insight/frontend/src/components/MonthlyEvaluationTable.tsx`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/submissions.py` methods `_ensure_valid_monthly_period`, `_apply_current_month_date_filter`, `create_or_update_submission`
  - `resource-insight/backend/app/models/submissions.py`
- Confidence: `Confirmed`

### 7. Submit Project-Based Team Assessments

- Business purpose: Let PMs or project leaders review people specifically within a project hierarchy.
- Primary actor(s): PM, project lead, admin.
- Trigger: User opens `Project Assessments` and chooses a managed project.
- Main business flow:
  - System lists projects where the user is PM or has project subordinates.
  - User selects a project.
  - System loads only members in that project who report directly to that user and match the selected frequency.
  - User writes and submits project-scoped reviews.
- Outcome: Reviews are stored against both employee and project, enabling project-weighted scoring and history.
- Exceptions / failure cases if visible:
  - Access is denied if the user is neither admin nor PM / project manager for the project nor a `reports_to` manager in that project.
  - Reviewed employee must be a member of the selected project.
  - The same daily/monthly timing and duplicate rules still apply.
- Related screens / routes / entities:
  - `/project-assessments`
  - `Project`
  - `ProjectMember`
  - `Submission.project_id`
  - `Submission.project_weight`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/project-assessments.tsx`
  - `resource-insight/frontend/src/components/ProjectMonthlyEvaluationTable.tsx`
  - `resource-insight/frontend/src/components/ProjectDailyEvaluationTable.tsx`
  - `resource-insight/backend/app/services/submissions.py` methods `get_project_monthly_submissions`, `get_project_daily_submissions`, `get_managed_projects`
- Confidence: `Confirmed`

## Review Visibility And Analysis

### 8. View Authored Review History

- Business purpose: Let a reviewer inspect the reviews they have authored.
- Primary actor(s): Leader / reviewer.
- Trigger: User opens `Report History`.
- Main business flow:
  - User optionally selects a project and filters by employee, date, frequency, or status.
  - System returns submissions where the current user is the submitter.
  - User expands a row to inspect full criteria, levels, points, and feedback.
- Outcome: Reviewer can audit or revisit past evaluations.
- Exceptions / failure cases if visible:
  - Statuses distinguish `submitted`, `pending`, and `saved`.
- Related screens / routes / entities:
  - `/report-histories`
  - `Submission.status`
  - `SubmissionRecord`
- Evidence:
  - `resource-insight/frontend/src/components/ReportHistoryTable.tsx`
  - `resource-insight/backend/app/services/submissions.py` method `get_submission_histories`
  - `resource-insight/frontend/src/utils/options.ts`
- Confidence: `Confirmed`

### 9. Inspect Subordinate Performance

- Business purpose: Let leaders inspect completed reviews for subordinates in project hierarchy.
- Primary actor(s): Leader, PM, admin.
- Trigger: User opens `Subordinator Performances`.
- Main business flow:
  - User optionally selects a managed project and filters by employee, leader, date, or frequency.
  - System returns submitted subordinate reviews together with the in-project leader relationship.
  - User expands rows to inspect detailed evaluations.
- Outcome: Leader can monitor results for people below them in the hierarchy.
- Exceptions / failure cases if visible:
  - Visibility is tied to project `reports_to` relationships, not only direct manager relationships.
- Related screens / routes / entities:
  - `/subordinator-performances`
  - `ProjectMember.reports_to_id`
  - `Submission`
- Evidence:
  - `resource-insight/frontend/src/components/SubordinatorPerformanceTable.tsx`
  - `resource-insight/backend/app/services/submissions.py` method `get_subordinator_performances`
- Confidence: `Confirmed`

### 10. View Employee Performance History Trends

- Business purpose: Let admins and managers inspect one employee’s historical monthly trend.
- Primary actor(s): Admin, direct manager.
- Trigger: User opens `Employee Performance History` for a target employee.
- Main business flow:
  - System authorizes only admins or that employee’s direct manager.
  - System groups monthly submissions into monthly, quarterly, or annual buckets.
  - User sees trend data built from submitted reviews.
- Outcome: Management can analyze performance patterns over time.
- Exceptions / failure cases if visible:
  - Non-admin, non-manager users are blocked.
  - Only submitted monthly reviews are used.
- Related screens / routes / entities:
  - `/employee-performance-history`
  - `/user-performance-history/{employee_id}`
  - `PerformanceDataPoint`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/employee-performance-history.tsx`
  - `resource-insight/backend/app/api/routes/submissions.py`
  - `resource-insight/backend/app/services/submissions.py` method `get_user_performance_history`
- Confidence: `Confirmed`

## Review Operations And Stewardship

### 11. Operate The Active Review Cycle

- Business purpose: Give admins a control plane for running the current review cycle.
- Primary actor(s): Admin / people-ops review operator.
- Trigger: Admin opens `Active Users`.
- Main business flow:
  - Admin filters by frequency and date/month.
  - Admin sees users, managers, project assignments, review progress, and action controls.
  - Admin can remind reviewers, send feedbacks to completed employees, export data, edit users, soft-delete users, and maintain top/warning lists.
- Outcome: Review operations can be actively managed instead of passively observed.
- Exceptions / failure cases if visible:
  - Feedback emails are only sent for selected employees who are fully reviewed.
  - Reminder and feedback emails are tracked in email logs to prevent repeated sends within a month.
  - Performance-list rules prevent an employee appearing in opposite lists in the same month.
- Related screens / routes / entities:
  - `/admin/active-user-management`
  - `PerformanceList`
  - `EmailLogs`
  - `SubmissionProgress`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/admin/active-user-management.tsx`
  - `resource-insight/frontend/src/components/UserManagement/Header.tsx`
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/frontend/src/components/Leaderboard/ReviewerTab.tsx`
  - `resource-insight/frontend/src/components/ReportProgress/ExportModal.tsx`
  - `resource-insight/backend/app/api/routes/performance.py`
  - `resource-insight/backend/app/utils.py`
- Confidence: `Confirmed`

### 12. Manage Users, Roles, Direct Managers, And Active Status

- Business purpose: Keep the employee review roster usable and correctly routed.
- Primary actor(s): Admin.
- Trigger: Admin works from `Active Users` or `Inactive Users`.
- Main business flow:
  - Admin adds or edits users.
  - Admin sets role to admin, project manager, or employee.
  - Admin updates direct manager.
  - Admin can soft-delete or restore users.
  - Admin can also sync employees from Google Sheets.
- Outcome: The local employee roster remains usable for review operations.
- Exceptions / failure cases if visible:
  - Only admins can change roles, direct managers, active status, or run sync.
  - Duplicate employee ID or email is blocked.
- Related screens / routes / entities:
  - `/admin/active-user-management`
  - `/admin/inactive-user-management`
  - `Employee`
- Evidence:
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/frontend/src/routes/_layout/admin/inactive-user-management.tsx`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/employees.py`
- Confidence: `Confirmed`

### 13. Manage Projects, Project Membership, And In-Project Reporting Lines

- Business purpose: Maintain the project structures that drive project assessments and project org charts.
- Primary actor(s): Admin.
- Trigger: Admin opens `Project Management`.
- Main business flow:
  - Admin creates or archives a project.
  - Admin adds/removes members.
  - Admin assigns member vs PM role.
  - Admin sets who each member reports to within the project.
  - System exposes project members back to users and project-assessment flows.
- Outcome: Project review hierarchy becomes operable.
- Exceptions / failure cases if visible:
  - Member cannot be added twice to the same project.
  - `reports_to_id` must refer to another member in the same project.
  - Backend enforces total project weight per employee not exceeding 1.0, though the current admin UI hides weight and sends `0`.
- Related screens / routes / entities:
  - `/admin/project-management`
  - `Project`
  - `ProjectMember`
- Evidence:
  - `resource-insight/frontend/src/components/ProjectManagement/Header.tsx`
  - `resource-insight/frontend/src/components/ProjectManagement/ProjectMembersModal.tsx`
  - `resource-insight/backend/app/services/project_members.py`
  - `resource-insight/backend/app/api/routes/project_members.py`
  - `resource-insight/backend/app/models/project_members.py`
- Confidence: `Confirmed`

### 14. Maintain Review Criteria, Levels, Data Sources, And Automation Settings

- Business purpose: Let admins steward review form definitions and upstream data connections.
- Primary actor(s): Admin.
- Trigger: Admin opens `Site Settings`.
- Main business flow:
  - Admin configures Google Sheet IDs/ranges for employees, criteria, levels, projects, and project members.
  - Admin configures BOD email list and auto-send flags.
  - Admin runs sync for criteria, levels, projects, and project members.
- Outcome: Review forms and imported operational data remain up to date.
- Exceptions / failure cases if visible:
  - Sync actions are only available when the relevant sheet settings exist.
  - Missing sheet configuration or data blocks sync.
- Related screens / routes / entities:
  - `/admin/site-settings`
  - `SiteConfig`
  - `Criteria`
  - `Level`
  - `Project`
  - `ProjectMember`
- Evidence:
  - `resource-insight/frontend/src/components/SiteSettings/SheetConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/ProjectConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/CriteriaConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/LevelConfig.tsx`
  - `resource-insight/backend/app/models/configs.py`
  - `resource-insight/backend/app/services/sheets.py`
  - `resource-insight/backend/app/api/routes/sites.py`
- Confidence: `Confirmed`

### 15. Request And Resolve Reviewer Changes

- Business purpose: Handle cases where the current reviewer should be replaced.
- Primary actor(s): PM or requester, admin.
- Trigger: User opens `Change Reviewer` and submits a request.
- Main business flow:
  - Requester selects target employee, current reviewer, new reviewer, and a reason.
  - System stores the request and notifies admins.
  - Admin reviews pending requests and approves, rejects, or deletes them.
  - Requester receives status email/notification.
- Outcome: Reviewer-change requests are tracked with audit-like status.
- Exceptions / failure cases if visible:
  - Requester can only edit their own request.
  - Current reviewer is required.
  - Primary navigation exposes this workflow only to `is_pm` users, but the route and create API do not visibly enforce the same PM-only restriction.
  - Current code updates the request status but does not visibly update the actual reviewer relationship in the same workflow.
- Related screens / routes / entities:
  - `/change-manager`
  - `/admin/reviewer-change-requests`
  - `ReviewerChangeRequest`
  - `Notification`
- Evidence:
  - `resource-insight/frontend/src/components/ChangeManagerTable.tsx`
  - `resource-insight/frontend/src/components/UserManagement/ReviewerChangeRequestsAdminPage.tsx`
  - `resource-insight/backend/app/api/routes/reviewer_change_requests.py`
  - `resource-insight/backend/app/services/reviewer_change_request_service.py`
- Confidence: `Confirmed` for the tracked-request workflow, `Unknown` for whether status approval is intended to update reviewer ownership automatically

## Automated And Scheduled Operations

### 16. Automated Reminder, Reporting, And Feedback Mailouts

- Business purpose: Reduce manual chasing and distribute review outputs on a schedule.
- Primary actor(s): System scheduler, admin as configuration owner.
- Trigger: Cron schedule and site-config flags.
- Main business flow:
  - Scheduler checks whether automation flags are enabled.
  - It sends missed-review reminders, BOD performance reports, employee monthly feedback reports, and HR submission exports on defined schedules.
- Outcome: Review communications and reports can run without a user manually triggering them each time.
- Exceptions / failure cases if visible:
  - Automations only run when corresponding site-config flags are enabled.
  - Some routines are conditional on reporting-cycle timing such as second reporting week.
- Related screens / routes / entities:
  - `SiteConfig`
  - `EmailLogs`
  - Scheduled jobs
- Evidence:
  - `resource-insight/backend/app/cron_jobs/cron_jobs.py`
  - `resource-insight/backend/app/models/configs.py`
  - `resource-insight/backend/app/utils.py`
- Confidence: `Confirmed`

## Workflow Coordination

### 17. Receive And Act On Workflow Notifications

- Business purpose: Keep reviewers, admins, and requesters aware of workflow events without relying only on email or manual checking.
- Primary actor(s): Reviewer, admin, requester.
- Trigger: System creates a notification; user opens the notification bell or receives a real-time event.
- Main business flow:
  - System stores a notification with actor, message, receiver, and linked destination.
  - User sees unread and read notification lists.
  - User opens a notification to navigate to the relevant workflow screen.
  - User can mark it as read or remove it from the inbox.
- Outcome: Business events such as reviewer-change actions become visible and actionable in-product.
- Exceptions / failure cases if visible:
  - Users can only read or delete their own notifications.
  - Notifications are soft-deleted rather than hard-removed.
- Related screens / routes / entities:
  - Header notification bell
  - `Notification`
- Evidence:
  - `resource-insight/frontend/src/components/Common/Notification.tsx`
  - `resource-insight/backend/app/api/routes/notifications.py`
  - `resource-insight/backend/app/services/notifications.py`
  - `resource-insight/backend/app/api/routes/reviewer_change_requests.py`
- Confidence: `Confirmed`
