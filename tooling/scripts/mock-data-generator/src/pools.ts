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
  // Executive
  CEO: ['Leadership', 'Business Strategy', 'Stakeholder Management', 'Digital Transformation'],
  CTO: ['AWS', 'Engineering Leadership', 'DevOps', 'System Design', 'Cloud'],
  CDO: ['ML', 'NLP', 'Python', 'Data Engineering', 'AI'],
  // Engineering leadership
  'VP Engineering': [
    'Engineering Leadership',
    'AWS',
    'System Design',
    'DevOps',
    'Stakeholder Management',
  ],
  'Engineering Manager': [
    'Engineering Leadership',
    'Agile',
    'Risk Management',
    'Stakeholder Management',
    'Estimation',
  ],
  'Tech Lead': [
    'TypeScript',
    'Node.js',
    'System Design',
    'React',
    'PostgreSQL',
    'Engineering Leadership',
  ],
  'Software Architect': [
    'System Design',
    'AWS',
    'Kubernetes',
    'gRPC',
    'PostgreSQL',
    'Engineering Leadership',
  ],
  // Frontend
  'Junior Frontend Developer': ['JavaScript', 'HTML', 'CSS', 'React'],
  'Mid Frontend Developer': ['React', 'TypeScript', 'Next.js', 'JavaScript', 'Cypress'],
  'Senior Frontend Developer': [
    'React',
    'TypeScript',
    'Next.js',
    'JavaScript',
    'GraphQL',
    'Cypress',
    'Design Systems',
  ],
  // Backend
  'Backend Developer': ['Node.js', 'PostgreSQL', 'Docker', 'TypeScript'],
  'Junior Backend Developer': ['Node.js', 'PostgreSQL', 'TypeScript'],
  'Mid Backend Developer': ['Node.js', 'PostgreSQL', 'Docker', 'TypeScript', 'Redis'],
  'Senior Backend Developer': [
    'Node.js',
    'PostgreSQL',
    'Docker',
    'TypeScript',
    'Kafka',
    'GraphQL',
    'AWS',
  ],
  // Fullstack
  'Junior Fullstack Developer': ['React', 'Node.js', 'TypeScript'],
  'Mid Fullstack Developer': ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker'],
  'Senior Fullstack Developer': [
    'React',
    'Node.js',
    'TypeScript',
    'PostgreSQL',
    'Docker',
    'AWS',
    'GraphQL',
  ],
  // Mobile
  'Junior Mobile Developer': ['React Native', 'TypeScript', 'iOS'],
  'Mid Mobile Developer': ['React Native', 'TypeScript', 'iOS', 'Android', 'Swift'],
  'Senior Mobile Developer': [
    'React Native',
    'iOS',
    'Android',
    'Swift',
    'Kotlin',
    'SwiftUI',
    'Jetpack Compose',
  ],
  // DevOps / SRE / Cloud / IT
  'DevOps Engineer': ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'CI/CD'],
  'Senior DevOps Engineer': [
    'AWS',
    'Kubernetes',
    'Terraform',
    'Helm',
    'CI/CD',
    'GitHub Actions',
    'ArgoCD',
  ],
  'Site Reliability Engineer': [
    'Linux',
    'Monitoring',
    'Prometheus',
    'Grafana',
    'Kubernetes',
    'OpenTelemetry',
  ],
  'Cloud Engineer': ['AWS', 'Azure', 'GCP', 'Terraform', 'CloudFront'],
  'IT Engineer': ['AWS', 'Kubernetes', 'Terraform', 'Linux', 'Monitoring', 'Security'],
  // Data & AI
  'Data Engineer': ['Spark', 'Kafka', 'Airflow', 'Python', 'PostgreSQL'],
  'Senior Data Engineer': ['Spark', 'Kafka', 'Airflow', 'Python', 'PostgreSQL', 'dbt', 'BigQuery'],
  'Data Scientist': ['ML', 'NLP', 'Spark', 'Python'],
  'Senior Data Scientist': [
    'ML',
    'NLP',
    'Spark',
    'Python',
    'PyTorch',
    'TensorFlow',
    'Feature Engineering',
  ],
  'ML Engineer': ['ML', 'PyTorch', 'TensorFlow', 'MLflow', 'Python'],
  'MLOps Engineer': ['MLOps', 'Kubernetes', 'MLflow', 'AWS', 'Docker', 'Python'],
  'AI Engineer': ['LLM', 'Prompt Engineering', 'LangChain', 'RAG', 'OpenAI SDK', 'Anthropic SDK'],
  'Generative AI Engineer': [
    'LLM',
    'Fine-tuning',
    'PyTorch',
    'Hugging Face',
    'RAG',
    'Vector Databases',
  ],
  // QA
  'Junior QA Engineer': ['Cypress', 'API Testing', 'TypeScript'],
  'QA Engineer': ['Cypress', 'Playwright', 'API Testing', 'Postman', 'TypeScript'],
  'Senior QA Engineer': [
    'Cypress',
    'Playwright',
    'API Testing',
    'Postman',
    'JMeter',
    'TypeScript',
    'Test Automation',
  ],
  'QA Automation Engineer': [
    'Selenium',
    'Cypress',
    'Playwright',
    'Test Automation',
    'TypeScript',
    'Robot Framework',
  ],
  'QA Lead': [
    'Test Automation',
    'Cypress',
    'Playwright',
    'Risk Management',
    'Stakeholder Management',
  ],
  // Security
  'Security Engineer': ['Security', 'OWASP', 'IAM', 'SAST', 'DAST'],
  'Senior Security Engineer': [
    'Security',
    'OWASP',
    'IAM',
    'Penetration Testing',
    'SAST',
    'DAST',
    'Threat Modeling',
  ],
  'Security Lead': [
    'Security',
    'ISO 27001',
    'SOC 2',
    'Zero Trust',
    'Risk Management',
    'Stakeholder Management',
  ],
  // Project & product
  PM: ['Agile', 'Scrum', 'Risk Management'],
  'Project Manager': ['Agile', 'Scrum', 'JIRA', 'Risk Management', 'Stakeholder Management'],
  'Senior Project Manager': [
    'Agile',
    'Scrum',
    'JIRA',
    'Risk Management',
    'Stakeholder Management',
    'Estimation',
    'Portfolio Management',
  ],
  'Delivery Manager': [
    'Agile',
    'Stakeholder Management',
    'Risk Management',
    'Estimation',
    'Resource Planning',
  ],
  'Scrum Master': ['Scrum', 'Agile', 'Kanban', 'Stakeholder Management'],
  'Product Owner': ['Agile', 'Scrum', 'Product Roadmap', 'Stakeholder Management', 'Estimation'],
  'Business Analyst': [
    'Stakeholder Management',
    'Risk Management',
    'Agile',
    'JIRA',
    'Product Roadmap',
  ],
  // PMO
  'PMO Lead': [
    'Portfolio Management',
    'KPI',
    'Governance',
    'Resource Planning',
    'Stakeholder Management',
  ],
  'PMO Analyst': ['Portfolio Management', 'KPI', 'Resource Planning', 'JIRA'],
  // Design
  'UI/UX Designer': ['Figma', 'Wireframing', 'Prototyping', 'User Research'],
  'Senior UI/UX Designer': [
    'Figma',
    'Sketch',
    'Wireframing',
    'Prototyping',
    'User Research',
    'Design Systems',
    'Accessibility',
  ],
  'Design Lead': [
    'Figma',
    'Design Systems',
    'Stakeholder Management',
    'User Research',
    'Accessibility',
  ],
  // HR / Talent
  'HR Manager': [
    'HRIS',
    'Performance Reviews',
    'Employee Engagement',
    'Labor Law VN',
    'Stakeholder Management',
  ],
  'HR Generalist': ['HRIS', 'Onboarding', 'Employee Engagement', 'Labor Law VN'],
  'HR Business Partner': [
    'Stakeholder Management',
    'Performance Reviews',
    'Employee Engagement',
    'Compensation',
  ],
  'Talent Acquisition': ['Technical Recruiting', 'LinkedIn Recruiter', 'Onboarding'],
  // Internal IT
  'IT Support': ['Linux', 'Monitoring', 'Office Operations'],
  'IT Administrator': ['Linux', 'Monitoring', 'Security', 'Office Operations'],
  // Business operations
  'Account Manager': ['Account Management', 'CRM', 'Negotiation', 'Stakeholder Management'],
  'Sales Manager': ['B2B Sales', 'CRM', 'Negotiation', 'Stakeholder Management', 'Leadership'],
  'Marketing Specialist': ['Content Marketing', 'SEO', 'CRM'],
  'Finance / Accountant': ['Accounting', 'Financial Reporting', 'Budgeting'],
  'Operations Manager': [
    'Office Operations',
    'Stakeholder Management',
    'Risk Management',
    'Leadership',
  ],
  'Office Administrator': ['Office Operations', 'HRIS', 'Stakeholder Management'],
  // Internal comms
  'IC Executive': ['Internal Communications', 'Employee Engagement', 'Town Hall Facilitation'],
  // Legacy unspecific (cast only)
  'Junior Developer': ['JavaScript', 'HTML', 'CSS'],
  'Software Engineer': ['TypeScript', 'Node.js', 'PostgreSQL'],
}

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

export type Seniority = 'junior' | 'mid' | 'senior'

export function seniorityOf(role: string): Seniority {
  if (role.startsWith('Junior ')) return 'junior'
  if (role.startsWith('Senior ')) return 'senior'
  return 'mid'
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
