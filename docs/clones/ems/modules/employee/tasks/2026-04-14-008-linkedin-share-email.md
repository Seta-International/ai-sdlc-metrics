---
module: employee
task: linkedin-share-email
created: 2026-04-14
priority: medium
depends-on: [001]
---

# Task: LinkedIn Import + Share Link + Email Generation

## Scope

Three related profile enrichment features:

1. **LinkedIn profile import** — OAuth-based one-time import of education, work experience, skills, certifications from LinkedIn into profile sections
2. **Share link** — JWT-based temporary public URL to view an employee profile (for external sharing)
3. **Company email generation** — auto-generate company email from Vietnamese name

## Roles Covered

- **EMPLOYEE:** Link own LinkedIn, import profile data, view own share links
- **HR:** Generate share links for any employee, generate company emails during onboarding

## Business Context

LinkedIn import is a massive onboarding UX win — instead of manually entering education, work history, and skills, employees connect LinkedIn on day 1 and their profile is pre-populated. Profile completeness jumps from ~20% to ~80% instantly.

Share links are used to send employee profiles to external parties (clients, partners) without giving them system access.

Email generation follows the business rule: Vietnamese full name → latin transliteration → `first.last@seta-international.vn` with dedup.

## Source Reference

- **Files:** `src/core/services/employee_service.py` (generate_employee_share_link, get_employee_from_share_token, check_email_exists)
- **Key logic:**
  - Share link: JWT with employee_id, 24h expiry, returns full profile on verification
  - Email gen: Vietnamese name → ASCII transliteration → `{first}.{last}@domain`, tries `{first}.{last}1`, `{first}.{last}2` etc. on collision

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`, `apps/api/src/modules/people/application/queries/`
- **Conventions to follow:** Use Vercel AI SDK patterns if LLM needed, `@future/storage` for any file handling

## Data Model

LinkedIn data maps to existing profile sections:

- LinkedIn education → `profile_section` type `education`
- LinkedIn positions → `profile_section` type `work_experience`
- LinkedIn skills → `profile_section` type `skill`
- LinkedIn certifications → `profile_section` type `certification`

Share link: no new table needed — JWT contains profileId + tenantId + expiry. Or optionally track active share links:

```
people.profile_share_link
  id          uuid PK
  tenant_id   uuid NOT NULL
  profile_id  uuid NOT NULL
  token       text NOT NULL UNIQUE
  expires_at  timestamptz NOT NULL
  created_by  uuid NOT NULL
  created_at  timestamptz NOT NULL DEFAULT now()
```

## Interface Contract

Commands:

- `ImportLinkedInProfileCommand { profileId, linkedInAccessToken }` — fetch and map LinkedIn data
- `GenerateShareLinkCommand { profileId, expiresIn?: duration }` — create JWT share token
- `GenerateCompanyEmailCommand { fullName, domain? }` — returns available email

Queries:

- `GetSharedProfileQuery { token }` — verify JWT, return public profile view
- `ListShareLinksQuery { profileId }` — active share links for a profile

LinkedIn data flow:

1. Frontend initiates OAuth with LinkedIn
2. Frontend receives access token, sends to backend
3. Backend calls LinkedIn API to fetch profile
4. Backend maps LinkedIn fields → profile_section payloads
5. Backend creates/updates profile sections (merge, don't overwrite existing)
6. Return import summary (what was imported, what was skipped)

## Edge Cases

- LinkedIn API access: requires LinkedIn partnership program for full profile access. Fallback: basic profile only (name, headline, public URL). Document which LinkedIn API tier is needed.
- Import conflict: employee already has education entries. Strategy: append new entries, skip duplicates (match on institution + degree + field).
- Vietnamese name transliteration: handle compound names, middle names, common prefixes (Thi, Van, etc.)
- Email collision: `first.last@domain` taken → try `first.last1@domain`, `first.last2@domain`, up to 10 attempts
- Share link expiry: default 7 days, configurable. Expired tokens return 401 with clear message.
- Share link revocation: delete the share link record (token becomes invalid)

## Acceptance Criteria

- [ ] LinkedIn OAuth flow integration (or documentation of API requirements if partnership needed)
- [ ] LinkedIn data mapped to profile sections with merge logic
- [ ] Share link generation with configurable expiry
- [ ] Share link verification returns public profile view (no confidential fields)
- [ ] Share link revocation
- [ ] Company email generation with Vietnamese transliteration
- [ ] Email dedup with numeric suffix fallback
- [ ] tRPC procedures for all operations
- [ ] Unit tests for email generation (Vietnamese names with diacritics)
- [ ] Unit tests for share link lifecycle (create, verify, expire, revoke)
