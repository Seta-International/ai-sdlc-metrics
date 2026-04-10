# 04. Clone-Critical Understanding

This is the preservation view. The goal is not to improve the product. The goal is to reproduce what this system already means and how it already behaves.

## 1. Core Business Capabilities That Cannot Be Lost

- Recruitment management must remain a staffed hiring-request workflow, not just a list of job posts. A recruitment carries ownership, HR staffing, project/department context, vacancy target, priority, dates, and governance around due-date changes.
  Evidence: `hiring-app-ui-react/src/pages/recruitment/recruitment-form/index.tsx`, `hiring-app-ui-react/src/pages/recruitment/recruitment-form/recruitment-form.schema.tsx`
- Candidate management must remain a long-lived person record with CV lineage, comments, application history, pool membership, blacklist state, interview history, and communication history.
  Evidence: `hiring-app-ui-react/src/@type/candidate.ts`, `hiring-app-ui-react/src/pages/candidate-details/index.tsx`, `hiring-app-ui-react/src/pages/candidate-details/candidate-application-history/index.tsx`
- Recruitment-level pipeline management must be preserved. The board behavior and candidate status movement are core operating mechanics, not UI decoration.
  Evidence: `hiring-app-ui-react/src/pages/recruitment-details/tabs/CandidatesTab.tsx`, `hiring-app-ui-react/src/utils/constants.ts`
- Talent pools and the pending pool must survive as first-class recruiting constructs. They are operational working sets, not cosmetic labels.
  Evidence: `hiring-app-ui-react/src/hooks/use-get-side-menu-items.tsx`, `hiring-app-ui-react/src/pages/talent-pool/index.tsx`
- Blacklist behavior must remain separate from ordinary candidate rejection. It is a blocking control with reason capture and different operational consequences.
  Evidence: `hiring-app-ui-react/src/pages/black-list/index.tsx`, `hiring-app-ui-react/src/i18n/translations/en.ts`
- Interview scheduling must include logistics, not only a timestamp. Interviewers, room or meeting mode, candidate/interviewer notifications, and survey/evaluation forms materially affect the process.
  Evidence: `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/interview-test.form.tsx`, `hiring-app-ui-react/src/pages/calendar-schedule/index.tsx`
- Reporting must preserve the business’s metric semantics, not just chart shells. The repo contains explicit definitions/formulas for core recruiting KPIs.
  Evidence: `hiring-app-ui-react/src/i18n/translations/en.ts`
- External sourcing via web crawling is part of the current business surface and should not be omitted in a faithful clone.
  Evidence: `hiring-app-ui-react/src/pages/web-crawling/index.tsx`, `hiring-app-ui-react/src/store/web-crawling/@type.ts`

## 2. Essential Workflows To Preserve

- Recruitment creation and controlled editing, including mandatory owner/HR staffing and due-date reason logging.
- Manual candidate entry.
- AI-assisted CV parsing during candidate creation.
- Spreadsheet-based candidate import.
- Batch CV upload and processing.
- Duplicate candidate handling that favors record consolidation over uncontrolled re-creation.
- Candidate assignment to recruitments and movement through a shared hiring-stage model.
- Candidate reuse through talent pools and pending-pool parking.
- Blacklist and unblock flow with explicit reason management.
- Interview scheduling, availability checks, rescheduling, and optional participant notifications.
- Post-interview survey/evaluation sending and status tracking.
- Candidate email sending based on reusable templates.
- Reporting with operational filters and exports.
- User synchronization from Timesheet and role administration.
- Web-crawling batch creation and result review.

Evidence: `hiring-app-ui-react/src/api/index.ts`, `hiring-app-ui-react/src/hooks/use-get-side-menu-items.tsx`, `hiring-app-ui-react/src/pages/*`, `hiring-app-ui-react/src/store/*`

## 3. Critical Business Rules To Preserve

- Recruitment cannot be created without core scope and staffing fields, including at least one project, one level, and one HR member. `Confirmed`
- Changing end date on an existing non-draft recruitment requires a modification reason. `Confirmed`
- Candidate lifecycle semantics matter. The visible active lifecycle is `New -> Reviewing -> Interviewing -> Offering -> Accept offer -> On-board`, with `Reject offer`, `Reject Candidate`, and `Cancel` as off-ramps. `Confirmed`
- Importing candidates depends on stage/date consistency rules. The status chosen determines which milestone dates must be present. `Confirmed`
- Blacklisted candidates are blocked from normal downstream actions. `Confirmed`
- Interview setup must enforce interviewer presence, no duplicate interviewers, future start time, duration limits, and room rules by interview mode. `Confirmed`
- Web-crawling job creation requires a platform plus at least one additional search field. `Confirmed`
- Talent pool names must be unique. `Confirmed`

Evidence: `hiring-app-ui-react/src/pages/recruitment/recruitment-form/recruitment-form.schema.tsx`, `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-ui-react/src/i18n/translations/en.ts`, `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/interview-test.form.tsx`, `hiring-app-api-nest/libs/talentPool/src/lib/talentPool.service.ts`, `hiring-app-ui-react/src/pages/web-crawling/crawling-create.dialog.tsx`

## 4. Essential Actors And Permission Boundaries

- HR Manager and HR Executive are the core operators. A clone that flattens their authority into generic admin/user roles risks breaking the real operating model.
- Director is not just a viewer; the role has broad access across recruiting and reporting.
- Managers and Members can participate in hiring workflows, but access to recruitment detail is additionally constrained by assignment to the recruitment team.
- Candidate and Interviewer are important external-facing actors even though they are not full application users; they receive emails, surveys, and evaluation requests.

Evidence: `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`, `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-ui-react/src/pages/recruitment-details/index.tsx`

## 5. Key Domain Entities And State Models

- `Recruitment`: a governed hiring request with team ownership and fulfillment tracking. Preserve at least the visible visibility modes `PUBLIC`, `PRIVATE`, `INTERNAL`, `DRAFT`, `CLOSED`, plus the separate progress labels `NEW`, `RECRUITING`, `INCOMPLETE`, `CLOSED`, `SUCCESS`, `DONE`.
- `Candidate`: a durable person record, not one row per application. Preserve the active candidate pipeline and its off-ramps.
- `Application history`: the record that allows one candidate to carry multiple applications over time.
- `Talent pool`: a reusable candidate collection, including a special pending pool.
- `Blacklist candidate`: a blocked state with operational restrictions and reason capture.
- `Interview schedule`: a logistical interview object with communications, not just a calendar timestamp.
- `Search batch`: a sourcing job with criteria, creator, timestamp, status, and retrieved profiles.

Evidence: `hiring-app-ui-react/src/@type/*`, `hiring-app-ui-react/src/store/web-crawling/@type.ts`, `hiring-app-ui-react/src/utils/constants.ts`

## 6. Operational Processes That Appear Necessary

- Regular maintenance of hiring reference data.
- Periodic syncing of internal users from Timesheet.
- Controlled management of Google Drive CV links and optional talent-pool folders.
- HR decision-making around when to notify participants of interview changes.
- Curated email templates and repeatable candidate communications.
- Back-office review of sourcing batches and talent-pool contents.

These are not implementation details. They are part of how the business runs the system.

## 7. External Dependencies That Materially Affect Behavior

- Microsoft authentication.
- Google Drive file access and sharing behavior.
- Timesheet as upstream user source.
- Some room/calendar availability provider behind interview scheduling.

If these dependencies are replaced in a clone, their business effects still need to be reproduced.

Evidence: `hiring-app-ui-react/README.md`, `hiring-app-ui-react/src/api/index.ts`, `hiring-app-ui-react/src/pages/user-management/index.tsx`, `hiring-app-ui-react/src/pages/talent-pool/index.tsx`

## 8. What Seems Configurable Vs Fixed

### Likely Configurable

- Departments, projects, levels, CV sources, contact types, working places, working times, interview rooms, interview types, talent pools.
- Email templates and merge fields in use.
- Report filters, selected metrics, and export choices.
- Web-crawling search criteria.
- Recruitment-level assignments such as owner, members, and HR members.

### Likely Fixed Or Business-Defining

- The main actor model around HR, directors, hiring participants, candidates, and interviewers.
- The existence of separate recruitment, candidate, talent-pool, blacklist, interview, email, reporting, and sourcing workflows.
- The rule that candidate records are long-lived and can accumulate application history.
- The requirement for governed due-date changes on active recruitments.
- The interview follow-up pattern using survey/evaluation forms.
- The KPI semantics used in reporting.

## 9. What Is Still Unclear From The Repo

- Which candidate status model is finally authoritative. Older backend migrations and current UI constants do not fully match.
- Which backend implementation is authoritative. The UI references more capabilities and endpoints than the currently visible Nest modules expose.
- Exact transition rules for recruitment progress states.
- Whether Managers and Members are intended to see all recruitments or only assigned ones on list pages.
- Whether web-crawled profiles can be turned directly into candidate records from the current product.
- The exact downstream meaning of `On-board` and whether it hands off to another HR system.
- The exact provider and business behavior behind room availability and calendar booking.

Evidence: `hiring-app-ui-react/src/api/index.ts`, `hiring-app-api-nest/apps/seta-hrm-api/src/app/app.module.ts`, `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-api-nest/flyway/db/migrations/*.sql`

## 10. Questions That Need Confirmation Before Cloning

- Which repository or service holds the current authoritative backend for interview, email, reporting, read-CV, and web-crawling features?
- Should the clone preserve the current UI-defined candidate status lifecycle exactly, despite the older migration history?
- What is the intended distinction between recruitment visibility and recruitment progress status?
- Which roles may update candidate status, move candidates on the recruitment board, or blacklist candidates in production?
- Is the pending pool a true system pool with special rules or only a UI convention?
- What business outcome is expected when deleting a talent pool’s Google Drive folder?
- Are report metric formulas in translations the official business definitions to preserve?
- Should web-crawled results remain a separate sourcing workspace, or are they expected to feed candidate creation directly?

## 11. Highest-Risk Cloning Mistake

The highest-risk mistake would be cloning only the visible Nest backend modules and ignoring the broader business behavior clearly implemented in the UI and API contract. A faithful clone must reproduce the integrated product behavior: recruitment governance, candidate lifecycle, talent-pool operations, blacklist control, interview logistics, communication flows, reporting semantics, and sourcing workflows.
