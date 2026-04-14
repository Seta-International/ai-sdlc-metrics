---
module: employee
task: directory-search
created: 2026-04-14
priority: high
depends-on: [001]
---

# Task: Employee Directory + Search

## Scope

Implement the employee directory — the "company phonebook" — with full-text search, structured filtering, and multiple response shapes (list, card, detail).

## Roles Covered

- **HR:** Full directory access with all filters, view restricted fields, export capability
- **EXECUTIVE:** Full directory access, view restricted fields (not confidential)
- **MANAGER:** Full directory access, view restricted fields for direct reports only
- **EMPLOYEE:** Directory access, view public fields only, search by name/email/title/skills
- **EXTERNAL_PARTIME:** Limited directory (own profile + team members only)

## Business Context

Every HRM has a searchable employee directory. The legacy system has basic search (id/name/email/phone partial match) and paginated list with filters. The target needs proper full-text search across multiple fields, structured filters for HR use, and privacy-aware responses that hide restricted/confidential data based on the requester's role.

## Source Reference

- **Files:** `src/core/services/employee_service.py` (search_employees, get_employees), `src/repository/employee_repository.py` (\_apply_filters, search_employee_by_string)
- **Key logic:** Legacy search: OR across id/name/email/phone with ILIKE. Filters: id, email, full_name, phone, position, gender, status, marital_status, join_date range, skill_name. Paginated with sort.

## Target Location

- **Where:** `apps/api/src/modules/people/application/queries/`, `apps/api/src/modules/people/interface/trpc/`
- **Conventions to follow:** Query handlers return DTOs, tRPC procedures with Zod input schemas

## Data Model

No new tables. Queries against `employment_profile`, `employment_profile_detail`, `profile_section`, `job_history` (from task 001).

Consider a PostgreSQL `tsvector` column on `employment_profile` for full-text search, or use `ILIKE` patterns for simplicity at mid-market scale.

## Interface Contract

Queries:

- `SearchEmployeesQuery { tenantId, query: string, limit: number }` — quick typeahead search
- `ListEmployeesQuery { tenantId, filters, sort, page, pageSize }` — paginated directory

Filters:

- `departmentId` — filter by department (with option to include sub-departments)
- `managerId` — filter by direct manager
- `jobTitle` — ILIKE
- `jobLevel` — exact
- `employmentStatus` — exact or multi-select
- `employmentType` — exact or multi-select
- `workArrangement` — exact
- `workLocation` — ILIKE
- `hiredAfter` / `hiredBefore` — date range
- `skillName` — search within profile_section type=skill
- `countryCode` — exact

Response shapes:

- **List item:** id, employeeCode, displayName, email, jobTitle, department, workLocation, status, avatarUrl
- **Card:** list item + phone, manager name, skills summary
- **Detail:** full profile (respecting field access control from task 010)

tRPC procedures:

- `people.search` — typeahead, returns list items
- `people.list` — paginated with filters, returns list items
- `people.getProfile` — full detail (existing, enhance)

## Edge Cases

- Search must handle Vietnamese diacritics (search "Nguyen" matches "Nguyễn")
- Empty search returns all (paginated)
- Terminated employees excluded from directory by default, optional filter to include
- Self-search: employee searching for themselves should always find their own profile
- Department filter with hierarchy: "show everyone in Engineering" includes sub-departments

## Acceptance Criteria

- [ ] `SearchEmployeesQuery` handler with typeahead across name, email, title, department, skills
- [ ] `ListEmployeesQuery` handler with all filters and pagination
- [ ] Vietnamese diacritics handled (unaccented search matches accented data)
- [ ] Terminated employees excluded by default
- [ ] Department hierarchy filter (include sub-departments)
- [ ] tRPC procedures for search and list
- [ ] Response shapes respect caller's role (field visibility — basic version, full access control in task 010)
- [ ] Unit tests for filter combinations
- [ ] Integration test for search with Vietnamese names
