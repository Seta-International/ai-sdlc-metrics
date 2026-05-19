#!/usr/bin/env tsx
/**
 * Generates mock CSV seed data for connector_ms365_directory and connector_ms365_planner schemas.
 * Run: tsx tooling/scripts/generate-mock-csv.ts
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const OUT = '/home/thangtran/SETA/seta-os/tooling/scripts/data'
const SYNCED = '2026-05-19T07:00:00+00:00'

// ── Name data ────────────────────────────────────────────────────────────────
const SURNAMES = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
]
const MIDDLES = [
  'Văn',
  'Thị',
  'Thanh',
  'Minh',
  'Hoàng',
  'Đức',
  'Ngọc',
  'Trọng',
  'Xuân',
  'Quốc',
  'Thành',
  'Hữu',
  'Đình',
  'Thế',
  'Anh',
  'Gia',
]
const GIVENS = [
  'An',
  'Anh',
  'Bảo',
  'Bình',
  'Chi',
  'Cường',
  'Dũng',
  'Duy',
  'Giang',
  'Hà',
  'Hải',
  'Hiếu',
  'Hoa',
  'Hùng',
  'Huy',
  'Khải',
  'Khoa',
  'Lan',
  'Linh',
  'Long',
  'Luân',
  'Mai',
  'Minh',
  'Nam',
  'Nga',
  'Ngọc',
  'Nhân',
  'Nhung',
  'Phong',
  'Phúc',
  'Phương',
  'Quân',
  'Quang',
  'Sơn',
  'Tài',
  'Tâm',
  'Tân',
  'Thắng',
  'Thảo',
  'Thanh',
  'Thịnh',
  'Trang',
  'Trung',
  'Tú',
  'Tuấn',
  'Tùng',
  'Uyên',
  'Vân',
  'Việt',
  'Khánh',
  'Kiên',
  'Mạnh',
  'Phước',
  'Thiện',
  'Thu',
  'Tiến',
  'Toàn',
  'Trí',
  'Xuân',
  'Yến',
]

const VIET_MAP: Record<string, string> = {
  à: 'a',
  á: 'a',
  ả: 'a',
  ã: 'a',
  ạ: 'a',
  ă: 'a',
  ằ: 'a',
  ắ: 'a',
  ẳ: 'a',
  ẵ: 'a',
  ặ: 'a',
  â: 'a',
  ầ: 'a',
  ấ: 'a',
  ẩ: 'a',
  ẫ: 'a',
  ậ: 'a',
  đ: 'd',
  è: 'e',
  é: 'e',
  ẻ: 'e',
  ẽ: 'e',
  ẹ: 'e',
  ê: 'e',
  ề: 'e',
  ế: 'e',
  ể: 'e',
  ễ: 'e',
  ệ: 'e',
  ì: 'i',
  í: 'i',
  ỉ: 'i',
  ĩ: 'i',
  ị: 'i',
  ò: 'o',
  ó: 'o',
  ỏ: 'o',
  õ: 'o',
  ọ: 'o',
  ô: 'o',
  ồ: 'o',
  ố: 'o',
  ổ: 'o',
  ỗ: 'o',
  ộ: 'o',
  ơ: 'o',
  ờ: 'o',
  ớ: 'o',
  ở: 'o',
  ỡ: 'o',
  ợ: 'o',
  ù: 'u',
  ú: 'u',
  ủ: 'u',
  ũ: 'u',
  ụ: 'u',
  ư: 'u',
  ừ: 'u',
  ứ: 'u',
  ử: 'u',
  ữ: 'u',
  ự: 'u',
  ỳ: 'y',
  ý: 'y',
  ỷ: 'y',
  ỹ: 'y',
  ỵ: 'y',
}
function ascii(s: string) {
  return s
    .toLowerCase()
    .split('')
    .map((c) => VIET_MAP[c] ?? c)
    .join('')
}

// ── Skill pools ──────────────────────────────────────────────────────────────
const SKILLS: Record<string, string[]> = {
  CEO: [
    'Leadership',
    'Digital Transformation',
    'Business Strategy',
    'Change Management',
    'Executive Communication',
    'Agile Transformation',
    'OKR',
  ],
  CTO: [
    'Enterprise Architecture',
    'Cloud Strategy',
    'AWS',
    'Azure',
    'System Design',
    'DevOps',
    'Engineering Leadership',
    'Microservices',
    'Kubernetes',
    'Infrastructure',
  ],
  CDO: [
    'Data Strategy',
    'Analytics',
    'Machine Learning',
    'AI',
    'LLM',
    'Data Engineering',
    'Python',
    'Business Intelligence',
    'ETL',
    'NLP',
  ],
  'IC Executive': [
    'Internal Communications',
    'Corporate Communications',
    'Employee Engagement',
    'Content Strategy',
    'Executive Communications',
    'Change Management',
    'Stakeholder Management',
    'Brand Messaging',
    'Crisis Communication',
    'Town Hall Facilitation',
    'Intranet Management',
    'Leadership Communication',
    'Organizational Announcements',
  ],
  PM: [
    'Project Management',
    'Agile',
    'Scrum',
    'JIRA',
    'Risk Management',
    'Stakeholder Communication',
    'Product Roadmap',
    'Sprint Planning',
    'OKR',
    'User Story Mapping',
  ],
  PMO: [
    'PMO',
    'Portfolio Management',
    'Risk Management',
    'MS Project',
    'Resource Planning',
    'KPI',
    'Governance',
    'Reporting',
    'Change Management',
    'Budget Management',
  ],
  'Frontend Developer': [
    'React',
    'TypeScript',
    'JavaScript',
    'Next.js',
    'CSS',
    'HTML',
    'TailwindCSS',
    'Redux',
    'Zustand',
    'Vue',
    'Angular',
    'Performance Optimization',
    'Webpack',
    'Vite',
    'Testing',
    'Accessibility',
    'Figma',
  ],
  'Backend Developer': [
    'Node.js',
    'Python',
    'Java',
    'Go',
    'PostgreSQL',
    'Redis',
    'Docker',
    'REST API',
    'GraphQL',
    'Kafka',
    'Microservices',
    'AWS',
    'gRPC',
    'MongoDB',
    'TypeScript',
    'RabbitMQ',
    'Elasticsearch',
  ],
  'Fullstack Developer': [
    'React',
    'Node.js',
    'TypeScript',
    'PostgreSQL',
    'Docker',
    'Next.js',
    'GraphQL',
    'AWS',
    'Redis',
    'TailwindCSS',
    'Prisma',
    'tRPC',
    'CI/CD',
  ],
  'Talent Acquisition': [
    'Technical Recruiting',
    'HR',
    'LinkedIn Recruiter',
    'Talent Pipeline',
    'People Management',
    'Onboarding',
    'Employer Branding',
    'Interviewing',
    'ATS',
    'Compensation & Benefits',
  ],
  IT: [
    'Infrastructure',
    'AWS',
    'Azure',
    'Cloud',
    'Docker',
    'Kubernetes',
    'Linux',
    'Windows Server',
    'Network Administration',
    'Security',
    'CI/CD',
    'Terraform',
    'Monitoring',
    'Ansible',
    'Grafana',
    'Prometheus',
  ],
}

function pickSkills(role: string, n: number): string[] {
  const pool = SKILLS[role] ?? []
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, shuffled.length))
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
function row(vals: unknown[]): string {
  return vals.map(cell).join(',')
}
function csv(headers: string[], rows: unknown[][]): string {
  return `${[headers.join(','), ...rows.map(row)].join('\n')}\n`
}

function plannerEtag(id: string) {
  return `W/"JzEt${Buffer.from(id).toString('base64').slice(0, 20)}Cg=="`
}
function _plannerOdataEtag(id: string) {
  return `W/"JzEt${Buffer.from(id).toString('base64').slice(0, 20)}Cg=="`
}
function pgArray(items: string[]): string {
  return `{${items.join(',')}}`
}

// ── Generate users ────────────────────────────────────────────────────────────
interface User {
  id: string
  upn: string
  mail: string
  displayName: string
  givenName: string
  surname: string
  jobTitle: string
  department: string
  managerId: string | null
  skills: string[]
  employeeId: string
  phone: string
}

const ROLE_DEPTS: Record<string, string> = {
  CEO: 'Executive',
  CTO: 'Executive',
  CDO: 'Executive',
  'IC Executive': 'Internal Communications',
  PM: 'Product & Program Management',
  PMO: 'Program Management Office',
  'Frontend Developer': 'Frontend Engineering',
  'Backend Developer': 'Backend Engineering',
  'Fullstack Developer': 'Engineering',
  'Talent Acquisition': 'Human Resources',
  IT: 'IT & Infrastructure',
}

const ROLE_COUNTS: [string, number][] = [
  ['CEO', 1],
  ['CTO', 1],
  ['CDO', 1],
  ['IC Executive', 5],
  ['PM', 25],
  ['PMO', 15],
  ['Frontend Developer', 65],
  ['Backend Developer', 80],
  ['Fullstack Developer', 60],
  ['Talent Acquisition', 12],
  ['IT', 35],
]

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length] as T
}

let uidx = 0
function genName(seed: number): { displayName: string; givenName: string; surname: string } {
  const sn = pick(SURNAMES, seed)
  const mn = pick(MIDDLES, seed * 3 + uidx)
  const gn = pick(GIVENS, seed * 7 + uidx * 2)
  return { displayName: `${sn} ${mn} ${gn}`, givenName: gn, surname: sn }
}

const users: User[] = []
let empIdx = 1000

for (const [role, count] of ROLE_COUNTS) {
  for (let i = 0; i < count; i++) {
    uidx++
    const { displayName, givenName, surname } = genName(uidx)
    const asciiFirst = ascii(givenName)
    const asciiLast = ascii(surname)
    const usernameBase = `${asciiFirst}.${asciiLast}`
    const usernameIdx = users.filter((u) => u.upn.startsWith(usernameBase)).length
    const username = usernameIdx === 0 ? usernameBase : `${usernameBase}${usernameIdx}`
    const upn = `${username}@setafuture.onmicrosoft.com`
    const mail = upn
    const skillCount =
      role === 'CEO' || role === 'CTO' || role === 'CDO' ? 5 : 3 + Math.floor(Math.random() * 4)
    users.push({
      id: randomUUID(),
      upn,
      mail,
      displayName,
      givenName,
      surname,
      jobTitle: role,
      department: ROLE_DEPTS[role] ?? 'Engineering',
      managerId: null,
      skills: pickSkills(role, skillCount),
      employeeId: String(empIdx++),
      phone: `+84 9${String(Math.floor(Math.random() * 9e8)).padStart(8, '0')}`,
    })
  }
}

// Assign manager IDs
function mustFind(role: string): User {
  const u = users.find((x) => x.jobTitle === role)
  if (!u) throw new Error(`No user with jobTitle=${role}`)
  return u
}
const ceo = mustFind('CEO')
const cto = mustFind('CTO')
const cdo = mustFind('CDO')
const icExecs = users.filter((u) => u.jobTitle === 'IC Executive')
const pms = users.filter((u) => u.jobTitle === 'PM')
const pmos = users.filter((u) => u.jobTitle === 'PMO')
const frontends = users.filter((u) => u.jobTitle === 'Frontend Developer')
const backends = users.filter((u) => u.jobTitle === 'Backend Developer')
const fullstacks = users.filter((u) => u.jobTitle === 'Fullstack Developer')
const tas = users.filter((u) => u.jobTitle === 'Talent Acquisition')
const its = users.filter((u) => u.jobTitle === 'IT')

cto.managerId = ceo.id
cdo.managerId = ceo.id
icExecs.forEach((u) => {
  u.managerId = ceo.id
})
pms.forEach((u, _i) => {
  u.managerId = cto.id
})
pmos.forEach((u) => {
  u.managerId = ceo.id
})
frontends.forEach((u, i) => {
  u.managerId = pms[i % pms.length]?.id
})
backends.forEach((u, i) => {
  u.managerId = pms[i % pms.length]?.id
})
fullstacks.forEach((u, i) => {
  u.managerId = pms[i % pms.length]?.id
})
tas.forEach((u) => {
  u.managerId = icExecs[0]?.id
})
its.forEach((u) => {
  u.managerId = cto.id
})

// ── Groups ────────────────────────────────────────────────────────────────────
interface Group {
  id: string
  displayName: string
  description: string
  mailNickname: string
  groupType: string
  members: { userId: string; role: string }[]
}

const groups: Group[] = [
  {
    id: randomUUID(),
    displayName: 'Leadership Team',
    description: 'Executive leadership and IC heads',
    mailNickname: 'leadership-team',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Engineering All Hands',
    description: 'All engineering staff',
    mailNickname: 'eng-all',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Frontend Team',
    description: 'Frontend engineering team',
    mailNickname: 'frontend-team',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Backend Team',
    description: 'Backend engineering team',
    mailNickname: 'backend-team',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Fullstack Team',
    description: 'Fullstack engineering team',
    mailNickname: 'fullstack-team',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'PMO Office',
    description: 'Program Management Office',
    mailNickname: 'pmo-office',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Product Management',
    description: 'Product and project managers',
    mailNickname: 'product-mgmt',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'HR & Talent',
    description: 'Human Resources and Talent Acquisition',
    mailNickname: 'hr-talent',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'IT & Infrastructure',
    description: 'IT support and cloud infrastructure',
    mailNickname: 'it-infra',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Infrastructure Review',
    description: 'Cross-functional infrastructure review task force',
    mailNickname: 'infra-review',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Cloud & DevOps',
    description: 'Cloud architecture and DevOps practices',
    mailNickname: 'cloud-devops',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Data & Analytics',
    description: 'Data engineering and analytics',
    mailNickname: 'data-analytics',
    groupType: 'Unified',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Security Task Force',
    description: 'Cross-team security and compliance group',
    mailNickname: 'security-tf',
    groupType: 'SecurityGroup',
    members: [],
  },
  {
    id: randomUUID(),
    displayName: 'Internal Communications',
    description: 'Internal comms, announcements, and employee engagement',
    mailNickname: 'internal-comms',
    groupType: 'Unified',
    members: [],
  },
]

function mustGroup(name: string): Group {
  const g = groups.find((x) => x.displayName === name)
  if (!g) throw new Error(`No group: ${name}`)
  return g
}
const gLeadership = mustGroup('Leadership Team')
const gEngAll = mustGroup('Engineering All Hands')
const gFrontend = mustGroup('Frontend Team')
const gBackend = mustGroup('Backend Team')
const gFullstack = mustGroup('Fullstack Team')
const gPMO = mustGroup('PMO Office')
const gProduct = mustGroup('Product Management')
const gHR = mustGroup('HR & Talent')
const gIT = mustGroup('IT & Infrastructure')
const gInfraReview = mustGroup('Infrastructure Review')
const gCloudDevOps = mustGroup('Cloud & DevOps')
const gData = mustGroup('Data & Analytics')
const gSecurity = mustGroup('Security Task Force')
const gInternalComms = mustGroup('Internal Communications')

// Populate members
const addMember = (g: Group, u: User, role = 'member'): void => {
  g.members.push({ userId: u.id, role })
}

// Leadership
for (const u of [ceo, cto, cdo, ...icExecs]) addMember(gLeadership, u, 'owner')

// Engineering all (IC Execs excluded — they're comms, not engineering)
for (const u of [...pms, ...frontends, ...backends, ...fullstacks]) addMember(gEngAll, u)

// Role-specific
for (const u of frontends) addMember(gFrontend, u)
for (const u of backends) addMember(gBackend, u)
for (const u of fullstacks) addMember(gFullstack, u)
for (const u of pmos) addMember(gPMO, u)
for (const u of pms) addMember(gProduct, u)
for (const u of tas) addMember(gHR, u)
for (const u of its) addMember(gIT, u)

// Infrastructure Review - IT, select backends, fullstacks, CTO
for (const u of [cto, ...its.slice(0, 15), ...backends.slice(0, 10), ...fullstacks.slice(0, 5)]) {
  addMember(gInfraReview, u)
}

// Cloud DevOps
for (const u of [
  cto,
  ...its.slice(0, 20),
  ...backends
    .filter((u) => u.skills.some((s) => ['AWS', 'Docker', 'Kubernetes', 'CI/CD'].includes(s)))
    .slice(0, 15),
]) {
  addMember(gCloudDevOps, u)
}

// Data & Analytics
for (const u of [
  cdo,
  ...backends
    .filter((u) => u.skills.some((s) => ['Python', 'MongoDB', 'Elasticsearch'].includes(s)))
    .slice(0, 10),
]) {
  addMember(gData, u)
}

// Security - IT + select leads
for (const u of [cto, ...its.slice(0, 10), ...backends.slice(0, 5)]) addMember(gSecurity, u)

// Internal Communications - IC Execs + CEO
for (const u of [ceo, ...icExecs]) addMember(gInternalComms, u, 'owner')

// ── Plans ─────────────────────────────────────────────────────────────────────
interface Plan {
  id: string
  ownerGroupId: string
  title: string
}

const PLAN_ID_LEN = 28
function planId() {
  return randomUUID().replace(/-/g, '').slice(0, PLAN_ID_LEN)
}
function bucketId() {
  return randomUUID().replace(/-/g, '').slice(0, PLAN_ID_LEN)
}
function taskId() {
  return randomUUID().replace(/-/g, '').slice(0, PLAN_ID_LEN)
}

const plans: Plan[] = [
  { id: planId(), ownerGroupId: gInfraReview.id, title: 'Infrastructure Review Q2 2026' },
  { id: planId(), ownerGroupId: gEngAll.id, title: 'Q2 2026 Engineering Sprint' },
  { id: planId(), ownerGroupId: gFrontend.id, title: 'Frontend Modernization' },
  { id: planId(), ownerGroupId: gBackend.id, title: 'Backend Services Optimization' },
  { id: planId(), ownerGroupId: gCloudDevOps.id, title: 'Cloud Infrastructure Setup' },
  { id: planId(), ownerGroupId: gSecurity.id, title: 'Security & Compliance 2026' },
  { id: planId(), ownerGroupId: gProduct.id, title: 'Product Roadmap H1 2026' },
  { id: planId(), ownerGroupId: gPMO.id, title: 'PMO Governance & Reporting' },
]

function mustPlan(title: string): Plan {
  const p = plans.find((x) => x.title === title)
  if (!p) throw new Error(`No plan: ${title}`)
  return p
}
const planInfra = mustPlan('Infrastructure Review Q2 2026')
const planEng = mustPlan('Q2 2026 Engineering Sprint')
const planFE = mustPlan('Frontend Modernization')
const planBE = mustPlan('Backend Services Optimization')
const planCloud = mustPlan('Cloud Infrastructure Setup')
const planSec = mustPlan('Security & Compliance 2026')
const planProd = mustPlan('Product Roadmap H1 2026')
const planPMO = mustPlan('PMO Governance & Reporting')

// ── Buckets ───────────────────────────────────────────────────────────────────
interface Bucket {
  id: string
  planId: string
  name: string
  orderHint: string
}

function makeBuckets(p: Plan, names: string[]): Bucket[] {
  return names.map((name, i) => ({
    id: bucketId(),
    planId: p.id,
    name,
    orderHint: `${(i + 1) * 1000}!`,
  }))
}

const buckets: Bucket[] = [
  ...makeBuckets(planInfra, ['To Do', 'In Progress', 'In Review', 'Done']),
  ...makeBuckets(planEng, ['Backlog', 'Sprint 1', 'Sprint 2', 'Done']),
  ...makeBuckets(planFE, ['To Do', 'In Progress', 'Review', 'Done']),
  ...makeBuckets(planBE, ['To Do', 'In Progress', 'Review', 'Done']),
  ...makeBuckets(planCloud, ['To Do', 'In Progress', 'Blocked', 'Done']),
  ...makeBuckets(planSec, ['To Do', 'In Progress', 'Review', 'Done']),
  ...makeBuckets(planProd, ['Backlog', 'This Sprint', 'In Review', 'Done']),
  ...makeBuckets(planPMO, ['To Do', 'In Progress', 'Done']),
]

function mustBucket(planId: string, name: string): Bucket {
  const b = buckets.find((x) => x.planId === planId && x.name === name)
  if (!b) throw new Error(`No bucket "${name}" in plan ${planId}`)
  return b
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
interface Task {
  id: string
  planId: string
  bucketId: string
  title: string
  percentComplete: number
  priority: number
  dueDate: string | null
  assigneeIds: string[]
  createdBy: string
  createdAt: string
  lastModifiedBy: string
  lastModifiedAt: string
  description: string
  checklist: Record<string, unknown>
}

function isoDate(daysFromNow: number) {
  const d = new Date('2026-05-19T07:00:00Z')
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString()
}

function makeChecklist(items: string[], allDone = false): Record<string, unknown> {
  const cl: Record<string, unknown> = {}
  items.forEach((title) => {
    const cid = randomUUID().replace(/-/g, '').slice(0, 28)
    cl[cid] = {
      '@odata.type': '#microsoft.graph.plannerChecklistItem',
      isChecked: allDone,
      title,
      orderHint: `${Math.floor(Math.random() * 9999)}!`,
      lastModifiedBy: { user: { id: ceo.id } },
      lastModifiedDateTime: SYNCED,
    }
  })
  return cl
}

function makeTask(
  planId: string,
  bucketId: string,
  title: string,
  opts: {
    percent?: number
    priority?: number
    dueDays?: number | null
    assignees?: User[]
    createdBy?: User
    description?: string
    checklistItems?: string[]
  } = {},
): Task {
  const assignees = opts.assignees ?? []
  const creator = opts.createdBy ?? ceo
  const now = isoDate(-Math.floor(Math.random() * 60))
  return {
    id: taskId(),
    planId,
    bucketId,
    title,
    percentComplete: opts.percent ?? 0,
    priority: opts.priority ?? 5,
    dueDate: opts.dueDays != null ? isoDate(opts.dueDays) : null,
    assigneeIds: assignees.map((u) => u.id),
    createdBy: creator.id,
    createdAt: now,
    lastModifiedBy: creator.id,
    lastModifiedAt: now,
    description: opts.description ?? '',
    checklist: makeChecklist(opts.checklistItems ?? []),
  }
}

const tasks: Task[] = []

// Infra Review plan tasks

const bInfraTodo = mustBucket(planInfra.id, 'To Do')
const bInfraIP = mustBucket(planInfra.id, 'In Progress')
const bInfraReview = mustBucket(planInfra.id, 'In Review')
const bInfraDone = mustBucket(planInfra.id, 'Done')

const infraTasks = [
  {
    title: 'Review AWS infrastructure architecture and resource allocation',
    assignees: its.slice(0, 3),
    percent: 0,
    priority: 1,
    due: 14,
    items: [
      'Audit EC2 instances',
      'Review VPC configuration',
      'Check IAM policies',
      'Validate auto-scaling groups',
    ],
  },
  {
    title: 'Audit cloud infrastructure costs and optimize spending',
    assignees: its.slice(1, 4),
    percent: 30,
    priority: 1,
    due: 21,
    items: [
      'Export cost reports',
      'Identify unused resources',
      'Right-size instances',
      'Evaluate reserved vs on-demand',
    ],
  },
  {
    title: 'Review Kubernetes cluster configuration and node pools',
    assignees: [pick(its, 0), pick(its, 2)],
    percent: 50,
    priority: 1,
    due: 10,
    items: [
      'Check node resource limits',
      'Review pod security policies',
      'Validate network policies',
      'Audit RBAC',
    ],
  },
  {
    title: 'Infrastructure security vulnerability assessment',
    assignees: its.slice(2, 5),
    percent: 0,
    priority: 1,
    due: 7,
    items: [
      'Run vulnerability scan',
      'Review open ports',
      'Check SSL/TLS config',
      'Validate secrets management',
    ],
  },
  {
    title: 'Review network infrastructure and firewall rules',
    assignees: [pick(its, 3), pick(its, 5)],
    percent: 20,
    priority: 2,
    due: 30,
    items: [
      'Audit security groups',
      'Review inbound/outbound rules',
      'Check VPN configuration',
      'Validate peering',
    ],
  },
  {
    title: 'Database infrastructure review and performance optimization',
    assignees: backends.slice(0, 2),
    percent: 0,
    priority: 2,
    due: 28,
    items: [
      'Review connection pooling',
      'Check index usage',
      'Validate backup strategy',
      'Audit read replicas',
    ],
  },
  {
    title: 'Review CI/CD infrastructure pipeline and tooling',
    assignees: [pick(its, 1), pick(backends, 5)],
    percent: 60,
    priority: 2,
    due: 14,
    items: [
      'Audit pipeline stages',
      'Check runner capacity',
      'Review artifact storage',
      'Validate deployment gates',
    ],
  },
  {
    title: 'Cloud storage infrastructure audit and lifecycle policies',
    assignees: its.slice(0, 2),
    percent: 0,
    priority: 3,
    due: 35,
    items: [
      'Review S3 bucket policies',
      'Check lifecycle rules',
      'Validate encryption',
      'Audit public access',
    ],
  },
  {
    title: 'Review load balancer configuration and health checks',
    assignees: [pick(its, 4)],
    percent: 40,
    priority: 2,
    due: 21,
    items: [
      'Check listener rules',
      'Validate SSL termination',
      'Review health check thresholds',
      'Audit access logs',
    ],
  },
  {
    title: 'Infrastructure disaster recovery plan review and testing',
    assignees: [cto, pick(its, 0), pick(its, 2)],
    percent: 10,
    priority: 1,
    due: 45,
    items: [
      'Review RTO/RPO targets',
      'Test failover procedure',
      'Validate backup restore',
      'Update runbooks',
    ],
  },
  {
    title: 'Review monitoring and alerting infrastructure setup',
    assignees: its.slice(3, 6),
    percent: 70,
    priority: 2,
    due: 7,
    items: [
      'Audit alert thresholds',
      'Review dashboard coverage',
      'Check log retention',
      'Validate on-call rotation',
    ],
  },
  {
    title: 'Container infrastructure security scan and hardening',
    assignees: [pick(its, 1), pick(its, 6)],
    percent: 0,
    priority: 1,
    due: 14,
    items: [
      'Scan container images',
      'Review Dockerfile best practices',
      'Validate registry access',
      'Harden base images',
    ],
  },
  {
    title: 'Review infrastructure as code (IaC) practices and Terraform state',
    assignees: [pick(its, 0), pick(its, 3)],
    percent: 80,
    priority: 3,
    due: 21,
    items: [
      'Audit Terraform state backends',
      'Check module versioning',
      'Review variable management',
      'Validate state locking',
    ],
  },
  {
    title: 'Network infrastructure capacity planning for Q3 2026',
    assignees: [pick(its, 2), pick(its, 5)],
    percent: 0,
    priority: 3,
    due: 60,
    items: [
      'Analyze traffic patterns',
      'Project growth estimates',
      'Identify bottlenecks',
      'Plan capacity upgrades',
    ],
  },
  {
    title: 'Review edge infrastructure and CDN configuration',
    assignees: [pick(its, 4), pick(backends, 2)],
    percent: 0,
    priority: 3,
    due: 30,
    items: [
      'Audit CDN cache rules',
      'Review origin shield',
      'Check SSL certificates',
      'Validate geo-restrictions',
    ],
  },
  {
    title: 'Evaluate on-premise vs cloud migration for remaining services',
    assignees: [cto, pick(its, 0), pick(its, 1)],
    percent: 15,
    priority: 2,
    due: 90,
    items: [
      'Inventory on-prem services',
      'Cost-benefit analysis',
      'Risk assessment',
      'Migration timeline draft',
    ],
  },
  {
    title: 'Review Terraform modules and update to latest provider versions',
    assignees: [pick(its, 2)],
    percent: 100,
    priority: 3,
    due: -7,
    items: [
      'Update AWS provider',
      'Update GCP provider',
      'Run plan validation',
      'Apply and verify',
    ],
  },
  {
    title: 'Audit infrastructure access controls and privilege escalation',
    assignees: [pick(its, 0), pick(its, 4)],
    percent: 0,
    priority: 1,
    due: 14,
    items: [
      'Review admin access list',
      'Audit service accounts',
      'Check MFA enforcement',
      'Validate just-in-time access',
    ],
  },
]

for (const t of infraTasks) {
  const bucket =
    t.percent === 100
      ? bInfraDone
      : t.percent > 50
        ? bInfraReview
        : t.percent > 0
          ? bInfraIP
          : bInfraTodo
  tasks.push(
    makeTask(planInfra?.id, bucket.id, t.title, {
      percent: t.percent,
      priority: t.priority,
      dueDays: t.due,
      assignees: t.assignees,
      createdBy: cto,
      description: `Infrastructure review task: ${t.title}`,
      checklistItems: t.items,
    }),
  )
}

// Q2 Engineering Sprint tasks

const bEngBacklog = mustBucket(planEng.id, 'Backlog')
const bEngS1 = mustBucket(planEng.id, 'Sprint 1')
const bEngS2 = mustBucket(planEng.id, 'Sprint 2')
const bEngDone = mustBucket(planEng.id, 'Done')

const engTaskDefs = [
  {
    title: 'Set up monorepo CI pipeline with parallelized test runs',
    assignees: [pick(its, 0), pick(backends, 10)],
    percent: 100,
    priority: 3,
    due: -14,
    desc: 'Configure GitHub Actions to run unit, integration, and e2e test suites in parallel across all workspace packages. Target: total CI time under 8 minutes.',
    items: [
      'Create reusable workflow for test parallelization',
      'Configure pnpm cache in CI',
      'Split unit vs integration jobs',
      'Set up test result artifacts upload',
      'Validate on feature branch',
    ],
  },
  {
    title: 'Implement distributed tracing across all microservices',
    assignees: backends.slice(5, 8),
    percent: 60,
    priority: 2,
    due: 14,
    desc: 'Add OpenTelemetry trace propagation between API gateway, auth service, and data services. Traces should be visible end-to-end in Jaeger.',
    items: [
      'Add OTEL trace context propagation headers',
      'Instrument HTTP client calls',
      'Instrument DB queries with spans',
      'Connect to Jaeger exporter',
      'Write trace smoke test',
    ],
  },
  {
    title: 'Migrate authentication service to MSAL with PKCE flow',
    assignees: backends.slice(0, 3),
    percent: 40,
    priority: 1,
    due: 7,
    desc: 'Replace legacy JWT auth with MSAL ConfidentialClientApplication using PKCE for SPA clients. All existing tokens must remain valid during the transition period.',
    items: [
      'Integrate @azure/msal-node',
      'Implement PKCE challenge/verifier',
      'Update token validation middleware',
      'Write integration tests with mock JWKS',
      'Update client-side auth SDK',
      'Document new auth endpoints',
    ],
  },
  {
    title: 'Add OpenTelemetry instrumentation to API gateway',
    assignees: [pick(backends, 3)],
    percent: 80,
    priority: 2,
    due: -3,
    desc: 'Instrument the Hono API gateway with OTEL spans covering route matching, middleware chain, and response serialization. Ensure tenant_id is a span attribute on every request.',
    items: [
      'Add OTEL SDK initialization',
      'Instrument Hono middleware',
      'Attach tenant_id to root span',
      'Configure sampling rate',
      'Verify Jaeger trace visibility',
    ],
  },
  {
    title: 'Design and implement multi-tenant data isolation layer',
    assignees: backends.slice(8, 11),
    percent: 20,
    priority: 1,
    due: 28,
    desc: 'Build the withTenant() DB wrapper and RLS policy template that ensures every query is scoped to the correct tenant. Covers Drizzle schema conventions and migration guard checks.',
    items: [
      'Design withTenant() API surface',
      'Implement SET LOCAL app.tenant_id',
      'Write RLS policy template',
      'Add migration guard test',
      'Document cross-tenant query prohibition',
      'Review with security team',
    ],
  },
  {
    title: 'Upgrade Node.js to v24 across all services',
    assignees: [pick(its, 1), pick(backends, 0)],
    percent: 100,
    priority: 3,
    due: -20,
    desc: 'Update all Dockerfiles, CI configs, and .nvmrc files to Node 24. Verify no native module breakage. Run full test suite post-upgrade.',
    items: [
      'Update .nvmrc to 24',
      'Update Dockerfiles',
      'Update CI node-version matrix',
      'Run full test suite',
      'Fix any native module issues',
    ],
  },
  {
    title: 'Implement rate limiting and request throttling middleware',
    assignees: [pick(backends, 4)],
    percent: 50,
    priority: 2,
    due: 10,
    desc: 'Add per-tenant rate limiting middleware at the API gateway level using a sliding window algorithm backed by Redis counters. Include configurable limits per endpoint tier.',
    items: [
      'Research sliding window vs token bucket',
      'Implement Redis counter logic',
      'Add Hono middleware integration',
      'Write load test for limit enforcement',
      'Add 429 response with Retry-After header',
      'Document per-tier limits',
    ],
  },
  {
    title: 'Add comprehensive API documentation via OpenAPI 3.1',
    assignees: backends.slice(2, 5),
    percent: 30,
    priority: 3,
    due: 21,
    desc: 'Expand @hono/zod-openapi coverage to all public routes. Auto-generate openapi.json on build. Add Swagger UI dev endpoint.',
    items: [
      'Audit undocumented routes',
      'Add .openapi() metadata to all Zod schemas',
      'Configure getOpenAPIDocument in main.ts',
      'Add Swagger UI dev route',
      'Write schema diff CI check',
    ],
  },
  {
    title: 'Implement event-driven notification system with pub/sub',
    assignees: backends.slice(6, 9),
    percent: 0,
    priority: 2,
    due: 35,
    desc: 'Build a lightweight in-process pub/sub system using p-queue and EventEmitter for now, shaped for future Redis Streams migration. Covers task-completed and mention events.',
    items: [
      'Define event schema contracts',
      'Implement typed EventBus class',
      'Add task-completed publisher',
      'Add mention-detected publisher',
      'Wire email notification subscriber',
      'Write unit tests with event assertions',
      'Document Redis migration path',
    ],
  },
  {
    title: 'Database connection pool tuning and query optimization',
    assignees: [pick(backends, 1), pick(backends, 7)],
    percent: 70,
    priority: 2,
    due: -5,
    desc: 'Profile the production pg pool under load, tune max/min connections per tenant tier, and fix the top 5 slow queries identified in the APM dashboard.',
    items: [
      'Export slow query report from APM',
      'Add EXPLAIN ANALYZE to top 5 offenders',
      'Add missing indexes',
      'Tune pool min/max per tier',
      'Validate with load test replay',
      'Document connection budget',
    ],
  },
  {
    title: 'Set up automated integration test environment with fixtures',
    assignees: fullstacks.slice(0, 3),
    percent: 0,
    priority: 2,
    due: 21,
    desc: 'Create a Docker Compose test environment with seeded Postgres. All integration tests should spin up cleanly with pnpm test:integration. Include tenant fixture factory.',
    items: [
      'Write docker-compose.test.yml',
      'Create tenant fixture factory',
      'Seed test database via migration runner',
      'Add teardown/cleanup hooks',
      'Configure vitest integration project',
      'Document local setup steps',
    ],
  },
  {
    title: 'Implement webhook delivery system with retry logic',
    assignees: backends.slice(3, 6),
    percent: 0,
    priority: 2,
    due: 30,
    desc: 'Build an outbound webhook system with exponential backoff retry (max 5 attempts), HMAC-SHA256 signature on payload, and per-tenant delivery logs in Postgres.',
    items: [
      'Design webhook_deliveries schema',
      'Implement HMAC-SHA256 signing',
      'Build retry queue with p-queue',
      'Add exponential backoff logic',
      'Persist delivery status per attempt',
      'Write idempotency test',
      'Add admin endpoint to view delivery logs',
    ],
  },
  {
    title: 'Performance profiling and bottleneck elimination sprint',
    assignees: [...backends.slice(0, 2), ...fullstacks.slice(0, 2)],
    percent: 0,
    priority: 1,
    due: 14,
    desc: 'Run flame graph profiling on the three slowest API endpoints under 100 concurrent users. Identify and fix CPU hotspots, excessive serialization, and unnecessary DB round-trips.',
    items: [
      'Set up clinic.js profiling',
      'Run flame graph on /tasks endpoint',
      'Run flame graph on /plans endpoint',
      'Identify top 3 CPU hotspots',
      'Implement fixes',
      'Re-run profiling to confirm improvement',
      'Document findings in ADR',
    ],
  },
  {
    title: 'Onboard two new backend engineers to codebase',
    assignees: [pick(icExecs, 0), pick(pms, 0)],
    percent: 50,
    priority: 3,
    due: 7,
    desc: 'Prepare onboarding materials, pair programming sessions, and first-task tickets for two new backend hires joining in May 2026.',
    items: [
      'Update onboarding README',
      'Schedule architecture walkthrough session',
      'Assign good-first-issue tickets',
      'Pair programming on auth middleware',
      'Code review first PR',
      'Gather onboarding feedback',
    ],
  },
  {
    title: 'Evaluate and adopt pnpm workspaces best practices',
    assignees: [pick(backends, 0), pick(its, 1)],
    percent: 100,
    priority: 3,
    due: -30,
    desc: 'Audit pnpm workspace configuration for hoisting issues, phantom dependencies, and incorrect protocol usage. Document canonical patterns for the team.',
    items: [
      'Run pnpm ls --depth 1 audit',
      'Fix phantom dependency imports',
      'Enforce workspace:* protocol for internal deps',
      'Add check-no-manual-pkg-edit guard',
      'Update CLAUDE.md conventions',
      'Present findings in team sync',
    ],
  },
]

for (const t of engTaskDefs) {
  const bucket =
    t.percent === 100 ? bEngDone : t.percent >= 60 ? bEngS1 : t.percent > 0 ? bEngS2 : bEngBacklog
  tasks.push(
    makeTask(planEng?.id, bucket.id, t.title, {
      ...t,
      dueDays: t.due,
      createdBy: cto,
      description: t.desc,
      checklistItems: t.items,
    }),
  )
}

// Frontend Modernization tasks

const bFeTodo = mustBucket(planFE.id, 'To Do')
const bFeIP = mustBucket(planFE.id, 'In Progress')
const bFeReview = mustBucket(planFE.id, 'Review')
const bFeDone = mustBucket(planFE.id, 'Done')

const feTaskDefs = [
  {
    title: 'Migrate legacy class components to React functional components',
    assignees: frontends.slice(0, 4),
    percent: 80,
    priority: 2,
    due: -10,
    desc: 'Convert all class-based React components in the dashboard module to functional components with hooks. Target: 0 class components remaining after this task.',
    items: [
      'Inventory all class components',
      'Convert lifecycle methods to useEffect',
      'Replace this.state with useState',
      'Update unit tests to React Testing Library',
      'Review prop types → TypeScript interfaces',
      'Final review pass — no class components',
    ],
  },
  {
    title: 'Implement design system with shared Tailwind tokens',
    assignees: frontends.slice(4, 8),
    percent: 100,
    priority: 2,
    due: -21,
    desc: 'Extract all colour, spacing, and typography values into a shared Tailwind config. Publish as @seta/design-tokens. All admin SPAs must reference this package.',
    items: [
      'Extract colour palette to tokens',
      'Extract spacing scale',
      'Extract typography scale',
      'Publish @seta/design-tokens package',
      'Update DESIGN.md with token reference',
      'Migrate apps to use tokens',
      'Visual regression snapshot baseline',
    ],
  },
  {
    title: 'Add Storybook component documentation',
    assignees: frontends.slice(2, 5),
    percent: 60,
    priority: 3,
    due: 14,
    desc: 'Set up Storybook 8 with all shared UI components documented. Each component needs at minimum a Default, Loading, and Error story. Deploy to Chromatic.',
    items: [
      'Bootstrap Storybook 8 in monorepo',
      'Write stories for Button, Input, Modal',
      'Write stories for DataTable, Badge, Alert',
      'Write stories for layout components',
      'Configure Chromatic CI integration',
      'Add a11y addon and fix violations',
      'Document story writing guide',
    ],
  },
  {
    title: 'Improve Core Web Vitals — LCP < 2.5s target',
    assignees: frontends.slice(0, 3),
    percent: 40,
    priority: 1,
    due: 21,
    desc: 'Profile the Studio dashboard with WebPageTest and Lighthouse. Reduce LCP from current ~4.1s to under 2.5s by optimising critical render path, image loading, and font strategy.',
    items: [
      'Baseline Lighthouse score measurement',
      'Identify LCP element and render path',
      'Implement preload for critical fonts',
      'Convert hero images to WebP/AVIF',
      'Remove render-blocking scripts',
      'Implement resource hints (prefetch/preconnect)',
      'Re-measure and confirm < 2.5s LCP',
    ],
  },
  {
    title: 'Implement progressive web app (PWA) features',
    assignees: frontends.slice(8, 11),
    percent: 0,
    priority: 3,
    due: 45,
    desc: 'Add service worker with offline-first caching for the Studio app shell. Include Web App Manifest, install prompt, and background sync for draft task saves.',
    items: [
      'Add Web App Manifest',
      'Implement service worker with Workbox',
      'Cache app shell and static assets',
      'Implement background sync for drafts',
      'Add install prompt UI',
      'Test offline mode thoroughly',
      'PWA audit with Lighthouse',
    ],
  },
  {
    title: 'Add end-to-end type safety from API to UI via tRPC',
    assignees: fullstacks.slice(0, 4),
    percent: 30,
    priority: 2,
    due: 28,
    desc: 'Replace manual fetch calls in the React apps with tRPC client that shares router types from the Hono backend. Zero hand-written response interfaces.',
    items: [
      'Define tRPC router on backend',
      'Export router type to @seta/api-types',
      'Set up tRPC React client',
      'Migrate /tasks queries to tRPC',
      'Migrate /plans queries to tRPC',
      'Add E2E type test',
      'Remove deprecated fetch wrappers',
    ],
  },
  {
    title: 'Refactor state management from Redux to Zustand',
    assignees: frontends.slice(5, 9),
    percent: 20,
    priority: 3,
    due: 35,
    desc: 'Remove Redux Toolkit and replace all store slices with lightweight Zustand stores. Maintain the same devtools integration.',
    items: [
      'Audit all Redux slices',
      'Create Zustand equivalents',
      'Migrate UI state slice',
      'Migrate filter/search state slice',
      'Migrate auth state slice',
      'Remove redux toolkit dependency',
      'Update Storybook decorators',
    ],
  },
  {
    title: 'Implement accessibility (WCAG 2.1 AA) audit and fixes',
    assignees: frontends.slice(1, 4),
    percent: 0,
    priority: 2,
    due: 42,
    desc: 'Run axe-core audit across all Studio screens. Triage violations by severity and fix all critical and serious issues. Target: 0 critical, 0 serious violations in CI.',
    items: [
      'Run axe-core audit on all routes',
      'Triage violations by severity',
      'Fix keyboard navigation issues',
      'Fix missing ARIA labels',
      'Fix colour contrast failures',
      'Add vitest-axe assertions to component tests',
      'Set up axe CI gate',
    ],
  },
  {
    title: 'Migrate build tooling from Webpack to Vite',
    assignees: [pick(frontends, 0), pick(frontends, 3)],
    percent: 100,
    priority: 2,
    due: -14,
    desc: 'Replace Webpack 5 config with Vite 6. Dev server HMR target under 200ms. Production build time target under 30s.',
    items: [
      'Create vite.config.ts',
      'Migrate alias config',
      'Migrate env variable handling',
      'Update CSS modules config',
      'Validate production build output',
      'Benchmark build time improvement',
      'Remove webpack and related deps',
    ],
  },
  {
    title: 'Add i18n support for Vietnamese and English',
    assignees: frontends.slice(6, 9),
    percent: 0,
    priority: 3,
    due: 60,
    desc: 'Integrate react-i18next. Extract all UI strings to translation files for vi-VN and en-US. Add language switcher to the app shell header.',
    items: [
      'Set up react-i18next',
      'Extract strings from Studio screens',
      'Extract strings from Timesheet screens',
      'Add vi-VN translation file',
      'Add en-US translation file',
      'Build language switcher component',
      'Add missing-translation lint rule',
    ],
  },
  {
    title: 'Implement React Query for server state management',
    assignees: frontends.slice(3, 6),
    percent: 50,
    priority: 2,
    due: 14,
    desc: 'Introduce @tanstack/react-query to cache and synchronise server state. Replace manual loading/error state patterns across all data-fetching components.',
    items: [
      'Add QueryClient provider to app root',
      'Migrate tasks list query',
      'Migrate plans list query',
      'Migrate user profile query',
      'Add optimistic update for task status toggle',
      'Set up devtools in development mode',
      'Remove deprecated useEffect data-fetch patterns',
    ],
  },
  {
    title: 'Code-split and lazy-load heavy dashboard modules',
    assignees: frontends.slice(10, 13),
    percent: 70,
    priority: 2,
    due: -3,
    desc: 'Apply React.lazy() and dynamic import() to the Analytics, Reporting, and Settings modules. Measure bundle size reduction. Target: initial bundle under 200 KB gzipped.',
    items: [
      'Baseline bundle analysis with vite-bundle-visualizer',
      'Lazy-load Analytics module',
      'Lazy-load Reporting module',
      'Lazy-load Settings module',
      'Add loading skeletons per module',
      'Measure initial bundle size',
      'Confirm < 200 KB gzipped',
    ],
  },
  {
    title: 'Design and implement dark mode support',
    assignees: frontends.slice(12, 15),
    percent: 0,
    priority: 3,
    due: 50,
    desc: 'Add system-preference-aware dark mode using CSS custom properties and Tailwind dark variant. Persist user preference in localStorage.',
    items: [
      'Audit colour tokens for dark variants',
      'Define dark mode palette',
      'Configure Tailwind dark mode',
      'Apply dark classes to app shell',
      'Apply dark classes to forms and tables',
      'Add theme toggle component',
      'Test with system dark mode on macOS and Windows',
    ],
  },
  {
    title: 'Write visual regression test baseline with Playwright',
    assignees: frontends.slice(0, 3),
    percent: 0,
    priority: 2,
    due: 40,
    desc: 'Set up Playwright screenshot-based visual regression tests for the 10 most critical UI screens. Integrate with CI — fail on unexpected diffs.',
    items: [
      'Set up @playwright/test in workspace',
      'Configure screenshot comparison thresholds',
      'Capture baseline for Dashboard screen',
      'Capture baseline for Task List screen',
      'Capture baseline for Plan view',
      'Capture baseline for Settings screen',
      'Add CI step for visual diff check',
      'Document how to update baselines',
    ],
  },
  {
    title: 'Integrate design handoff from Figma to component library',
    assignees: [...frontends.slice(4, 6)],
    percent: 0,
    priority: 3,
    due: 55,
    desc: 'Establish a workflow where Figma design tokens (exported via Style Dictionary) flow into the @seta/design-tokens package automatically on merge to main.',
    items: [
      'Set up Style Dictionary config',
      'Export Figma tokens as JSON',
      'Map to Tailwind config shape',
      'Add GitHub Action to sync on design update',
      'Document designer workflow',
      'Validate token round-trip with Storybook',
    ],
  },
]

for (const t of feTaskDefs) {
  const bucket =
    t.percent === 100 ? bFeDone : t.percent >= 60 ? bFeReview : t.percent > 0 ? bFeIP : bFeTodo
  tasks.push(
    makeTask(planFE?.id, bucket.id, t.title, {
      ...t,
      dueDays: t.due,
      createdBy: icExecs[0],
      description: t.desc,
      checklistItems: t.items,
    }),
  )
}

// Backend optimization tasks

const bBeTodo = mustBucket(planBE.id, 'To Do')
const bBeIP = mustBucket(planBE.id, 'In Progress')
const bBeReview = mustBucket(planBE.id, 'Review')
const bBeDone = mustBucket(planBE.id, 'Done')

const beTaskDefs = [
  {
    title: 'Implement GraphQL subscriptions for real-time updates',
    assignees: backends.slice(0, 3),
    percent: 0,
    priority: 2,
    due: 28,
    desc: 'Add GraphQL subscription support using graphql-ws over WebSocket for live task status and comment feed updates. Subscriptions must respect tenant isolation.',
    items: [
      'Set up graphql-ws server',
      'Add subscription types to schema',
      'Implement task status subscription resolver',
      'Implement comment feed subscription resolver',
      'Add tenant_id filter guard',
      'Write integration test with mock WS client',
      'Document subscription auth flow',
    ],
  },
  {
    title: 'Add Redis caching layer for frequently accessed entities',
    assignees: backends.slice(3, 6),
    percent: 60,
    priority: 2,
    due: 14,
    desc: 'Cache plan membership lists, user profiles, and connector configs in Redis with per-tenant key namespacing. TTL: 5 minutes for membership, 1 hour for connector config.',
    items: [
      'Define Redis key schema (tenant-scoped)',
      'Cache plan membership reads',
      'Cache user profile reads',
      'Cache connector config reads',
      'Add cache invalidation on write',
      'Write cache hit/miss metrics',
      'Integration test: verify cache eviction',
    ],
  },
  {
    title: 'Refactor monolith booking service into microservices',
    assignees: backends.slice(5, 10),
    percent: 20,
    priority: 1,
    due: 60,
    desc: 'Extract the booking domain from the monolith into a standalone service following the DDD module conventions. Define explicit API boundaries and migrate existing callers.',
    items: [
      'Map current booking domain boundaries',
      'Design new service API (REST + OpenAPI)',
      'Extract Drizzle schema to new package',
      'Implement booking service HTTP routes',
      'Migrate callers to new service API',
      'Add contract tests between services',
      'Deprecation plan for monolith booking code',
      'Feature flag rollout plan',
    ],
  },
  {
    title: 'Implement Kafka event streaming for async workflows',
    assignees: backends.slice(10, 13),
    percent: 0,
    priority: 2,
    due: 45,
    desc: 'Introduce Kafka (via KafkaJS) for async task assignment notifications, audit log streaming, and report generation triggers. Use LRU + p-queue locally until Kafka is provisioned.',
    items: [
      'Design event topic naming convention',
      'Define Avro/JSON schemas for each event type',
      'Implement producer for task-assigned event',
      'Implement consumer for notification service',
      'Add dead letter topic handling',
      'Write integration test with testcontainers-kafka',
      'Document local dev without Kafka',
    ],
  },
  {
    title: 'Add gRPC endpoints for internal service communication',
    assignees: backends.slice(1, 4),
    percent: 40,
    priority: 3,
    due: 30,
    desc: 'Expose user lookup and plan membership queries via gRPC for low-latency internal service calls. Define .proto files in a shared @seta/proto package.',
    items: [
      'Create @seta/proto package',
      'Define user.proto and plan.proto',
      'Implement gRPC server with @grpc/grpc-js',
      'Generate TypeScript stubs',
      'Migrate one internal HTTP call to gRPC',
      'Add health check endpoint',
      'Benchmark vs REST baseline',
    ],
  },
  {
    title: 'Optimize slow N+1 queries in reporting module',
    assignees: [pick(backends, 2), pick(backends, 8)],
    percent: 100,
    priority: 1,
    due: -5,
    desc: 'The reporting module was generating 40+ queries per request due to N+1 patterns. Fixed by converting to batched DataLoader approach and adding composite indexes.',
    items: [
      'Identify N+1 patterns with EXPLAIN ANALYZE',
      'Add DataLoader for user batch fetching',
      'Add DataLoader for plan batch fetching',
      'Add composite index on (tenant_id, plan_id)',
      'Validate query count reduction',
      'Regression test with load replay',
    ],
  },
  {
    title: 'Implement dead letter queue handling for failed jobs',
    assignees: backends.slice(7, 10),
    percent: 0,
    priority: 2,
    due: 35,
    desc: 'Add a dead letter mechanism to the p-queue job runner. Failed jobs after max retries should land in a dead_letter_jobs Postgres table with full error context for ops review.',
    items: [
      'Design dead_letter_jobs schema',
      'Generate migration',
      'Capture failed job context on exhausted retries',
      'Build admin endpoint to inspect DLQ',
      'Add retry-from-DLQ action',
      'Write test: job fails → lands in DLQ',
      'Alert on DLQ depth threshold',
    ],
  },
  {
    title: 'Write load tests for checkout and payment flows',
    assignees: backends.slice(0, 3),
    percent: 50,
    priority: 2,
    due: 21,
    desc: 'Build k6 load test scripts for the two highest-traffic API paths. Target SLO: p95 < 300ms at 200 concurrent users.',
    items: [
      'Set up k6 in CI',
      'Write checkout flow script',
      'Write payment flow script',
      'Define SLO thresholds',
      'Run baseline at 50 concurrent users',
      'Run at 200 concurrent users',
      'Fix bottlenecks until SLO met',
      'Add k6 summary to CI report',
    ],
  },
  {
    title: 'Migrate Python data processing scripts to async workers',
    assignees: backends.slice(4, 7),
    percent: 30,
    priority: 3,
    due: 42,
    desc: 'Convert the three batch Python scripts that run as cron jobs into async Node.js workers managed by the existing p-queue job runner. Eliminates the Python runtime dependency.',
    items: [
      'Inventory Python scripts and their schedules',
      'Port report aggregation script to Node.js',
      'Port data export script to Node.js',
      'Port cleanup/archive script to Node.js',
      'Register workers in job runner',
      'Add integration tests per worker',
      'Remove Python from Docker image',
      'Validate cron schedule parity',
    ],
  },
  {
    title: 'Implement structured logging with correlation IDs',
    assignees: [pick(backends, 0)],
    percent: 100,
    priority: 2,
    due: -10,
    desc: 'All request logs now include a x-request-id correlation ID propagated from the gateway through downstream services. Logger uses pino with redaction for sensitive fields.',
    items: [
      'Add x-request-id generation at gateway',
      'Propagate correlation ID in request context',
      'Configure pino with tenant_id and correlation_id',
      'Enable auto-redaction for secrets',
      'Add correlation ID to error responses',
      'Verify end-to-end trace in Jaeger',
    ],
  },
  {
    title: 'Implement automated API contract testing with Dredd',
    assignees: backends.slice(2, 5),
    percent: 0,
    priority: 2,
    due: 28,
    desc: 'Set up Dredd to validate all live API responses against the OpenAPI 3.1 spec on every CI run. Any undocumented deviation should fail the build.',
    items: [
      'Install and configure Dredd',
      'Write Dredd hooks for auth setup',
      'Run Dredd against local test server',
      'Fix spec deviations',
      'Add CI step: dredd on PR merge',
      'Document how to add new contract tests',
    ],
  },
  {
    title: 'Add database migration rollback safety tests',
    assignees: backends.slice(8, 11),
    percent: 0,
    priority: 1,
    due: 20,
    desc: 'For each forward-only migration, write a test that confirms the schema state after applying. Guard against accidental destructive changes by adding a migration diff CI check.',
    items: [
      'Design migration test harness',
      'Write schema snapshot assertions',
      'Add CI check for destructive SQL keywords',
      'Test against a fresh database',
      'Document migration authoring rules',
      'Add pre-commit hook for migration review',
    ],
  },
]

for (const t of beTaskDefs) {
  const bucket =
    t.percent === 100 ? bBeDone : t.percent >= 60 ? bBeReview : t.percent > 0 ? bBeIP : bBeTodo
  tasks.push(
    makeTask(planBE?.id, bucket.id, t.title, {
      ...t,
      dueDays: t.due,
      createdBy: icExecs[1],
      description: t.desc,
      checklistItems: t.items,
    }),
  )
}

// Cloud Infrastructure tasks

const bCloudTodo = mustBucket(planCloud.id, 'To Do')
const bCloudIP = mustBucket(planCloud.id, 'In Progress')
const bCloudBlocked = mustBucket(planCloud.id, 'Blocked')
const bCloudDone = mustBucket(planCloud.id, 'Done')

const cloudTaskDefs = [
  {
    title: 'Set up multi-region AWS infrastructure with Route 53 failover',
    assignees: its.slice(0, 3),
    percent: 30,
    priority: 1,
    due: 30,
    blocked: false,
    desc: 'Provision primary (ap-southeast-1) and DR (ap-east-1) regions. Configure Route 53 health-check-based failover. RTO target: 5 minutes.',
    items: [
      'Provision VPC in ap-southeast-1',
      'Provision VPC in ap-east-1',
      'Configure VPC peering',
      'Create Route 53 health checks',
      'Configure failover routing policy',
      'Test manual failover',
      'Document runbook for failover trigger',
    ],
  },
  {
    title: 'Configure AWS WAF and Shield for DDoS protection',
    assignees: its.slice(1, 4),
    percent: 0,
    priority: 1,
    due: 14,
    blocked: false,
    desc: 'Enable AWS WAF on all ALBs and CloudFront distributions. Configure managed rule groups for OWASP Top 10. Enable Shield Standard; evaluate Shield Advanced for critical endpoints.',
    items: [
      'Enable WAF on all ALBs',
      'Enable WAF on CloudFront',
      'Attach AWS managed rule groups',
      'Add rate-based rule per IP',
      'Configure geo-blocking for restricted regions',
      'Test WAF rule triggers',
      'Review Shield Advanced pricing',
    ],
  },
  {
    title: 'Implement AWS Cost Anomaly Detection and budget alerts',
    assignees: [pick(its, 0)],
    percent: 100,
    priority: 2,
    due: -7,
    blocked: false,
    desc: 'Configured Cost Anomaly Detection monitors for EC2, RDS, and data transfer. Budget alerts trigger at 80% and 100% of monthly target per service category.',
    items: [
      'Create cost anomaly monitors',
      'Set up SNS alert topic',
      'Configure budget alerts at 80% threshold',
      'Configure budget alerts at 100% threshold',
      'Test alert delivery',
      'Tag all resources for cost allocation',
      'Document monthly review process',
    ],
  },
  {
    title: 'Deploy EKS cluster with managed node groups',
    assignees: its.slice(2, 5),
    percent: 0,
    priority: 1,
    due: 21,
    blocked: true,
    desc: 'Blocked pending VPC provisioning completion. Once unblocked: deploy EKS 1.30 with Karpenter for node autoscaling. Node groups: general-purpose and compute-optimised.',
    items: [
      'Wait for VPC provisioning (blocker)',
      'Create EKS cluster via Terraform',
      'Configure Karpenter node provisioner',
      'Deploy general-purpose node group',
      'Deploy compute-optimised node group',
      'Install cluster-autoscaler',
      'Configure cluster logging to CloudWatch',
      'Run smoke test workload',
    ],
  },
  {
    title: 'Set up AWS Control Tower for multi-account governance',
    assignees: [pick(its, 0), pick(its, 3)],
    percent: 0,
    priority: 2,
    due: 45,
    blocked: true,
    desc: 'Blocked pending AWS Organizations approval. Will configure landing zone with separate accounts for prod, staging, dev, and security audit. Apply Service Control Policies.',
    items: [
      'Wait for AWS Organizations approval (blocker)',
      'Enable Control Tower landing zone',
      'Create prod account',
      'Create staging account',
      'Create dev account',
      'Create security-audit account',
      'Apply SCP: deny root user actions',
      'Apply SCP: require MFA',
      'Document account vending process',
    ],
  },
  {
    title: 'Implement Terraform Cloud remote state and workspaces',
    assignees: its.slice(3, 6),
    percent: 60,
    priority: 2,
    due: 14,
    blocked: false,
    desc: 'Migrate Terraform state from local S3 backend to Terraform Cloud workspaces. One workspace per environment (dev/staging/prod). Enable Sentinel policy enforcement.',
    items: [
      'Create Terraform Cloud organization',
      'Configure workspace per environment',
      'Migrate dev state to TFC',
      'Migrate staging state to TFC',
      'Migrate prod state to TFC',
      'Add Sentinel cost policy',
      'Configure VCS-driven runs',
      'Update team access permissions',
    ],
  },
  {
    title: 'Configure GitHub Actions self-hosted runners on EC2',
    assignees: [pick(its, 1), pick(its, 4)],
    percent: 80,
    priority: 2,
    due: -3,
    blocked: false,
    desc: 'Deploy ephemeral GitHub Actions runners on EC2 Spot instances via the actions-runner-controller. Runners auto-scale 0→10 based on queue depth.',
    items: [
      'Deploy actions-runner-controller to k8s',
      'Configure EC2 spot instance fleet',
      'Set runner labels for job routing',
      'Configure autoscaling min 0 / max 10',
      'Test with sample workflow',
      'Monitor runner startup latency',
      'Document runner maintenance',
    ],
  },
  {
    title: 'Set up Prometheus + Grafana monitoring stack on k8s',
    assignees: its.slice(5, 8),
    percent: 40,
    priority: 2,
    due: 21,
    blocked: false,
    desc: 'Deploy kube-prometheus-stack via Helm. Build dashboards for API latency, DB connection pool, and per-tenant error rate. Configure PagerDuty alerting.',
    items: [
      'Deploy kube-prometheus-stack',
      'Configure persistent volume for Prometheus',
      'Import API latency dashboard',
      'Build DB pool utilisation dashboard',
      'Build per-tenant error rate dashboard',
      'Configure PagerDuty alert channel',
      'Set SLO alert thresholds',
      'Test alert firing end-to-end',
    ],
  },
  {
    title: 'Implement service mesh with Istio for east-west traffic',
    assignees: its.slice(0, 3),
    percent: 0,
    priority: 3,
    due: 60,
    blocked: false,
    desc: 'Install Istio in ambient mode on the EKS cluster. Enable mTLS between all services and export metrics to Prometheus. Start with sidecar injection on the API namespace only.',
    items: [
      'Install Istio via istioctl',
      'Enable namespace sidecar injection for api',
      'Configure PeerAuthentication for mTLS',
      'Verify mTLS between api and auth service',
      'Export Envoy metrics to Prometheus',
      'Add Kiali for service graph visibility',
      'Document policy for adding new services',
    ],
  },
  {
    title: 'Database migration to RDS Aurora with automated failover',
    assignees: [pick(its, 2), pick(backends, 0)],
    percent: 0,
    priority: 1,
    due: 35,
    blocked: true,
    desc: 'Blocked pending EKS cluster deployment. Migrate from single-AZ RDS PostgreSQL to Aurora PostgreSQL cluster with two read replicas and automated multi-AZ failover.',
    items: [
      'Wait for EKS deployment (blocker)',
      'Provision Aurora cluster via Terraform',
      'Set up DMS migration task',
      'Run initial full load',
      'Enable CDC for zero-downtime cutover',
      'Test automated failover (< 30s RTO)',
      'Update connection strings in all services',
      'Decommission old RDS instance',
    ],
  },
]

for (const t of cloudTaskDefs) {
  const bucket =
    t.percent === 100
      ? bCloudDone
      : t.blocked
        ? bCloudBlocked
        : t.percent > 0
          ? bCloudIP
          : bCloudTodo
  tasks.push(
    makeTask(planCloud?.id, bucket.id, t.title, {
      ...t,
      dueDays: t.due,
      createdBy: cto,
      description: t.desc,
      checklistItems: t.items,
    }),
  )
}

// Security tasks

const bSecTodo = mustBucket(planSec.id, 'To Do')
const bSecIP = mustBucket(planSec.id, 'In Progress')
const bSecReview = mustBucket(planSec.id, 'Review')
const bSecDone = mustBucket(planSec.id, 'Done')

const secTaskDefs = [
  {
    title: 'Conduct annual penetration testing of production environment',
    assignees: its.slice(0, 3),
    percent: 0,
    priority: 1,
    due: 30,
    desc: 'Engage external pentest vendor for black-box and grey-box testing of the production API, auth flows, and tenant isolation boundaries. Scope: external perimeter and authenticated API.',
    items: [
      'Define pentest scope and rules of engagement',
      'Share API docs with vendor',
      'Schedule pentest window',
      'Monitor for production impact during test',
      'Review preliminary findings',
      'Triage vulnerabilities by CVSS score',
      'Remediate critical and high findings',
      'Verify fixes with vendor re-test',
      'Publish internal security report',
    ],
  },
  {
    title: 'Implement zero-trust network access (ZTNA) model',
    assignees: its.slice(2, 5),
    percent: 20,
    priority: 1,
    due: 60,
    desc: 'Replace VPN-based access with a ZTNA solution (evaluating Cloudflare Access and AWS Verified Access). All internal tool access must go through identity-aware proxy.',
    items: [
      'Evaluate ZTNA vendors',
      'PoC Cloudflare Access for staging tooling',
      'PoC AWS Verified Access for admin endpoints',
      'Migrate Grafana behind identity proxy',
      'Migrate internal docs behind identity proxy',
      'Decommission VPN for covered services',
      'Write ZTNA policy documentation',
      'Train staff on new access workflow',
    ],
  },
  {
    title: 'Enable MFA for all staff Microsoft 365 accounts',
    assignees: [pick(its, 0)],
    percent: 100,
    priority: 1,
    due: -14,
    desc: 'Enforced MFA via Conditional Access policy for all M365 users. Excluded break-glass accounts documented and stored in sealed envelope with dual-custody.',
    items: [
      'Create Conditional Access policy',
      'Set policy to report-only mode for 1 week',
      'Review sign-in logs for impact',
      'Enable policy enforcement',
      'Document break-glass account exception',
      'Notify all staff of MFA requirement',
      'Resolve MFA setup issues for remote staff',
    ],
  },
  {
    title: 'Review and rotate all production secrets and API keys',
    assignees: its.slice(1, 4),
    percent: 70,
    priority: 1,
    due: 7,
    desc: 'Audit all secrets in AWS Secrets Manager and rotate any that are over 90 days old or were exposed to non-production systems. Enforce 90-day rotation policy going forward.',
    items: [
      'Export secret inventory from Secrets Manager',
      'Identify secrets older than 90 days',
      'Rotate database credentials',
      'Rotate OAuth client secrets',
      'Rotate third-party API keys',
      'Enable automatic rotation where supported',
      'Update rotation policy documentation',
      'Verify all services healthy after rotation',
    ],
  },
  {
    title: 'Implement SIEM for centralized log monitoring and alerting',
    assignees: its.slice(3, 6),
    percent: 0,
    priority: 2,
    due: 45,
    desc: 'Centralise CloudTrail, VPC Flow Logs, and application logs into a SIEM (evaluating Elastic Security and AWS Security Lake). Define detection rules for suspicious tenant access patterns.',
    items: [
      'Evaluate SIEM vendors',
      'Configure log ingestion from CloudTrail',
      'Configure log ingestion from VPC Flow Logs',
      'Configure application log forwarding',
      'Write detection rule: impossible travel',
      'Write detection rule: cross-tenant access attempt',
      'Write detection rule: privilege escalation',
      'Set up alert routing to security channel',
      'Run tabletop exercise with detection rules',
    ],
  },
  {
    title: 'Security awareness training for all staff',
    assignees: [pick(icExecs, 0)],
    percent: 50,
    priority: 2,
    due: 14,
    desc: 'Roll out mandatory annual security awareness training via the internal LMS. Topics: phishing, social engineering, safe credential handling, and incident reporting.',
    items: [
      'Source or create training content',
      'Upload to LMS',
      'Send all-staff announcement',
      'Track completion rate',
      'Follow up with non-completers',
      'Run simulated phishing campaign',
      'Publish completion report to leadership',
    ],
  },
  {
    title: 'GDPR compliance audit and data mapping exercise',
    assignees: [cdo, pick(pmos, 0)],
    percent: 30,
    priority: 1,
    due: 45,
    desc: 'Map all personal data flows across the platform, document legal basis for processing, and validate that erasure (right to be forgotten) is implemented for all tenant data.',
    items: [
      'Identify all personal data stores',
      'Document data flow diagram',
      'Validate lawful basis per data category',
      'Test data subject erasure endpoint',
      'Test data subject access request flow',
      'Review third-party data processor agreements',
      'Draft privacy notice update',
      'Legal review of findings',
    ],
  },
  {
    title: 'Implement code signing for all release artifacts',
    assignees: [pick(its, 1), pick(backends, 0)],
    percent: 0,
    priority: 2,
    due: 30,
    desc: 'Sign all Docker images and npm packages using Sigstore/cosign. Enforce signature verification in the deployment pipeline before any image is promoted to production.',
    items: [
      'Set up cosign key pair in AWS KMS',
      'Sign Docker images in CI',
      'Sign npm packages on publish',
      'Add signature verification step in deploy pipeline',
      'Add cosign verification to Kubernetes admission controller',
      'Test: unsigned image should be rejected',
      'Document signing workflow for contributors',
    ],
  },
]

for (const t of secTaskDefs) {
  const bucket =
    t.percent === 100 ? bSecDone : t.percent >= 60 ? bSecReview : t.percent > 0 ? bSecIP : bSecTodo
  tasks.push(
    makeTask(planSec?.id, bucket.id, t.title, {
      ...t,
      dueDays: t.due,
      createdBy: cto,
      description: t.desc,
      checklistItems: t.items,
    }),
  )
}

// Product roadmap tasks

const bProdBacklog = mustBucket(planProd.id, 'Backlog')
const bProdSprint = mustBucket(planProd.id, 'This Sprint')
const bProdReview = mustBucket(planProd.id, 'In Review')
const bProdDone = mustBucket(planProd.id, 'Done')

const prodTaskDefs = [
  {
    title: 'Define Q3 2026 product roadmap and prioritization',
    assignees: [pick(pms, 0), pick(pms, 1)],
    percent: 60,
    priority: 1,
    due: 7,
    desc: 'Synthesize findings from stakeholder interviews, NPS data, and support tickets into a ranked Q3 roadmap. Present to leadership for sign-off.',
    items: [
      'Collect input from all stakeholder groups',
      'Score initiatives by RICE framework',
      'Draft candidate roadmap v1',
      'Review with CTO and CDO',
      'Incorporate feedback',
      'Present final roadmap to leadership',
      'Publish roadmap to all-staff comms',
    ],
  },
  {
    title: 'Stakeholder interviews for new feature discovery',
    assignees: pms.slice(2, 5),
    percent: 40,
    priority: 2,
    due: 14,
    desc: 'Conduct 30-minute structured interviews with 12 stakeholders across 4 departments to identify unmet needs and friction points in the current platform.',
    items: [
      'Draft interview discussion guide',
      'Schedule 12 interviews (3 per PM)',
      'Conduct interviews and record notes',
      'Synthesize themes across interviews',
      'Tag insights by product area',
      'Present top 5 themes to product team',
      'File insights in research repo',
    ],
  },
  {
    title: 'Write PRD for AI-powered task assignment recommendation',
    assignees: [pick(pms, 0), cdo],
    percent: 20,
    priority: 1,
    due: 21,
    desc: 'Define the problem, user stories, success metrics, and technical constraints for a feature that recommends the best-fit team member for an unassigned task based on skills and workload.',
    items: [
      'Define problem statement and target users',
      'Write user stories (5–8)',
      'Define success metrics and acceptance criteria',
      'Outline technical approach with CDO',
      'Identify data requirements (skills, workload signals)',
      'Review PRD with engineering leads',
      'Final sign-off from CTO',
    ],
  },
  {
    title: 'User journey mapping for onboarding flow',
    assignees: pms.slice(1, 3),
    percent: 0,
    priority: 2,
    due: 28,
    desc: 'Map the current end-to-end onboarding journey for a new tenant admin. Identify drop-off points and friction. Propose an improved 3-step activation flow.',
    items: [
      'Recruit 5 participant admins for observation sessions',
      'Shadow 3 live onboarding sessions',
      'Map current as-is journey',
      'Identify top 3 friction points',
      'Propose improved to-be journey',
      'Validate with 2 participants',
      'Write UX recommendation doc',
    ],
  },
  {
    title: 'Competitive analysis — MS Planner vs Asana vs Monday',
    assignees: pms.slice(3, 5),
    percent: 100,
    priority: 3,
    due: -14,
    desc: 'Completed analysis of feature parity, pricing, and integration depth for the three leading project management tools. Key findings presented at April product review.',
    items: [
      'Define comparison criteria',
      'Evaluate MS Planner',
      'Evaluate Asana',
      'Evaluate Monday.com',
      'Score each on criteria matrix',
      'Write executive summary',
      'Present findings at product review',
    ],
  },
  {
    title: 'Define success metrics and KPIs for H1 2026 launches',
    assignees: [pick(pms, 0), pick(pmos, 0)],
    percent: 80,
    priority: 2,
    due: -5,
    desc: 'Establish baseline measurements and target KPIs for all features shipped in H1 2026. Includes activation rate, 30-day retention, and time-to-first-value metrics.',
    items: [
      'List all H1 launches',
      'Define leading and lagging indicators per feature',
      'Agree baseline measurements',
      'Set 30-day and 90-day targets',
      'Configure dashboards in analytics tool',
      'Align with PMO on reporting cadence',
    ],
  },
  {
    title: 'Sprint retrospective process improvement rollout',
    assignees: pmos.slice(0, 3),
    percent: 0,
    priority: 3,
    due: 21,
    desc: 'Standardize the retrospective format across all squads using the Start/Stop/Continue framework with async pre-writing in Confluence. Reduce retro time from 90 to 45 minutes.',
    items: [
      'Draft new retro format guide',
      'Pilot with two squads',
      'Gather facilitator feedback',
      'Update format based on feedback',
      'Publish retro guide to all teams',
      'Train squad leads',
      'Track average retro duration per squad',
    ],
  },
  {
    title: 'API integration requirements for third-party connectors',
    assignees: [pick(pms, 4), pick(icExecs, 0)],
    percent: 30,
    priority: 2,
    due: 35,
    desc: 'Document the technical and business requirements for the next two connector integrations: Jira and Slack. Includes auth model, data model mapping, and rate limit constraints.',
    items: [
      'Research Jira OAuth 2.0 scopes',
      'Research Slack app manifest requirements',
      'Map Jira issue → Planner task field mapping',
      'Map Slack channel → Group field mapping',
      'Define rate limit handling requirements',
      'Review with engineering lead',
      'Publish connector requirements spec',
    ],
  },
]

for (const t of prodTaskDefs) {
  const bucket =
    t.percent === 100
      ? bProdDone
      : t.percent >= 60
        ? bProdReview
        : t.percent > 0
          ? bProdSprint
          : bProdBacklog
  tasks.push(
    makeTask(planProd?.id, bucket.id, t.title, {
      ...t,
      dueDays: t.due,
      createdBy: pms[0],
      description: t.desc,
      checklistItems: t.items,
    }),
  )
}

// PMO tasks

const bPMOTodo = mustBucket(planPMO.id, 'To Do')
const bPMOIP = mustBucket(planPMO.id, 'In Progress')
const bPMODone = mustBucket(planPMO.id, 'Done')

const pmoTaskDefs = [
  {
    title: 'Monthly resource utilization report — May 2026',
    assignees: pmos.slice(0, 2),
    percent: 100,
    priority: 2,
    due: -2,
    desc: 'Compiled May 2026 resource utilization across all active projects. Average utilization: 87%. Three engineers flagged as over-allocated; escalation in progress.',
    items: [
      'Pull timesheet data from system',
      'Calculate utilization per engineer',
      'Identify over and under-allocated staff',
      'Highlight cross-project conflicts',
      'Draft report summary',
      'Review with PMO lead',
      'Distribute to department heads',
    ],
  },
  {
    title: 'Update project portfolio dashboard in Power BI',
    assignees: [pick(pmos, 1)],
    percent: 60,
    priority: 2,
    due: 5,
    desc: 'Refresh Power BI portfolio dashboard with Q2 actuals. Add new drill-down for per-sprint velocity and budget burn rate per project.',
    items: [
      'Connect latest data source refresh',
      'Add sprint velocity visual',
      'Add budget burn rate visual',
      'Fix drill-through filter bug',
      'Validate data against source system',
      'Publish to Power BI service',
      'Notify stakeholders of refresh',
    ],
  },
  {
    title: 'Risk register review and mitigation plan update',
    assignees: pmos.slice(0, 3),
    percent: 30,
    priority: 1,
    due: 10,
    desc: 'Quarterly review of all active project risks. Two new high-severity risks identified: key-person dependency on auth service and vendor delivery delay for cloud tooling.',
    items: [
      'Pull current risk register',
      'Re-score all open risks',
      'Identify new risks from project leads',
      'Update mitigation plans',
      'Escalate newly critical risks to CTO',
      'Publish updated register',
      'Schedule mitigation follow-up for high risks',
    ],
  },
  {
    title: 'Quarterly budget variance analysis',
    assignees: pmos.slice(2, 4),
    percent: 0,
    priority: 1,
    due: 14,
    desc: 'Q2 2026 budget variance analysis across all cost centres. Compare actuals to plan and forecast Q3 adjustments. Present to CFO by end of May.',
    items: [
      'Export actuals from finance system',
      'Map to budget line items',
      'Calculate variance per cost centre',
      'Identify root cause for >10% variances',
      'Draft Q3 forecast adjustments',
      'Review with finance team',
      'Prepare CFO presentation deck',
    ],
  },
  {
    title: 'Prepare board presentation for Q2 project status',
    assignees: [pick(pmos, 0), ceo],
    percent: 40,
    priority: 1,
    due: 7,
    desc: 'Prepare the quarterly board deck covering portfolio health, milestone status for top 5 projects, risk summary, and resource outlook for Q3.',
    items: [
      'Gather milestone status from all project leads',
      'Summarize portfolio health RAG status',
      'Compile key risks and mitigations',
      'Draft resource outlook slide',
      'Build budget summary slide',
      'Review with CEO',
      'Finalize deck',
      'Submit to board secretary',
    ],
  },
  {
    title: 'Onboarding checklist update for new project managers',
    assignees: [pick(pmos, 3)],
    percent: 0,
    priority: 3,
    due: 30,
    desc: 'Revise the PM onboarding checklist to reflect the new tooling stack (MS Planner, Teams, Power BI) and updated governance process. Target: new PMs productive by day 10.',
    items: [
      'Review current onboarding checklist',
      'Interview 2 recently onboarded PMs',
      'Identify gaps and outdated items',
      'Update checklist for new tooling',
      'Add Power BI training module',
      'Add governance process walkthrough',
      'Get sign-off from PMO lead',
      'Publish updated checklist to SharePoint',
    ],
  },
]

for (const t of pmoTaskDefs) {
  const bucket = t.percent === 100 ? bPMODone : t.percent > 0 ? bPMOIP : bPMOTodo
  tasks.push(
    makeTask(planPMO?.id, bucket.id, t.title, {
      ...t,
      dueDays: t.due,
      createdBy: pmos[0],
      description: t.desc,
      checklistItems: t.items,
    }),
  )
}

// ── Build plan members ────────────────────────────────────────────────────────
const planMemberRows: { tenantId: string; planId: string; userId: string }[] = []

function addPlanMembers(plan: Plan, grp: Group) {
  for (const m of grp.members) {
    planMemberRows.push({ tenantId: TENANT_ID, planId: plan.id, userId: m.userId })
  }
}

addPlanMembers(planInfra, gInfraReview)
addPlanMembers(planEng, gEngAll)
addPlanMembers(planFE, gFrontend)
addPlanMembers(planBE, gBackend)
addPlanMembers(planCloud, gCloudDevOps)
addPlanMembers(planSec, gSecurity)
addPlanMembers(planProd, gProduct)
addPlanMembers(planPMO, gPMO)

// Deduplicate plan members
const pmSet = new Set<string>()
const planMembersUniq = planMemberRows.filter((r) => {
  const k = `${r.planId}:${r.userId}`
  if (pmSet.has(k)) return false
  pmSet.add(k)
  return true
})

// ── Write CSVs ────────────────────────────────────────────────────────────────

// directory_users
const userRaws = users.map((u) => ({
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users/$entity',
  id: u.id,
  displayName: u.displayName,
  givenName: u.givenName,
  surname: u.surname,
  userPrincipalName: u.upn,
  mail: u.mail,
  jobTitle: u.jobTitle,
  department: u.department,
  officeLocation: 'Ho Chi Minh City',
  city: 'Ho Chi Minh City',
  country: 'Vietnam',
  usageLocation: 'VN',
  mobilePhone: u.phone,
  businessPhones: [u.phone],
  preferredLanguage: 'vi-VN',
  accountEnabled: true,
  userType: 'Member',
  employeeId: u.employeeId,
  skills: u.skills,
  createdDateTime: isoDate(-365 + Math.floor(Math.random() * 300)),
  '@odata.etag': plannerEtag(u.id),
}))

writeFileSync(
  `${OUT}/directory_users.csv`,
  csv(
    [
      'tenant_id',
      'entra_object_id',
      'user_principal_name',
      'mail',
      'display_name',
      'manager_id',
      'raw',
      'synced_at',
    ],
    users.map((u, i) => [
      TENANT_ID,
      u.id,
      u.upn,
      u.mail,
      u.displayName,
      u.managerId ?? '',
      userRaws[i],
      SYNCED,
    ]),
  ),
)
console.log(`✓ directory_users.csv (${users.length} rows)`)

// directory_groups
const groupRaws = groups.map((g) => ({
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#groups/$entity',
  id: g.id,
  displayName: g.displayName,
  description: g.description,
  mail: `${g.mailNickname}@setafuture.onmicrosoft.com`,
  mailEnabled: true,
  securityEnabled: g.groupType === 'SecurityGroup',
  mailNickname: g.mailNickname,
  groupTypes: g.groupType === 'Unified' ? ['Unified'] : [],
  visibility: 'Private',
  resourceProvisioningOptions: g.groupType === 'Unified' ? ['Team'] : [],
  membershipRule: null,
  createdDateTime: isoDate(-200 + Math.floor(Math.random() * 100)),
  renewedDateTime: SYNCED,
  '@odata.etag': plannerEtag(g.id),
}))

writeFileSync(
  `${OUT}/directory_groups.csv`,
  csv(
    ['tenant_id', 'entra_group_id', 'display_name', 'group_type', 'raw', 'synced_at'],
    groups.map((g, i) => [TENANT_ID, g.id, g.displayName, g.groupType, groupRaws[i], SYNCED]),
  ),
)
console.log(`✓ directory_groups.csv (${groups.length} rows)`)

// directory_group_members
const gmRows: unknown[][] = []
for (const g of groups) {
  for (const m of g.members) {
    gmRows.push([TENANT_ID, g.id, m.userId, m.role, SYNCED])
  }
}
// deduplicate
const gmSet = new Set<string>()
const gmUniq = gmRows.filter((r) => {
  const k = `${r[1]}:${r[2]}`
  if (gmSet.has(k)) return false
  gmSet.add(k)
  return true
})

writeFileSync(
  `${OUT}/directory_group_members.csv`,
  csv(['tenant_id', 'entra_group_id', 'entra_object_id', 'role', 'synced_at'], gmUniq),
)
console.log(`✓ directory_group_members.csv (${gmUniq.length} rows)`)

// sync_state (directory)
writeFileSync(
  `${OUT}/directory_sync_state.csv`,
  csv(
    [
      'tenant_id',
      'resource_kind',
      'delta_token',
      'last_full_sync_at',
      'last_delta_sync_at',
      'status',
    ],
    [
      [TENANT_ID, 'users', 'opaqueToken_users_abc123==', isoDate(-1), SYNCED, 'idle'],
      [TENANT_ID, 'groups', 'opaqueToken_groups_def456==', isoDate(-1), SYNCED, 'idle'],
    ],
  ),
)
console.log('✓ directory_sync_state.csv (2 rows)')

// planner_plans_cache
const planRaws = plans.map((p) => ({
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#planner/plans/$entity',
  id: p.id,
  title: p.title,
  owner: p.ownerGroupId,
  container: {
    '@odata.type': '#microsoft.graph.plannerPlanContainer',
    containerId: p.ownerGroupId,
    type: 'group',
    url: `https://graph.microsoft.com/v1.0/groups/${p.ownerGroupId}`,
  },
  createdBy: {
    '@odata.type': '#microsoft.graph.identitySet',
    user: { id: cto.id, displayName: cto.displayName },
  },
  createdDateTime: isoDate(-90 + Math.floor(Math.random() * 30)),
  '@odata.etag': plannerEtag(p.id),
}))

writeFileSync(
  `${OUT}/planner_plans_cache.csv`,
  csv(
    [
      'tenant_id',
      'graph_plan_id',
      'owner_group_id',
      'title',
      'container_url',
      'etag',
      'raw',
      'synced_at',
      'soft_deleted_at',
    ],
    plans.map((p, i) => [
      TENANT_ID,
      p.id,
      p.ownerGroupId,
      p.title,
      `https://graph.microsoft.com/v1.0/groups/${p.ownerGroupId}`,
      plannerEtag(p.id),
      planRaws[i],
      SYNCED,
      '',
    ]),
  ),
)
console.log(`✓ planner_plans_cache.csv (${plans.length} rows)`)

// planner_buckets_cache
const bucketRaws = buckets.map((b) => ({
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#planner/buckets/$entity',
  id: b.id,
  name: b.name,
  planId: b.planId,
  orderHint: b.orderHint,
  '@odata.etag': plannerEtag(b.id),
}))

writeFileSync(
  `${OUT}/planner_buckets_cache.csv`,
  csv(
    [
      'tenant_id',
      'graph_bucket_id',
      'plan_id',
      'name',
      'order_hint',
      'etag',
      'raw',
      'synced_at',
      'soft_deleted_at',
    ],
    buckets.map((b, i) => [
      TENANT_ID,
      b.id,
      b.planId,
      b.name,
      b.orderHint,
      plannerEtag(b.id),
      bucketRaws[i],
      SYNCED,
      '',
    ]),
  ),
)
console.log(`✓ planner_buckets_cache.csv (${buckets.length} rows)`)

// planner_tasks_cache
function assignmentsObj(userIds: string[], assignedById: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const uid of userIds) {
    obj[uid] = {
      '@odata.type': '#microsoft.graph.plannerAssignment',
      orderHint: `${Math.floor(Math.random() * 99999)}!`,
      assignedBy: { '@odata.type': '#microsoft.graph.identitySet', user: { id: assignedById } },
      assignedDateTime: SYNCED,
    }
  }
  return obj
}

const taskRaws = tasks.map((t) => ({
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#planner/tasks/$entity',
  id: t.id,
  planId: t.planId,
  bucketId: t.bucketId,
  title: t.title,
  orderHint: `${Math.floor(Math.random() * 999999)}!`,
  assigneePriority: `${Math.floor(Math.random() * 99999)}!`,
  percentComplete: t.percentComplete,
  priority: t.priority,
  startDateTime: null,
  dueDateTime: t.dueDate,
  createdDateTime: t.createdAt,
  completedDateTime: t.percentComplete === 100 ? isoDate(-1) : null,
  hasDescription: !!t.description,
  previewType: 'description',
  referenceCount: 0,
  checklistItemCount: Object.keys(t.checklist).length,
  activeChecklistItemCount: Object.values(t.checklist).filter(
    (c) => !(c as { isChecked: boolean }).isChecked,
  ).length,
  conversationThreadId: null,
  createdBy: { '@odata.type': '#microsoft.graph.identitySet', user: { id: t.createdBy } },
  completedBy:
    t.percentComplete === 100
      ? {
          '@odata.type': '#microsoft.graph.identitySet',
          user: { id: t.assigneeIds[0] ?? t.createdBy },
        }
      : null,
  assignments: assignmentsObj(t.assigneeIds, t.createdBy),
  appliedCategories: {
    category1: false,
    category2: false,
    category3: false,
    category4: false,
    category5: false,
    category6: false,
  },
  '@odata.etag': plannerEtag(t.id),
}))

writeFileSync(
  `${OUT}/planner_tasks_cache.csv`,
  csv(
    [
      'tenant_id',
      'graph_task_id',
      'plan_id',
      'bucket_id',
      'title',
      'percent_complete',
      'priority',
      'due_date',
      'assignee_ids',
      'created_by',
      'created_at_graph',
      'last_modified_by',
      'last_modified_at_graph',
      'etag',
      'raw',
      'synced_at',
      'soft_deleted_at',
    ],
    tasks.map((t, i) => [
      TENANT_ID,
      t.id,
      t.planId,
      t.bucketId,
      t.title,
      t.percentComplete,
      t.priority,
      t.dueDate ?? '',
      pgArray(t.assigneeIds),
      t.createdBy,
      t.createdAt,
      t.lastModifiedBy,
      t.lastModifiedAt,
      plannerEtag(t.id),
      taskRaws[i],
      SYNCED,
      '',
    ]),
  ),
)
console.log(`✓ planner_tasks_cache.csv (${tasks.length} rows)`)

// planner_task_details_cache
const detailRaws = tasks.map((t) => ({
  '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#planner/tasks/${t.id}/details/$entity`,
  id: t.id,
  description: t.description,
  previewType: 'description',
  checklist: t.checklist,
  references: {},
  '@odata.etag': plannerEtag(t.id),
}))

writeFileSync(
  `${OUT}/planner_task_details_cache.csv`,
  csv(
    [
      'tenant_id',
      'graph_task_id',
      'description',
      'checklist',
      'references',
      'etag',
      'raw',
      'synced_at',
    ],
    tasks.map((t, i) => [
      TENANT_ID,
      t.id,
      t.description,
      t.checklist,
      {},
      plannerEtag(t.id),
      detailRaws[i],
      SYNCED,
    ]),
  ),
)
console.log(`✓ planner_task_details_cache.csv (${tasks.length} rows)`)

// plan_members
writeFileSync(
  `${OUT}/planner_plan_members.csv`,
  csv(
    ['tenant_id', 'plan_id', 'user_id', 'synced_at'],
    planMembersUniq.map((r) => [r.tenantId, r.planId, r.userId, SYNCED]),
  ),
)
console.log(`✓ planner_plan_members.csv (${planMembersUniq.length} rows)`)

// sync_watermarks (planner)
const watermarkRows: unknown[][] = []
for (const p of plans) {
  watermarkRows.push([TENANT_ID, 'plan', p.id, SYNCED, 'idle', `delta_${p.id.slice(0, 8)}_token==`])
}
watermarkRows.push([TENANT_ID, 'tenant', TENANT_ID, SYNCED, 'idle', `delta_tenant_token==`])

writeFileSync(
  `${OUT}/planner_sync_watermarks.csv`,
  csv(
    ['tenant_id', 'scope_kind', 'scope_id', 'last_sync_at', 'status', 'delta_token'],
    watermarkRows,
  ),
)
console.log(`✓ planner_sync_watermarks.csv (${watermarkRows.length} rows)`)

console.log('\nAll CSV files written to', OUT)
