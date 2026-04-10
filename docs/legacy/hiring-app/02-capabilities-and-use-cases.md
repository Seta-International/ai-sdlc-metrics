# 02. Capabilities And Use Cases

## Recruitment Planning And Pipeline Management

### 1. Create And Maintain Recruitment Openings

- Business purpose: turn a hiring need into a managed recruitment record with staffing, timing, scope, and vacancy targets.
- Primary actor(s): HR Manager, HR Executive, Director.
- Trigger: a department or project needs headcount.
- Main business flow: user creates or edits a recruitment with name, description, benefits, requirements, department, salary, vacancy count, working place/time, projects, levels, owner, HR members, optional members, optional talent pools, start/end dates, visibility/status, and priority.
- Outcome: the recruitment becomes a trackable hiring request that can hold and manage candidates.
- Exceptions/failure cases: required fields block save; at least one project, one level, and one HR member are mandatory; due-date changes on an existing non-draft recruitment require a reason.
- Related screens/routes/forms/entities: `/recruitment`, `/recruitment/:id`, recruitment form, `Recruitment`.
- Evidence from repo: `hiring-app-ui-react/src/pages/recruitment/recruitment-form/index.tsx`, `hiring-app-ui-react/src/pages/recruitment/recruitment-form/recruitment-form.schema.tsx`, `hiring-app-ui-react/src/@type/recruitments.ts`.
- Confidence level: `Confirmed`

### 2. Staff A Recruitment And Control Access To It

- Business purpose: assign responsibility and participation for a hiring request.
- Primary actor(s): HR Manager, HR Executive, Director; Managers/Members as assigned participants.
- Trigger: creating a recruitment or updating team ownership.
- Main business flow: recruitment is assigned an owner, HR members, and optional members; non-HR/director users can access recruitment details only when they belong to the recruitment’s member set.
- Outcome: responsibility and visibility are scoped around the hiring team.
- Exceptions/failure cases: non-assigned users are denied detail access.
- Related screens/routes/forms/entities: `/recruitment/:id`, recruitment detail header and access gate.
- Evidence from repo: `hiring-app-ui-react/src/pages/recruitment-details/index.tsx`, `hiring-app-ui-react/src/pages/recruitment/recruitment-form/index.tsx`.
- Confidence level: `Confirmed`

### 3. Run The Recruitment Candidate Board

- Business purpose: manage candidate movement inside a specific recruitment.
- Primary actor(s): HR Manager, HR Executive; Directors/Managers/Members appear to participate with narrower rights.
- Trigger: candidates exist in the recruitment.
- Main business flow: recruitment detail shows status columns; users move candidates across columns and reorder them; users can also remove a candidate from the recruitment.
- Outcome: the recruitment has a live pipeline view of current hiring progress.
- Exceptions/failure cases: drag-and-drop appears limited by role and access; removed candidates leave that recruitment’s pipeline.
- Related screens/routes/forms/entities: `/recruitment/:id`, candidate board, recruitment card.
- Evidence from repo: `hiring-app-ui-react/src/pages/recruitment-details/tabs/CandidatesTab.tsx`, `hiring-app-ui-react/src/pages/recruitment-details/recruitment-details.card.tsx`, `hiring-app-ui-react/src/@type/recruitment-details.ts`.
- Confidence level: `Confirmed`

## Candidate Intake And Candidate Record Management

### 4. Create Candidate Records Manually

- Business purpose: register a new candidate directly into the hiring system.
- Primary actor(s): HR Manager, HR Executive, Director.
- Trigger: recruiter receives a CV or referral outside bulk intake.
- Main business flow: user enters personal/contact data, applied position, source, CV information, optional recruitments, optional talent pools, and related metadata.
- Outcome: a candidate profile exists and can be routed into hiring workflows.
- Exceptions/failure cases: validation failures block save.
- Related screens/routes/forms/entities: `/candidate`, candidate form, `Candidate`.
- Evidence from repo: `hiring-app-ui-react/src/pages/candidate/candidate.form.tsx`, `hiring-app-ui-react/src/@type/candidate.ts`.
- Confidence level: `Confirmed`

### 5. Parse A CV To Prefill Candidate Data

- Business purpose: reduce manual data entry and accelerate intake.
- Primary actor(s): HR Manager, HR Executive, Director.
- Trigger: recruiter uploads a CV during candidate creation.
- Main business flow: resume parser reads CV content, pre-populates candidate fields, and user reviews/edits before saving.
- Outcome: faster candidate creation with AI-assisted extraction.
- Exceptions/failure cases: parser failures or incomplete extraction require manual correction.
- Related screens/routes/forms/entities: candidate form, CV parser, file upload.
- Evidence from repo: `hiring-app-ui-react/src/store/read-cv/actions.ts`, `hiring-app-ui-react/src/api/index.ts`, `hiring-app-ui-react/src/pages/candidate/candidate.form.tsx`.
- Confidence level: `Confirmed`

### 6. Import Candidates From Spreadsheet

- Business purpose: onboard many candidate records at once from structured data.
- Primary actor(s): HR Manager, HR Executive, Director.
- Trigger: recruiter has a bulk candidate spreadsheet.
- Main business flow: user downloads a template, fills required columns, uploads the completed file, and confirms import.
- Outcome: multiple candidate/application records are created or updated in bulk.
- Exceptions/failure cases: date/status dependencies apply; CV links must be public Google Drive links during processing.
- Related screens/routes/forms/entities: candidate page import flow.
- Evidence from repo: `hiring-app-ui-react/src/pages/candidate/index.tsx`, `hiring-app-ui-react/src/i18n/translations/en.ts`.
- Confidence level: `Confirmed`

### 7. Batch Upload CV Files And Create Candidate Records

- Business purpose: process many raw CV documents without manually typing records first.
- Primary actor(s): HR Manager, HR Executive, Director.
- Trigger: recruiter has a folder of CV files.
- Main business flow: user uploads many PDF/DOC/DOCX files, duplicate filenames are filtered, files are uploaded, a batch job is queued, progress is tracked, and parsed results create candidate records.
- Outcome: bulk candidate intake from unstructured CV files.
- Exceptions/failure cases: duplicate file names, parser failures, upload errors, and duplicate candidate detection.
- Related screens/routes/forms/entities: batch CV upload modal, upload progress modal, read-CV batch APIs.
- Evidence from repo: `hiring-app-ui-react/src/components/batch-cv-upload-modal/index.tsx`, `hiring-app-ui-react/src/components/upload-progress-modal/index.tsx`, `hiring-app-ui-react/src/store/read-cv/actions.ts`.
- Confidence level: `Confirmed`

### 8. Detect Duplicate Candidates And Preserve Candidate History

- Business purpose: avoid fragmenting one person into multiple candidate records while still capturing new applications or new CV versions.
- Primary actor(s): HR users.
- Trigger: a new candidate import or create operation matches an existing candidate.
- Main business flow: system displays current candidate identity and changed fields; user decides whether to update the existing record instead of creating a duplicate; application history remains visible on candidate detail.
- Outcome: the candidate base remains consolidated while repeat applications are preserved.
- Exceptions/failure cases: if the user cancels, newly uploaded CV files may be deleted; exact duplicate-matching rules are not fully visible.
- Related screens/routes/forms/entities: duplicate dialog, application history, compare CVs.
- Evidence from repo: `hiring-app-ui-react/src/pages/candidate/candidate.duplication.tsx`, `hiring-app-ui-react/src/pages/candidate-details/candidate-application-history/index.tsx`, `hiring-app-ui-react/src/api/index.ts`.
- Confidence level: `Confirmed`

## Talent Pool And Blacklist Operations

### 9. Maintain Talent Pools And A Pending Pool

- Business purpose: organize candidates into reusable sourcing or qualification pools outside one recruitment.
- Primary actor(s): HR Manager, HR Executive; Directors appear to have export/view rights on detail pages.
- Trigger: recruiters want to group candidates by strategic need or temporarily park them.
- Main business flow: user creates, edits, searches, and deletes named talent pools; candidates are added to pools; sidebar shows pool entries dynamically; a special pending pool is always present.
- Outcome: recruiters can reuse and route candidate collections across recruiting work.
- Exceptions/failure cases: pool name uniqueness is enforced in backend service; deletion can include a prompt to delete the associated Google Drive folder.
- Related screens/routes/forms/entities: `/static/talent-pool`, `/talent-pool/:id`, `TalentPool`.
- Evidence from repo: `hiring-app-ui-react/src/pages/talent-pool/index.tsx`, `hiring-app-ui-react/src/pages/candidates-by-talent-pool/index.tsx`, `hiring-app-ui-react/src/hooks/use-get-side-menu-items.tsx`, `hiring-app-api-nest/libs/talentPool/src/lib/talentPool.service.ts`.
- Confidence level: `Confirmed`

### 10. Blacklist Candidates

- Business purpose: block unsuitable candidates from further hiring activity while keeping an audit trail and management list.
- Primary actor(s): HR users.
- Trigger: recruiter decides a candidate must be blocked.
- Main business flow: user chooses move-to-blacklist, provides a reason, and candidate is transferred into blacklist management; blacklisted candidates can later be removed from blacklist or permanently deleted.
- Outcome: the candidate is operationally blocked from normal hiring flow.
- Exceptions/failure cases: blacklist reason is required; certain candidate actions become disabled while blacklisted.
- Related screens/routes/forms/entities: `/black-list`, candidate detail side modal, blacklist confirmation dialogs.
- Evidence from repo: `hiring-app-ui-react/src/pages/black-list/index.tsx`, `hiring-app-ui-react/src/pages/candidate-details/modal/index.tsx`, `hiring-app-ui-react/src/store/candidate/actions.ts`, `hiring-app-ui-react/src/i18n/translations/en.ts`.
- Confidence level: `Confirmed`

## Interviewing And Communication

### 11. Schedule Candidate Interviews

- Business purpose: convert a candidate at interview stage into a concrete interview event with participants and logistics.
- Primary actor(s): HR users, interviewers.
- Trigger: candidate reaches or needs interview stage.
- Main business flow: recruiter chooses interview type, start/end time, location, room or meeting setup, interviewers, contact person details, and whether to send notifications/forms.
- Outcome: interview schedule is created and can be tracked on candidate detail and calendar.
- Exceptions/failure cases: at least one interviewer required; duplicate interviewers blocked; start time cannot be in the past; end time cannot precede start and cannot exceed four hours; room required for in-office interviews; room availability is checked.
- Related screens/routes/forms/entities: `/interview`, `/calendar-schedule`, candidate interview form, `InterviewSchedule`.
- Evidence from repo: `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/interview-test.form.tsx`, `hiring-app-ui-react/src/store/interview-schedule/action.ts`, `hiring-app-ui-react/src/@type/interview-schedule.ts`.
- Confidence level: `Confirmed`

### 12. Manage Interview Calendar And Rescheduling

- Business purpose: operate interview schedules across day/week/month views and handle changes consistently.
- Primary actor(s): HR users.
- Trigger: recruiter needs to review or move scheduled interviews.
- Main business flow: interview schedules are shown in a shared calendar; user drags or edits events; on update, system asks whether interviewers and the candidate should be notified by email.
- Outcome: interview schedule stays synchronized and participants can be informed of changes.
- Exceptions/failure cases: update depends on room/provider availability and successful schedule save.
- Related screens/routes/forms/entities: `/calendar-schedule`.
- Evidence from repo: `hiring-app-ui-react/src/pages/calendar-schedule/index.tsx`.
- Confidence level: `Confirmed`

### 13. Send Candidate Survey Forms And Interviewer Evaluation Forms

- Business purpose: collect structured post-interview information from the candidate and the interview panel.
- Primary actor(s): HR users, candidate, interviewer.
- Trigger: interview is scheduled or completed.
- Main business flow: recruiter can auto-send or manually send a survey to the candidate and an evaluation form to interviewers; UI tracks not-sent, queued, sent, failed, and submitted states.
- Outcome: interview follow-up and assessment are standardized.
- Exceptions/failure cases: send failures are surfaced in form status.
- Related screens/routes/forms/entities: candidate interview tab, interview APIs, interview form status.
- Evidence from repo: `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/index.tsx`, `hiring-app-ui-react/src/store/interview-schedule/@type.ts`, `hiring-app-ui-react/src/api/index.ts`, `hiring-app-ui-react/src/utils/constants.ts`.
- Confidence level: `Confirmed`

### 14. Manage Email Templates And Candidate Emails

- Business purpose: standardize outbound communication to candidates and preserve communication history.
- Primary actor(s): HR users.
- Trigger: HR needs reusable messaging or wants to send an email on a candidate record.
- Main business flow: user creates templates with title and HTML body, inserts system fields such as candidate or recruitment variables, and sends templated emails with attachments from candidate detail.
- Outcome: candidate communication becomes repeatable and auditable.
- Exceptions/failure cases: unsaved changes can block email sending until saved or discarded.
- Related screens/routes/forms/entities: `/email-template`, candidate email tab.
- Evidence from repo: `hiring-app-ui-react/src/pages/email-template/create-edit-form.tsx`, `hiring-app-ui-react/src/pages/candidate-details/candidate-email/index.tsx`, `hiring-app-ui-react/src/utils/constants.ts`.
- Confidence level: `Confirmed`

## Administration, Reporting, And External Sourcing

### 15. Administer Users And Sync Accounts From Timesheet

- Business purpose: keep the hiring system’s internal user base aligned with the company directory or upstream workforce system.
- Primary actor(s): HR Manager, HR Executive, Director; HR Manager appears to have strongest edit rights.
- Trigger: new internal users need access or roles need to change.
- Main business flow: user management lists accounts, roles are updated, users can be deleted, and a sync action fetches users from Timesheet.
- Outcome: authorized internal staff can participate in hiring workflows with correct roles.
- Exceptions/failure cases: sync errors or role misconfiguration can affect access.
- Related screens/routes/forms/entities: `/user-management`, manager sync/update APIs.
- Evidence from repo: `hiring-app-ui-react/src/pages/user-management/index.tsx`, `hiring-app-ui-react/src/store/manager/actions.ts`, `hiring-app-ui-react/src/i18n/translations/en.ts`.
- Confidence level: `Confirmed`

### 16. Maintain Hiring Reference Data

- Business purpose: govern the controlled vocabularies and lookup data that make recruiting workflows consistent.
- Primary actor(s): HR Manager, HR Executive, Director.
- Trigger: organization changes or operating definitions need updating.
- Main business flow: users manage departments, projects, levels, CV sources, contact types, working places/times, interview rooms, interview types, and talent-pool reference data.
- Outcome: recruiting records and filters use standardized business data.
- Exceptions/failure cases: incorrect master data affects downstream forms, reporting, and scheduling.
- Related screens/routes/forms/entities: `/static/*` pages, static data APIs.
- Evidence from repo: `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`, `hiring-app-ui-react/src/store/app/actions.ts`, `hiring-app-api-nest/libs/staticData/src/lib/staticData.controller.ts`.
- Confidence level: `Confirmed`

### 17. Analyze Recruiting Performance

- Business purpose: measure recruiting volume, quality, speed, outcomes, and recruiter performance.
- Primary actor(s): HR Manager, HR Executive, Director.
- Trigger: operational review, management reporting, or export need.
- Main business flow: user selects metrics and filters by date, project, recruitment, owner, HR member, or CV source; dashboards and tables refresh; results can be exported.
- Outcome: the organization can monitor funnel performance and recruiting effectiveness.
- Exceptions/failure cases: reporting depends on clean stage/date data.
- Related screens/routes/forms/entities: `/reports`, report filters, charts, PDF/Excel/chart exports.
- Evidence from repo: `hiring-app-ui-react/src/pages/reports/index.tsx`, `hiring-app-ui-react/src/store/reports/@type.ts`, `hiring-app-ui-react/src/i18n/translations/en.ts`.
- Confidence level: `Confirmed`

### 18. Run Web-Crawling Sourcing Batches

- Business purpose: search external platforms for candidate profiles matching a hiring need.
- Primary actor(s): HR Manager, HR Executive.
- Trigger: recruiters want proactive sourcing rather than waiting for inbound applications.
- Main business flow: user creates a search batch by platform plus at least one other criterion such as job title, location, level, include keywords, or exclude keywords; batches are stored with status and results; users can filter and delete batches.
- Outcome: sourcing intelligence and profile discovery are added to the recruiter workflow.
- Exceptions/failure cases: platform plus at least one other field is mandatory; current repo does not fully show how crawled profiles become full candidate records.
- Related screens/routes/forms/entities: `/web-crawling`, create dialog, search batch list/cards.
- Evidence from repo: `hiring-app-ui-react/src/pages/web-crawling/crawling-create.dialog.tsx`, `hiring-app-ui-react/src/store/web-crawling/@type.ts`, `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`.
- Confidence level: `Confirmed` for batch creation and viewing, `Unknown` for direct candidate conversion flow
