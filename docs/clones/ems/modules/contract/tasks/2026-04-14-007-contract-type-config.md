---
module: contract
task: contract-type-config
created: 2026-04-14
priority: medium
depends-on: []
---

# Task: Contract Type + Jurisdiction Config

## Scope

Implement contract type management in the `admin` module and jurisdiction rules as seed data:

1. Contract type CRUD — tenant-configurable contract types with behavioral attributes
2. Vietnam jurisdiction rules — seed data enforcing legal constraints
3. Contract type → contract creation integration

## Roles Covered

- **SUPER_ADMIN:** Create/update/delete contract types, view jurisdiction rules
- **HR:** View contract types (used when creating contracts)

## Business Context

Contract types drive behavior: a "Fixed-term" contract has an end date and renewal limits. A "Permanent" contract has no end date but has probation. A "Contractor" contract has different tax treatment. The legacy system has a simple name-only lookup. Modern HRMs (Personio, Deel) make contract types configurable with behavioral attributes.

Vietnam labor law imposes specific rules: max 60 days probation for professional roles, max 2 consecutive fixed-term contracts, conversion to indefinite required after 36 months of fixed-term. These are legal requirements, not tenant-configurable.

## Source Reference

- **Files:** `src/core/services/contract_type_service.py` (basic CRUD), `src/core/models/configuration.py` (ContractType model — name only)
- **Key logic:** Legacy has name-only contract types. No behavioral attributes, no jurisdiction rules.

## Target Location

- **Where:** `apps/api/src/modules/admin/` (domain, application, infrastructure, interface)
- **Conventions to follow:** Hexagonal architecture, admin module pattern

## Data Model

### New table in `admin` schema

```
admin.contract_type
  id                    uuid PK (uuidv7)
  tenant_id             uuid NOT NULL
  code                  text NOT NULL       -- 'permanent' | 'fixed_term' | 'contractor' | 'internship' | 'probation_within' | custom
  name                  text NOT NULL       -- display name
  description           text
  has_end_date          boolean NOT NULL DEFAULT false
  has_probation         boolean NOT NULL DEFAULT false
  default_probation_days integer            -- e.g., 60 for Vietnam professional roles
  max_renewal_count     integer             -- legal limit on consecutive renewals
  max_total_duration_months integer         -- e.g., 36 for Vietnam fixed-term
  auto_renewal_eligible boolean DEFAULT false
  notice_period_days    integer DEFAULT 30
  benefits_tier         text                -- links to benefits eligibility
  is_system             boolean DEFAULT false  -- system-defined, not deletable
  is_active             boolean DEFAULT true
  display_order         integer DEFAULT 0
  created_at            timestamptz DEFAULT now()
  updated_at            timestamptz DEFAULT now()

  UNIQUE (tenant_id, code)
```

### Seed data: Vietnam contract types

```
{ code: 'permanent', name: 'Hợp đồng không xác định thời hạn', has_end_date: false, has_probation: true, default_probation_days: 60, notice_period_days: 45, is_system: true }
{ code: 'fixed_term', name: 'Hợp đồng xác định thời hạn', has_end_date: true, has_probation: true, default_probation_days: 60, max_renewal_count: 2, max_total_duration_months: 36, notice_period_days: 30, is_system: true }
{ code: 'seasonal', name: 'Hợp đồng theo mùa vụ', has_end_date: true, has_probation: false, max_total_duration_months: 12, notice_period_days: 3, is_system: true }
{ code: 'internship', name: 'Hợp đồng thực tập', has_end_date: true, has_probation: false, notice_period_days: 3, is_system: true }
{ code: 'contractor', name: 'Hợp đồng dịch vụ', has_end_date: true, has_probation: false, notice_period_days: 30, is_system: true }
```

### Jurisdiction rules (read-only seed data)

```
admin.jurisdiction_contract_rule
  id                    uuid PK
  country_code          text NOT NULL       -- 'VN'
  contract_type_code    text NOT NULL       -- 'fixed_term'
  rule_key              text NOT NULL       -- 'max_probation_days'
  rule_value            text NOT NULL       -- '60'
  description           text                -- 'Vietnam labor code 2019, Article 25'
  legal_reference       text                -- 'Bộ luật Lao động 2019, Điều 25'

  UNIQUE (country_code, contract_type_code, rule_key)
```

## Interface Contract

### Commands

- `CreateContractTypeCommand { tenantId, code, name, description?, hasEndDate, hasProbation, defaultProbationDays?, maxRenewalCount?, maxTotalDurationMonths?, noticePeriodDays?, autoRenewalEligible?, benefitsTier? }`
- `UpdateContractTypeCommand { tenantId, contractTypeId, name?, description?, ... }` — cannot update system types' code or behavioral fields
- `DeleteContractTypeCommand { tenantId, contractTypeId }` — soft delete, cannot delete system types

### Queries

- `ListContractTypesQuery { tenantId }` — all active types, ordered by display_order
- `GetContractTypeQuery { tenantId, contractTypeId }` — single type with all attributes
- `GetJurisdictionRulesQuery { countryCode, contractTypeCode? }` — jurisdiction rules for validation

### Facade (for people module to consume)

- `AdminQueryFacade.getContractType(contractTypeId, tenantId)` — returns type with behavioral attributes
- `AdminQueryFacade.getJurisdictionRules(countryCode, contractTypeCode)` — returns applicable rules

## Edge Cases

- **System types:** Cannot be deleted or have behavioral fields changed. Name/description can be customized.
- **Custom types:** Tenant can create custom contract types beyond the system-provided ones.
- **Type in use:** Cannot delete a type that has active contracts referencing it. Return error with count of affected contracts.
- **Jurisdiction rules:** Read-only. Updated only through seed migrations. Tenants cannot relax legal rules (but can add stricter internal rules via contract type config).
- **Multi-country tenant:** A tenant operating in VN and SG would see contract types for both countries. Filter by `country_code` when applicable.

## Acceptance Criteria

- [ ] Contract type CRUD in admin module
- [ ] Vietnam contract types seeded as system types
- [ ] Jurisdiction rules table with Vietnam rules seeded
- [ ] System types protected from deletion and behavioral modification
- [ ] Soft-delete for contract types (in-use validation)
- [ ] AdminQueryFacade exposing contract type data for people module
- [ ] tRPC procedures for type management and jurisdiction queries
- [ ] Unit tests for CRUD operations
- [ ] Unit tests for system type protection
- [ ] Integration test for facade consumption by people module
