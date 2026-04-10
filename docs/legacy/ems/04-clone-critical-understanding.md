# Clone-Critical Understanding

This section captures what a cloning team must preserve from the current EMS business behavior. If these behaviors are simplified away, the result will not be a faithful clone of the existing system.

## Core Business Capabilities That Cannot Be Lost

- EMS is not just an employee directory. It is a combined HR operations, staffing, contract, and exit-management system. A clone must preserve that breadth. Evidence: `EMS/README.md`, `EMS-fe/README.md`, `EMS/main.py`
- The employee record is a rich operational and compliance object. A clone must preserve legal, tax, insurance, bank, family, skill, and project-history data, not just basic identity fields. Evidence: `EMS/src/core/models/employee_related.py`
- Account and project staffing are part of the core product, not side data. A clone must preserve employee allocation to client accounts/projects, including effort, billing type, member type, and role context. Evidence: `EMS/src/core/models/project.py`, `EMS-fe/src/types/project.ts`, `EMS-fe/src/types/account.ts`
- Contract administration is a first-class business capability. A clone must preserve contract versions, template-driven document generation, handover tracking, reminder timing, and evaluation-leader workflow. Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/models/contract.py`, `EMS/src/core/models/configuration.py`
- Offboarding is a governed clearance process. A clone must preserve approval, multi-role task assignment, reminders, evidence, and final deactivation side effects. Evidence: `EMS/src/core/services/offboard_service.py`, `EMS/src/core/models/offboard.py`, `EMS/src/core/models/task.py`
- RBAC is multi-scope and business-shaped. A clone must preserve organization, account, and project scopes plus the contract-handler exception and partner-access overlay. Evidence: `EMS/src/core/models/role.py`, `EMS/src/present/dependencies/contract_access_control.py`, `EMS/src/core/models/partner.py`

## Essential Workflows To Preserve

### Employee data governance

- Preserve the difference between direct admin edits and employee-submitted drafts.
- Preserve approval and rejection of profile drafts, including returned comments to the employee.
- Preserve automatic base-role assignment and company email generation behavior at employee creation.

Evidence: `EMS/src/core/services/employee_service.py`, `EMS-fe/src/features/profile/Profile.tsx`, `EMS-fe/src/pages/draft-profile-changes/DraftProfileChanges.tsx`

### Contract lifecycle

- Preserve the rule that contract work begins as a draft version.
- Preserve the rule that one employee can have only one draft contract at a time.
- Preserve placeholder-based document generation from employee and contract data.
- Preserve the transition where saving a contract makes the draft active and expires the latest previous contract.
- Preserve expiring-contract detection and evaluation task creation.

Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/constant/contract_placeholder.py`, `EMS/src/core/constant/system_settings.py`

### Offboarding lifecycle

- Preserve employee self-initiation and HR-initiated offboarding.
- Preserve HR review before task assignment.
- Preserve the role buckets used for clearance work: PM, HR, employee, IT, handover assignee.
- Preserve hard cleanup on completion: deactivate employee, revoke sessions, remove roles, remove account memberships, emit deactivation webhook.

Evidence: `EMS/src/core/services/offboard_service.py`, `EMS/src/core/models/offboard.py`, `EMS-fe/src/pages/requests&tasks/offboarding/components/subtasks/CreateTaskForm.tsx`

### Staffing lifecycle

- Preserve account ownership and project ownership as distinct concepts.
- Preserve allocation, billable status, and member-type semantics because they are visible in dashboards and staffing views.
- Preserve bench visibility and organization-level headcount trend reporting.

Evidence: `EMS/src/core/models/account.py`, `EMS/src/core/models/project.py`, `EMS-fe/src/pages/employees/layouts/EmployeesLayout.tsx`, `EMS-fe/src/types/project.ts`

## Critical Business Rules To Preserve

- Employee creation status depends on whether a Teams account should be created. Evidence: `EMS/src/core/services/employee_service.py`, `EMS-fe/src/pages/employees/CreateEmployee.tsx`
- Company email generation is bound to the company domain `seta-international.vn`. Evidence: `EMS/src/core/services/employee_service.py`
- Offboarding cannot proceed to task assignment without approval. Evidence: `EMS/src/core/services/offboard_service.py`
- Offboarding requests appear to be unique per employee while active. Evidence: `EMS/src/core/services/offboard_service.py`
- Contract reminder timing is configurable by system settings rather than fixed in code. Evidence: `EMS/src/core/constant/system_settings.py`, `EMS/src/core/services/contract_service.py`
- Contract document generation depends on templates and placeholder mapping, not free-form uploads alone. Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/constant/contract_placeholder.py`
- Partner webhook behavior includes a one-webhook-per-partner-per-event rule and retry logic. Evidence: `EMS/src/core/services/webhook_service.py`, `EMS-fe/src/components/document/webhooks/sections/ResponseSection.tsx`
- Sensitive data visibility is role-sensitive. The clearest explicit example is salary masking for non-Super-Admin users in the frontend. Evidence: `EMS-fe/src/features/salary-mask/index.tsx`

## Essential Actors And Permission Boundaries

- Super Admin: preserve broad system authority, configuration access, export privileges, and highest-sensitivity visibility.
- HR: preserve workforce-operations ownership over employee data, draft approvals, and offboarding control.
- Executive: preserve organization-level oversight and contract/configuration access.
- Account Manager and Project Manager: preserve scoped responsibility below organization level.
- Employee: preserve self-service but keep official-record control limited.
- Contract Handler: preserve as a separate operational actor with contract-module access by configuration, not only RBAC.
- Partner-access user: preserve as a partner-specific permission overlay.

Evidence: `EMS/src/core/models/role.py`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`, `EMS/src/present/dependencies/contract_access_control.py`, `EMS-fe/src/components/role/partner/PartnersManagement.tsx`

## Key Domain Entities And State Models

- Employee: `Active`, `Inactive`, `Pending Approve`. Evidence: `EMS/src/core/enums/employee.py`
- Employee Draft: `Draft`, `Approved`, `Rejected`. Evidence: `EMS/src/core/enums/employee.py`, `EMS/src/core/models/employee_draft.py`
- Offboarding Request: `pending`, `approved`, `processing`, `rejected`, `completed`. Evidence: `EMS/src/core/models/offboard.py`
- Task: `pending`, `completed`, and module-scoped to `offboard` or `contract`. Evidence: `EMS/src/core/models/task.py`
- Contract Version: `draft`, `active`, `terminated`, `expired`, `expiring`, `default`. Evidence: `EMS/src/core/models/contract.py`
- Contract Evaluation: `PASS`, `FAIL`, `EXTEND`. Evidence: `EMS/src/core/models/contract.py`
- Account and Project: both carry operating status concepts that affect staffing context. Evidence: `EMS/src/core/models/account.py`, `EMS/src/core/models/project.py`
- Project Staffing Assignment: employee + project + role + effort + billing type + member type + position. Evidence: `EMS/src/core/models/project.py`, `EMS-fe/src/types/project.ts`

## Operational Processes That Appear Necessary

- Scheduled reminders for expiring contracts and task deadlines.
- Mail-driven operational communication for passwords, OTP, offboarding, exports, and contract follow-up.
- Template storage and generated document storage in object storage.
- Manual administration of contract handlers, contract types, handover statuses, and partner access.
- Seeded or imported baseline data, especially around employees and reference configuration.

Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/services/offboard_service.py`, `EMS/worker/seed/configuration.py`, `EMS/worker/seed/employee/data_mapper.py`

## External Dependencies That Materially Affect Behavior

- Microsoft identity services materially affect login and employee setup behavior. A clone that ignores this may break real onboarding and access patterns. Evidence: `EMS/src/core/services/auth_service.py`, `EMS/src/sdk/microsoft/client.py`
- Object storage materially affects contract generation and media retrieval. Evidence: `EMS/src/core/services/contract_service.py`
- Mail worker behavior materially affects approvals, exports, and reminders. Evidence: `EMS/worker/consumer/mail/mail_service.py`
- Partner webhook consumers materially affect employee lifecycle propagation outside EMS. Evidence: `EMS/src/core/services/webhook_service.py`

## What Seems Configurable Vs Fixed

### Configurable

- Contract Handlers. Evidence: `EMS-fe/src/pages/config/System.tsx`, `EMS/src/core/models/configuration.py`
- Contract Types. Evidence: `EMS-fe/src/pages/config/System.tsx`, `EMS/worker/seed/configuration.py`
- Handover Statuses. Evidence: `EMS-fe/src/pages/config/System.tsx`, `EMS/worker/seed/configuration.py`
- Reminder windows such as `CONTRACT_REMINDER_DAYS` and `EVALUATION_REMINDER_DAYS`. Evidence: `EMS/src/core/constant/system_settings.py`
- Templates and template groups. Evidence: `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`, `EMS-fe/src/pages/contracts/EditContractDialog.tsx`
- Partner access assignments and webhook endpoints. Evidence: `EMS-fe/src/components/role/partner/PartnersManagement.tsx`, `EMS-fe/src/components/developer/webhook/WebhookManagement.tsx`

### Fixed Or Hard-Coded In The Snapshot

- Core roles and role scopes. Evidence: `EMS/src/core/models/role.py`
- Company email domain `seta-international.vn`. Evidence: `EMS/src/core/services/employee_service.py`
- Offboarding assignee role buckets `pm`, `hr`, `employee`, `it`, `assignee`. Evidence: `EMS/src/core/models/offboard.py`
- Webhook event set `employee_created`, `employee_deactived`, `test`. Evidence: `EMS/src/core/enums/intergration.py`
- Webhook retry policy of three attempts. Evidence: `EMS/src/core/services/webhook_service.py`, `EMS-fe/src/components/document/webhooks/sections/ResponseSection.tsx`

## What Is Still Unclear From The Repo

- Salary management is ambiguous. The frontend and migrations suggest it exists or existed, but the current backend application wiring does not clearly expose it.
- The broader evaluation module is unclear beyond contract evaluation and a developer/PR evaluation data model.
- The generic `My Requests` area is present in navigation design but not actually implemented in the current frontend.
- The exact production use of partner integrations beyond webhook delivery is not fully visible from the scanned code.
- The precise approval meaning of `Pending Approve` on employee creation is implied by Microsoft/Teams creation but not fully documented in prose.

Evidence: `EMS-fe/src/service/salary/types.ts`, `EMS/alembic/versions/cacbfca784e1_phase_5_contract_and_salary.py`, `EMS/main.py`, `EMS/src/core/models/evaluation.py`, `EMS-fe/src/pages/requests&tasks/myrequests/MyRequest.tsx`

## Questions That Need Confirmation Before Cloning

- Is salary management live in production, intentionally removed, or pending reimplementation?
- Is EMS intended to be the source of truth for staffing decisions, or only a reporting mirror of staffing managed elsewhere?
- What is the exact business trigger and approval owner for moving a newly created employee from `Pending Approve` to full operational readiness?
- Are contract evaluations only for expiring contracts, or do they also drive renewal, promotion, or probation decisions outside what is visible here?
- Which partner systems are business-critical, and what downstream processes depend on `employee_created` and `employee_deactived` events?
- Are there any manual steps outside EMS that are required before an offboarding case can be marked `completed`?
- Which document templates are legally mandatory versus operationally optional?

## Bottom Line

To clone EMS faithfully, preserve the system as a governed employee-lifecycle operations platform with four tightly connected pillars:

- employee master data and controlled self-service;
- staffing across accounts and projects;
- contract versioning and document/reminder operations;
- offboarding clearance with real access cleanup and downstream sync.

If any of those pillars are reduced to simple CRUD, the clone will miss the real business behavior embodied in the repositories.
