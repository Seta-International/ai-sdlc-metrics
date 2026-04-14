---
module: employee
task: field-access-control
created: 2026-04-14
priority: medium
depends-on: [004]
---

# Task: Field-Level Access Control

## Scope

Implement 3-tier field visibility on employee profiles so sensitive data is only visible to authorized viewers:

- **public** — visible to all authenticated employees (name, email, title, department, skills)
- **restricted** — visible to HR + direct manager + self (home address, personal email, DOB)
- **confidential** — visible to HR only (salary, national ID, bank details, tax ID)

## Roles Covered

- **SUPER_ADMIN:** Configure field visibility tiers, view all fields
- **HR:** View all fields including confidential
- **EXECUTIVE:** View public + restricted fields
- **MANAGER:** View public fields for all, restricted fields for direct reports
- **EMPLOYEE:** View all own fields, public fields for others
- **EXTERNAL_PARTIME:** View public fields for team members only

## Business Context

Privacy is a legal requirement (GDPR, Vietnamese data protection law). Every modern HRM restricts who can see salary, national ID, and bank details. The legacy system has no field-level access control — if you can see a profile, you see everything. This is a compliance risk.

## Source Reference

- **Files:** No legacy equivalent — all-or-nothing access in legacy
- **Key logic:** N/A — new feature based on HRM industry standards

## Target Location

- **Where:** `apps/api/src/modules/people/application/queries/`, `apps/api/src/modules/people/domain/`
- **Conventions to follow:** Apply filtering at the query handler level, not at the tRPC layer

## Data Model

Field visibility can be defined as a static mapping (not tenant-configurable for MVP):

```typescript
const FIELD_VISIBILITY: Record<string, 'public' | 'restricted' | 'confidential'> = {
  // Public
  displayName: 'public',
  email: 'public',
  jobTitle: 'public',
  department: 'public',
  workLocation: 'public',
  workArrangement: 'public',
  avatarUrl: 'public',
  skills: 'public',
  languages: 'public',

  // Restricted
  personalEmail: 'restricted',
  personalPhone: 'restricted',
  dob: 'restricted',
  permanentAddress: 'restricted',
  currentAddress: 'restricted',
  maritalStatus: 'restricted',
  emergencyContacts: 'restricted',
  dependents: 'restricted',

  // Confidential
  nationalId: 'confidential',
  taxId: 'confidential',
  socialInsuranceNumber: 'confidential',
  bankAccount: 'confidential',
  salary: 'confidential', // from finance module
  customFields: 'restricted', // default, can be per-field later
}
```

## Interface Contract

Domain service:

- `ProfileVisibilityService.filterProfile(profile, viewerRole, viewerActorId, profileActorId, managerActorId)` → filtered profile

Logic:

1. If viewer is the profile owner → return all fields
2. If viewer is HR/SUPER_ADMIN → return all fields
3. If viewer is MANAGER and profile is direct report → return public + restricted
4. If viewer is EXECUTIVE → return public + restricted
5. Otherwise → return public only

Apply in:

- `GetProfileQuery` handler
- `ListEmployeesQuery` handler (list items show public fields only)
- `ExportEmployeesQuery` handler (export respects visibility)
- `GetSharedProfileQuery` handler (share links show public only)

## Edge Cases

- Manager of manager (skip-level): only sees public, not restricted (only direct manager gets restricted)
- Employee viewing own terminated profile: still sees all own fields
- Shared profile link: always public-only (external viewer)
- Export: HR can export all fields, others only export fields they can see
- Custom fields: default to restricted tier, post-MVP allow per-field configuration

## Acceptance Criteria

- [ ] `ProfileVisibilityService` with tier-based filtering logic
- [ ] Applied to all profile query handlers
- [ ] Self-view always returns full profile
- [ ] HR/SUPER_ADMIN always see all fields
- [ ] Manager sees restricted fields for direct reports only
- [ ] Public-only for all other viewers
- [ ] Share link responses are public-only
- [ ] Export respects visibility tiers
- [ ] Unit tests for each viewer role scenario
- [ ] Integration test verifying a manager cannot see confidential fields
