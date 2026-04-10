# EMS Workflows, Rules, And Domain

## End-To-End Workflows

### Workflow: Employee creation and initial activation

- What happens: HR or Super Admin creates an employee record. The service can generate an employee ID, generate a company email in the `seta-international.vn` domain, assign the default organization role `Employee`, and issue a temporary password.
- Who does it: HR or Super Admin.
- What conditions apply: if `create_teams` is enabled, the employee is created in `Pending Approve`; otherwise `Active`. Frontend validation shows country-specific phone validation and structured profile requirements.
- What state changes occur: a new employee row is created; an organization role row is created; related data can be attached; email and password workflows are triggered.
- What business consequence results: EMS becomes the starting system of record for the employee and may also trigger Microsoft account provisioning support work.
- Evidence: `EMS/src/core/services/employee_service.py`, `EMS/src/core/enums/employee.py`, `EMS-fe/src/pages/employees/CreateEmployee.tsx`, `EMS-fe/src/pages/employees/components/create/validation.ts`

### Workflow: Employee self-update with HR review

- What happens: employees edit profile data through self-service, but the official record is not changed immediately.
- Who does it: employee initiates; HR or Super Admin reviews.
- What conditions apply: non-super-admin changes go into draft tables; super-admin edits can update the official record directly.
- What state changes occur: draft rows are created or replaced and marked `Draft`; approval overwrites the employee record and deletes the draft; rejection marks the draft `Rejected` and stores a comment.
- What business consequence results: the system balances employee self-service with HR governance over official employee data.
- Evidence: `EMS-fe/src/features/profile/Profile.tsx`, `EMS/src/core/models/employee_draft.py`, `EMS/src/core/services/employee_service.py`, `EMS-fe/src/pages/draft-profile-changes/DraftProfileChanges.tsx`

### Workflow: Offboarding request to full deactivation

- What happens: an offboarding case is opened, reviewed, operational tasks are assigned, and completion triggers access cleanup.
- Who does it: employee or HR/Super Admin initiates; HR/Super Admin approves or rejects; PM, HR, IT, employee, and handover assignee complete tasks.
- What conditions apply: only one active offboarding case per employee is allowed; tasks can only be created once the request is approved.
- What state changes occur: offboarding request goes `pending -> approved -> processing -> completed`, or `pending -> rejected`. Related tasks go `pending -> completed`. Final completion changes employee status to `Inactive`, revokes sessions, deletes roles, removes account links, and emits a deactivation webhook.
- What business consequence results: exit operations are not complete until operational cleanup is done, and employee access status follows the workflow rather than a manual toggle.
- Evidence: `EMS/src/core/models/offboard.py`, `EMS/src/core/services/offboard_service.py`, `EMS/src/core/services/task_service.py`, `EMS/src/present/routers/offboarding_router.py`, `EMS-fe/src/pages/requests&tasks/offboarding/components/subtasks/CreateTaskForm.tsx`

### Workflow: Contract draft to active contract

- What happens: an operator creates a draft contract version, optionally generates draft documents from templates, and then saves the version into active status.
- Who does it: Executive, Super Admin, or Contract Handler.
- What conditions apply: an employee cannot have more than one draft contract at a time; templates are expected; template references must be valid; some update actions are allowed only while the contract is in draft.
- What state changes occur: new version starts `draft`; contract documents are attached to that draft; when the version is saved, the latest previous contract becomes `expired` and the draft becomes `active`.
- What business consequence results: the system treats contracts as versioned governed records, with one active version representing the current employment contract.
- Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/models/contract.py`, `EMS-fe/src/pages/contracts/EditContractDialog.tsx`

### Workflow: Expiring contract follow-up

- What happens: the scheduler scans active contracts approaching end date, marks them as `expiring`, and creates evaluation tasks for assigned leaders.
- Who does it: background scheduler initiates; evaluation leaders receive and complete tasks.
- What conditions apply: reminder lead time is driven by the configurable `CONTRACT_REMINDER_DAYS`; leaders must be assigned to the contract version for evaluation tasks to be created.
- What state changes occur: computed or persisted contract status becomes `expiring`; `contract` tasks are created with deadlines aligned to contract end date.
- What business consequence results: contract renewals and end-of-term employee assessments become operational work items rather than passive calendar reminders.
- Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/constant/system_settings.py`, `EMS/src/core/models/task.py`

### Workflow: Account/project staffing and capacity visibility

- What happens: employees are attached to client accounts and projects and classified by role, allocation, billing type, and member type.
- Who does it: HR, Account Manager, Project Manager, Executive.
- What conditions apply: assignments are scoped by account or project; account and project roles exist in addition to organization roles.
- What state changes occur: account/project relationships and employee role rows are created or updated; allocation metrics and billable/non-billable views change.
- What business consequence results: EMS becomes the staffing and delivery visibility layer, not only the HR record system.
- Evidence: `EMS/src/core/models/account.py`, `EMS/src/core/models/project.py`, `EMS/src/core/models/role.py`, `EMS-fe/src/types/account.ts`, `EMS-fe/src/types/project.ts`

### Workflow: Partner access and webhook operations

- What happens: employees are granted access to specific partner integrations, then use that access to manage partner webhooks and API keys.
- Who does it: HR or admins grant/revoke access; partner-access users manage their partner integration.
- What conditions apply: access is partner-specific; webhook creation is limited to one webhook per partner and event.
- What state changes occur: partner access entries are created or removed; webhook endpoints, active state, keys, and delivery logs are created or updated.
- What business consequence results: downstream systems can react to EMS lifecycle events in a governed, auditable way.
- Evidence: `EMS/src/core/models/partner.py`, `EMS/src/core/models/webhook.py`, `EMS/src/core/services/partner_service.py`, `EMS/src/core/services/webhook_service.py`, `EMS-fe/src/components/developer/webhook/WebhookManagement.tsx`

## Business Rules And Constraints

- Official employee data is not open-edit for normal employees. Non-super-admin self-edits go through draft approval. Evidence: `EMS-fe/src/features/profile/Profile.tsx`, `EMS/src/core/services/employee_service.py`
- Employee creation assigns the organization role `Employee` automatically. Evidence: `EMS/src/core/services/employee_service.py`
- Employee creation status depends on Microsoft/Teams provisioning choice. `create_teams=true` leads to `Pending Approve`; otherwise `Active`. Evidence: `EMS/src/core/services/employee_service.py`, `EMS-fe/src/pages/employees/CreateEmployee.tsx`
- Company email generation is tied to `seta-international.vn`. Evidence: `EMS/src/core/services/employee_service.py`, `EMS/src/present/routers/employee_router.py`
- One employee cannot have multiple concurrent offboarding cases. Evidence: `EMS/src/core/services/offboard_service.py`
- Offboarding tasks can only be created after HR approval. Evidence: `EMS/src/core/services/offboard_service.py`
- Completing offboarding is not just a form status change. It deactivates the employee and removes active operational access. Evidence: `EMS/src/core/services/offboard_service.py`
- Offboarding work is deliberately split across role categories `pm`, `hr`, `employee`, `it`, and `assignee`. Evidence: `EMS/src/core/models/offboard.py`, `EMS-fe/src/pages/requests&tasks/offboarding/components/subtasks/CreateTaskForm.tsx`
- Contract lifecycle is versioned. A new active contract expires the latest previous contract. Evidence: `EMS/src/core/services/contract_service.py`
- Only one draft contract per employee is allowed. Evidence: `EMS/src/core/services/contract_service.py`
- Contract creation/update depends on templates. Frontend requires at least one template; backend rejects duplicate template IDs. Evidence: `EMS-fe/src/pages/contracts/EditContractDialog.tsx`, `EMS/src/core/services/contract_service.py`
- Contract document generation depends on placeholder mapping from employee and contract data into templates stored in object storage. Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/constant/contract_placeholder.py`
- Contract reminder timing is configurable, not hard-coded. Evidence: `EMS/src/core/constant/system_settings.py`, `EMS/src/core/services/contract_service.py`
- Contract Handlers are a special access category that bypasses normal contract role checks. Evidence: `EMS/src/present/dependencies/contract_access_control.py`, `EMS-fe/src/pages/config/System.tsx`
- Employee Excel export is restricted to Super Admin. Evidence: `EMS/src/present/routers/document_router.py`
- Employee share-link generation is restricted to Super Admin and HR. Evidence: `EMS/src/present/routers/employee_router.py`
- Salary visibility, where present in the frontend, is masked for everyone except Super Admin. Evidence: `EMS-fe/src/features/salary-mask/index.tsx`
- `My Requests` is not an active workflow in this snapshot even though the menu structure anticipates it. Evidence: `EMS-fe/src/pages/requests&tasks/myrequests/MyRequest.tsx`

## Permission And Role Boundaries

- Organization scope roles: `Super Admin`, `HR`, `Executive`, `Employee`, and possibly `External/Part-time` define company-wide access patterns. Evidence: `EMS/src/core/models/role.py`
- Account scope roles: `Account Manager` is modeled as an account-level role. Evidence: `EMS/src/core/models/role.py`
- Project scope roles: `Project Manager` is modeled as a project-level role. Evidence: `EMS/src/core/models/role.py`
- Super Admin: the broadest operator role; sees configuration, contract setup, exports, and privileged data controls. Evidence: `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`, `EMS/src/present/routers/document_router.py`
- HR: the main workforce operator; manages employees, drafts, offboarding, and organization-level roles. Evidence: `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`, `EMS/src/present/routers/employee_router.py`, `EMS/src/present/routers/offboarding_router.py`
- Executive: oversight role with broad viewing and contract/configuration access. Evidence: `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`
- Employee: self-service actor with access to own profile and personal tasks. Evidence: `EMS-fe/README.md`, `EMS-fe/src/features/profile/Profile.tsx`
- Contract Handler: a functional access role stored in configuration rather than the main RBAC table; grants contract module entry even without the normal role combination. Evidence: `EMS/src/core/models/configuration.py`, `EMS/src/present/dependencies/contract_access_control.py`
- Partner-access users: a separate access overlay used for partner-specific operations. Evidence: `EMS/src/core/models/partner.py`, `EMS-fe/src/components/role/partner/PartnersManagement.tsx`

## Core Domain Entities And Their Meaning

- Employee: the master workforce record. States visible: `Active`, `Inactive`, `Pending Approve`. Evidence: `EMS/src/core/enums/employee.py`
- Employee Draft: a pending or rejected proposed version of employee data. States visible: `Draft`, `Approved`, `Rejected`. Evidence: `EMS/src/core/enums/employee.py`, `EMS/src/core/models/employee_draft.py`
- Account: commercial/client container for delivery work. States visible through `contract_status`: `Active`, `On Hold`, `Closed`. Evidence: `EMS/src/core/models/account.py`
- Project: delivery unit under an account. States visible: `Active`, `On Hold`, `Closed`. Delivery models include `Scrum`, `Kanban`, `Waterfall`, `Other`. Evidence: `EMS/src/core/models/project.py`
- Project Employee assignment: the staffing relationship between a person and a project, including effort percentage, position, billing type, and member type. Evidence: `EMS/src/core/models/project.py`, `EMS-fe/src/types/project.ts`
- Contract Version: the time-bounded contract record for an employee. States visible: `draft`, `active`, `terminated`, `expired`, `expiring`, `default`. Evidence: `EMS/src/core/models/contract.py`
- Contract Evaluation Leader: the person responsible for evaluating an expiring contract. Evidence: `EMS/src/core/models/contract.py`, `EMS/src/core/services/contract_service.py`
- Contract Evaluation: the review artifact with score, strengths, improvements, summary, and result `PASS`, `FAIL`, or `EXTEND`. Evidence: `EMS/src/core/models/contract.py`
- Contract Type, Handover Status, Contract Handler: configurable contract administration reference data. Evidence: `EMS/src/core/models/configuration.py`, `EMS/worker/seed/configuration.py`
- Offboarding Request: the parent exit case. States visible: `pending`, `approved`, `processing`, `rejected`, `completed`. Evidence: `EMS/src/core/models/offboard.py`
- Task: a reusable work item attached to `offboard` or `contract`, with `pending` or `completed` state. Evidence: `EMS/src/core/models/task.py`
- Partner, Key, Webhook, Webhook Log: the objects used to manage external partner access and delivery. Evidence: `EMS/src/core/models/partner.py`, `EMS/src/core/models/webhook.py`

## Operational / Back-Office / Manual Processes Implied By The Repo

- Microsoft identity operations matter to the business flow. EMS supports Microsoft login, session tracking by provider, avatar sync, and optional Microsoft/Teams account provisioning behavior during employee creation. Evidence: `EMS/src/core/services/auth_service.py`, `EMS/src/sdk/microsoft/client.py`, `EMS/src/core/services/employee_service.py`
- Email is part of the operating model, not a nice-to-have. OTPs, temporary passwords, offboarding notices, rejection emails, export completion, and contract reminders are sent through the mail pipeline. Evidence: `EMS/src/core/services/auth_service.py`, `EMS/src/core/services/offboard_service.py`, `EMS/src/core/services/document_service.py`, `EMS/worker/seed/email_templates.py`
- Scheduled jobs are business-critical because reminder timing drives contract and offboarding follow-up. Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/constant/system_settings.py`
- MinIO or equivalent object storage is business-critical for contract documents and media access. Evidence: `EMS/src/core/services/contract_service.py`, `EMS/src/core/services/auth_service.py`
- Seed data suggests a controlled rollout model with configured contract types, handover statuses, partners, and a seeded HR admin. Evidence: `EMS/worker/seed/configuration.py`, `EMS/worker/seed/partner.py`, `EMS/worker/seed/hr_admin.py`
- The worker import mapper suggests there may be an ongoing or historical spreadsheet-to-system migration process for employee data. Evidence: `EMS/worker/seed/employee/data_mapper.py`

## External Dependencies That Affect Business Flow

- Microsoft Graph / Microsoft 365: authentication, user lookup, avatar sync, and likely user-provisioning support. Evidence: `EMS/src/sdk/microsoft/client.py`, `EMS/src/core/services/auth_service.py`
- MinIO / object storage: template storage, generated document storage, media URLs. Evidence: `EMS/src/core/services/contract_service.py`
- Mail worker / templates: operational communication for approvals, tasks, exports, and reminders. Evidence: `EMS/worker/consumer/mail/mail_service.py`, `EMS/src/templates/export_excel_email.html`
- Partner systems consuming webhooks: employee lifecycle changes can have downstream business effects outside EMS. Evidence: `EMS/src/core/services/webhook_service.py`, `EMS/src/core/enums/intergration.py`
