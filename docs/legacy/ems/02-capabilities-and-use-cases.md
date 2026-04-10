# EMS Capabilities And Use Cases

## Workforce Records

### Capability: Employee master record management

- Business purpose: keep a single, structured record for each employee across HR, delivery, and compliance use cases.
- Primary actor(s): Super Admin, HR.
- Trigger: a new employee joins, or HR needs to maintain employee information.
- Main business flow: privileged staff create an employee, the system validates uniqueness, can generate an employee ID, can generate a company email on `seta-international.vn`, assigns the base organization role of `Employee`, and issues a temporary password. If Microsoft/Teams account creation is requested, the employee starts in `Pending Approve`; otherwise the employee starts `Active`.
- Outcome: a managed employee profile exists and is ready for later staffing, contract, and access workflows.
- Exceptions/failure cases if visible: duplicate identifiers or email-like fields are blocked; employee creation behavior changes depending on whether Teams creation is requested.
- Related screens/routes/forms/entities if relevant: `CreateEmployee.tsx`, employee models and related tables, `/employees/generate-email`, `/employees/employee-id-suggestions`.
- Evidence from repo: `EMS/src/core/services/employee_service.py`, `EMS/src/core/enums/employee.py`, `EMS-fe/src/pages/employees/CreateEmployee.tsx`, `EMS-fe/src/pages/employees/components/create/validation.ts`, `EMS/src/present/routers/employee_router.py`
- Confidence level: Confirmed

### Capability: Rich employee detail management

- Business purpose: store the full operating profile needed for employment administration, not just a name and contact card.
- Primary actor(s): HR, Super Admin, employees for self-maintenance of some fields.
- Trigger: profile completion, updates, compliance record maintenance, CV generation, contract generation.
- Main business flow: the system stores personal identity, addresses, tax and social insurance data, bank data, education, certifications, social links, languages, technical skills, project history, and child information in related employee tables.
- Outcome: EMS can support HR administration, contract placeholders, exports, and profile sharing from one record.
- Exceptions/failure cases if visible: none clearly exposed beyond standard validation and duplicate checks.
- Related screens/routes/forms/entities if relevant: employee detail/profile screens, employee-related models, CV download, share-link flow.
- Evidence from repo: `EMS/src/core/models/employee_related.py`, `EMS-fe/src/features/profile/Profile.tsx`, `EMS/src/core/services/employee_service.py`, `EMS-fe/src/hooks/useEmployeeAction.ts`
- Confidence level: Confirmed

## Controlled Self-Service

### Capability: Employee self-service profile change workflow

- Business purpose: let employees propose profile changes without giving them direct control over the official employee record.
- Primary actor(s): employees, HR, Super Admin.
- Trigger: an employee updates their own profile.
- Main business flow: non-super-admin changes are stored as an employee draft; HR or Super Admin can review draft profile changes and approve or reject them. Approval replaces the current employee record with the draft-backed version; rejection stores a comment and keeps the change out of the official record. Super Admin can edit directly without the draft workflow.
- Outcome: employee data stays current while sensitive changes remain governed.
- Exceptions/failure cases if visible: draft not found, employee not found, rejected drafts can carry comments; the UI surfaces draft status and comments back to the employee.
- Related screens/routes/forms/entities if relevant: `Profile.tsx`, `DraftProfileChanges.tsx`, `/employees/draft`, `/employees/draft/approve/{employee_id}`, `/employees/draft/reject/{employee_id}`, employee draft tables.
- Evidence from repo: `EMS-fe/src/features/profile/Profile.tsx`, `EMS-fe/src/pages/draft-profile-changes/DraftProfileChanges.tsx`, `EMS/src/core/models/employee_draft.py`, `EMS/src/core/services/employee_service.py`, `EMS/src/present/routers/employee_router.py`
- Confidence level: Confirmed

## Staffing And Delivery Operations

### Capability: Account and project workforce planning

- Business purpose: organize employees around client accounts and delivery projects so the company can track staffing, allocation, and delivery structure.
- Primary actor(s): HR, Account Manager, Project Manager, Executive.
- Trigger: a client account is created, a project is opened, or staffing changes are needed.
- Main business flow: accounts capture client-facing commercial context such as client company, domain, location, timezone, contract status, billing model, and dates. Projects live under accounts and carry status, delivery model, dates, and tags. Employees are assigned to projects with role name, effort percentage, position, billable/non-billable classification, and member type such as core, shadow, or backfill.
- Outcome: EMS represents who is assigned where, how heavily they are allocated, and what kind of delivery role they occupy.
- Exceptions/failure cases if visible: no explicit staffing approval flow is visible in the scanned code; operational dashboards imply the model is expected to remain current.
- Related screens/routes/forms/entities if relevant: Accounts, Projects, Account Employees, Project Employees, account and project dashboard types, project employee models.
- Evidence from repo: `EMS/src/core/models/account.py`, `EMS/src/core/models/project.py`, `EMS-fe/src/types/account.ts`, `EMS-fe/src/types/project.ts`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`
- Confidence level: Confirmed

### Capability: Organization workforce overview

- Business purpose: give leadership and operators a top-level view of workforce movement and idle capacity.
- Primary actor(s): Executive, HR, likely Super Admin.
- Trigger: periodic review of workforce health or staffing posture.
- Main business flow: employee overview screens expose new employees, total employees, and bench employees over selectable periods such as this month, last month, or custom date ranges.
- Outcome: decision-makers can monitor growth and unallocated capacity.
- Exceptions/failure cases if visible: custom-period reporting only runs when both dates are chosen.
- Related screens/routes/forms/entities if relevant: `EmployeesLayout.tsx`, overview info service.
- Evidence from repo: `EMS-fe/src/pages/employees/layouts/EmployeesLayout.tsx`, `EMS/src/present/routers/document_router.py`
- Confidence level: Confirmed

## Contract Operations

### Capability: Contract drafting, activation, and document generation

- Business purpose: manage employment contracts as governed records rather than ad hoc files.
- Primary actor(s): Super Admin, Executive, Contract Handler.
- Trigger: a new contract is needed, an existing contract changes, or a document must be generated from a template.
- Main business flow: a user creates a draft contract version for an employee with contract type, start date, term length, and one or more templates. The system enforces one draft contract per employee. Draft documents can be generated by filling placeholders from employee and contract data into template files stored in MinIO. When the contract version is saved, the latest previous contract version is marked `expired`, the draft becomes `active`, and contract reminder scheduling begins.
- Outcome: the employee has an active contract version with generated document artifacts and a tracked lifecycle state.
- Exceptions/failure cases if visible: a draft cannot be created if one already exists; at least one template must be selected in the frontend; duplicate template IDs are rejected; draft document deletion is only allowed on draft contracts.
- Related screens/routes/forms/entities if relevant: `EditContractDialog.tsx`, contract table, contract documents, `/contracts/draft-version`, `/contracts/fill-placeholders`, `/contracts/save-contract-document`.
- Evidence from repo: `EMS/src/core/services/contract_service.py`, `EMS/src/core/models/contract.py`, `EMS/src/core/constant/contract_placeholder.py`, `EMS-fe/src/pages/contracts/EditContractDialog.tsx`, `EMS/src/present/routers/contract_router.py`
- Confidence level: Confirmed

### Capability: Contract monitoring, handover tracking, and evaluation reminders

- Business purpose: keep active contracts visible, identify expiring contracts early, and route review work to the right people.
- Primary actor(s): Executive, Contract Handler, evaluation leaders.
- Trigger: contracts become active, approach their end date, or require handover/evaluation updates.
- Main business flow: the active-contract view lists employee, position, email, contract type, term, dates, handover status, evaluation leaders, and computed contract status. Handover status is configurable and can be updated. The contract reminder window is configurable through system settings. A scheduled scan marks qualifying contracts as `expiring` and creates contract tasks for assigned evaluation leaders.
- Outcome: contract review and follow-up work becomes operationally visible before a contract lapses.
- Exceptions/failure cases if visible: evaluation leader IDs cannot be empty; handover status must exist; reminder behavior depends on configured reminder days and assigned leaders.
- Related screens/routes/forms/entities if relevant: contract table columns, handover status config, contract evaluation leaders, contract tasks, system settings.
- Evidence from repo: `EMS/src/core/services/contract_service.py`, `EMS/src/core/constant/system_settings.py`, `EMS/src/core/models/configuration.py`, `EMS-fe/src/pages/contracts/components/contract-table/Columns.tsx`, `EMS-fe/src/pages/config/System.tsx`
- Confidence level: Confirmed

## Requests, Tasks, And Exit Operations

### Capability: Offboarding request and cross-functional clearance

- Business purpose: control employee exits through a tracked, multi-party workflow instead of a one-step status change.
- Primary actor(s): employees, HR, Super Admin, Project Manager, IT, handover assignee.
- Trigger: an employee wants to leave, or HR initiates an offboarding case on behalf of an employee.
- Main business flow: an employee can create their own offboarding request; HR or Super Admin can also create one. The request starts `pending`. HR or Super Admin approves or rejects it. Once approved, tasks can be created for handover assignee, project manager, HR, IT, and the employee. After task creation the offboarding case moves to `processing`. When the offboarding case is completed, the employee is deactivated, sessions are revoked, roles are removed, account memberships are removed, and a deactivation webhook is sent.
- Outcome: employee exit is coordinated, auditable, and connected to real access cleanup.
- Exceptions/failure cases if visible: duplicate offboarding requests are blocked; tasks cannot be created before approval; rejected requests can carry a reason and trigger rejection email notifications.
- Related screens/routes/forms/entities if relevant: Offboarding Requests, My Tasks, offboarding request actions, `CreateTaskForm.tsx`, `form_offboards`, `tasks`.
- Evidence from repo: `EMS/src/present/routers/offboarding_router.py`, `EMS/src/core/services/offboard_service.py`, `EMS/src/core/models/offboard.py`, `EMS/src/core/models/task.py`, `EMS-fe/src/pages/requests&tasks/offboarding/components/subtasks/CreateTaskForm.tsx`
- Confidence level: Confirmed

### Capability: Personal task completion with evidence

- Business purpose: let assignees close operational tasks while providing proof when needed.
- Primary actor(s): employees assigned to offboarding or contract tasks; HR and organization admins for oversight.
- Trigger: a task is assigned to a user.
- Main business flow: assignees view personal tasks, can mark tasks pending or completed, and can attach evidence. Organization administrators can also review or manage tasks.
- Outcome: workflow completion is traceable rather than assumed.
- Exceptions/failure cases if visible: task state changes are restricted to `pending` and `completed`; task visibility depends on assignment or privileged access.
- Related screens/routes/forms/entities if relevant: My Tasks route, `tasks`, `task_evidences`.
- Evidence from repo: `EMS/src/core/models/task.py`, `EMS/src/core/services/task_service.py`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`
- Confidence level: Confirmed

## Governance And Integration

### Capability: Role, access, and partner-access governance

- Business purpose: separate organization-wide authority from account/project authority, while also controlling who may work with partner integrations.
- Primary actor(s): Super Admin, HR, Executive.
- Trigger: a user needs permissions, a role assignment changes, or partner access must be granted or revoked.
- Main business flow: EMS uses organization, account, and project role scopes. Organization-level menus expose roles, employee role assignment, and partner access management. Partner access is managed by assigning employees to specific partners. Contract access has a business exception: contract handlers can enter the contract module without the normal role combination.
- Outcome: access is aligned to business responsibility rather than broad technical admin rights.
- Exceptions/failure cases if visible: contract module access uses a bypass only for configured contract handlers; partner access is partner-specific, not global.
- Related screens/routes/forms/entities if relevant: role pages, partner access page, `employee_roles`, `partner_access`, contract handler config.
- Evidence from repo: `EMS/src/core/models/role.py`, `EMS-fe/src/features/app-layout/hooks/menuConfig.ts`, `EMS-fe/src/components/role/partner/PartnersManagement.tsx`, `EMS/src/present/dependencies/contract_access_control.py`, `EMS-fe/src/pages/config/System.tsx`
- Confidence level: Confirmed

### Capability: Partner webhook management

- Business purpose: let partner-connected users expose employee lifecycle events to external systems in a controlled way.
- Primary actor(s): employees with partner access, admins who manage partner access.
- Trigger: a partner integration needs to receive lifecycle events or a delivery log must be reviewed.
- Main business flow: a user with access to a partner can configure webhook endpoints, regenerate API keys, test webhooks, toggle active state, and review delivery logs. EMS supports events such as `employee_created`, `employee_deactived`, and `test`. EMS includes the partner API key in the `X-API-KEY` header and retries failed webhook deliveries up to three times.
- Outcome: external partner systems can synchronize with EMS lifecycle changes.
- Exceptions/failure cases if visible: only one webhook per partner and event is allowed; log retries are explicitly supported; the key must be regenerated if lost.
- Related screens/routes/forms/entities if relevant: webhook management UI, webhook documentation, `webhooks`, `webhook_logs`, `keys`.
- Evidence from repo: `EMS/src/core/services/webhook_service.py`, `EMS/src/core/enums/intergration.py`, `EMS-fe/src/components/developer/webhook/WebhookManagement.tsx`, `EMS-fe/src/components/document/webhooks/sections/SecuritySection.tsx`, `EMS-fe/src/components/document/webhooks/sections/ResponseSection.tsx`
- Confidence level: Confirmed

### Capability: Export, sharing, and document access

- Business purpose: distribute employee information in controlled formats for operational use.
- Primary actor(s): Super Admin, HR, authorized internal viewers.
- Trigger: CV sharing, employee record sharing, or Excel export is needed.
- Main business flow: authorized users can download CVs, generate share links for employee profiles, and export employee data to Excel. Excel exports are delivered through the mail pipeline rather than simple inline file download. Contract documentation and webhook documentation are also exposed as dedicated documentation routes.
- Outcome: people outside the immediate editing workflow can consume needed information without direct database access.
- Exceptions/failure cases if visible: employee Excel export is restricted to Super Admin; employee share-link generation is restricted to Super Admin and HR.
- Related screens/routes/forms/entities if relevant: document routes, share-link route, employee actions hook, export email template.
- Evidence from repo: `EMS/src/present/routers/document_router.py`, `EMS/src/present/routers/employee_router.py`, `EMS/src/core/services/document_service.py`, `EMS-fe/src/hooks/useEmployeeAction.ts`, `EMS/src/templates/export_excel_email.html`
- Confidence level: Confirmed

## Observed But Incomplete In This Snapshot

### Capability: Salary management

- Business purpose: likely to manage employee salary totals and salary structure breakdowns.
- Primary actor(s): likely Super Admin and HR.
- Trigger: salary record creation, salary-history review, or salary-structure maintenance.
- Main business flow: the frontend contains salary DTOs, salary pages, and a salary mask that only Super Admin can unmask. A migration creates `salary` and `salary_structure` tables.
- Outcome: unclear in the current backend snapshot.
- Exceptions/failure cases if visible: the backend repository snapshot does not expose an active salary router or service through `main.py`, so end-to-end business behavior cannot be confirmed.
- Related screens/routes/forms/entities if relevant: salary pages and services, salary migration, salary mask component.
- Evidence from repo: `EMS-fe/src/service/salary/types.ts`, `EMS-fe/src/features/salary-mask/index.tsx`, `EMS/alembic/versions/cacbfca784e1_phase_5_contract_and_salary.py`, `EMS/main.py`
- Confidence level: Unknown
