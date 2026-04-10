# Resource Insight Business Overview

## What The System Appears To Be

`resource-insight` is best understood as SETA's internal performance review operations system, branded in the product as `SETA Review`. It is not just a passive analytics dashboard. It is an operating surface for collecting manager reviews, handling project-based assessments, distributing feedback, tracking review completion, and running the administrative review cycle.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/backend/app/core/config.py` sets `PROJECT_NAME = "Seta Review"`.
  - `resource-insight/frontend/src/routes/auth/login.tsx` welcomes users to `SETA Review`.
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx` exposes review-centric modules such as `My Performances`, `Evaluation Reports`, `Project Assessments`, `Report History`, `Request Change Reviewer`, `Active User`, and `Reviewer Change Requests`.
  - `resource-insight/backend/app/services/submissions.py` contains the workflow logic for submission timing, reviewer scope, project weighting, exports, leaderboards, and feedback delivery.

## Business Domain / Industry Context

The system sits in internal People Ops / HR performance management. It manages employee reviews inside a services company with projects, project managers, reporting hierarchies, and executive reporting needs.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/README.md` describes employee performance management, evaluation, feedback, reporting, and organizational insights.
  - `resource-insight/backend/app/models/employees.py`, `projects.py`, and `project_members.py` model employees, projects, reporting lines, PM roles, and report frequency.
  - `resource-insight/backend/app/models/configs.py` includes BOD email distribution and review automation flags.
  - `resource-insight/backend/app/cron_jobs/cron_jobs.py` sends executive-style performance reports and HR-facing exports.

## Core Business Problem Solved

The system solves the problem of running structured performance reviews across both company hierarchy and project hierarchy.

It gives SETA one place to:

- identify who should review whom,
- collect daily and monthly evaluations,
- capture qualitative feedback,
- track completion and follow-up,
- surface top and warning lists,
- send reminders and feedback communications,
- and keep employees able to see their own review history.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/backend/app/models/submissions.py` defines review submissions, criteria, levels, frequencies, and statuses.
  - `resource-insight/backend/app/services/submissions.py` enforces submission windows, duplicate prevention, project membership, weighting, progress tracking, history, and leaderboard calculations.
  - `resource-insight/frontend/src/components/DailyEvaluationTable.tsx`, `MonthlyEvaluationTable.tsx`, `ProjectDailyEvaluationTable.tsx`, and `ProjectMonthlyEvaluationTable.tsx` implement review authoring flows.
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx` and `Leaderboard/ReviewerTab.tsx` implement reminder sending, feedback sending, and performance-list operations.

## Target Users / Actors

### Employees

Employees use the system to sign in, see reviews written about them, inspect their projects and reporting structures, and submit general feedback.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/my-performances.tsx`
  - `resource-insight/frontend/src/components/MyPerformanceTable.tsx`
  - `resource-insight/frontend/src/components/Common/MyPerformanceEvaluationDetail.tsx`
  - `resource-insight/frontend/src/routes/_layout/employee-feedbacks.tsx`
  - `resource-insight/frontend/src/routes/_layout/my-projects.tsx`

### Reviewers / Line Managers

Leaders review employees routed to them, inspect authored history, see subordinate performance, and may receive reminder emails when reviews are incomplete.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/evaluation-reports.tsx`
  - `resource-insight/frontend/src/routes/_layout/report-histories.tsx`
  - `resource-insight/frontend/src/routes/_layout/subordinator-performances.tsx`
  - `resource-insight/backend/app/api/routes/employees.py` for `target` values `daily-report`, `monthly-report`, and leader detection in `/me`
  - `resource-insight/backend/app/utils.py` reminder generation and email logging

### Project Managers / Project Leads

PMs or project leaders review team members inside project hierarchies, inspect managed projects, and can request reviewer changes.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx` exposes `Request Change Reviewer` only when `is_pm` is true.
  - `resource-insight/frontend/src/routes/_layout/project-assessments.tsx`
  - `resource-insight/frontend/src/components/ProjectMonthlyEvaluationTable.tsx`
  - `resource-insight/frontend/src/components/ProjectDailyEvaluationTable.tsx`
  - `resource-insight/frontend/src/routes/_layout/change-manager.tsx`
  - `resource-insight/backend/app/services/submissions.py` methods `get_project_monthly_submissions`, `get_project_daily_submissions`, and `get_managed_projects`

### Admin / People Ops Review Operators

Admins operate the review cycle, maintain users and projects, manage reviewer-change requests, sync master-like data from Google Sheets, send reminders and feedback emails, classify top/warning employees, and export review data.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/frontend/src/routes/_layout/admin/active-user-management.tsx`
  - `resource-insight/frontend/src/components/UserManagement/Header.tsx`
  - `resource-insight/frontend/src/components/UserManagement/UserTable.tsx`
  - `resource-insight/frontend/src/routes/_layout/admin/project-management.tsx`
  - `resource-insight/frontend/src/routes/_layout/admin/site-settings.tsx`
  - `resource-insight/frontend/src/routes/_layout/admin/reviewer-change-requests.tsx`
  - `resource-insight/backend/app/api/routes/performance.py`
  - `resource-insight/backend/app/api/routes/sites.py`
  - `resource-insight/backend/app/api/routes/employees.py`

### Executives / BOD / HR Recipients

Executives and HR are not primary interactive users in the UI, but the system clearly serves them through email reports and export outputs.

- Confidence: `Strong inference`
- Evidence:
  - `resource-insight/backend/app/models/configs.py` contains `bod_email_list`.
  - `resource-insight/backend/app/cron_jobs/cron_jobs.py` sends performance reports to BOD emails and submission exports to `HR_EMAILS`.
  - `resource-insight/backend/app/utils.py` generates executive-style performance and feedback report emails.

## Value The System Provides

- A shared review workspace for employees, leaders, PMs, and admins.
- Structured evaluation forms with criteria and levels instead of ad hoc narrative review.
- Support for both org-line and project-line review responsibilities.
- Self-service access to received feedback and project/org visibility.
- Administrative control over progress, reminders, exports, and monthly classifications.
- A review history that can be searched by employee, project, date, frequency, and status.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/frontend/src/components/Common/SidebarItems.tsx`
  - `resource-insight/frontend/src/components/Common/EvaluationDetail.tsx`
  - `resource-insight/frontend/src/components/Common/MyPerformanceEvaluationDetail.tsx`
  - `resource-insight/frontend/src/components/ReportHistoryTable.tsx`
  - `resource-insight/frontend/src/components/SubordinatorPerformanceTable.tsx`
  - `resource-insight/frontend/src/components/OrgChart/CompanyOrgChartPanel.tsx`
  - `resource-insight/frontend/src/components/OrgChart/ProjectOrgChartPanel.tsx`

## Scope Boundaries

### Inside The System

- Employee review submissions and their records.
- Review criteria, levels, and feedback fields.
- Reviewer routing based on direct manager and project `reports_to` relationships.
- Project-scoped assessments and project org charts.
- Employee self-service review history.
- General employee feedback intake.
- Reviewer-change request tracking.
- Notifications, reminder emails, feedback emails, exports, and performance lists.
- Local copies of employees, projects, and project memberships needed to run review workflows.

- Confidence: `Confirmed`
- Evidence:
  - `resource-insight/backend/app/models/models.py`
  - `resource-insight/backend/app/models/submissions.py`
  - `resource-insight/backend/app/models/feedbacks.py`
  - `resource-insight/backend/app/models/reviewer_change_request.py`
  - `resource-insight/backend/app/models/notifications.py`
  - `resource-insight/backend/app/models/performance.py`

### Outside Or Upstream Of The System

- Enterprise identity providers are external; this app only consumes Google/Microsoft SSO.
- Employee and project source data are not purely native to this app; they are imported via Google Sheets and a limited EMS webhook.
- Payroll, timesheets, recruiting, and broader HR master-data operations are outside the system boundary.

- Confidence: `Confirmed` for SSO and external data feeds; `Strong inference` for payroll/timesheets/recruiting being outside.
- Evidence:
  - `resource-insight/backend/app/services/sso.py`
  - `resource-insight/backend/app/services/sheets.py`
  - `resource-insight/backend/app/api/routes/webhook.py`
  - `docs/architecture/current-landscape.md` positions `Review` separately from `EMS`, `Timesheet`, and `Hiring`

## Major Business Concepts And Terminology

| Concept                 | Meaning In This System                                                                                                            | Confidence | Evidence                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Employee                | A reviewable person and login-eligible user, stored locally with active status, role flags, direct manager, and report frequency. | Confirmed  | `resource-insight/backend/app/models/employees.py`                                                         |
| Direct manager          | The company-hierarchy reviewer relationship for org-line reviews.                                                                 | Confirmed  | `resource-insight/backend/app/models/employees.py`, `resource-insight/backend/app/api/routes/employees.py` |
| Project member          | An employee assigned to a project, with role, weight, and an in-project `reports_to` relationship.                                | Confirmed  | `resource-insight/backend/app/models/project_members.py`                                                   |
| PM                      | A project manager role within project membership and also a user flag `is_pm`.                                                    | Confirmed  | `resource-insight/backend/app/models/common.py`, `resource-insight/backend/app/models/employees.py`        |
| Submission              | A saved or submitted review instance for one employee, one period, and optionally one project.                                    | Confirmed  | `resource-insight/backend/app/models/submissions.py`                                                       |
| Submission record       | One criterion-level evaluation item within a submission, including note/evidence.                                                 | Confirmed  | `resource-insight/backend/app/models/models.py`                                                            |
| Criteria                | The evaluation questions or categories, typed as `main`, `sub`, or `feedback`, and tied to an evaluation type.                    | Confirmed  | `resource-insight/backend/app/models/submissions.py`                                                       |
| Level                   | The rating scale with title, point, and description.                                                                              | Confirmed  | `resource-insight/backend/app/models/submissions.py`                                                       |
| Report frequency        | Employee cadence: `Daily`, `Bi-weekly`, or `Monthly`.                                                                             | Confirmed  | `resource-insight/backend/app/models/common.py`, `resource-insight/frontend/src/utils/options.ts`          |
| Feedback                | Two meanings exist: general employee-submitted feedback and review-form feedback criteria inside submissions.                     | Confirmed  | `resource-insight/backend/app/models/feedbacks.py`, `resource-insight/backend/app/models/submissions.py`   |
| Reviewer change request | A tracked request to replace one reviewer with another for an employee.                                                           | Confirmed  | `resource-insight/backend/app/models/reviewer_change_request.py`                                           |
| Performance list        | Manual admin classification of employees into `TOP` or `WARNING` lists.                                                           | Confirmed  | `resource-insight/backend/app/models/performance.py`                                                       |
| Site config             | Admin-managed settings for Google Sheet sources, BOD recipients, and automation flags.                                            | Confirmed  | `resource-insight/backend/app/models/configs.py`                                                           |

## Confidence Register For Major Conclusions

| Conclusion                                                                                           | Confidence                                                                | Why                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The system is a review operations control plane, not merely reporting.                               | Confirmed                                                                 | Review authoring, reminder, approval, export, and admin stewardship flows are first-class.                                                                               |
| SETA uses it for employee performance management across org and project structures.                  | Confirmed                                                                 | Employee, project, reviewer, PM, and review-cycle models are central across UI and backend.                                                                              |
| Admin users are acting as people-ops review operators, not just IT admins.                           | Confirmed                                                                 | Admin screens include progress tracking, reminder sending, feedback sending, performance lists, and master-data sync.                                                    |
| Executive and HR reporting are important outputs.                                                    | Strong inference                                                          | BOD distribution, HR export mails, monthly reports, and submission export workflows are explicitly coded.                                                                |
| Google Sheets still functions as a business-critical source of operational data.                     | Confirmed                                                                 | Site settings, sync routes, and sheet services exist for employees, criteria, levels, projects, and project members.                                                     |
| EMS integration is limited and not the primary day-to-day operating surface for this system.         | Confirmed                                                                 | Only webhook create/deactivate flows are visible, versus large sheet-sync and local-management surfaces.                                                                 |
| Bi-weekly review behavior may be legacy or partially active.                                         | Strong inference                                                          | The model, options, cron jobs, and exports still support bi-weekly logic, but the main authoring screens center on daily and monthly flows.                              |
| `Evaluation Reports` currently appears to mix direct-report routing and project-subordinate routing. | Confirmed for current code behavior, Unknown for intended business intent | Employee selection for `daily-report` and `monthly-report` unions `direct_manager_id` and project `reports_to_id`, while project assessments remain a separate workflow. |
| The requester boundary for reviewer-change requests is not fully clean.                              | Confirmed for current code behavior, Unknown for intended business intent | The sidebar exposes `Request Change Reviewer` only to PMs, but the route and create API do not visibly enforce a PM-only rule.                                           |
| Reviewer-change approval may not update the authoritative reviewer relationship.                     | Confirmed for current code behavior, Unknown for intended business intent | The approval route changes request status and sends notifications, but does not update `employees.direct_manager_id` or `project_members.reports_to_id`.                 |
