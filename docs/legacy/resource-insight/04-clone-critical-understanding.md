# Clone-Critical Understanding

This document captures the business behavior that must be preserved if the current system is cloned faithfully.

## Core Business Capabilities That Cannot Be Lost

- Structured performance review authoring for daily and monthly cycles.
- Project-specific assessments driven by project hierarchy, not only company hierarchy.
- Employee self-service access to received review feedback.
- Review operations control plane for admins: progress tracking, reminder sending, feedback sending, exports, and performance list curation.
- Reviewer-change request tracking with admin decision workflow.
- Local availability of employees, projects, and project memberships so review routing is operationally usable.

- Evidence:
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx`
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/backend/app/api/routes/reviewer_change_requests.py`

## Essential Workflows To Preserve

### Preserve The Two Review Modes

- Preserve org-line review and project-line review as separate user-facing workflows.
- Why it matters:
  - The system distinguishes between general reviewer responsibility and project-specific reporting responsibility.
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/evaluation-reports.tsx`
  - `resource-insight/frontend/src/routes/_layout/project-assessments.tsx`
  - `resource-insight/backend/app/services/submissions.py`

### Preserve Or Explicitly Resolve The Current Reviewer Queue Semantics

- Preserve the current reviewer queue behavior, or make an explicit product decision to change it before cloning.
- Why it matters:
  - `Evaluation Reports` currently pulls candidate employees using both direct-manager and project `reports_to` relationships, while `Project Assessments` separately handles project-scoped review and the current-submission loaders for `Evaluation Reports` only use direct-manager scope.
  - This is one of the most important areas where the current system’s business intent is not perfectly clean in code.
- Evidence:
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`
  - `resource-insight/frontend/src/components/MonthlyEvaluationTable.tsx`
  - `resource-insight/frontend/src/routes/_layout/project-assessments.tsx`

### Preserve Employee Self-Service As Read-Only Review Consumption

- Preserve the ability for employees to view review history without exposing the full scoring-editing surface.
- Why it matters:
  - `My Performances` currently emphasizes received feedback content rather than editable or full scorer detail.
- Evidence:
  - `resource-insight/frontend/src/components/MyPerformanceTable.tsx`
  - `resource-insight/frontend/src/components/Common/MyPerformanceEvaluationDetail.tsx`
  - `resource-insight/backend/app/services/submissions.py` with `is_my_performance=True`

### Preserve Admin Review Operations

- Preserve the admin workbench as an active cycle-management surface, not just CRUD admin.
- Why it matters:
  - The business relies on reminders, exports, manual performance lists, hierarchy maintenance, and feedback mailouts.
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/admin/active-user-management.tsx`
  - `resource-insight/frontend/src/components/UserManagement/Header.tsx`
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/backend/app/utils.py`

### Preserve Reviewer Change As A Tracked Workflow

- Preserve the request, status, notification, and admin decision trail even if reviewer mutation semantics are later clarified.
- Why it matters:
  - The organization already uses a formal request path instead of informal manager swapping.
- Evidence:
  - `resource-insight/frontend/src/components/ChangeManagerTable.tsx`
  - `resource-insight/frontend/src/components/UserManagement/ReviewerChangeRequestsAdminPage.tsx`
  - `resource-insight/backend/app/models/reviewer_change_request.py`

## Critical Business Rules To Preserve

### Submission Timing Rules

- Daily:
  - Only today or previous working day may be reviewed.
  - Previous working day closes after 18:00.
  - Weekend daily reviews are blocked.
- Monthly:
  - Review period must match a full calendar month.
  - Current month is allowed.
  - Previous month remains open only during the first 7 days of the next month.
- Why this cannot be lost:
  - These rules define the operational cadence of the review cycle and what counts as on-time review behavior.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/frontend/src/hooks/useDate.ts`

### Submission Uniqueness Rules

- Preserve one authoritative submission per employee-period-project slot.
- Why this cannot be lost:
  - History, progress tracking, and scoring all assume one review record per slot.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py`

### Criteria Completeness Rules

- Preserve the rule that submitted reviews are complete enough to be meaningful:
  - all main criteria required,
  - feedback required in the current UI flow,
  - evidence notes required before submission.
- Why this cannot be lost:
  - Business trust in the reviews depends on structured completeness, not partial comments.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`
  - `resource-insight/frontend/src/components/MonthlyEvaluationTable.tsx`

### Reviewer Routing Rules

- Preserve both routing sources:
  - company direct manager (`direct_manager_id`)
  - project reporting line (`project_members.reports_to_id`)
- Why this cannot be lost:
  - The system’s entire distinction between org review and project review depends on these relationships.
- Evidence:
  - `resource-insight/backend/app/models/employees.py`
  - `resource-insight/backend/app/models/project_members.py`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/submissions.py`

### Project Weighting Rules

- Preserve project-weight-aware scoring and leaderboard behavior.
- Preserve equal-weight fallback when all project weights are zero.
- Why this cannot be lost:
  - Multi-project employee scoring changes materially if allocation weighting is removed.
- Evidence:
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/backend/app/services/project_members.py`
  - `resource-insight/frontend/src/components/Leaderboard/TopPerformanceTab.tsx`

### Performance List Mutual Exclusion

- Preserve the rule that one employee cannot be both `TOP` and `WARNING` in the same month.
- Why this cannot be lost:
  - These lists are management classifications with business meaning, not casual tags.
- Evidence:
  - `resource-insight/backend/app/services/performance.py`
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`

## Essential Actors And Permission Boundaries

- Employee:
  - Must keep access to own review history, own project visibility, and own feedback submission.
- Leader / reviewer:
  - Must keep ability to author reviews, inspect authored history, and inspect subordinate results.
- PM / project lead:
  - Must keep project-scoped assessment capability and managed-project visibility.
  - The current UI also treats PMs as the primary requester role for reviewer-change requests.
- Admin / people-ops review operator:
  - Must keep review-cycle operations, data stewardship, approval, sync, export, and communication controls.
- External systems:
  - Must continue to provide identity and source data if the clone is intended to behave like today’s live system.

- Evidence:
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx`
  - `resource-insight/backend/app/api/routes/employees.py`
  - `resource-insight/backend/app/services/sso.py`
  - `resource-insight/backend/app/services/sheets.py`

## Key Domain Entities And State Models To Preserve

- Employee:
  - Preserve `active/inactive`, `admin`, `pm`, `direct_manager`, and `report_frequency`.
- Project:
  - Preserve `active/archived`.
- ProjectMember:
  - Preserve `role`, `reports_to`, and `weight`.
- Submission:
  - Preserve `pending/saved/submitted`, period dates, submitter, employee, project link, and project weight snapshot.
- SubmissionRecord:
  - Preserve criterion, rating level, and note/evidence.
- ReviewerChangeRequest:
  - Preserve requester, current reviewer, requested reviewer, reason, and status.
- Notification:
  - Preserve unread/read/deleted lifecycle.
- PerformanceList:
  - Preserve monthly top/warning designation.
- SiteConfig:
  - Preserve external source references and automation flags.

- Evidence:
  - `resource-insight/backend/app/models/employees.py`
  - `resource-insight/backend/app/models/projects.py`
  - `resource-insight/backend/app/models/project_members.py`
  - `resource-insight/backend/app/models/submissions.py`
  - `resource-insight/backend/app/models/feedbacks.py`
  - `resource-insight/backend/app/models/reviewer_change_request.py`
  - `resource-insight/backend/app/models/notifications.py`
  - `resource-insight/backend/app/models/performance.py`
  - `resource-insight/backend/app/models/configs.py`
  - `resource-insight/backend/app/models/models.py`

## Operational Processes That Appear Necessary

- Someone must keep the employee roster current.
- Someone must keep direct manager assignments current.
- Someone must keep project memberships and project `reports_to` chains current.
- Someone must maintain criteria and levels.
- Someone must monitor review completion and send reminders.
- Someone must decide who belongs in top/warning lists.
- Someone must send or monitor feedback-result delivery to employees.
- Someone must handle reviewer-change requests.

- Why this matters:
  - The business process is not fully self-healing. It relies on review operations stewardship.
- Evidence:
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/frontend/src/components/ProjectManagement/ProjectMembersModal.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/SheetConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/ProjectConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/CriteriaConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/LevelConfig.tsx`
  - `resource-insight/backend/app/cron_jobs/cron_jobs.py`

## External Dependencies That Materially Affect Behavior

- Google / Microsoft SSO:
  - Required for current login experience.
- Google Sheets:
  - Required for current source-data maintenance model.
- EMS webhook:
  - Required if current joiner/leaver behavior must remain.
- SMTP / email delivery:
  - Required for reminder, feedback, executive, and HR report flows.
- API-key consumer path:
  - May matter if other internal systems rely on review-derived user/project data.

- Evidence:
  - `resource-insight/backend/app/services/sso.py`
  - `resource-insight/backend/app/services/sheets.py`
  - `resource-insight/backend/app/api/routes/webhook.py`
  - `resource-insight/backend/app/utils.py`
  - `resource-insight/backend/app/api/deps.py`

## What Seems Configurable Vs Fixed

### Configurable

- Employee roster contents and direct manager assignments.
- Project list and project membership.
- Project manager designation and in-project `reports_to` relationships.
- Criteria and level definitions.
- Google Sheet IDs and ranges.
- BOD email list and automation flags.
- Which employees are manually placed into top/warning lists.

- Evidence:
  - `resource-insight/frontend/src/components/SiteSettings/SheetConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/ProjectConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/CriteriaConfigs.tsx`
  - `resource-insight/frontend/src/components/SiteSettings/LevelConfig.tsx`
  - `resource-insight/frontend/src/components/ProjectManagement/ProjectMembersModal.tsx`
  - `resource-insight/backend/app/models/configs.py`

### Fixed In Business Logic Today

- Daily review deadline behavior.
- First-7-days prior-month grace for monthly review.
- One submission per employee-period-project slot.
- Total project weight cap of 1.0 and equal-weight fallback when all weights are zero.
- Performance-list mutual exclusion.
- Role model based on `is_admin`, `is_pm`, plus relationship-derived leader status.
- Scheduled automation timings coded in cron jobs.
- Sidebar exposure of `Request Change Reviewer` only to PM users.

- Evidence:
  - `resource-insight/backend/app/services/submissions.py`
  - `resource-insight/backend/app/services/project_members.py`
  - `resource-insight/backend/app/services/performance.py`
  - `resource-insight/backend/app/cron_jobs/cron_jobs.py`
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx`

## What Is Still Unclear From The Repo

- Whether `Bi-weekly` reviews are still an active business requirement or a legacy mode retained in code.
- Whether `Evaluation Reports` is intentionally supposed to include project subordinates in addition to direct reports, or whether those users should exist only in `Project Assessments`.
- Whether approving a reviewer-change request is supposed to update the true reviewer relationship; current code only updates the request status.
- Whether project weights are intentionally hidden from admins now, or that UI is temporarily masking a still-important business concept.
- Whether the PM-only menu exposure for reviewer-change requests reflects the true business requester policy, or only a frontend shortcut.
- Whether the true upstream master for employees/projects is Google Sheets, EMS, or a mixed transition state.
- How much executive reporting actually depends on the top/warning lists versus weighted leaderboards alone.
- The precise meaning and operational use of `is_combined` criteria.
- The business consumer behind the API-key access path for `users-with-projects`.

- Evidence:
  - `resource-insight/backend/app/models/common.py`
  - `resource-insight/backend/app/api/routes/reviewer_change_requests.py`
  - `resource-insight/frontend/src/components/ProjectManagement/ProjectMembersModal.tsx`
  - `resource-insight/backend/app/services/sheets.py`
  - `resource-insight/backend/app/api/deps.py`

## Questions That Need Confirmation Before Cloning

1. Is `Bi-weekly` still part of live review operations, or should the faithful clone focus only on daily and monthly flows?
2. Should `Evaluation Reports` continue to include project subordinates, or should project-line review exist only inside `Project Assessments`?
3. When a reviewer-change request is approved, should the clone preserve the current behavior of status-tracking only, or should it also mutate reviewer ownership?
4. Is reviewer-change request creation truly a PM-only business action, or should any authenticated employee be allowed to request it?
5. Are project weights still a live business concept, despite being hidden in the current admin UI?
6. Which external source is currently authoritative for employees, projects, and project memberships: Google Sheets, EMS, or both?
7. Who is the business owner of criteria definitions and feedback taxonomy?
8. Are the cron schedules and current automation triggers business-approved rules, or implementation defaults that can move?
9. Are top/warning lists used only for visibility, or do they trigger downstream HR, performance, or compensation processes?

## Bottom Line

To clone this system faithfully, a team must reproduce it as a review operations application, not as a generic performance dashboard. The non-negotiables are reviewer routing, time-window rules, project-scoped review behavior, admin cycle operations, employee self-service history, and the surrounding reminder / feedback / export machinery that keeps the review process moving. The biggest remaining clarification items are mixed reviewer-queue semantics in `Evaluation Reports` and the true authority model behind reviewer-change approval.
