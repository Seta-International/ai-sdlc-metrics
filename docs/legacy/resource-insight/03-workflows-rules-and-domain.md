# Workflows, Rules, And Domain

## End-To-End Workflows

### 1. Daily Org-Line Review Workflow

- What happens:
  - A reviewer opens `Evaluation Reports`.
  - The system loads daily-frequency employees routed to that reviewer.
  - In current code, that queue is built from both `direct_manager_id` and project `reports_to_id` relationships.
  - The reviewer fills daily criteria, evidence, and feedback, then saves or submits.
- Who does it:
  - Leader / reviewer.
- What conditions apply:
  - Review is only allowed for employees whose `report_frequency` is `Daily`.
  - Daily submissions are allowed only for today or the previous working day.
  - Previous working day is only open before 18:00.
  - Daily submissions are not allowed on weekends.
- What state changes occur:
  - A `Submission` is created or updated.
  - `Submission.status` moves into `saved` or `submitted`.
  - `SubmissionRecord` rows are created, updated, or removed.
  - `Submission.total_point` is recalculated.
- What business consequence results:
  - The organization captures day-level review data and can track completion and results.
- Evidence:
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/submissions.py` method `create_or_update_submission`
  - `resource-insight/backend/app/helpers/time.py`

### 2. Monthly Org-Line Review Workflow

- What happens:
  - A reviewer opens `Evaluation Reports` in monthly mode.
  - The system loads monthly-frequency employees routed to that reviewer.
  - In current code, that queue is built from both `direct_manager_id` and project `reports_to_id` relationships.
  - Reviewer scores main and sub criteria, adds evidence and feedback, and submits or saves.
- Who does it:
  - Leader / reviewer.
- What conditions apply:
  - Review period must be the full month boundary.
  - Current month is always allowed.
  - Previous month remains open only during the first 7 days of the current month.
  - One monthly submission per employee per month per project is allowed.
- What state changes occur:
  - `Submission.from_date` and `Submission.to_date` are set.
  - Submission status becomes `saved` or `submitted`.
  - Criterion-level records are stored.
  - Total score is recomputed using criteria weights.
- What business consequence results:
  - The company gets a month-bounded performance record suitable for history, ranking, and feedback distribution.
- Evidence:
  - `resource-insight/frontend/src/components/MonthlyEvaluationTable.tsx`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/submissions.py` methods `_ensure_valid_monthly_period`, `_apply_current_month_date_filter`, `update_total_submission_points`

### 3. Project Assessment Workflow

- What happens:
  - A PM or project leader opens `Project Assessments`.
  - They select a project they manage or where people report to them.
  - They review only members in that project who report directly to them inside the project hierarchy.
  - They submit project-scoped daily or monthly assessments.
- Who does it:
  - PM, project lead, admin.
- What conditions apply:
  - Access requires admin status, PM membership, or direct `reports_to` authority in the project.
  - Reviewed employee must be assigned to the project.
  - Project frequency still has to match employee `report_frequency`.
- What state changes occur:
  - Project-linked `Submission` rows are created/updated with `project_id`.
  - `project_weight` is stored on the submission.
- What business consequence results:
  - Performance can be reviewed in the context of actual project reporting relationships, not only company hierarchy.
- Evidence:
  - `resource-insight/frontend/src/components/ProjectMonthlyEvaluationTable.tsx`
  - `resource-insight/frontend/src/components/ProjectDailyEvaluationTable.tsx`
  - `resource-insight/backend/app/services/submissions.py` methods `get_project_monthly_submissions`, `get_project_daily_submissions`, `create_or_update_submission`

### 4. Review Progress, Reminder, And Feedback Operations Workflow

- What happens:
  - Admin opens `Active Users`.
  - They inspect progress, filter by frequency and period, send reminder emails, send feedback emails to fully reviewed employees, export data, and maintain top/warning lists.
- Who does it:
  - Admin / people-ops review operator.
- What conditions apply:
  - Reminder recipients are derived from incomplete review status.
  - Feedback emails are only sent to employees whose review progress is complete.
  - Performance-list entries cannot conflict with the opposite list in the same month.
- What state changes occur:
  - `EmailLogs` are written for reminders and feedback sends.
  - `PerformanceList` rows are created or deleted.
  - Notifications may be emitted for some workflows.
- What business consequence results:
  - The review cycle is actively administered, not left to individual managers alone.
- Evidence:
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/frontend/src/components/Leaderboard/ReviewerTab.tsx`
  - `resource-insight/backend/app/api/routes/performance.py`
  - `resource-insight/backend/app/utils.py`

### 5. Reviewer Change Request Workflow

- What happens:
  - A requester identifies an employee, current reviewer, requested reviewer, and reason.
  - The request is recorded.
  - Admins are notified and later approve, reject, or delete the request.
  - Requester receives notification/email on status change.
- Who does it:
  - Requester, admin.
- What conditions apply:
  - Current reviewer is mandatory.
  - Only the requester may edit their own request.
  - Only admins may approve, reject, or delete.
- What state changes occur:
  - `ReviewerChangeRequest.status` moves `pending -> approved/rejected`.
  - `Notification` rows are created for admins and requesters.
- What business consequence results:
  - Reviewer changes become explicit, tracked, and reviewable rather than informal.
- Evidence:
  - `resource-insight/frontend/src/components/ChangeManagerTable.tsx`
  - `resource-insight/frontend/src/components/UserManagement/ReviewerChangeRequestsAdminPage.tsx`
  - `resource-insight/backend/app/api/routes/reviewer_change_requests.py`

### 6. Master-Data Stewardship And Sync Workflow

- What happens:
  - Admin configures sheet sources and sync actions in `Site Settings`.
  - Admin syncs employees, criteria, levels, projects, and project members.
  - Separate EMS webhook events can create or deactivate employees.
- Who does it:
  - Admin for sync and configuration.
  - External EMS for webhook creation/deactivation.
- What conditions apply:
  - Sync requires configured Google Sheet IDs/ranges.
  - Project-member sync validates referenced employees and projects.
  - Missing upstream data blocks sync.
- What state changes occur:
  - Local copies of `Employee`, `Project`, `ProjectMember`, `Criteria`, and `Level` are inserted, updated, or deactivated.
- What business consequence results:
  - The review application can operate with locally queryable roster and project data, even though source truth lives outside the app.
- Evidence:
  - `resource-insight/frontend/src/components/SiteSettings/SheetConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/ProjectConfigs.tsx`
  - `resource-insight/backend/app/services/sheets.py`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/api/routes/sites.py`
  - `resource-insight/backend/app/api/routes/webhook.py`

## Business Rules And Constraints

### Authentication And Access Rules

- A user can only log in if SSO returns an email that matches a locally active employee.
- `is_admin` is an explicit stored role.
- `is_pm` is an explicit stored flag and also reinforced by project membership role `PM`.
- `is_leader` is derived, not stored: it becomes true when someone has direct reports or project members reporting to them.
- Consequence:
  - Review access depends on both explicit role flags and relationship-derived authority.
- Evidence:
  - `resource-insight/backend/app/services/sso.py`
  - `resource-insight/backend/app/api/routes/employees.py` route `/me`
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx`

### Reviewer Queue Construction Rules

- `Evaluation Reports` currently draws daily and monthly employee queues from:
  - employees whose `direct_manager_id` equals the current user
  - employees who report to the current user through `project_members.reports_to_id`, filtered by matching frequency
- `Project Assessments` separately draws project-specific queues from managed projects and in-project reporting lines.
- The loaders for existing current submissions in `Evaluation Reports` query only direct-manager relationships.
- Consequence:
  - The current product mixes org and project routing in the evaluation queue, but not consistently across all loaders. A faithful clone must decide whether this asymmetry is intentional business behavior or technical drift.
- Evidence:
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/submissions.py` methods `get_current_submissions`, `get_current_monthly_submissions`
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`
  - `resource-insight/frontend/src/components/MonthlyEvaluationTable.tsx`
  - `resource-insight/frontend/src/routes/_layout/project-assessments.tsx`

### Reviewer-Change Access Rules

- The sidebar exposes `Request Change Reviewer` only to users with `is_pm = true`.
- The route for `/change-manager` and the create API for reviewer-change requests do not visibly enforce the same PM-only boundary.
- Consequence:
  - The business requester role is partially encoded in navigation but not cleanly enforced server-side, so the intended boundary is unclear.
- Evidence:
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx`
  - `resource-insight/frontend/src/routes/_layout/change-manager.tsx`
  - `resource-insight/backend/app/api/routes/reviewer_change_requests.py`

### Frequency Ownership Rule

- Every employee has one report frequency: `Daily`, `Bi-weekly`, or `Monthly`.
- A submission frequency must match the employee’s assigned report frequency.
- Consequence:
  - Review cadence is controlled per employee, not chosen ad hoc by the reviewer.
- Evidence:
  - `resource-insight/backend/app/models/common.py`
  - `resource-insight/backend/app/models/employees.py`
  - `resource-insight/backend/app/services/submissions.py`

### Daily Review Window Rules

- Daily reviews are only valid for today or the previous working day.
- Previous working day is only open before 18:00.
- Weekend daily submissions are blocked.
- Consequence:
  - Daily reviews behave like an operational close process, not an open historical ledger.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/backend/app/helpers/time.py`
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`

### Monthly Review Window Rules

- Monthly reviews must represent the full calendar month.
- Reviewers can submit current month reviews.
- Previous month remains valid only during the first 7 days of the current month.
- Consequence:
  - Monthly reviews have a formal cutoff and grace period.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/frontend/src/hooks/useDate.ts`
  - `resource-insight/frontend/src/components/MonthlyEvaluationTable.tsx`

### Duplicate Prevention Rules

- One daily submission per employee, day, and project is allowed.
- One monthly submission per employee, month, and project is allowed.
- If one already exists, the system blocks a new one and may name the reviewer who already submitted it.
- Consequence:
  - The system behaves like a single authoritative review record per review slot.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py` method `create_or_update_submission`

### Criteria Completeness Rules

- On submit, all main criteria are required.
- The frontend additionally enforces that feedback criteria are present and notes are filled.
- Monthly scoring uses weighted main and sub criteria.
- Daily scoring uses the main criterion level point.
- Consequence:
  - A submitted review is meant to be complete and scoreable.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py` methods `_validate_records`, `update_total_submission_points`
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`
  - `resource-insight/frontend/src/components/MonthlyEvaluationTable.tsx`

### Project Membership And Hierarchy Rules

- A project review can only be created if the employee is a member of that project.
- `reports_to_id` must reference another member in the same project.
- PM or `reports_to` authority determines which project reviews a user can access.
- Consequence:
  - Project assessments are driven by project structure, not by free selection.
- Evidence:
  - `resource-insight/backend/app/services/project_members.py`
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/frontend/src/components/ProjectManagement/ProjectMembersModal.tsx`

### Project Allocation Weight Rules

- Project members have a `weight` between `0.0` and `1.0`.
- Backend prevents an employee’s total project weights exceeding `1.0`.
- Submission scoring and leaderboards use `project_weight`.
- If all active project memberships for an employee have weight `0`, the backend redistributes equal weight across them.
- Consequence:
  - Multi-project employees are scored as weighted allocations, not simple averages.
- Evidence:
  - `resource-insight/backend/app/models/project_members.py`
  - `resource-insight/backend/app/services/project_members.py`
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/frontend/src/components/Leaderboard/TopPerformanceTab.tsx`

### Performance List Rules

- Admins can manually classify employees into `TOP` or `WARNING`.
- An employee cannot be in both lists in the current month.
- The UI also checks whether they were already in the same list in a previous period and prompts for confirmation.
- Consequence:
  - Top/warning lists are curated management designations, not purely computed leaderboard output.
- Evidence:
  - `resource-insight/backend/app/models/performance.py`
  - `resource-insight/backend/app/services/performance.py`
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`

### Reminder / Feedback Send Rules

- Reminder emails are targeted at reviewers with incomplete reviews.
- Feedback result emails are targeted at employees with completed monthly reviews and available feedback criteria.
- Email sends are logged by sender, receiver, month, and type.
- Consequence:
  - Communication workflows are operationally controlled and intended to be deduplicated.
- Evidence:
  - `resource-insight/backend/app/models/emails_logs.py`
  - `resource-insight/backend/app/utils.py`
  - `resource-insight/frontend/src/components/Leaderboard/ReviewerTab.tsx`
  - `resource-insight/frontend/src/components/UserManagement/Header.tsx`

## Permission And Role Boundaries

| Actor                       | Business boundary                                                                                                                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee                    | Can access own review history, own project visibility, own settings, and own general feedback.                                                     | `resource-insight/frontend/src/components/Common/SidebarItems.tsx`, `resource-insight/backend/app/api/routes/employees.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Leader / reviewer           | Can review routed employees, see authored histories, inspect subordinate results, and view employee trend history for direct reports.              | `resource-insight/frontend/src/routes/_layout/evaluation-reports.tsx`, `resource-insight/backend/app/services/submissions.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PM / project lead           | Can review direct project reports inside a project. The current menu also exposes reviewer-change requests primarily to PM users.                  | `resource-insight/frontend/src/routes/_layout/project-assessments.tsx`, `resource-insight/frontend/src/components/Common/SidebarItems.tsx`, `resource-insight/backend/app/services/submissions.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Admin                       | Can manage users, roles, managers, projects, project members, configs, sync, reviewer-change decisions, reminders, exports, and performance lists. | `resource-insight/frontend/src/routes/_layout/admin/active-user-management.tsx`, `resource-insight/frontend/src/routes/_layout/admin/project-management.tsx`, `resource-insight/frontend/src/routes/_layout/admin/site-settings.tsx`, `resource-insight/frontend/src/routes/_layout/admin/reviewer-change-requests.tsx`, `resource-insight/backend/app/api/routes/employees.py`, `resource-insight/backend/app/api/routes/projects.py`, `resource-insight/backend/app/api/routes/project_members.py`, `resource-insight/backend/app/api/routes/sites.py`, `resource-insight/backend/app/api/routes/performance.py`, `resource-insight/backend/app/api/routes/reviewer_change_requests.py` |
| External identity providers | Authenticate users but do not decide authorization alone.                                                                                          | `resource-insight/backend/app/services/sso.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| External data sources       | Feed employees/projects/criteria/levels into the app but are not the review workflow surface.                                                      | `resource-insight/backend/app/services/sheets.py`, `resource-insight/backend/app/api/routes/webhook.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Core Domain Entities

| Entity                | Meaning                                                     | Key fields / states                                                                              | Evidence                                                         |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Employee              | Reviewable person and user account.                         | `is_active`, `is_admin`, `is_pm`, `direct_manager_id`, `report_frequency`                        | `resource-insight/backend/app/models/employees.py`               |
| Project               | Review-relevant work container.                             | `name`, `description`, `is_active`                                                               | `resource-insight/backend/app/models/projects.py`                |
| ProjectMember         | Employee’s assignment into a project and project hierarchy. | `role`, `weight`, `reports_to_id`                                                                | `resource-insight/backend/app/models/project_members.py`         |
| Criteria              | Review question/category.                                   | `criteria_type`, `evaluation_type`, `weight`, `is_combined`                                      | `resource-insight/backend/app/models/submissions.py`             |
| Level                 | Rating scale for a criterion.                               | `title`, `point`, `evaluation_type`                                                              | `resource-insight/backend/app/models/submissions.py`             |
| Submission            | Review instance.                                            | `status`, `frequency`, `submitted_by_id`, `project_id`, `project_weight`, `from_date`, `to_date` | `resource-insight/backend/app/models/submissions.py`             |
| SubmissionRecord      | Criterion-level answer within a review.                     | `criteria_id`, `level_id`, `note`                                                                | `resource-insight/backend/app/models/models.py`                  |
| EmployeeFeedback      | General feedback submitted by an employee.                  | `type`, `content`, `owner_id`                                                                    | `resource-insight/backend/app/models/feedbacks.py`               |
| ReviewerChangeRequest | Request to swap reviewers.                                  | `status`, `reason`, `current_reviewer_id`, `requested_reviewer_id`, `requested_by_id`            | `resource-insight/backend/app/models/reviewer_change_request.py` |
| Notification          | In-app workflow alert.                                      | `receiver_id`, `message`, `status`, `link`, `is_deleted`                                         | `resource-insight/backend/app/models/notifications.py`           |
| PerformanceList       | Admin designation of top/warning employee.                  | `list_type`, `selection_date`                                                                    | `resource-insight/backend/app/models/performance.py`             |
| SiteConfig            | Operational settings and source-system references.          | sheet IDs/ranges, BOD emails, auto-send flags                                                    | `resource-insight/backend/app/models/configs.py`                 |
| EmailLog              | Audit of sent reminder/feedback emails.                     | `type`, `status`, `sender_id`, `receiver_id`, `sent_at`                                          | `resource-insight/backend/app/models/emails_logs.py`             |

## Lifecycle / State Transitions

### Submission

- `pending`: default or unstarted review slot.
- `saved`: draft review exists but is not final.
- `submitted`: final review counted in progress, history, and scoring.
- Evidence:
  - `resource-insight/backend/app/models/submissions.py`
  - `resource-insight/frontend/src/utils/options.ts`

### Reviewer Change Request

- `pending`: waiting for admin decision.
- `approved`: admin accepted the request.
- `rejected`: admin declined the request.
- Evidence:
  - `resource-insight/backend/app/models/reviewer_change_request.py`
  - `resource-insight/frontend/src/components/UserManagement/ReviewerChangeRequestsAdminPage.tsx`

### Notification

- `unread -> read`
- soft-deleted separately through `is_deleted`
- Evidence:
  - `resource-insight/backend/app/models/notifications.py`
  - `resource-insight/backend/app/services/notifications.py`

### Employee

- `is_active = true/false`
- Soft delete and restore are explicit admin actions.
- Evidence:
  - `resource-insight/backend/app/api/routes/employees.py`

### Project

- `is_active = true/false`
- Archive is the business action exposed in the API.
- Evidence:
  - `resource-insight/backend/app/api/routes/projects.py`
  - `resource-insight/backend/app/services/projects.py`

## External Dependencies That Affect Business Flow

- Google SSO and Microsoft SSO:
  - Needed for login.
  - Business effect: only emails known to the local employee roster may enter.
- Google Sheets:
  - Feeds employees, criteria, levels, projects, and project members.
  - Business effect: review routing and evaluation forms depend on these imports.
- EMS webhook:
  - Creates or deactivates employee records.
  - Business effect: joiners/leavers can be reflected without manual entry.
- SMTP / email service:
  - Sends reminders, feedback, and executive/HR reports.
  - Business effect: cycle operations rely on outbound email.
- API-key consumer:
  - `get_current_employee_or_api_key` suggests an external system can consume user/project review data.
  - Business effect: the app is not only a UI; it also exposes review-derived operational data outward.
- Evidence:
  - `resource-insight/backend/app/services/sso.py`
  - `resource-insight/backend/app/services/sheets.py`
  - `resource-insight/backend/app/api/routes/webhook.py`
  - `resource-insight/backend/app/api/deps.py`

## Operational / Back-Office Processes Implied By The Repo

- Admins or people-ops operators manually sync sheet-backed source data.
- Admins maintain direct managers and project hierarchies so reviewer routing stays accurate.
- Admins monitor incomplete review progress and chase reviewers using reminder emails.
- Admins choose who goes into top and warning performance lists.
- Admins send review-result feedback to employees after full review completion.
- Admins export monthly and daily submissions into Excel for downstream reporting.
- Scheduled jobs can automatically send reminder and report emails if enabled.
- Evidence:
  - `resource-insight/frontend/src/components/UserManagement/Header.tsx`
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/frontend/src/components/ReportProgress/ExportModal.tsx`
  - `resource-insight/backend/app/cron_jobs/cron_jobs.py`
