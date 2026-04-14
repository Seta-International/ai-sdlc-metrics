---
module: employee
task: profile-completeness
created: 2026-04-14
priority: low
depends-on: [001, 003]
---

# Task: Profile Completeness + Duplicate Validation

## Scope

Two data quality features:

1. **Profile completeness** — computed score per profile showing which sections are filled. Nudges employees to complete their profile. Configurable required sections per tenant.
2. **Duplicate field validation** — cross-tenant uniqueness enforcement for critical fields (email, phone, identity numbers).

## Roles Covered

- **EMPLOYEE:** See own completeness score and missing sections
- **HR:** View completeness dashboard across all employees, configure required sections
- **SUPER_ADMIN:** Configure required sections and uniqueness rules

## Business Context

**Completeness:** HiBob calls this "Profile Strength." It gamifies data collection during onboarding. HR gets a dashboard showing which employees have incomplete profiles, enabling targeted follow-ups. Without it, profiles stay 30% complete for months.

**Duplicate validation:** The legacy system validates uniqueness of 8+ fields (email, phone, identity numbers, bank account, motorbike plate). This prevents duplicate records and data corruption. Must be preserved.

## Source Reference

- **Files:** `src/core/services/employee_service.py` (_check_duplicate_fields_)
- **Key logic:** Legacy checks uniqueness of: email, personal_email, phone, identity_number, old_identity_number, tax_id_number, social_insurance_number, account_bank_number, motorbike_plate. Throws if any collision found.

## Target Location

- **Where:** `apps/api/src/modules/people/application/`, `apps/api/src/modules/people/domain/`
- **Conventions to follow:** Domain service for validation, query handler for completeness

## Data Model

Completeness configuration:

```
people.profile_completeness_config
  id              uuid PK
  tenant_id       uuid NOT NULL
  section         text NOT NULL  -- 'personal_info' | 'education' | 'skills' | 'emergency_contact' | 'documents' | etc.
  is_required     boolean NOT NULL DEFAULT false
  weight          integer NOT NULL DEFAULT 1  -- relative weight in score calculation
  created_at      timestamptz
  updated_at      timestamptz

  UNIQUE (tenant_id, section)
```

Completeness score is computed, not stored — calculated at query time from profile state.

Duplicate validation uses unique indexes + application-level checks:

- `employment_profile.companyEmail` — unique per tenant (index)
- `employment_profile_detail.nationalId` — unique per tenant (partial index, WHERE nationalId IS NOT NULL)
- `employment_profile_detail.taxId` — unique per tenant (partial index)
- etc.

## Interface Contract

Queries:

- `GetProfileCompletenessQuery { profileId }` — returns score (0-100) + list of missing/incomplete sections
- `ListIncompleteProfilesQuery { tenantId, belowScore? }` — HR dashboard, returns profiles sorted by completeness

Commands:

- `ConfigureCompletenessCommand { tenantId, sections: { section, isRequired, weight }[] }`

Domain service:

- `DuplicateFieldValidator.validate(tenantId, profileId, fields)` — checks uniqueness, returns field-level errors
- Called from `CreateEmploymentProfileHandler`, `UpdateProfileDirectHandler`, `ApproveProfileChangeHandler`

Completeness calculation:

- Base sections: personal_info (name, email), employment_info (title, department), profile_detail (DOB, address)
- Profile sections: education (at least 1), skills (at least 1), emergency_contact (at least 1), languages
- Documents: at least 1 ID document uploaded
- Score = (filled_weighted_sections / total_weighted_sections) \* 100

## Edge Cases

- New employee on day 1: score is low (~20%) — this is expected, not an error
- Terminated employees: excluded from incomplete profiles dashboard
- Duplicate check on draft/change request: validate before approval, not at submission time
- Partial unique index: NULL values should not conflict (two employees with NULL phone is fine)
- Custom fields: if marked required, contribute to completeness score

## Acceptance Criteria

- [ ] Completeness score calculation (0-100) based on weighted sections
- [ ] Completeness config table with tenant defaults
- [ ] `GetProfileCompletenessQuery` returns score + missing sections
- [ ] `ListIncompleteProfilesQuery` for HR dashboard
- [ ] Duplicate field validation service
- [ ] Unique partial indexes on critical fields (email, nationalId, taxId, etc.)
- [ ] Validation called during create, update, and change request approval
- [ ] Clear error messages identifying which field and which existing profile conflicts
- [ ] tRPC procedures for completeness queries and config
- [ ] Unit tests for completeness calculation (various fill levels)
- [ ] Unit tests for duplicate detection (exact match, NULL handling)
- [ ] Integration test for duplicate rejection on create
