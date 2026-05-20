export const FAMILY_NAMES = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Vũ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
  'Hoàng',
  'Phan',
  'Trương',
  'Đinh',
  'Tô',
  'Mai',
  'Đoàn',
  'Cao',
] as const

export const MIDDLE_NAMES = ['Thị', 'Văn', 'Hữu', 'Quốc', 'Đình', 'Ngọc', 'Trung', 'Hoàng'] as const

export const GIVEN_NAMES = [
  'An',
  'Anh',
  'Bảo',
  'Bình',
  'Châu',
  'Chi',
  'Cường',
  'Dũng',
  'Đức',
  'Giang',
  'Hà',
  'Hải',
  'Hiếu',
  'Hồng',
  'Hùng',
  'Huy',
  'Khánh',
  'Lan',
  'Linh',
  'Mai',
  'Minh',
  'Nam',
  'Phương',
  'Quân',
  'Sơn',
  'Tâm',
  'Thảo',
  'Trang',
  'Tuấn',
  'Yến',
] as const

export const ROLES = [
  'CEO',
  'CTO',
  'CDO',
  'IC Executive',
  'PM',
  'PMO',
  'Frontend Developer',
  'Backend Developer',
  'Fullstack Developer',
  'Talent Acquisition',
  'IT Engineer',
  'Data Scientist',
  'Junior Developer',
  'Software Engineer',
  'QA Engineer',
] as const

export const PROJECTS = [
  'SETA Internal',
  'Client Atlas',
  'Client Beta',
  'Client Helios',
  'Client Nova',
  'R&D',
] as const

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

export const ALIAS_SKILLS = ['k8s', 'ts', 'postgres', 'pg', 'js', 'node'] as const

export const ROLE_SKILL_PROFILE: Readonly<Record<string, readonly string[]>> = {
  CEO: ['Leadership', 'Stakeholder Management'],
  CTO: ['AWS', 'Engineering Leadership', 'DevOps'],
  CDO: ['ML', 'NLP', 'Python', 'Data Engineering'],
  'IC Executive': ['Stakeholder Management', 'Leadership'],
  PM: ['Agile', 'Scrum', 'Risk Management'],
  PMO: ['Risk Management', 'Stakeholder Management'],
  'Frontend Developer': ['React', 'TypeScript', 'Next.js', 'JavaScript'],
  'Backend Developer': ['Node.js', 'PostgreSQL', 'Docker', 'TypeScript'],
  'Fullstack Developer': ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
  'Talent Acquisition': ['Stakeholder Management'],
  'IT Engineer': ['AWS', 'Kubernetes', 'Terraform', 'Linux', 'Monitoring', 'Security'],
  'Data Scientist': ['ML', 'NLP', 'Spark', 'Python'],
  'Junior Developer': ['JavaScript', 'OOP'],
  'Software Engineer': ['TypeScript', 'Node.js'],
  'QA Engineer': ['Cypress', 'Playwright', 'TypeScript'],
}

export const PLAN_TAGS_INFRA = [
  'infrastructure',
  'cloud',
  'devops',
  'aws',
  'kubernetes',
  'review',
] as const
export const PLAN_TAGS_PRODUCT = ['frontend', 'backend', 'mobile', 'product', 'roadmap'] as const
export const PLAN_TAGS_DATA = ['ai', 'ml', 'spark', 'data', 'analytics'] as const

export const TASK_TAGS_INFRA = [
  'infrastructure',
  'aws',
  'kubernetes',
  'terraform',
  'cloud',
  'monitoring',
  'security',
  'devops',
  'reliability',
  'cost',
  'review',
] as const
export const TASK_TAGS_NON_INFRA = [
  'frontend',
  'react',
  'design-system',
  'documentation',
  'qa',
  'mobile',
  'product',
] as const

export const PLAN_TITLE_TEMPLATES = [
  'Infrastructure Review {quarter} {year}',
  'Cloud Migration {quarter}',
  '{team} Modernization',
  '{team} Cleanup Sprint',
  'AI Platform R&D',
  'Security & Compliance {year}',
  'Product Roadmap {quarter}',
  'Quarterly Engineering Sprint',
  'Mobile App {year}',
  '{team} Reliability Initiative',
] as const

export const TEAMS = ['Frontend', 'Backend', 'Data', 'Platform', 'Mobile', 'DevOps'] as const
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const

export const TASK_TITLES_SHORT = [
  '',
  'Logs',
  'Cleanup',
  'Bugfix',
  'Refactor',
  'Docs',
  'Tests',
] as const

export const TASK_TITLES_MEDIUM = [
  'Investigate {component} {issue}',
  'Update {service} configuration',
  'Audit {system} security and policies',
  'Migrate {component} to v{version}',
  'Set up {service} for {team}',
  'Review {component} architecture',
  'Patch CVE in {component}',
  'Roll out {feature} to {env}',
  'Document {component} runbook',
] as const

export const TASK_TITLES_LONG = [
  'Investigate and document the root cause of the intermittent 502 errors observed during the morning peak traffic window in the production payment gateway and propose a remediation plan covering load balancing strategy',
  'Design and validate a phased migration plan for moving the monolithic billing service into the new microservices platform without exceeding the agreed maintenance window for end-customer-facing endpoints',
  'Coordinate with the security task force to audit the entire IAM policy surface across all AWS accounts and produce a prioritized remediation backlog based on least-privilege deviations',
] as const

export const TITLE_SLOTS = {
  component: [
    'nginx ingress',
    'auth gateway',
    'payment service',
    'search index',
    'event bus',
    'job runner',
  ],
  issue: ['latency spike', 'memory leak', 'flaky tests', 'timeouts', 'cost regression'],
  service: ['PostgreSQL', 'Redis', 'Kafka', 'Spark cluster', 'monitoring stack'],
  system: ['Kubernetes cluster', 'CI pipeline', 'API gateway'],
  version: ['1.7', '2.0', '15', '18'],
  team: ['ML team', 'data team', 'backend team', 'platform team'],
  feature: ['feature flag dashboard', 'audit log viewer', 'cost report'],
  env: ['production', 'staging', 'canary'],
} as const

export const TASK_DESCRIPTION_TEMPLATES = [
  'Review the {skills} configuration across production and propose adjustments.',
  'Document the steps to run {skills} integration in the new environment.',
  'Investigate why {skills} usage spiked last week and produce a write-up.',
  'Provision {skills} resources for the upcoming launch and verify capacity.',
  'Coordinate with the {team} team on {skills} migration.',
]

export const DESCRIPTION_SKILL_HINTS = {
  infra: ['AWS', 'Kubernetes', 'Terraform', 'Linux', 'Monitoring', 'Security', 'Docker'],
  data: ['Spark', 'NLP', 'ML', 'Kafka', 'Airflow'],
  frontend: ['React', 'TypeScript', 'Next.js'],
  backend: ['Node.js', 'PostgreSQL', 'Redis'],
}
