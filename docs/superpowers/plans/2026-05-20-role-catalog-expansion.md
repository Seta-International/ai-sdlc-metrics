# Mock Data Role-Catalog Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the uniform-distribution role pool (which produced 19 CEOs, 19 CTOs, 18 CDOs, etc.) with a deterministic per-role headcount allocation modeling a realistic 300-person IT outsourcing company across 60+ role labels including AI, QA, Security, HR, Design, and Business operations.

**Architecture:** Spec → SCHEMA.md → generator stay in lockstep. The new generator drives volume fill from a `ROLE_HEADCOUNT_TARGET` map (sum=299) plus the 13-row named cast (12 role-bearing + `u013` empty). Seniority is encoded in the role string (Junior/Mid/Senior variants) and reflected in skill count (Junior 2-3 skills, Mid 4-5, Senior 5-7). The named cast in `cast.ts` is untouched — all changes are downstream of it.

**Tech Stack:** TypeScript ESM, Vitest, pnpm 11.0.9, Node ≥24. No new dependencies.

---

## Files

**Modify:**
- `tooling/scripts/mock-data-generator/src/pools.ts` — replace `ROLES`, replace `ROLE_SKILL_PROFILE`, extend `SKILL_CATALOG`, add `ROLE_HEADCOUNT_TARGET`, add seniority helpers
- `tooling/scripts/mock-data-generator/src/gen-users.ts` — switch from `rng.pick(ROLES)` uniform to deterministic per-role allocation; seniority-aware skill counts
- `tooling/scripts/mock-data-generator/src/__tests__/gen-users.test.ts` — exact count (300), per-role count map, CEO/CTO/CDO=1 invariant, seniority skill-count behavior
- `docs/superpowers/specs/SCHEMA.md` — Skills-by-job-title table expanded from 11 to 37 rows; Groups table grows by 5; Plans table unchanged

**Regenerate (no manual edits):**
- `mock/users.csv`, `mock/plans.csv`, `mock/plan_members.csv`, `mock/buckets.csv`, `mock/tasks.csv`, `mock/timesheet.csv` — emitted by `pnpm gen-mock`

**Reference (read-only):**
- `docs/superpowers/specs/2026-05-20-mock-data-schema-design.md` §6.1 — the catalog and counts
- `tooling/scripts/mock-data-generator/src/cast.ts` — verbatim named cast (no edits)
- `tooling/scripts/mock-data-generator/src/__tests__/scenarios.test.ts`, `edges.test.ts`, `integration.test.ts` — must still pass without modification

---

## Task 1: Baseline verification

Goal: confirm the existing generator tests pass before any changes, so any later failures can be attributed to this work.

**Files:** none

- [ ] **Step 1: Run the existing test suite**

```bash
pnpm --filter @seta/mock-data-generator test
```

Expected: all tests pass (gen-users, gen-plans, gen-plan-members, gen-buckets, gen-tasks, gen-timesheet, scenarios, edges, integration, csv, aliases, rng, write-csv).

If any test fails before changes start, stop and investigate — do not proceed.

- [ ] **Step 2: Snapshot the current role distribution**

```bash
awk -F',' 'NR>1 {print $4}' mock/users.csv | sort | uniq -c | sort -rn
```

Expected output shape: ~20 distinct roles each occurring 10–30 times (the uniform-pick artifact we're replacing). Record the output in the implementation chat for before/after comparison.

---

## Task 2: Extend `SKILL_CATALOG` with new domains

Goal: add the skill vocabulary needed for AI, QA automation, Security, Design, Mobile expansion, and DevOps depth so `ROLE_SKILL_PROFILE` entries (Task 3) have realistic sources.

**Files:** Modify: `tooling/scripts/mock-data-generator/src/pools.ts:86-146`

- [ ] **Step 1: Replace the skill domain arrays**

In `pools.ts`, replace the existing `SKILLS_*` constants and `SKILL_CATALOG` aggregate with the expanded set. Keep `SKILLS_LANGUAGES`, `SKILLS_FRAMEWORKS`, `SKILLS_DATABASES` unchanged; expand the others.

```ts
const SKILLS_LANGUAGES = ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Rust']
const SKILLS_FRAMEWORKS = [
  'React',
  'Next.js',
  'Vue',
  'Angular',
  'Node.js',
  'NestJS',
  'Django',
  'FastAPI',
  'Spring Boot',
]
const SKILLS_DATABASES = ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch']
const SKILLS_INFRA = [
  'AWS',
  'Azure',
  'GCP',
  'Kubernetes',
  'Terraform',
  'Docker',
  'Linux',
  'Nginx',
  'CloudFront',
  'Helm',
  'Istio',
  'Service Mesh',
  'Ansible',
  'ArgoCD',
  'Pulumi',
  'CI/CD',
  'GitHub Actions',
]
const SKILLS_OBS = ['Monitoring', 'Logging', 'Grafana', 'Prometheus', 'Datadog', 'OpenTelemetry']
const SKILLS_SECURITY = [
  'Security',
  'IAM',
  'OAuth',
  'OWASP',
  'Penetration Testing',
  'SAST',
  'DAST',
  'ISO 27001',
  'SOC 2',
  'Zero Trust',
  'Threat Modeling',
]
const SKILLS_DATA = ['ML', 'NLP', 'Spark', 'Kafka', 'Airflow', 'ETL', 'BigQuery', 'dbt']
const SKILLS_AI = [
  'LLM',
  'Prompt Engineering',
  'LangChain',
  'LlamaIndex',
  'RAG',
  'Vector Databases',
  'OpenAI SDK',
  'Anthropic SDK',
  'Hugging Face',
  'Fine-tuning',
  'PyTorch',
  'TensorFlow',
  'scikit-learn',
  'Computer Vision',
  'MLOps',
  'MLflow',
  'Feature Engineering',
]
const SKILLS_QA = [
  'Selenium',
  'Postman',
  'JMeter',
  'K6',
  'Robot Framework',
  'Test Automation',
  'API Testing',
  'Cypress',
  'Playwright',
]
const SKILLS_MOBILE = [
  'iOS',
  'Android',
  'Swift',
  'Kotlin',
  'Flutter',
  'React Native',
  'SwiftUI',
  'Jetpack Compose',
  'Xamarin',
]
const SKILLS_DESIGN = [
  'Figma',
  'Sketch',
  'User Research',
  'Wireframing',
  'Prototyping',
  'Design Systems',
  'Accessibility',
]
const SKILLS_PM = [
  'Agile',
  'Scrum',
  'Kanban',
  'JIRA',
  'Risk Management',
  'Product Roadmap',
  'Stakeholder Management',
  'Estimation',
  'Resource Planning',
  'Portfolio Management',
  'KPI',
  'Governance',
]
const SKILLS_HR = [
  'Technical Recruiting',
  'LinkedIn Recruiter',
  'Onboarding',
  'Employee Engagement',
  'Performance Reviews',
  'HRIS',
  'Compensation',
  'Labor Law VN',
]
const SKILLS_BIZ = [
  'B2B Sales',
  'Account Management',
  'CRM',
  'Negotiation',
  'Content Marketing',
  'SEO',
  'Accounting',
  'Financial Reporting',
  'Budgeting',
  'Office Operations',
]
const SKILLS_LEAD = [
  'Leadership',
  'Engineering Leadership',
  'Digital Transformation',
  'Business Strategy',
  'Internal Communications',
  'Town Hall Facilitation',
]
const SKILLS_NARROW = ['OOP', 'gRPC', 'Webpack', 'ESLint', 'GraphQL', 'WebSockets']
const SKILLS_BROAD = [
  'DevOps',
  'AI',
  'Frontend',
  'Backend',
  'Data Engineering',
  'Mobile',
  'Cloud',
  'Site Reliability',
]

export const SKILL_CATALOG = [
  ...SKILLS_LANGUAGES,
  ...SKILLS_FRAMEWORKS,
  ...SKILLS_DATABASES,
  ...SKILLS_INFRA,
  ...SKILLS_OBS,
  ...SKILLS_SECURITY,
  ...SKILLS_DATA,
  ...SKILLS_AI,
  ...SKILLS_QA,
  ...SKILLS_MOBILE,
  ...SKILLS_DESIGN,
  ...SKILLS_PM,
  ...SKILLS_HR,
  ...SKILLS_BIZ,
  ...SKILLS_LEAD,
  ...SKILLS_NARROW,
  ...SKILLS_BROAD,
] as const
```

- [ ] **Step 2: Run typecheck to confirm the catalog still compiles**

```bash
pnpm --filter @seta/mock-data-generator typecheck
```

Expected: PASS (no consumers of `SKILL_CATALOG` care about its concrete element set, only that it's a `readonly string[]`).

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/mock-data-generator/src/pools.ts
git commit -m "feat(mock-data-generator): expand SKILL_CATALOG with AI/QA/Security/Design/HR/Biz domains"
```

---

## Task 3: Replace `ROLES` and `ROLE_SKILL_PROFILE` with the canonical 60+ role catalog

Goal: define every role label that may appear in `users.csv` (canonical + legacy) and the skill profile each canonical role's volume-fill members draw from. The shape is unchanged; the content is fully replaced.

**Files:** Modify: `tooling/scripts/mock-data-generator/src/pools.ts:59-75` (the `ROLES` const) and `tooling/scripts/mock-data-generator/src/pools.ts:150-166` (the `ROLE_SKILL_PROFILE` const)

- [ ] **Step 1: Replace `ROLES` with the full catalog**

```ts
export const ROLES = [
  // Executive
  'CEO',
  'CTO',
  'CDO',
  // Engineering leadership
  'VP Engineering',
  'Engineering Manager',
  'Tech Lead',
  'Software Architect',
  // Frontend
  'Junior Frontend Developer',
  'Mid Frontend Developer',
  'Senior Frontend Developer',
  // Backend
  'Backend Developer', // legacy unleveled (u004, u005)
  'Junior Backend Developer',
  'Mid Backend Developer',
  'Senior Backend Developer',
  // Fullstack
  'Junior Fullstack Developer',
  'Mid Fullstack Developer',
  'Senior Fullstack Developer',
  // Mobile
  'Junior Mobile Developer',
  'Mid Mobile Developer',
  'Senior Mobile Developer',
  // DevOps / SRE / Cloud / IT
  'DevOps Engineer',
  'Senior DevOps Engineer',
  'Site Reliability Engineer',
  'Cloud Engineer',
  'IT Engineer', // legacy; cast only (u002, u003, u008, u010, u011)
  // Data & AI
  'Data Engineer',
  'Senior Data Engineer',
  'Data Scientist',
  'Senior Data Scientist',
  'ML Engineer',
  'MLOps Engineer',
  'AI Engineer',
  'Generative AI Engineer',
  // QA
  'Junior QA Engineer',
  'QA Engineer',
  'Senior QA Engineer',
  'QA Automation Engineer',
  'QA Lead',
  // Security
  'Security Engineer',
  'Senior Security Engineer',
  'Security Lead',
  // Project & product
  'PM', // legacy abbreviation (u009)
  'Project Manager',
  'Senior Project Manager',
  'Delivery Manager',
  'Scrum Master',
  'Product Owner',
  'Business Analyst',
  // PMO
  'PMO Lead',
  'PMO Analyst',
  // Design
  'UI/UX Designer',
  'Senior UI/UX Designer',
  'Design Lead',
  // HR / Talent
  'HR Manager',
  'HR Generalist',
  'HR Business Partner',
  'Talent Acquisition',
  // Internal IT
  'IT Support',
  'IT Administrator',
  // Business operations
  'Account Manager',
  'Sales Manager',
  'Marketing Specialist',
  'Finance / Accountant',
  'Operations Manager',
  'Office Administrator',
  // Internal comms
  'IC Executive',
  // Legacy unspecific (cast only)
  'Junior Developer', // u012
  'Software Engineer', // u015
] as const
```

- [ ] **Step 2: Replace `ROLE_SKILL_PROFILE` with one entry per role**

Replace the existing 15-entry map with a 60+ entry map. Each entry lists 4–7 skills representative of that role; the generator's seniority logic (Task 4) will trim or extend based on Junior/Mid/Senior context.

```ts
export const ROLE_SKILL_PROFILE: Readonly<Record<string, readonly string[]>> = {
  // Executive
  CEO: ['Leadership', 'Business Strategy', 'Stakeholder Management', 'Digital Transformation'],
  CTO: ['AWS', 'Engineering Leadership', 'DevOps', 'System Design', 'Cloud'],
  CDO: ['ML', 'NLP', 'Python', 'Data Engineering', 'AI'],
  // Engineering leadership
  'VP Engineering': ['Engineering Leadership', 'AWS', 'System Design', 'DevOps', 'Stakeholder Management'],
  'Engineering Manager': ['Engineering Leadership', 'Agile', 'Risk Management', 'Stakeholder Management', 'Estimation'],
  'Tech Lead': ['TypeScript', 'Node.js', 'System Design', 'React', 'PostgreSQL', 'Engineering Leadership'],
  'Software Architect': ['System Design', 'AWS', 'Kubernetes', 'gRPC', 'PostgreSQL', 'Engineering Leadership'],
  // Frontend
  'Junior Frontend Developer': ['JavaScript', 'HTML', 'CSS', 'React'],
  'Mid Frontend Developer': ['React', 'TypeScript', 'Next.js', 'JavaScript', 'Cypress'],
  'Senior Frontend Developer': ['React', 'TypeScript', 'Next.js', 'JavaScript', 'GraphQL', 'Cypress', 'Design Systems'],
  // Backend
  'Backend Developer': ['Node.js', 'PostgreSQL', 'Docker', 'TypeScript'],
  'Junior Backend Developer': ['Node.js', 'PostgreSQL', 'TypeScript'],
  'Mid Backend Developer': ['Node.js', 'PostgreSQL', 'Docker', 'TypeScript', 'Redis'],
  'Senior Backend Developer': ['Node.js', 'PostgreSQL', 'Docker', 'TypeScript', 'Kafka', 'GraphQL', 'AWS'],
  // Fullstack
  'Junior Fullstack Developer': ['React', 'Node.js', 'TypeScript'],
  'Mid Fullstack Developer': ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker'],
  'Senior Fullstack Developer': ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS', 'GraphQL'],
  // Mobile
  'Junior Mobile Developer': ['React Native', 'TypeScript', 'iOS'],
  'Mid Mobile Developer': ['React Native', 'TypeScript', 'iOS', 'Android', 'Swift'],
  'Senior Mobile Developer': ['React Native', 'iOS', 'Android', 'Swift', 'Kotlin', 'SwiftUI', 'Jetpack Compose'],
  // DevOps / SRE / Cloud / IT
  'DevOps Engineer': ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'CI/CD'],
  'Senior DevOps Engineer': ['AWS', 'Kubernetes', 'Terraform', 'Helm', 'CI/CD', 'GitHub Actions', 'ArgoCD'],
  'Site Reliability Engineer': ['Linux', 'Monitoring', 'Prometheus', 'Grafana', 'Kubernetes', 'OpenTelemetry'],
  'Cloud Engineer': ['AWS', 'Azure', 'GCP', 'Terraform', 'CloudFront'],
  'IT Engineer': ['AWS', 'Kubernetes', 'Terraform', 'Linux', 'Monitoring', 'Security'],
  // Data & AI
  'Data Engineer': ['Spark', 'Kafka', 'Airflow', 'Python', 'PostgreSQL'],
  'Senior Data Engineer': ['Spark', 'Kafka', 'Airflow', 'Python', 'PostgreSQL', 'dbt', 'BigQuery'],
  'Data Scientist': ['ML', 'NLP', 'Spark', 'Python'],
  'Senior Data Scientist': ['ML', 'NLP', 'Spark', 'Python', 'PyTorch', 'TensorFlow', 'Feature Engineering'],
  'ML Engineer': ['ML', 'PyTorch', 'TensorFlow', 'MLflow', 'Python'],
  'MLOps Engineer': ['MLOps', 'Kubernetes', 'MLflow', 'AWS', 'Docker', 'Python'],
  'AI Engineer': ['LLM', 'Prompt Engineering', 'LangChain', 'RAG', 'OpenAI SDK', 'Anthropic SDK'],
  'Generative AI Engineer': ['LLM', 'Fine-tuning', 'PyTorch', 'Hugging Face', 'RAG', 'Vector Databases'],
  // QA
  'Junior QA Engineer': ['Cypress', 'API Testing', 'TypeScript'],
  'QA Engineer': ['Cypress', 'Playwright', 'API Testing', 'Postman', 'TypeScript'],
  'Senior QA Engineer': ['Cypress', 'Playwright', 'API Testing', 'Postman', 'JMeter', 'TypeScript', 'Test Automation'],
  'QA Automation Engineer': ['Selenium', 'Cypress', 'Playwright', 'Test Automation', 'TypeScript', 'Robot Framework'],
  'QA Lead': ['Test Automation', 'Cypress', 'Playwright', 'Risk Management', 'Stakeholder Management'],
  // Security
  'Security Engineer': ['Security', 'OWASP', 'IAM', 'SAST', 'DAST'],
  'Senior Security Engineer': ['Security', 'OWASP', 'IAM', 'Penetration Testing', 'SAST', 'DAST', 'Threat Modeling'],
  'Security Lead': ['Security', 'ISO 27001', 'SOC 2', 'Zero Trust', 'Risk Management', 'Stakeholder Management'],
  // Project & product
  PM: ['Agile', 'Scrum', 'Risk Management'],
  'Project Manager': ['Agile', 'Scrum', 'JIRA', 'Risk Management', 'Stakeholder Management'],
  'Senior Project Manager': ['Agile', 'Scrum', 'JIRA', 'Risk Management', 'Stakeholder Management', 'Estimation', 'Portfolio Management'],
  'Delivery Manager': ['Agile', 'Stakeholder Management', 'Risk Management', 'Estimation', 'Resource Planning'],
  'Scrum Master': ['Scrum', 'Agile', 'Kanban', 'Stakeholder Management'],
  'Product Owner': ['Agile', 'Scrum', 'Product Roadmap', 'Stakeholder Management', 'Estimation'],
  'Business Analyst': ['Stakeholder Management', 'Risk Management', 'Agile', 'JIRA', 'Product Roadmap'],
  // PMO
  'PMO Lead': ['Portfolio Management', 'KPI', 'Governance', 'Resource Planning', 'Stakeholder Management'],
  'PMO Analyst': ['Portfolio Management', 'KPI', 'Resource Planning', 'JIRA'],
  // Design
  'UI/UX Designer': ['Figma', 'Wireframing', 'Prototyping', 'User Research'],
  'Senior UI/UX Designer': ['Figma', 'Sketch', 'Wireframing', 'Prototyping', 'User Research', 'Design Systems', 'Accessibility'],
  'Design Lead': ['Figma', 'Design Systems', 'Stakeholder Management', 'User Research', 'Accessibility'],
  // HR / Talent
  'HR Manager': ['HRIS', 'Performance Reviews', 'Employee Engagement', 'Labor Law VN', 'Stakeholder Management'],
  'HR Generalist': ['HRIS', 'Onboarding', 'Employee Engagement', 'Labor Law VN'],
  'HR Business Partner': ['Stakeholder Management', 'Performance Reviews', 'Employee Engagement', 'Compensation'],
  'Talent Acquisition': ['Technical Recruiting', 'LinkedIn Recruiter', 'Onboarding'],
  // Internal IT
  'IT Support': ['Linux', 'Monitoring', 'Office Operations'],
  'IT Administrator': ['Linux', 'Monitoring', 'Security', 'Office Operations'],
  // Business operations
  'Account Manager': ['Account Management', 'CRM', 'Negotiation', 'Stakeholder Management'],
  'Sales Manager': ['B2B Sales', 'CRM', 'Negotiation', 'Stakeholder Management', 'Leadership'],
  'Marketing Specialist': ['Content Marketing', 'SEO', 'CRM'],
  'Finance / Accountant': ['Accounting', 'Financial Reporting', 'Budgeting'],
  'Operations Manager': ['Office Operations', 'Stakeholder Management', 'Risk Management', 'Leadership'],
  'Office Administrator': ['Office Operations', 'HRIS'],
  // Internal comms
  'IC Executive': ['Internal Communications', 'Employee Engagement', 'Town Hall Facilitation'],
  // Legacy unspecific (cast only)
  'Junior Developer': ['JavaScript', 'HTML', 'CSS'],
  'Software Engineer': ['TypeScript', 'Node.js'],
}
```

- [ ] **Step 3: Add `ROLE_HEADCOUNT_TARGET` immediately after `ROLE_SKILL_PROFILE`**

```ts
export const ROLE_HEADCOUNT_TARGET: Readonly<Record<string, number>> = {
  // Executive
  CEO: 1,
  CTO: 1,
  CDO: 1,
  // Engineering leadership
  'VP Engineering': 1,
  'Engineering Manager': 7,
  'Tech Lead': 8,
  'Software Architect': 4,
  // Frontend
  'Junior Frontend Developer': 14,
  'Mid Frontend Developer': 20,
  'Senior Frontend Developer': 10,
  // Backend
  'Backend Developer': 2, // legacy; cast only (u004, u005)
  'Junior Backend Developer': 13,
  'Mid Backend Developer': 26,
  'Senior Backend Developer': 13,
  // Fullstack
  'Junior Fullstack Developer': 8,
  'Mid Fullstack Developer': 11,
  'Senior Fullstack Developer': 7,
  // Mobile
  'Junior Mobile Developer': 3,
  'Mid Mobile Developer': 4,
  'Senior Mobile Developer': 3,
  // DevOps / SRE / Cloud / IT
  'DevOps Engineer': 6,
  'Senior DevOps Engineer': 5,
  'Site Reliability Engineer': 4,
  'Cloud Engineer': 4,
  'IT Engineer': 5, // legacy; cast only — 5 cast members
  // Data & AI
  'Data Engineer': 3,
  'Senior Data Engineer': 2,
  'Data Scientist': 3,
  'Senior Data Scientist': 2,
  'ML Engineer': 3,
  'MLOps Engineer': 2,
  'AI Engineer': 3,
  'Generative AI Engineer': 2,
  // QA
  'Junior QA Engineer': 6,
  'QA Engineer': 8,
  'Senior QA Engineer': 5,
  'QA Automation Engineer': 5,
  'QA Lead': 2,
  // Security
  'Security Engineer': 4,
  'Senior Security Engineer': 1,
  'Security Lead': 1,
  // Project & product
  PM: 1, // legacy; cast only (u009)
  'Project Manager': 9,
  'Senior Project Manager': 4,
  'Delivery Manager': 2,
  'Scrum Master': 3,
  'Product Owner': 3,
  'Business Analyst': 6,
  // PMO
  'PMO Lead': 1,
  'PMO Analyst': 2,
  // Design
  'UI/UX Designer': 5,
  'Senior UI/UX Designer': 2,
  'Design Lead': 1,
  // HR / Talent
  'HR Manager': 1,
  'HR Generalist': 3,
  'HR Business Partner': 1,
  'Talent Acquisition': 3,
  // Internal IT
  'IT Support': 2,
  'IT Administrator': 2,
  // Business operations
  'Account Manager': 4,
  'Sales Manager': 2,
  'Marketing Specialist': 1,
  'Finance / Accountant': 2,
  'Operations Manager': 1,
  'Office Administrator': 1,
  // Internal comms
  'IC Executive': 2,
  // Legacy unspecific (cast only)
  'Junior Developer': 1, // u012
  'Software Engineer': 1, // u015
}
```

- [ ] **Step 4: Add `seniorityOf` helper and seniority sets in `pools.ts`**

Append at the bottom of `pools.ts`:

```ts
export type Seniority = 'junior' | 'mid' | 'senior'

export function seniorityOf(role: string): Seniority {
  if (role.startsWith('Junior ')) return 'junior'
  if (role.startsWith('Senior ')) return 'senior'
  return 'mid'
}
```

- [ ] **Step 5: Write a sanity unit test for `ROLE_HEADCOUNT_TARGET`**

Create `tooling/scripts/mock-data-generator/src/__tests__/pools.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ROLE_HEADCOUNT_TARGET, ROLE_SKILL_PROFILE, ROLES, seniorityOf } from '../pools.js'

describe('ROLE_HEADCOUNT_TARGET', () => {
  it('sums to 299 (catalog total; u013 with empty role brings dataset to 300)', () => {
    const sum = Object.values(ROLE_HEADCOUNT_TARGET).reduce((acc, n) => acc + n, 0)
    expect(sum).toBe(299)
  })

  it('has exactly one CEO, CTO, and CDO', () => {
    expect(ROLE_HEADCOUNT_TARGET.CEO).toBe(1)
    expect(ROLE_HEADCOUNT_TARGET.CTO).toBe(1)
    expect(ROLE_HEADCOUNT_TARGET.CDO).toBe(1)
  })

  it('has a target for every role in ROLES', () => {
    for (const role of ROLES) {
      expect(ROLE_HEADCOUNT_TARGET[role]).toBeDefined()
    }
  })

  it('has a skill profile for every role in ROLES', () => {
    for (const role of ROLES) {
      expect(ROLE_SKILL_PROFILE[role]).toBeDefined()
      expect(ROLE_SKILL_PROFILE[role]!.length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('seniorityOf', () => {
  it('classifies Junior roles', () => {
    expect(seniorityOf('Junior Frontend Developer')).toBe('junior')
    expect(seniorityOf('Junior QA Engineer')).toBe('junior')
  })
  it('classifies Senior roles', () => {
    expect(seniorityOf('Senior Backend Developer')).toBe('senior')
    expect(seniorityOf('Senior DevOps Engineer')).toBe('senior')
  })
  it('classifies everything else as mid', () => {
    expect(seniorityOf('CEO')).toBe('mid')
    expect(seniorityOf('Mid Backend Developer')).toBe('mid')
    expect(seniorityOf('Engineering Manager')).toBe('mid')
    expect(seniorityOf('Project Manager')).toBe('mid')
  })
})
```

- [ ] **Step 6: Run the pools test**

```bash
pnpm vitest run tooling/scripts/mock-data-generator/src/__tests__/pools.test.ts
```

Expected: all 6 tests pass. If `ROLE_HEADCOUNT_TARGET` sum ≠ 299, fix the count(s) until it does — the spec § 6.1 is the source of truth.

- [ ] **Step 7: Commit**

```bash
git add tooling/scripts/mock-data-generator/src/pools.ts tooling/scripts/mock-data-generator/src/__tests__/pools.test.ts
git commit -m "feat(mock-data-generator): canonical role catalog and ROLE_HEADCOUNT_TARGET sum=299"
```

---

## Task 4: Update `gen-users` tests for the new contract (failing first)

Goal: rewrite the test assertions to match the new generator's contract before touching the generator itself. The tests should fail with the *current* generator and pass once Task 5 lands.

**Files:** Modify: `tooling/scripts/mock-data-generator/src/__tests__/gen-users.test.ts`

- [ ] **Step 1: Replace `gen-users.test.ts` with the new contract**

```ts
import { describe, expect, it } from 'vitest'
import { NAMED_USERS } from '../cast.js'
import { generateUsers } from '../gen-users.js'
import { ALIAS_SKILLS, ROLE_HEADCOUNT_TARGET, seniorityOf } from '../pools.js'
import { createRng } from '../rng.js'

describe('generateUsers', () => {
  it('produces exactly 300 users', () => {
    const users = generateUsers(createRng(42), 300)
    expect(users.length).toBe(300)
  })

  it('includes the named cast verbatim', () => {
    const users = generateUsers(createRng(42), 300)
    for (const named of NAMED_USERS) {
      expect(users).toContainEqual(named)
    }
  })

  it('assigns unique user_ids', () => {
    const users = generateUsers(createRng(42), 300)
    const ids = users.map((u) => u.user_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('hits exactly one CEO, one CTO, one CDO', () => {
    const users = generateUsers(createRng(42), 300)
    expect(users.filter((u) => u.role === 'CEO')).toHaveLength(1)
    expect(users.filter((u) => u.role === 'CTO')).toHaveLength(1)
    expect(users.filter((u) => u.role === 'CDO')).toHaveLength(1)
  })

  it('produces the exact per-role headcount from ROLE_HEADCOUNT_TARGET (ignoring empty-role rows)', () => {
    const users = generateUsers(createRng(42), 300)
    const actual: Record<string, number> = {}
    for (const u of users) {
      if (u.role === '') continue
      actual[u.role] = (actual[u.role] ?? 0) + 1
    }
    for (const [role, target] of Object.entries(ROLE_HEADCOUNT_TARGET)) {
      expect(actual[role] ?? 0).toBe(target)
    }
  })

  it('roughly 15% of users have at least one of project/role empty', () => {
    const users = generateUsers(createRng(42), 300)
    const sparse = users.filter((u) => u.project === '' || u.role === '')
    const ratio = sparse.length / users.length
    expect(ratio).toBeGreaterThan(0.1)
    expect(ratio).toBeLessThan(0.2)
  })

  it('roughly 5% of users have empty skills', () => {
    const users = generateUsers(createRng(42), 300)
    const empty = users.filter((u) => u.skills === '')
    const ratio = empty.length / users.length
    expect(ratio).toBeGreaterThan(0.02)
    expect(ratio).toBeLessThan(0.08)
  })

  it('roughly 10% of users use at least one alias-form skill', () => {
    const users = generateUsers(createRng(42), 300)
    const aliasUsers = users.filter((u) =>
      u.skills.split(',').some((s) => (ALIAS_SKILLS as readonly string[]).includes(s)),
    )
    const ratio = aliasUsers.length / users.length
    expect(ratio).toBeGreaterThan(0.05)
    expect(ratio).toBeLessThan(0.15)
  })

  it('Junior roles carry 2–3 skills', () => {
    const users = generateUsers(createRng(42), 300)
    const juniors = users.filter((u) => seniorityOf(u.role) === 'junior' && u.skills !== '')
    expect(juniors.length).toBeGreaterThan(0)
    for (const u of juniors) {
      const count = u.skills.split(',').length
      expect(count).toBeGreaterThanOrEqual(2)
      expect(count).toBeLessThanOrEqual(3)
    }
  })

  it('Senior roles carry 5–7 skills', () => {
    const users = generateUsers(createRng(42), 300)
    const seniors = users
      .filter((u) => seniorityOf(u.role) === 'senior' && u.skills !== '')
      // Exclude the named cast — they have fixed skill lists from cast.ts
      .filter((u) => !NAMED_USERS.some((n) => n.user_id === u.user_id))
    expect(seniors.length).toBeGreaterThan(0)
    for (const u of seniors) {
      const count = u.skills.split(',').length
      expect(count).toBeGreaterThanOrEqual(5)
      expect(count).toBeLessThanOrEqual(7)
    }
  })

  it('is deterministic given the same seed', () => {
    const a = generateUsers(createRng(42), 300)
    const b = generateUsers(createRng(42), 300)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run the new test file — confirm it fails**

```bash
pnpm vitest run tooling/scripts/mock-data-generator/src/__tests__/gen-users.test.ts
```

Expected: FAIL on at least these assertions (exact failure depends on seed):
- "hits exactly one CEO, one CTO, one CDO" — current generator picks roles uniformly, so multiple CEOs/CTOs/CDOs appear.
- "produces the exact per-role headcount from ROLE_HEADCOUNT_TARGET" — current generator never matches per-role counts.
- "Junior roles carry 2–3 skills" / "Senior roles carry 5–7 skills" — current generator uses a single 2–4 + 0–3 extras heuristic regardless of seniority.

Do NOT proceed to Task 5 until you've confirmed the test file *runs* — i.e., compiles, imports resolve, and at least the cast-verbatim test passes. If imports fail, fix them before moving on.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tooling/scripts/mock-data-generator/src/__tests__/gen-users.test.ts
git commit -m "test(mock-data-generator): tests for exact per-role headcount and seniority skill count"
```

---

## Task 5: Rewrite `generateUsers` for deterministic per-role allocation

Goal: drive volume fill from `ROLE_HEADCOUNT_TARGET`. For each role, allocate `target − cast_count_for_role` volume-fill slots. Apply sparsity (empty project / empty role / empty skills) per the spec § 6.4 rates. Skills are drawn from `ROLE_SKILL_PROFILE[role]` with count varying by seniority.

**Files:** Modify: `tooling/scripts/mock-data-generator/src/gen-users.ts` (full rewrite)

- [ ] **Step 1: Replace `gen-users.ts` with the new implementation**

```ts
import { NAMED_USERS } from './cast.js'
import {
  ALIAS_SKILLS,
  FAMILY_NAMES,
  GIVEN_NAMES,
  MIDDLE_NAMES,
  PROJECTS,
  ROLE_HEADCOUNT_TARGET,
  ROLE_SKILL_PROFILE,
  SKILL_CATALOG,
  type Seniority,
  seniorityOf,
} from './pools.js'
import type { Rng } from './rng.js'
import type { User } from './types.js'

const NAMED_IDS = new Set(NAMED_USERS.map((u) => u.user_id))
const HIGHEST_NAMED_NUM = Math.max(
  ...NAMED_USERS.map((u) => Number.parseInt(u.user_id.slice(1), 10)),
)

const CANONICAL_OF_ALIAS: Record<string, string> = {
  k8s: 'Kubernetes',
  ts: 'TypeScript',
  postgres: 'PostgreSQL',
  pg: 'PostgreSQL',
  js: 'JavaScript',
  node: 'Node.js',
}

function makeId(num: number): string {
  return `u${String(num).padStart(3, '0')}`
}

function makeName(rng: Rng): string {
  return `${rng.pick(FAMILY_NAMES)} ${rng.pick(MIDDLE_NAMES)} ${rng.pick(GIVEN_NAMES)}`
}

function skillCountForSeniority(rng: Rng, sen: Seniority): number {
  if (sen === 'junior') return rng.intRange(2, 3)
  if (sen === 'senior') return rng.intRange(5, 7)
  return rng.intRange(4, 5)
}

function makeSkillsForRole(rng: Rng, role: string): string {
  const baseProfile = ROLE_SKILL_PROFILE[role] ?? []
  const sen = seniorityOf(role)
  const wantTotal = skillCountForSeniority(rng, sen)

  // Junior: fill from profile only, no extras.
  // Mid / Senior: profile first, top up from the broader catalog if profile is short.
  const profileTake = Math.min(baseProfile.length, wantTotal)
  const base = rng.sample(baseProfile, profileTake)

  let skills: string[] = [...base]
  if (sen !== 'junior' && skills.length < wantTotal) {
    const need = wantTotal - skills.length
    const pool = SKILL_CATALOG.filter((s) => !skills.includes(s))
    if (need > 0 && pool.length > 0) {
      const extras = rng.sample(pool, Math.min(need, pool.length))
      skills = [...skills, ...extras]
    }
  }

  // Trim to exact count (junior may have profile shorter than wantTotal — accept that).
  skills = skills.slice(0, wantTotal)

  // 10% chance to swap one canonical skill for its alias form (per spec § 6.4).
  if (rng.chance(0.1)) {
    const alias = rng.pick(ALIAS_SKILLS)
    const target = CANONICAL_OF_ALIAS[alias]
    const idx = target ? skills.indexOf(target) : -1
    if (idx >= 0) skills[idx] = alias
    else if (skills.length < 7) skills.push(alias)
  }

  return [...new Set(skills)].join(',')
}

/**
 * Volume-fill allocation: for each role in ROLE_HEADCOUNT_TARGET, allocate
 * (target − cast_count_for_role) volume-fill slots. The named cast in cast.ts
 * is emitted verbatim and reserves its slots.
 */
function buildVolumeFillRoleQueue(): string[] {
  const castCountByRole = new Map<string, number>()
  for (const u of NAMED_USERS) {
    if (u.role === '') continue
    castCountByRole.set(u.role, (castCountByRole.get(u.role) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [role, target] of Object.entries(ROLE_HEADCOUNT_TARGET)) {
    const reserved = castCountByRole.get(role) ?? 0
    const fill = target - reserved
    if (fill < 0) {
      throw new Error(
        `cast has ${reserved} '${role}' rows but ROLE_HEADCOUNT_TARGET allocates only ${target}`,
      )
    }
    for (let i = 0; i < fill; i++) queue.push(role)
  }
  return queue
}

export function generateUsers(rng: Rng, total: number): User[] {
  const users: User[] = [...NAMED_USERS]
  const volumeFillCount = total - users.length
  const queue = buildVolumeFillRoleQueue()

  if (queue.length !== volumeFillCount) {
    throw new Error(
      `volume-fill mismatch: queue=${queue.length} required=${volumeFillCount} (total=${total}, cast=${users.length})`,
    )
  }

  let nextNum = HIGHEST_NAMED_NUM + 1
  for (const role of queue) {
    let id = makeId(nextNum++)
    while (NAMED_IDS.has(id)) id = makeId(nextNum++)
    const name = makeName(rng)
    const project = rng.chance(0.1) ? '' : rng.pick(PROJECTS)
    const roleField = rng.chance(0.05) ? '' : role
    const skills = rng.chance(0.05) ? '' : makeSkillsForRole(rng, role)
    users.push({ user_id: id, name, project, role: roleField, skills })
  }
  return users
}
```

- [ ] **Step 2: Run the gen-users tests — confirm they pass**

```bash
pnpm vitest run tooling/scripts/mock-data-generator/src/__tests__/gen-users.test.ts
```

Expected: ALL tests pass — including the new exact-count, CEO/CTO/CDO=1, and seniority skill-count assertions.

If any fail:
- Sum-of-targets ≠ 299 → fix `ROLE_HEADCOUNT_TARGET` in `pools.ts` until `pools.test.ts` passes again.
- Seniority skill-count assertion → confirm `skillCountForSeniority` ranges match the spec (Junior 2-3, Mid 4-5, Senior 5-7) and that `ROLE_SKILL_PROFILE` entries for Senior roles have ≥5 skills.

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/mock-data-generator/src/gen-users.ts
git commit -m "feat(mock-data-generator): deterministic per-role headcount with seniority-aware skill count"
```

---

## Task 6: Verify integration / scenarios / edges still pass

Goal: confirm the change to `generateUsers` did not break the broader test suite. Scenarios/edges should pass because they depend on the named cast (unchanged) and on `suggestForTask` logic (unchanged).

**Files:** none

- [ ] **Step 1: Run the full mock-data-generator test suite**

```bash
pnpm --filter @seta/mock-data-generator test
```

Expected: ALL tests pass. The relevant suites and what they cover:
- `gen-users.test.ts` — new contract (Task 4)
- `pools.test.ts` — new (Task 3)
- `scenarios.test.ts` — Scenarios 1-5 against the full dataset
- `edges.test.ts` — Edges E4, E5, E9, E13, E18, E20, E24, E26
- `integration.test.ts` — referential integrity, named cast verbatim, orphan plan, determinism, volume floors
- Plus the other gen-* tests, rng/csv/aliases

If `scenarios.test.ts` or `edges.test.ts` fail:
- Check that `NAMED_USERS` skills are present in the regenerated dataset (the cast is emitted first and skipped on collision, so this should be guaranteed).
- Check that `plan_members` still doesn't include `u008` in `p001` — that depends on `gen-plan-members`, not `gen-users`, so it should be unaffected.
- If the failure is in volume floors, the new generator may need a tweak — but in principle volume floors depend on `gen-tasks` only.

- [ ] **Step 2: Run typecheck + lint at the repo root**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS. The new file imports `Seniority` from `pools.js` and `ROLE_HEADCOUNT_TARGET`; verify Biome accepts the changes (no unused imports, type-only imports marked).

- [ ] **Step 3: Commit (only if any lint/typecheck-driven changes were made)**

```bash
git add -A
git commit -m "chore(mock-data-generator): typecheck/lint cleanup"
```

If there were no changes, skip the commit.

---

## Task 7: Regenerate the 6 CSVs and spot-check

Goal: produce the new `mock/*.csv` files and verify the role distribution matches `ROLE_HEADCOUNT_TARGET`.

**Files:** Regenerate: `mock/users.csv`, `mock/plans.csv`, `mock/plan_members.csv`, `mock/buckets.csv`, `mock/tasks.csv`, `mock/timesheet.csv`

- [ ] **Step 1: Regenerate**

```bash
pnpm gen-mock
```

Expected: writes 6 files. Output line resembles: `Wrote 6 files to D:\Work\seta-os\mock: users=300 plans=50 plan_members=... buckets=... tasks=600 timesheet=400`.

- [ ] **Step 2: Verify total user count is exactly 300**

```bash
awk 'END{print NR-1}' mock/users.csv
```

Expected: `300`.

- [ ] **Step 3: Verify CEO/CTO/CDO each appear exactly once**

```bash
awk -F',' 'NR>1 && ($4=="CEO" || $4=="CTO" || $4=="CDO") {print $4}' mock/users.csv | sort | uniq -c
```

Expected:
```
      1 CDO
      1 CEO
      1 CTO
```

- [ ] **Step 4: Verify role distribution matches `ROLE_HEADCOUNT_TARGET`**

```bash
awk -F',' 'NR>1 {print $4}' mock/users.csv | sort | uniq -c | sort -rn
```

Compare against the spec § 6.1 table. Per-role counts should match exactly (modulo the ~5% empty-role rows that won't show up under any role).

- [ ] **Step 5: Verify named cast survived**

```bash
awk -F',' 'NR>1 && $1=="u001"' mock/users.csv
awk -F',' 'NR>1 && $1=="u013"' mock/users.csv
```

Expected first line includes `Trần Văn Hùng,SETA Internal,CTO,...`; second includes `Đinh Thanh Mai,SETA Internal,,DevOps,AI` (note empty role).

- [ ] **Step 6: Commit the regenerated CSVs**

```bash
git add mock/users.csv mock/plans.csv mock/plan_members.csv mock/buckets.csv mock/tasks.csv mock/timesheet.csv
git commit -m "chore(mock-data): regenerate CSVs with realistic 300-person role distribution"
```

---

## Task 8: Update `SCHEMA.md` Skills-by-job-title table

Goal: expand the SCHEMA.md table from 11 rows to 37 rows (one per canonical role family) so the MS Graph `raw.jobTitle` example surface stays consistent with the new catalog. Junior/Mid/Senior variants share a row labelled by discipline (the column is for example skills, not exact-match enumeration).

**Files:** Modify: `docs/superpowers/specs/SCHEMA.md:70-82` (the "Skills by job title" table)

- [ ] **Step 1: Replace the table**

Locate the "**Skills by job title**" heading at line 68 and the table immediately below it. Replace the table body (NOT the heading or surrounding paragraphs) with:

```markdown
| Job Title | Example Skills |
|---|---|
| CEO | Leadership, Business Strategy, Stakeholder Management, Digital Transformation |
| CTO | AWS, Engineering Leadership, DevOps, System Design |
| CDO | ML, NLP, Python, Data Engineering, AI |
| VP Engineering | Engineering Leadership, AWS, System Design, DevOps |
| Engineering Manager | Engineering Leadership, Agile, Risk Management, Stakeholder Management |
| Tech Lead | TypeScript, Node.js, System Design, React, PostgreSQL |
| Software Architect | System Design, AWS, Kubernetes, gRPC, PostgreSQL |
| Frontend Developer (Junior / Mid / Senior) | React, TypeScript, Next.js, JavaScript, Cypress, Design Systems |
| Backend Developer (Junior / Mid / Senior) | Node.js, PostgreSQL, Docker, TypeScript, Kafka, GraphQL |
| Fullstack Developer (Junior / Mid / Senior) | React, Node.js, TypeScript, PostgreSQL, Docker, AWS |
| Mobile Developer (Junior / Mid / Senior) | React Native, iOS, Android, Swift, Kotlin, SwiftUI |
| DevOps Engineer (Senior) | AWS, Kubernetes, Terraform, Helm, CI/CD, GitHub Actions, ArgoCD |
| Site Reliability Engineer | Linux, Monitoring, Prometheus, Grafana, Kubernetes, OpenTelemetry |
| Cloud Engineer | AWS, Azure, GCP, Terraform, CloudFront |
| IT Engineer | AWS, Kubernetes, Terraform, Linux, Monitoring, Security |
| Data Engineer (Senior) | Spark, Kafka, Airflow, Python, PostgreSQL, dbt, BigQuery |
| Data Scientist (Senior) | ML, NLP, Spark, Python, PyTorch, TensorFlow, Feature Engineering |
| ML Engineer | ML, PyTorch, TensorFlow, MLflow, Python |
| MLOps Engineer | MLOps, Kubernetes, MLflow, AWS, Docker, Python |
| AI Engineer | LLM, Prompt Engineering, LangChain, RAG, OpenAI SDK, Anthropic SDK |
| Generative AI Engineer | LLM, Fine-tuning, PyTorch, Hugging Face, RAG, Vector Databases |
| QA Engineer (Junior / Senior) | Cypress, Playwright, API Testing, Postman, JMeter, TypeScript |
| QA Automation Engineer | Selenium, Cypress, Playwright, Test Automation, Robot Framework |
| QA Lead | Test Automation, Cypress, Playwright, Risk Management |
| Security Engineer (Senior) | Security, OWASP, IAM, Penetration Testing, SAST, DAST, Threat Modeling |
| Security Lead | Security, ISO 27001, SOC 2, Zero Trust, Risk Management |
| Project Manager (Senior) | Agile, Scrum, JIRA, Risk Management, Stakeholder Management, Portfolio Management |
| Delivery Manager | Agile, Stakeholder Management, Risk Management, Resource Planning |
| Scrum Master | Scrum, Agile, Kanban, Stakeholder Management |
| Product Owner | Agile, Scrum, Product Roadmap, Stakeholder Management |
| Business Analyst | Stakeholder Management, Risk Management, Agile, JIRA, Product Roadmap |
| PMO (Lead / Analyst) | Portfolio Management, KPI, Governance, Resource Planning |
| UI/UX Designer (Senior / Lead) | Figma, Sketch, Wireframing, Prototyping, User Research, Design Systems, Accessibility |
| HR (Manager / Generalist / BP) | HRIS, Onboarding, Employee Engagement, Labor Law VN, Performance Reviews |
| Talent Acquisition | Technical Recruiting, LinkedIn Recruiter, Onboarding |
| IT Support / Administrator | Linux, Monitoring, Security, Office Operations |
| Account Manager / Sales Manager | Account Management, B2B Sales, CRM, Negotiation, Stakeholder Management |
| Marketing Specialist | Content Marketing, SEO, CRM |
| Finance / Accountant | Accounting, Financial Reporting, Budgeting |
| Operations Manager / Office Administrator | Office Operations, Stakeholder Management, HRIS |
| IC Executive | Internal Communications, Employee Engagement, Town Hall Facilitation |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/SCHEMA.md
git commit -m "docs(schema): expand Skills-by-job-title table to match new role catalog"
```

---

## Task 9: Update `SCHEMA.md` Groups table

Goal: add the new role-family groups (QA, Design, Mobile, Data & AI) so the SCHEMA.md group composition reflects the wider catalog. The `Engineering All Hands` group widens to include the new disciplines.

**Files:** Modify: `docs/superpowers/specs/SCHEMA.md:124-138` (the "Groups in this dataset" table)

- [ ] **Step 1: Replace the table**

Locate the "**Groups in this dataset**" heading and replace the table beneath it with:

```markdown
| Group | Type | Purpose |
|---|---|---|
| Leadership Team | Unified | CEO, CTO, CDO, VP Engineering, IC Execs |
| Engineering All Hands | Unified | All Engineering Managers, Tech Leads, PMs, and developers (FE/BE/FS/Mobile/DevOps/Data/AI) |
| Frontend Team | Unified | All Frontend Developers (Junior/Mid/Senior) |
| Backend Team | Unified | All Backend Developers (Junior/Mid/Senior) |
| Fullstack Team | Unified | All Fullstack Developers (Junior/Mid/Senior) |
| Mobile Team | Unified | All Mobile Developers (Junior/Mid/Senior) |
| QA Team | Unified | All QA Engineers, QA Automation Engineers, QA Lead |
| Design Team | Unified | UI/UX Designers, Senior UI/UX Designers, Design Lead |
| PMO Office | Unified | PMO Lead and Analysts |
| Product Management | Unified | All PMs, Senior PMs, Delivery Managers, Scrum Masters, Product Owners, Business Analysts |
| HR & Talent | Unified | HR Manager, HR Generalists, HR Business Partners, Talent Acquisition |
| IT & Infrastructure | Unified | All IT Engineers, DevOps Engineers, SREs, Cloud Engineers, IT Support, IT Administrator |
| Infrastructure Review | Unified | Cross-functional review task force (CTO + senior infra ICs) |
| Cloud & DevOps | Unified | DevOps + SRE + Cloud + cloud-skilled Backend engineers |
| Data & AI | Unified | CDO + Data Engineers, Data Scientists, ML/MLOps/AI/Generative AI Engineers |
| Security Task Force | SecurityGroup | Security Engineers + Security Lead + selected senior engineers |
| Internal Communications | Unified | CEO + all IC Executives |
| Business Operations | Unified | Account Managers, Sales Managers, Marketing, Finance, Operations, Office Admin |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/SCHEMA.md
git commit -m "docs(schema): expand Groups table with QA/Design/Mobile/Data&AI/Biz Ops"
```

---

## Task 10: Final verification

Goal: end-to-end smoke test that the entire toolchain is consistent.

**Files:** none

- [ ] **Step 1: Run the full mock-data-generator test suite once more**

```bash
pnpm --filter @seta/mock-data-generator test
```

Expected: ALL tests pass.

- [ ] **Step 2: Re-run `pnpm gen-mock` and compare two consecutive runs are byte-equal**

```bash
pnpm gen-mock
md5sum mock/*.csv > /tmp/run1.md5
pnpm gen-mock
md5sum mock/*.csv > /tmp/run2.md5
diff /tmp/run1.md5 /tmp/run2.md5
```

Expected: diff is empty (determinism property — same seed produces byte-equal CSVs).

On Windows PowerShell, replace `md5sum` with:

```powershell
Get-FileHash mock\*.csv -Algorithm MD5 | Select-Object Path, Hash | Format-Table -AutoSize
```

Run twice, capture both outputs, diff manually.

- [ ] **Step 3: Repo-wide typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS across the whole monorepo.

- [ ] **Step 4: Final commit (only if step 3 surfaced anything)**

```bash
git add -A
git commit -m "chore: post-implementation lint/typecheck cleanup"
```

If nothing surfaced, skip.

---

## Spec coverage verification

Cross-check this plan against `docs/superpowers/specs/2026-05-20-mock-data-schema-design.md`:

- **§2.1 role catalog reference** — already in spec; no code change needed (the spec's note points at §6.1).
- **§6.1 role catalog and distribution** — Task 3 (`ROLE_HEADCOUNT_TARGET`) + Task 5 (generator) enforce the per-role counts; Task 7 verifies in the regenerated CSV.
- **§6.1 chief roles exactly one of each** — Task 4 test "hits exactly one CEO, one CTO, one CDO"; Task 7 step 3 spot-check.
- **§6.1 seniority encoded in role + skill breadth** — Task 3 (seniorityOf, ROLE_SKILL_PROFILE) + Task 5 (`skillCountForSeniority`) + Task 4 tests "Junior roles carry 2-3 skills" / "Senior roles carry 5-7 skills".
- **§6.1 AI specialization splits** — Task 3 includes ML Engineer / MLOps Engineer / AI Engineer / Generative AI Engineer in the catalog with distinct skill profiles; Task 8 reflects in SCHEMA.md.
- **§6.1 legacy labels** — Task 3 includes all 5 legacy labels in `ROLES`/`ROLE_HEADCOUNT_TARGET` with counts that match cast.ts; Task 5's `buildVolumeFillRoleQueue` allocates 0 volume-fill slots for them automatically because `target − cast_count = 0`.
- **§6.2 other table volumes** — unchanged from current generator; no task needed.
- **§6.3 infra-task cardinality** — checked by existing `integration.test.ts` "volume floors" suite (Task 6).
- **§6.4 field-sparsity rules** — covered by existing rates in `generateUsers` (Task 5: 10% empty project, 5% empty role, 5% empty skills, 10% alias).
- **SCHEMA.md Skills-by-job-title** — Task 8.
- **SCHEMA.md Groups table** — Task 9.

No gaps. The plan implements every requirement in §6.1 and the in-scope SCHEMA.md edits.
