export type RbacRole = 'org.admin' | 'planner.admin' | 'planner.contributor' | 'planner.viewer'

const ORG_ADMIN = new Set(['CEO', 'CTO', 'CDO', 'VP Engineering'])

const PLANNER_ADMIN = new Set(['Engineering Manager', 'Tech Lead', 'Software Architect'])

const PLANNER_VIEWER = new Set([
  'PMO Lead',
  'PMO Analyst',
  'HR Manager',
  'HR Generalist',
  'HR Business Partner',
  'Talent Acquisition',
  'IT Support',
  'IT Administrator',
  'Account Manager',
  'Sales Manager',
  'Marketing Specialist',
  'Finance / Accountant',
  'Operations Manager',
  'Office Administrator',
  'IC Executive',
])

// Explicit list of roles that resolve to planner.contributor.
// Includes legacy cast-only labels (Backend Developer, IT Engineer, PM,
// Junior Developer, Software Engineer) so the mapping is total over ROLES.
const PLANNER_CONTRIBUTOR = new Set([
  // Frontend / Backend / Fullstack / Mobile × seniority
  'Junior Frontend Developer',
  'Mid Frontend Developer',
  'Senior Frontend Developer',
  'Junior Backend Developer',
  'Mid Backend Developer',
  'Senior Backend Developer',
  'Junior Fullstack Developer',
  'Mid Fullstack Developer',
  'Senior Fullstack Developer',
  'Junior Mobile Developer',
  'Mid Mobile Developer',
  'Senior Mobile Developer',
  // DevOps / SRE / Cloud
  'DevOps Engineer',
  'Senior DevOps Engineer',
  'Site Reliability Engineer',
  'Cloud Engineer',
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
  'Project Manager',
  'Senior Project Manager',
  'Delivery Manager',
  'Scrum Master',
  'Product Owner',
  'Business Analyst',
  // Design
  'UI/UX Designer',
  'Senior UI/UX Designer',
  'Design Lead',
  // Legacy cast-only IC labels
  'Backend Developer',
  'IT Engineer',
  'PM',
  'Junior Developer',
  'Software Engineer',
])

export function roleToRbac(role: string): RbacRole {
  if (role === '') return 'planner.viewer'
  if (ORG_ADMIN.has(role)) return 'org.admin'
  if (PLANNER_ADMIN.has(role)) return 'planner.admin'
  if (PLANNER_CONTRIBUTOR.has(role)) return 'planner.contributor'
  if (PLANNER_VIEWER.has(role)) return 'planner.viewer'
  throw new Error(`roleToRbac: unrecognized role "${role}"`)
}
