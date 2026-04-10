# 03. Workflows, Rules, And Domain

## End-To-End Workflows

### 1. Recruitment Setup And Governance

- What happens: HR creates a recruitment request with business context, staffing, vacancy target, dates, visibility, and priority.
- Who does it: primarily HR Manager or HR Executive; Director also has route access.
- Conditions: recruitment requires name, description, benefit, requirement, department, salary, vacancy count, working place, working time, owner, at least one project, at least one level, at least one HR member, status, start date, end date, and priority.
- State changes: a recruitment record is created or updated; if the due date changes on an existing non-draft recruitment, a modification reason is captured.
- Business consequence: hiring demand becomes operationally manageable and auditable, not just informal headcount intent.
- Evidence: `hiring-app-ui-react/src/pages/recruitment/recruitment-form/recruitment-form.schema.tsx`, `hiring-app-ui-react/src/@type/recruitments.ts`, `hiring-app-ui-react/src/pages/recruitment-details/tabs/DueDateModificationTab.tsx`.
- Confidence: `Confirmed`

### 2. Candidate Intake, Dedupe, And Initial Routing

- What happens: candidates enter through manual entry, CV parsing, spreadsheet import, or batch CV upload; duplicate detection may route the operation into an update flow instead of new creation.
- Who does it: HR users.
- Conditions: imported data must meet template requirements; CV links for spreadsheet import must be Google Drive links with public access during processing.
- State changes: new candidate record, updated candidate record, or new application history against an existing candidate; uploaded CV file may be deleted if duplicate flow is abandoned.
- Business consequence: the company builds a reusable candidate database while controlling duplicate noise.
- Evidence: `hiring-app-ui-react/src/pages/candidate/candidate.form.tsx`, `hiring-app-ui-react/src/components/import-data-from-file/index.tsx`, `hiring-app-ui-react/src/components/batch-cv-upload-modal/index.tsx`, `hiring-app-ui-react/src/pages/candidate/candidate.duplication.tsx`, `hiring-app-ui-react/src/i18n/translations/en.ts`.
- Confidence: `Confirmed`

### 3. Candidate Progression Through The Hiring Pipeline

- What happens: candidate status moves through a staged lifecycle, either inside recruitment detail or from candidate-facing actions.
- Who does it: HR users; Managers/Members appear to participate when assigned to recruitment.
- Conditions: progression follows the defined status model and allowed next/related statuses.
- State changes: current candidate/application status changes among `New`, `Reviewing`, `Interviewing`, `Offering`, `Accept offer`, `Reject offer`, `On-board`, `Reject Candidate`, and `Cancel`.
- Business consequence: the system can measure funnel progress and enforce a shared interpretation of where each candidate stands.
- Evidence: `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-ui-react/src/pages/recruitment-details/tabs/CandidatesTab.tsx`, `hiring-app-ui-react/src/api/index.ts`.
- Confidence: `Confirmed`

### 4. Interview Scheduling, Execution, And Follow-Up

- What happens: once a candidate reaches interview handling, HR schedules the interview, secures room/meeting details, selects interviewers, and optionally notifies participants and sends forms.
- Who does it: HR users, interviewers, candidate.
- Conditions: at least one interviewer; no duplicate interviewers; future start time; end time after start and within four hours; room required for in-office interviews; availability checks apply.
- State changes: an interview schedule record is created or updated; communication statuses for candidate/interviewer forms move across `not_sent`, `queued`, `sent`, `failed`, and submitted-type outcomes.
- Business consequence: interviewing becomes an operational workflow with logistics and feedback capture, not an ad hoc calendar event.
- Evidence: `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/interview-test.form.tsx`, `hiring-app-ui-react/src/store/interview-schedule/action.ts`, `hiring-app-ui-react/src/pages/calendar-schedule/index.tsx`.
- Confidence: `Confirmed`

### 5. Talent Pool Reuse And Blacklist Control

- What happens: candidates are grouped into named pools for reuse, parked in a pending pool, or blocked through blacklist.
- Who does it: primarily HR users.
- Conditions: talent pool names must be unique; blacklist requires reason capture.
- State changes: candidate is added to a pool, removed from a pool, blocked in blacklist, removed from blacklist, or permanently deleted.
- Business consequence: recruiting operations can separate reusable sourcing inventory from actively blocked candidates.
- Evidence: `hiring-app-api-nest/libs/talentPool/src/lib/talentPool.service.ts`, `hiring-app-ui-react/src/pages/talent-pool/index.tsx`, `hiring-app-ui-react/src/pages/black-list/index.tsx`, `hiring-app-ui-react/src/i18n/translations/en.ts`.
- Confidence: `Confirmed`

### 6. Operational Reporting

- What happens: recruiting data is filtered and aggregated into metrics, tables, and charts.
- Who does it: HR Manager, HR Executive, Director.
- Conditions: filters can narrow by date, comparison period, project, recruitment, owner, HR member, source of CV, and selected metrics.
- State changes: no core business entity changes; report outputs and exports are generated.
- Business consequence: management can inspect throughput, quality, conversion, fulfillment speed, and recruiter performance.
- Evidence: `hiring-app-ui-react/src/pages/reports/index.tsx`, `hiring-app-ui-react/src/store/reports/@type.ts`, `hiring-app-ui-react/src/i18n/translations/en.ts`.
- Confidence: `Confirmed`

### 7. External Sourcing Via Web Crawling

- What happens: HR launches search batches against external platforms, tracks batch status, and reviews crawled profile data.
- Who does it: HR Manager and HR Executive.
- Conditions: platform selection is mandatory, and at least one additional search field must be provided.
- State changes: search batch is queued with `PENDING` or stored as `COMPLETED`.
- Business consequence: recruiters can proactively source leads outside inbound applicants.
- Evidence: `hiring-app-ui-react/src/pages/web-crawling/crawling-create.dialog.tsx`, `hiring-app-ui-react/src/store/web-crawling/@type.ts`, `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`.
- Confidence: `Confirmed`

## Business Rules And Constraints

### Recruitment Rules

- A recruitment cannot exist without explicit business ownership and HR staffing. `Confirmed`
  Evidence: `owner`, `hrMembers`, `project`, `level` required in `hiring-app-ui-react/src/pages/recruitment/recruitment-form/recruitment-form.schema.tsx`
- Due-date changes are governed and require a reason when modifying an existing non-draft recruitment. `Confirmed`
  Evidence: `extendDueReason` rule in `hiring-app-ui-react/src/pages/recruitment/recruitment-form/recruitment-form.schema.tsx`
- Recruitment visibility/publication status and recruitment progress status are separate concepts. `Strong inference`
  Evidence: visibility labels in `RECRUITMENT_VISIBILITY` and progress-like labels in `RECRUITMENT_STATUS` inside `hiring-app-ui-react/src/utils/constants.ts`

### Candidate Rules

- Candidate progression uses a stage model with visible allowed related states. `Confirmed`
  Evidence: `CANDIDATE_STATUS` in `hiring-app-ui-react/src/utils/constants.ts`
- Spreadsheet import ties status choice to required stage-date fields. `Confirmed`
  Evidence: import instructions in `hiring-app-ui-react/src/i18n/translations/en.ts`
- Blacklisted candidates are operationally restricted; some candidate actions become unavailable while blacklisted. `Confirmed`
  Evidence: `hiring-app-ui-react/src/pages/candidate-details/modal/index.tsx`, `hiring-app-ui-react/src/pages/candidate-details/index.tsx`

### Interview Rules

- Interview logistics are constrained by time, duration, participant uniqueness, and room type. `Confirmed`
  Evidence: `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/interview-test.form.tsx`
- In-office interviews require room handling, while meeting-based interviews do not. `Confirmed`
  Evidence: same form schema and conditional room field logic
- Rescheduling can trigger explicit decision points on whether to notify interviewers and candidate. `Confirmed`
  Evidence: `hiring-app-ui-react/src/pages/calendar-schedule/index.tsx`

### Talent Pool Rules

- Talent pools are named business objects with uniqueness expectations. `Confirmed`
  Evidence: duplicate-name checks in `hiring-app-api-nest/libs/talentPool/src/lib/talentPool.service.ts`
- Pool deletion may include deletion of an associated Google Drive folder, implying operational coupling between pool and file storage. `Confirmed`
  Evidence: `hiring-app-ui-react/src/pages/talent-pool/index.tsx`

## Permission And Role Boundaries

- `HR Manager (hrm)`: appears to be the highest day-to-day operator; has access to settings, reports, web crawling, user management, and broad recruiting actions. `Confirmed`
- `HR Executive (hre)`: major operational role with nearly the same workflow surface as HR Manager. `Confirmed`
- `Director (dir)`: broad oversight access, especially across recruitment, candidate, interview, reports, and some settings. `Confirmed`
- `Manager (ptm)` and `Member (mem)`: allowed into recruitment, candidate, interview, and calendar screens, but detailed recruitment access is additionally constrained by whether they belong to the recruitment team. `Confirmed` for route presence and page gate, `Strong inference` for business intent.

Evidence: `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`, `hiring-app-ui-react/src/pages/recruitment-details/index.tsx`

## Core Domain Entities And Meaning

- `Recruitment`: hiring request/opening. Holds business need, staffing, dates, priority, visibility, and target quantity.
- `Candidate`: person record. Holds identity, contact data, CV, source, current state, comments, blacklisting, and relationships to recruitments/interviews/pools.
- `Application history`: the per-candidate record of applications over time, including recruitment/source/status/CV details.
- `Talent pool`: reusable collection of candidates for future or grouped recruiting use.
- `Blacklist candidate`: blocked candidate record with blacklist reason and separate management behavior.
- `Interview schedule`: interview event with time, place, room or meeting link, interviewers, contactor details, and follow-up form states.
- `Email template`: reusable communication asset with merge fields.
- `Search batch`: sourcing job against external platforms.
- `Manager/User`: internal participant who can own recruitments, act as HR member, be an interviewer, or receive permissions.
- `Static data`: controlled business vocabularies such as levels, departments, CV sources, working places, interview rooms, and interview types.

Evidence: `hiring-app-ui-react/src/@type/*`, `hiring-app-api-nest/flyway/db/migrations/*.sql`, `hiring-app-ui-react/src/store/app/actions.ts`

## Lifecycle / State Transitions

### Candidate Lifecycle

- Main visible pipeline: `New` -> `Reviewing` -> `Interviewing` -> `Offering` -> `Accept offer` -> `On-board`. `Confirmed`
- Off-ramps: `Reject offer`, `Reject Candidate`, `Cancel`. `Confirmed`
- Consequence: reports, application history, interview handling, and bulk import rules depend on these meanings. `Confirmed`
- Important caveat: older backend migrations show different status vocabulary, so the UI appears to reflect the newer business lifecycle. `Confirmed`
  Evidence: `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-api-nest/flyway/db/migrations/V002_20231221061901__add_static_data_in_table.sql`, `hiring-app-api-nest/flyway/db/migrations/V004_20240125082243__change_structure_of_candidate_status_table.sql`

### Recruitment Lifecycle

- Visible labels: `NEW`, `RECRUITING`, `INCOMPLETE`, `CLOSED`, `SUCCESS`, `DONE`. `Confirmed`
- Exact transition rules are not fully visible in the repo. `Unknown`
- Separate visibility/publication labels: `PUBLIC`, `PRIVATE`, `INTERNAL`, `DRAFT`, `CLOSED`. `Confirmed`
  Evidence: `hiring-app-ui-react/src/utils/constants.ts`

### Interview Lifecycle

- Schedule states include `UPCOMING`, `IN_PROGRESS`, `INTERVIEWED`, `PASS`, `FAIL`. `Confirmed`
- Form-delivery states include `not_sent`, `queued`, `sent`, `failed`, plus submitted-like states visible in interview UI. `Confirmed`
  Evidence: `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/index.tsx`

### Search Batch Lifecycle

- Visible states: `PENDING`, `COMPLETED`. `Confirmed`
  Evidence: `hiring-app-ui-react/src/store/web-crawling/@type.ts`

## Operational / Back-Office / Manual Processes Implied By The Repo

- HR maintains reference catalogs that shape all downstream hiring data. `Confirmed`
- HR periodically syncs or imports users from Timesheet before those users can fully participate in hiring workflows. `Confirmed`
- HR must maintain Google Drive accessibility for CV links and may manage talent-pool folders in Drive. `Confirmed`
- HR manually decides whether reschedule emails should go to interviewers and candidates. `Confirmed`
- HR curates email templates and likely standard messaging policy. `Confirmed`
- HR or recruiting operations reviews external sourcing batches from LinkedIn and CareerViet. `Confirmed`

Evidence: `hiring-app-ui-react/src/pages/user-management/index.tsx`, `hiring-app-ui-react/src/pages/talent-pool/index.tsx`, `hiring-app-ui-react/src/i18n/translations/en.ts`, `hiring-app-ui-react/src/pages/calendar-schedule/index.tsx`, `hiring-app-ui-react/src/pages/web-crawling/index.tsx`

## External Dependencies That Affect Business Flow

- Microsoft login / Azure identity for authentication. `Confirmed`
  Evidence: `hiring-app-ui-react/README.md`, `hiring-app-ui-react/src/api/index.ts`
- Google Drive for CV access and pool-folder handling. `Confirmed`
  Evidence: `hiring-app-ui-react/README.md`, `hiring-app-ui-react/src/i18n/translations/en.ts`, `hiring-app-ui-react/src/pages/talent-pool/index.tsx`
- Timesheet Management as upstream user source. `Confirmed`
  Evidence: `hiring-app-ui-react/src/i18n/translations/en.ts`, `hiring-app-ui-react/src/pages/user-management/index.tsx`
- Calendar/room availability provider behind interview room checks. `Strong inference`
  Evidence: `hiring-app-ui-react/src/store/interview-schedule/action.ts`, `hiring-app-ui-react/src/api/index.ts`
