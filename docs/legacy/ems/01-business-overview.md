# EMS Business Overview

## What The System Appears To Be

EMS appears to be an internal workforce operations platform for SETA International. It combines HR master data, account and project staffing, contract administration, offboarding orchestration, role governance, document generation, and partner/webhook integration into one operating system for employee lifecycle management.

Evidence: `EMS/README.md`, `EMS-fe/README.md`, `EMS/main.py`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`

## Confidence-Rated Core Conclusions

| Topic | Conclusion | Confidence | Evidence |
| --- | --- | --- | --- |
| System identity | EMS is an Employee Management System used as a single internal platform rather than a narrow employee directory. | Confirmed | `EMS/README.md`, `EMS-fe/README.md`, `EMS/main.py` |
| Business domain | The system sits in HR and workforce operations, with strong links to client account staffing and software delivery management. | Confirmed | `EMS-fe/README.md`, `EMS/src/core/models/account.py`, `EMS/src/core/models/project.py`, `EMS-fe/src/types/project.ts` |
| Industry context | The company appears to be a professional services or outsourced delivery organization managing employees across client accounts and projects. | Strong inference | `EMS/src/core/models/account.py`, `EMS/src/core/models/project.py`, `EMS-fe/src/types/account.ts`, `EMS-fe/src/types/project.ts` |
| Geographic/legal context | The implementation is oriented to Vietnam-specific employee and labor data. | Confirmed | `EMS-fe/src/pages/employees/components/create/validation.ts`, `EMS/worker/seed/configuration.py`, `EMS/src/core/models/employee_related.py`, `EMS-fe/src/pages/requests&tasks/offboarding/components/subtasks/CreateTaskForm.tsx` |
| Primary operators | HR, employees, executives, and system administrators are first-class actors. | Confirmed | `EMS-fe/README.md`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts` |
| Additional actors | Account managers, project managers, IT, handover assignees, contract handlers, and partner-access users are part of the real operating model. | Confirmed | `EMS/src/core/models/role.py`, `EMS/src/core/models/offboard.py`, `EMS/src/present/dependencies/contract_access_control.py`, `EMS-fe/src/components/role/partner/PartnersManagement.tsx` |
| Core problem solved | The system centralizes workforce data and governs sensitive lifecycle events that would otherwise be spread across spreadsheets, documents, email, and manual coordination. | Strong inference | `EMS-fe/README.md`, `EMS/src/core/services/employee_service.py`, `EMS/src/core/services/offboard_service.py`, `EMS/src/core/services/contract_service.py` |
| Operational model | Background reminders, notifications, document generation, and external sync are part of business behavior, not optional technical extras. | Confirmed | `EMS/src/core/services/offboard_service.py`, `EMS/src/core/services/contract_service.py`, `EMS/src/core/constant/system_settings.py`, `EMS/src/core/services/webhook_service.py` |
| Salary scope | Salary management is visible in the frontend and migration history, but the current backend snapshot does not expose an active salary module. | Unknown | `EMS-fe/src/service/salary/types.ts`, `EMS-fe/src/features/salary-mask/index.tsx`, `EMS/alembic/versions/cacbfca784e1_phase_5_contract_and_salary.py`, `EMS/main.py` |

## Business Domain / Industry Context

The system sits at the intersection of:

- HR administration: employee records, documents, identity data, profile updates, offboarding.
- Workforce planning: account structure, project staffing, allocation, bench visibility, role assignments.
- Contract operations: contract types, document templates, handover state, reminders, evaluations.
- Governance and operations: RBAC, audit logging, partner access, webhook delivery, configurable handlers and reminder windows.

The account and project model strongly suggests a service company that allocates employees to client work rather than a business that only tracks internal departments.

Evidence: `EMS/src/core/models/account.py`, `EMS/src/core/models/project.py`, `EMS-fe/src/pages/employees/layouts/EmployeesLayout.tsx`, `EMS-fe/src/types/account.ts`

## Core Business Problem Solved

The system solves the need for a controlled system of record for employee lifecycle operations:

- create and maintain rich employee profiles;
- expose controlled self-service for profile changes;
- map employees onto client accounts and projects;
- manage employment contracts and generate contract documents from templates;
- handle employee exits through a tracked, multi-party clearance workflow;
- enforce who can see or act on sensitive workforce data;
- keep dependent partner systems informed when employee status changes.

Evidence: `EMS-fe/README.md`, `EMS/src/core/services/employee_service.py`, `EMS/src/core/services/offboard_service.py`, `EMS/src/core/services/contract_service.py`, `EMS/src/core/services/webhook_service.py`

## Target Users / Actors

- HR Department: creates and updates employees, reviews draft profile changes, manages offboarding, manages workforce data, and likely owns much of the day-to-day system operation. Evidence: `EMS-fe/README.md`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`
- Employees: view and update their own profile, access personal tasks, trigger offboarding requests, download or share some personal documents. Evidence: `EMS-fe/README.md`, `EMS-fe/src/features/profile/Profile.tsx`, `EMS/src/present/routers/offboarding_router.py`
- Executives: view organization-level data, contracts, roles, and configuration. Evidence: `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`, `EMS/src/core/models/role.py`
- System Administrators / Super Admins: manage organization settings, exports, templates, full-role operations, and privileged visibility. Evidence: `EMS/src/core/models/role.py`, `EMS/src/present/routers/document_router.py`, `EMS-fe/src/pages/config/System.tsx`
- Account Managers: operate in account scope and likely own client account staffing oversight. Evidence: `EMS/src/core/models/role.py`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`
- Project Managers: operate in project scope and participate in staffing and offboarding handover steps. Evidence: `EMS/src/core/models/role.py`, `EMS/src/core/models/offboard.py`
- IT: participates in offboarding recovery and access shutdown tasks. Evidence: `EMS/src/core/models/offboard.py`, `EMS-fe/src/pages/requests&tasks/offboarding/components/subtasks/CreateTaskForm.tsx`
- Contract Handlers: receive contract responsibilities and notifications even if they do not have the standard organization role set for contract access. Evidence: `EMS/src/present/dependencies/contract_access_control.py`, `EMS-fe/src/pages/config/System.tsx`

## Value The System Provides

- One employee record across HR, delivery, and contract operations.
- Controlled change management for employee profile updates.
- Better visibility into who is staffed, bench, billable, non-billable, core, shadow, or backfill.
- Faster contract generation through reusable templates and placeholders.
- Traceable exit operations with deadlines, assignees, reminders, evidence, and deactivation side effects.
- Lower risk from role-based access control, audit logging, and partner/webhook governance.

Evidence: `EMS-fe/README.md`, `EMS-fe/src/types/account.ts`, `EMS-fe/src/types/project.ts`, `EMS/src/core/models/task.py`, `EMS/src/core/services/contract_service.py`

## Scope Boundaries

### Inside The System

- Employee identity, personal, legal, family, education, language, skill, and project-history data.
- Employee self-service profile draft workflow.
- Organization, account, and project role assignment.
- Client account and project staffing views.
- Contract drafting, activation, handover tracking, document generation, and evaluation reminders.
- Offboarding requests and task clearance.
- Partner access management, webhook setup, webhook logging, and API key rotation.
- Document export, employee profile sharing, and audit logging.

Evidence: `EMS/main.py`, `EMS/src/core/models/employee.py`, `EMS/src/core/models/employee_related.py`, `EMS/src/core/models/project.py`, `EMS/src/core/models/contract.py`, `EMS/src/core/models/task.py`, `EMS/src/core/models/partner.py`, `EMS/src/core/models/webhook.py`

### Outside Or Unclear

- Recruitment / applicant tracking is not visible.
- Payroll execution is not confirmed; salary appears partial in this snapshot.
- Attendance, leave, and timesheet execution are not core EMS capabilities, though partner integrations may connect to related tools.
- Electronic contract signing is not visible.
- A general employee request module exists in navigation, but the `My Requests` page is explicitly not available yet.
- A broader performance-review product area may have been intended, but only contract evaluation and a developer/PR evaluation model are clearly evidenced.

Evidence: `EMS-fe/src/pages/requests&tasks/myrequests/MyRequest.tsx`, `EMS-fe/src/service/salary/types.ts`, `EMS/main.py`, `EMS/src/core/models/evaluation.py`

## Major Business Concepts And Terminology

- Employee: the core person record managed by EMS. Evidence: `EMS/src/core/models/employee.py`
- Employee Draft: a staged version of employee data pending HR approval or rejection. Evidence: `EMS/src/core/models/employee_draft.py`
- Account: a client or commercial account context that groups projects and staffing. Evidence: `EMS/src/core/models/account.py`
- Project: a delivery unit under an account, with staffing, delivery model, and status. Evidence: `EMS/src/core/models/project.py`
- Project Employee: an employee’s assignment to a project, including effort, billing type, member type, position, and role. Evidence: `EMS/src/core/models/project.py`, `EMS-fe/src/types/project.ts`
- Contract Version: a time-bounded employment contract record for an employee. Evidence: `EMS/src/core/models/contract.py`
- Contract Template / Template Group: reusable source documents for contract generation. Evidence: `EMS/src/core/models/contract.py`, `EMS-fe/src/pages/contracts/EditContractDialog.tsx`
- Contract Handler: a configurable person who receives contract responsibilities and notifications and can access the contract module. Evidence: `EMS/src/core/models/configuration.py`, `EMS/src/present/dependencies/contract_access_control.py`
- Handover Status: a configurable contract-related handover state. Evidence: `EMS/src/core/models/configuration.py`, `EMS/worker/seed/configuration.py`
- Offboarding Request: an employee exit case with state, date, reason, and downstream tasks. Evidence: `EMS/src/core/models/offboard.py`
- Task: a unit of work attached to offboarding or contracts, with assignee, deadline, status, and optional evidence. Evidence: `EMS/src/core/models/task.py`
- Partner: an external consumer or integration boundary with employee access control and webhook/API key management. Evidence: `EMS/src/core/models/partner.py`, `EMS/src/core/services/webhook_service.py`
