# 01. Business Overview

## What The System Appears To Be

- An internal hiring management system for SETA that combines applicant tracking, hiring operations, talent pooling, interview coordination, recruiter communication, and reporting. `Confirmed`
  Evidence: `hiring-app-ui-react/README.md`, `hiring-app-ui-react/src/hooks/use-get-side-menu-items.tsx`, `hiring-app-ui-react/src/api/index.ts`
- It behaves more like an internal recruiting operations workbench than a simple job-posting tool. Recruitment requests, candidate pipelines, interview logistics, blacklist control, reporting, and sourcing all live in the same product. `Strong inference`
  Evidence: `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`, `hiring-app-ui-react/src/pages/reports/index.tsx`, `hiring-app-ui-react/src/pages/web-crawling/index.tsx`

## Business Domain / Industry Context

- Domain: corporate talent acquisition / recruitment operations. `Confirmed`
  Evidence: `hiring-app-ui-react/README.md`, `hiring-app-ui-react/src/pages/recruitment/recruitment-form/index.tsx`, `hiring-app-ui-react/src/pages/candidate/index.tsx`
- The system seems designed for an internal HR or talent acquisition team serving multiple projects and departments inside one company. `Strong inference`
  Evidence: recruitment fields for `department`, `project`, `owner`, `hrMembers`, `members`, `level`, `candidateQuantity` in `hiring-app-ui-react/src/pages/recruitment/recruitment-form/index.tsx` and `hiring-app-ui-react/src/pages/recruitment/recruitment-form/recruitment-form.schema.tsx`

## Core Business Problem Solved

- The system centralizes hiring demand, candidate intake, evaluation, and fulfillment tracking so SETA can move from hiring request to onboarded candidate in one operating flow. `Confirmed`
  Evidence: recruitment, candidate, interview, calendar, report, and blacklist routes in `hiring-app-ui-react/src/routes/constant.ts`
- It also solves operational fragmentation: candidate records, CV files, interview scheduling, emails, talent pools, and performance reporting are treated as one coordinated process rather than separate tools. `Strong inference`
  Evidence: `hiring-app-ui-react/src/api/index.ts`, `hiring-app-ui-react/src/pages/candidate-details/index.tsx`, `hiring-app-ui-react/src/pages/calendar-schedule/index.tsx`, `hiring-app-ui-react/src/pages/email-template/index.tsx`

## Target Users / Actors

- HR Manager and HR Executive: primary system operators with the broadest access across recruiting, reporting, settings, sourcing, and administration. `Confirmed`
  Evidence: `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`
- Director: oversight actor with access to major hiring workflows and reports, but not every administrative action. `Confirmed`
  Evidence: `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`, `hiring-app-ui-react/src/pages/reports/index.tsx`
- Manager and Member: hiring participants with narrower access, especially around assigned recruitment work and candidate review/interview participation. `Strong inference`
  Evidence: `hiring-app-ui-react/src/routes/routes-map/authRoutes.ts`, `hiring-app-ui-react/src/pages/recruitment-details/index.tsx`
- Candidate: external person whose CV, applications, interviews, emails, and status progression are managed in the system. `Confirmed`
  Evidence: `hiring-app-ui-react/src/@type/candidate.ts`, `hiring-app-ui-react/src/pages/candidate-details/index.tsx`
- Interviewer: internal evaluator receiving interview schedules and assessment requests. `Confirmed`
  Evidence: `hiring-app-ui-react/src/pages/candidate-details/candidate-interview-test/index.tsx`, `hiring-app-ui-react/src/store/interview-schedule/@type.ts`

## Value The System Provides

- Converts hiring demand into managed recruitment records with ownership, staffing, due dates, priority, and vacancy targets. `Confirmed`
  Evidence: `hiring-app-ui-react/src/pages/recruitment/recruitment-form/index.tsx`
- Maintains a reusable candidate base rather than treating each application as disposable. `Confirmed`
  Evidence: application history endpoints in `hiring-app-ui-react/src/api/index.ts`, `hiring-app-ui-react/src/pages/candidate-details/candidate-application-history/index.tsx`
- Gives HR a controlled hiring pipeline with explicit candidate stages, interview scheduling, email communication, and reporting metrics. `Confirmed`
  Evidence: `hiring-app-ui-react/src/utils/constants.ts`, `hiring-app-ui-react/src/pages/calendar-schedule/index.tsx`, `hiring-app-ui-react/src/pages/reports/index.tsx`
- Supports proactive sourcing through talent pools and web crawling, not only reactive applicant processing. `Confirmed`
  Evidence: `hiring-app-ui-react/src/pages/talent-pool/index.tsx`, `hiring-app-ui-react/src/pages/web-crawling/crawling-create.dialog.tsx`

## Scope Boundaries

### Inside The System

- Recruitment request/opening management
- Candidate master records and application history
- Talent pools, including a special pending pool
- Blacklist management
- Interview scheduling, room/meeting handling, and interview feedback forms
- Candidate email templates and email history
- Recruiting performance reporting and exports
- User/role administration and user sync from Timesheet
- Reference/master data for hiring operations
- External sourcing via web crawling

Evidence: `hiring-app-ui-react/src/hooks/use-get-side-menu-items.tsx`, `hiring-app-ui-react/src/api/index.ts`

### Outside Or Only Partially Visible

- Payroll, employment contract generation, and full employee lifecycle after hiring `Unknown`
- Public job-board publishing and candidate self-service application portal `Weak inference`
- Full onboarding process after candidate reaches `On-board`; the system tracks it, but downstream HRIS execution is not visible `Strong inference`
- Detailed meeting/calendar provider implementation behind room availability and schedule notifications `Unknown`

Evidence: absence of modules for payroll/onboarding in both repos; onboarding appears only as a candidate state in `hiring-app-ui-react/src/utils/constants.ts`

## Major Business Concepts And Terminology

- `Recruitment`: a staffed hiring request or opening with scope, owner, HR team, project/department context, dates, visibility, and vacancy target. `Confirmed`
- `Candidate`: the core person record with CV, contact data, status, comments, applications, interviews, pools, and blacklist state. `Confirmed`
- `Application history`: evidence that the same candidate can apply multiple times or to multiple recruitments over time. `Confirmed`
- `Talent pool`: curated or reusable collection of candidates, distinct from a single recruitment. `Confirmed`
- `Pending Pool`: special pool for candidates not yet placed into a normal talent pool or recruitment flow. `Confirmed`
- `Blacklist`: blocked-candidate control with reason capture and separate management screen. `Confirmed`
- `Interview schedule`: operational record for interview type, time, location, room/meeting link, interviewers, and communication status. `Confirmed`
- `Candidate status`: the hiring-stage lifecycle used to progress or end a candidate’s journey. `Confirmed`
- `Recruitment status` and `recruitment visibility`: two separate concepts; one appears to describe fulfillment progress and the other publishing/access mode. `Strong inference`
- `Search batch`: a web-crawling sourcing job defined by platform and search criteria. `Confirmed`

Evidence: `hiring-app-ui-react/src/@type/recruitments.ts`, `hiring-app-ui-react/src/@type/candidate.ts`, `hiring-app-ui-react/src/@type/interview-schedule.ts`, `hiring-app-ui-react/src/store/web-crawling/@type.ts`, `hiring-app-ui-react/src/utils/constants.ts`

## Confidence Summary For Major Conclusions

- Internal recruiting operations platform for SETA: `Confirmed`
- Primary operators are HR Manager and HR Executive: `Confirmed`
- Director is an oversight/reporting role with broad but not full control: `Confirmed`
- Managers and members are hiring participants with narrower operational authority: `Strong inference`
- Candidate records are long-lived and support repeated applications: `Confirmed`
- Talent pools are an operational working model, not just labels: `Confirmed`
- The system includes proactive external sourcing, not only inbound applicant handling: `Confirmed`
- The currently visible Nest app is only part of the full business behavior exercised by the UI: `Confirmed`
  Evidence: `hiring-app-api-nest/apps/seta-hrm-api/src/app/app.module.ts` versus UI contract in `hiring-app-ui-react/src/api/index.ts`
