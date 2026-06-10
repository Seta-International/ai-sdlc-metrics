-- ===== business contexts (CTX-007 has NULL project: new project not yet in core) =====
insert into ta.business_context (context_code, project_id, project_name, roadmap_summary)
select v.code,
       (select project_id from core.project where project_code = v.proj),
       v.name, v.summary
from (values
 ('CTX-001','PRJ-001','Hệ thống ERP FPT Orion','Mở rộng đội Backend hỗ trợ dự án chuyển đổi microservices trong Q3'),
 ('CTX-002','PRJ-004','Ứng dụng Di động Techcombank Vega','Xây dựng đội Mobile Engineering cho ra mắt ứng dụng đa nền tảng Q4'),
 ('CTX-003','PRJ-003','Công cụ Nội bộ','Nâng cao năng lực QA Automation cho cải tiến pipeline CI/CD nội bộ'),
 ('CTX-004','PRJ-006','Nền tảng Phân tích VinGroup Draco','Mở rộng đội Data Engineering cho nền tảng phân tích dữ liệu thời gian thực'),
 ('CTX-005','PRJ-005','Tích hợp Đa đám mây FPT Lyra','Tuyển dụng kỹ sư DevOps hỗ trợ triển khai hạ tầng đa đám mây'),
 ('CTX-006','PRJ-002','Nền tảng AI VinGroup Energent','Thành lập đội AI/ML mới phát triển hệ thống đề xuất thông minh'),
 ('CTX-007',NULL,'Dự án Eta (mới)','Tuyển chuyên gia Frontend tái xây dựng Design System và cải tổ trải nghiệm người dùng')
) as v(code, proj, name, summary);

-- ===== headcount plans (salary text range -> numeric scaled min/max; AI/ML = wide band) =====
insert into ta.headcount_plan
 (hc_plan_code, context_id, position, role_id, headcount, salary_min_scaled, salary_max_scaled, target_start_date, quarter)
select v.code,
       (select business_context_id from ta.business_context where context_code = v.ctx),
       v.position,
       (select role_id from core.role where role_code = v.role),
       v.hc, v.smin, v.smax, v.tsd::date, v.q
from (values
 ('HC-2025-Q2-001','CTX-001','Senior Backend Developer','BE',3,1.50,2.50,'2026-07-01','2025-Q2'),
 ('HC-2025-Q2-002','CTX-002','Mobile Developer (React Native)','Mobile',2,1.20,2.00,'2026-08-01','2025-Q2'),
 ('HC-2025-Q3-001','CTX-003','QA Automation Engineer','QA',2,1.00,1.80,'2026-09-15','2025-Q3'),
 ('HC-2025-Q3-002','CTX-004','Data Engineer','DevOps',1,1.80,3.00,'2026-10-01','2025-Q3'),
 ('HC-2025-Q3-003','CTX-005','DevOps Engineer','DevOps',2,1.50,2.80,'2026-09-01','2025-Q3'),
 ('HC-2025-Q4-001','CTX-006','AI/ML Engineer','ML',2,2.00,3.50,'2026-11-01','2025-Q4'),
 ('HC-2025-Q4-002','CTX-007','Senior Frontend Developer','FE',3,1.40,2.20,'2026-10-15','2025-Q4')
) as v(code, ctx, position, role, hc, smin, smax, tsd, q);

-- ===== JD templates with full column set =====
insert into ta.jd_template
  (jd_code, position, role_id, hc_plan_id,
   jd_version, jd_status, last_updated, min_yoe, max_yoe,
   seniority_level, english_level_required, work_mode,
   salary_min_scaled, salary_max_scaled,
   must_have_skills, nice_to_have_skills, key_responsibilities, jd_full_text)
select v.code, v.pos,
  (select role_id from core.role where role_code = v.role),
  (select headcount_plan_id from ta.headcount_plan where hc_plan_code = v.hc),
  v.ver, v.status, v.lu::date, v.min_yoe::int, v.max_yoe::int,
  v.sen, v.eng, v.wm, v.smin::numeric, v.smax::numeric,
  v.mh, v.nth, v.kr, v.ft
from (values
 ('JD-BE-SR-001','Senior Backend Developer','BE','HC-2025-Q2-001','v2.1','In Draft','2025-03-20',4,NULL,'Senior','B2','Hybrid',1.5,2.5,'Python (3+ yrs production), PostgreSQL/SQL (advanced), RESTful API design, Microservices architecture','Docker, Redis, Apache Kafka, Cloud (AWS or GCP), System design, Kubernetes','• Design & own scalable BE microservices (Python/FastAPI)
• PostgreSQL schema design & query optimization
• Build async pipelines (Celery/Redis/Kafka)
• Mentor junior engineers; lead architecture reviews','## Senior Backend Developer – SETA International

### About the Role
We are scaling our backend engineering team to support a major microservices migration powering our enterprise AI platform. You will own critical services from design to production.

### Responsibilities
- Design and implement RESTful and event-driven microservices using Python (FastAPI/Django REST)
- Own database schema design, query optimization, and PostgreSQL tuning
- Build and maintain async task pipelines (Celery, Redis, Kafka)
- Collaborate with the AI/ML team to integrate model serving APIs
- Lead architecture reviews; mentor 2–3 junior engineers

### Must-Have Requirements
- 4+ years backend development; 3+ years Python in production
- Advanced PostgreSQL: indexing, CTEs, query plan analysis
- RESTful API design for web & mobile clients
- Microservices & distributed systems experience
- English B2+: daily async standups + written documentation in English

### Nice-to-Have
- Docker / Kubernetes container orchestration
- Kafka, RabbitMQ, or Redis Streams
- Cloud: AWS (preferred) or GCP
- Fintech / E-commerce / high-traffic systems background
- System design (>100K req/min)

### Offer
- Salary: $1,500–$2,500/month (negotiable)
- Hybrid: 3 days HCMC office, 2 days remote
- Annual bonus + health insurance + $500 L&D budget

### [AGENT NOTE] JD draft pending clarity score. HR review required before publish.'),
 ('JD-MOB-MID-001','Mobile Developer (React Native)','Mobile','HC-2025-Q2-002','v1.3','Ready','2025-03-15',3,NULL,'Mid','B1','Any',1.2,2.0,'React Native, JavaScript or TypeScript (strict mode), REST API integration, State management (Redux/Zustand)','Firebase, CI/CD (Fastlane/GitHub Actions), Published app (App Store or Play Store), Offline-first architecture','• Build cross-platform mobile app (iOS + Android) with React Native
• Integrate REST APIs and manage app state
• Work with design team to implement Figma designs pixel-perfect
• Write unit + integration tests; maintain CI/CD pipeline','## Mobile Developer (React Native) – SETA International

### Responsibilities
- Develop and maintain cross-platform mobile application (iOS + Android) using React Native
- Integrate RESTful APIs; implement robust state management (Redux/Zustand)
- Collaborate with UX designers to translate Figma designs into production-grade UI
- Write unit/integration tests; own CI/CD pipeline (Fastlane + GitHub Actions)
- Optimise app performance (JS thread, memory leaks, launch time)

### Must-Have
- 3+ years React Native in production (not Expo-only)
- TypeScript strict mode; proficient with React hooks
- REST API integration; familiarity with async patterns (async/await)
- State management: Redux Toolkit or Zustand

### Nice-to-Have
- Firebase (Auth, Firestore, FCM)
- Published app on App Store and/or Play Store
- CI/CD: Fastlane + GitHub Actions
- Offline-first architecture (e.g., WatermelonDB, SQLite)

### Offer
- Salary: $1,200–$2,000/month
- Flexible/remote-friendly working'),
 ('JD-QA-MID-001','QA Automation Engineer','QA','HC-2025-Q3-001','v1.6','Not Started','2025-03-01',2,NULL,'Mid','B1','Hybrid',1.0,1.8,'Selenium or Playwright, Python or Java, API Testing (Postman/RestAssured), Test plan & strategy','CI/CD integration (Jenkins/GitHub Actions), Performance testing (JMeter/k6), Docker, TestRail','• Design and implement automation test framework (Python/Playwright)
• API and integration testing; maintain test suites
• Integrate automation into CI/CD pipeline
• Document test plans, test cases, defect reports','## QA Automation Engineer – SETA International

### Responsibilities
- Design, implement, and maintain automated test framework (Playwright + Python preferred)
- Perform API testing and integration testing across microservices
- Integrate test suites into CI/CD pipeline (Jenkins/GitHub Actions)
- Document test plans, test cases, and defect reports in TestRail
- Collaborate with developers during sprint to shift testing left

### Must-Have
- 2+ years QA automation experience (not manual-only)
- Selenium or Playwright with Python or Java
- API testing: Postman, RestAssured, or equivalent
- Test planning and strategy documentation

### Nice-to-Have
- CI/CD integration (Jenkins, GitHub Actions)
- Performance testing: JMeter or k6
- Docker for test environment
- TestRail or similar TMS

### Offer
- Salary: $1,000–$1,800/month
- Hybrid working'),
 ('JD-DE-SR-001','Data Engineer','DevOps','HC-2025-Q3-002','v3.1','Ready','2025-03-18',3,NULL,'Senior','B1','Remote',1.8,3.0,'Python, SQL (advanced: window functions, CTEs, query optimization), ETL/ELT pipeline ownership, Cloud DWH (BigQuery or Redshift or Snowflake)','Apache Spark (PySpark), Apache Airflow, dbt, Kafka/Pub-Sub, GCP stack (Dataflow, Composer, GCS)','• Design & own ETL/ELT pipelines ingesting 100GB+/day
• Build dbt transformation layers with lineage, tests, docs
• Optimize BigQuery performance (partitioning, clustering)
• Implement data quality monitoring & alerting
• Define data contracts with ML and Analytics teams','## Senior Data Engineer – SETA International

### About the Role
SETA''s Data Platform team powers analytics for 30+ enterprise clients, ingesting 100GB+ daily. You will own pipelines end-to-end: ingestion → transformation → quality → serving.

### Responsibilities
- Design and implement batch/streaming ETL pipelines (Python + Airflow + Spark/BigQuery)
- Build dbt transformation layers: models, tests, macros, documentation
- Optimize BigQuery/Redshift performance: partitioning, clustering, query cost
- Integrate new data sources (REST APIs, CDC, flat files, Kafka)
- Implement data quality checks and pipeline alerting

### Must-Have
- 3+ years data engineering (pipeline ownership, not just SQL analytics)
- Python for DE: PySpark, pandas, custom ingestion
- Advanced SQL: window functions, CTEs, query plan analysis
- Cloud DWH hands-on: BigQuery (preferred), Redshift, or Snowflake

### Nice-to-Have
- Apache Spark, Airflow, dbt
- GCP: Dataflow, Composer, Pub/Sub, GCS
- Kafka or streaming ingestion

### Offer
- Salary: $1,800–$3,000/month
- Remote-first'),
 ('JD-DO-SR-001','DevOps Engineer','DevOps','HC-2025-Q3-003','v2.2','Not Started','2025-03-20',4,NULL,'Senior','B2','Any',1.5,2.8,'Linux, Docker, CI/CD (GitHub Actions or Jenkins), Cloud (AWS or GCP), Infrastructure as Code','Kubernetes, Terraform, Monitoring (Prometheus/Grafana), Vault, Multi-cloud architecture','• Build & maintain CI/CD pipelines (GitHub Actions + ArgoCD)
• Manage multi-cloud infra (AWS + GCP) with Terraform
• Kubernetes cluster administration; helm chart management
• Implement monitoring, alerting and incident response runbooks','## DevOps Engineer – SETA International

### Responsibilities
- Build and maintain CI/CD pipelines (GitHub Actions + ArgoCD)
- Manage multi-cloud infrastructure (AWS + GCP) using Terraform (IaC)
- Kubernetes cluster administration: deployments, autoscaling, network policies
- Helm chart development and ArgoCD GitOps workflows
- Implement monitoring/alerting (Prometheus + Grafana) and incident response runbooks

### Must-Have
- 4+ years DevOps/Platform engineering
- Linux administration; Docker containerisation
- CI/CD pipeline design (GitHub Actions or Jenkins)
- Cloud: AWS (EC2, EKS, RDS, S3) or GCP equivalent
- Infrastructure as Code (Terraform preferred)

### Nice-to-Have
- Kubernetes advanced: HPA, VPA, Istio service mesh
- HashiCorp Vault for secrets management
- Multi-cloud architecture patterns
- Monitoring: Prometheus + Grafana + AlertManager

### Offer
- Salary: $1,500–$2,800/month'),
 ('JD-AI-SR-001','AI/ML Engineer','ML','HC-2025-Q4-001','v1.1','In Draft','2025-03-25',3,NULL,'Senior','B2','Hybrid',2.0,3.5,'Python, PyTorch or TensorFlow, Model training & evaluation end-to-end, Statistical modeling, ML evaluation methodology','MLOps (MLflow/Kubeflow/W&B), LLM fine-tuning (LoRA/QLoRA), HuggingFace Transformers, FastAPI model serving, Cloud ML (Vertex AI/SageMaker)','• Train, fine-tune and evaluate LLMs and task-specific models
• Build model serving infra (FastAPI endpoints, batch inference)
• Implement MLOps: experiment tracking, model versioning, monitoring
• Collaborate with product team to translate business requirements into ML solutions','## AI/ML Engineer – SETA International

### About the Team
SETA''s AI team is building enterprise AI products including document intelligence, conversational AI, and agentic workflows. Applied research + production deployment—not pure research.

### Responsibilities
- Train, fine-tune, and evaluate LLMs and task-specific models (NLP, classification, extraction)
- Build model serving infrastructure (FastAPI, Triton, or TorchServe)
- Implement MLOps: experiment tracking (MLflow/W&B), model versioning, monitoring
- Collaborate with Product to frame ML problems and define success metrics

### Must-Have
- 3+ years hands-on ML engineering (production, not Kaggle-only)
- Python: PyTorch or TensorFlow, scikit-learn, pandas, numpy
- Model evaluation: cross-validation, metrics, A/B testing
- English B2+: paper reading + async written communication

### Nice-to-Have
- LLM fine-tuning: LoRA, QLoRA, full fine-tuning on Llama/Mistral/Qwen
- MLOps: MLflow, W&B, Kubeflow
- Model serving: FastAPI, Triton, TorchServe
- Cloud ML: Vertex AI, SageMaker, or Azure ML

### Offer
- Salary: $2,000–$3,500/month
- GPU cluster (A100 x8) + conference budget'),
 ('JD-FE-SR-001','Senior Frontend Developer','FE','HC-2025-Q4-002','v2.4','Not Started','2025-04-01',4,NULL,'Senior','B2','Hybrid',1.4,2.2,'React (hooks), TypeScript (strict mode), HTML/CSS advanced, State management (Redux/Zustand/React Query)','Next.js (SSR/SSG), GraphQL, Design system contribution (Storybook), Web performance optimization (Core Web Vitals)','• Lead frontend architecture for design system rebuild (Figma → React components)
• Migrate legacy React 16 app to Next.js 14 + TypeScript
• Optimise Core Web Vitals; implement SSR/SSG patterns
• Collaborate with UX designers; mentor 2 junior FE devs','## Senior Frontend Developer – SETA International

### Responsibilities
- Lead frontend architecture for design system rebuild (Figma → React component library via Storybook)
- Migrate legacy React 16 codebase to Next.js 14 + TypeScript strict mode
- Optimise Core Web Vitals (LCP, FID, CLS); implement SSR/SSG/ISR patterns
- Collaborate with UX designers; contribute to Figma→code handoff process
- Mentor 2 junior FE developers; lead code reviews

### Must-Have
- 4+ years React in production (not class-component only)
- TypeScript strict mode proficiency
- Advanced HTML/CSS: CSS Grid, Flexbox, accessibility (WCAG 2.1)
- State management: Redux Toolkit, Zustand, or React Query

### Nice-to-Have
- Next.js: SSR/SSG/ISR/App Router (Next 13+)
- GraphQL: Apollo Client or URQL
- Design system contribution: Storybook component library
- Web performance: bundle analysis, lazy loading, Core Web Vitals optimisation

### Offer
- Salary: $1,400–$2,200/month
- Remote or hybrid'),
 ('JD-BE-SR-002','Senior Backend Developer','BE','HC-2025-Q2-001','v3.0','Approved',NULL,4,NULL,'Senior','B2','Hybrid',1.5,2.5,'Python (3+ yrs production), PostgreSQL/SQL (advanced), RESTful API design, Microservices architecture','Docker, Redis, Apache Kafka, Cloud (AWS or GCP), System design, Kubernetes','• Design & own scalable BE microservices (Python/FastAPI)
• PostgreSQL schema design & query optimization
• Build async pipelines (Celery/Redis/Kafka)
• Mentor junior engineers; lead architecture reviews','## Senior Backend Developer – SETA International

### About the Role
We are scaling our backend engineering team to support a major microservices migration powering our enterprise AI platform. You will own critical services from design to production.

### Responsibilities
- Design and implement RESTful and event-driven microservices using Python (FastAPI/Django REST)
- Own database schema design, query optimization, and PostgreSQL tuning
- Build and maintain async task pipelines (Celery, Redis, Kafka)
- Collaborate with the AI/ML team to integrate model serving APIs
- Lead architecture reviews; mentor 2–3 junior engineers

### Must-Have Requirements
- 4+ years backend development; 3+ years Python in production
- Advanced PostgreSQL: indexing, CTEs, query plan analysis
- RESTful API design for web & mobile clients
- Microservices & distributed systems experience
- English B2+: daily async standups + written documentation in English

### Nice-to-Have
- Docker / Kubernetes container orchestration
- Kafka, RabbitMQ, or Redis Streams
- Cloud: AWS (preferred) or GCP
- Fintech / E-commerce / high-traffic systems background
- System design (>100K req/min)

### Offer
- Salary: $1,500–$2,500/month (negotiable)
- Hybrid: 3 days HCMC office, 2 days remote
- Annual bonus + health insurance + $500 L&D budget

### [AGENT NOTE] JD draft pending clarity score. HR review required before publish.')
) as v(code,pos,role,hc,ver,status,lu,min_yoe,max_yoe,sen,eng,wm,smin,smax,mh,nth,kr,ft);
-- ===== JD required skills (with skill_type) =====
insert into ta.jd_required_skill (jd_id, skill_id, skill_type)
select j.jd_template_id, s.skill_id, v.stype
from (values
 ('JD-BE-SR-001','python','must_have'),('JD-BE-SR-001','fastapi','must_have'),('JD-BE-SR-001','postgres','must_have'),('JD-BE-SR-001','microservices','must_have'),
 ('JD-BE-SR-001','docker','nice_to_have'),('JD-BE-SR-001','redis','nice_to_have'),('JD-BE-SR-001','kafka','nice_to_have'),('JD-BE-SR-001','aws','nice_to_have'),('JD-BE-SR-001','k8s','nice_to_have'),
 ('JD-BE-SR-002','python','must_have'),('JD-BE-SR-002','fastapi','must_have'),('JD-BE-SR-002','postgres','must_have'),('JD-BE-SR-002','microservices','must_have'),
 ('JD-BE-SR-002','docker','nice_to_have'),('JD-BE-SR-002','redis','nice_to_have'),('JD-BE-SR-002','kafka','nice_to_have'),('JD-BE-SR-002','k8s','nice_to_have'),
 ('JD-MOB-MID-001','reactnative','must_have'),('JD-MOB-MID-001','typescript','must_have'),('JD-MOB-MID-001','restapi','must_have'),
 ('JD-MOB-MID-001','react','nice_to_have'),('JD-MOB-MID-001','cicd','nice_to_have'),
 ('JD-QA-MID-001','selenium','must_have'),('JD-QA-MID-001','python','must_have'),('JD-QA-MID-001','api_testing','must_have'),
 ('JD-QA-MID-001','cicd','nice_to_have'),('JD-QA-MID-001','playwright','nice_to_have'),('JD-QA-MID-001','jmeter','nice_to_have'),
 ('JD-DE-SR-001','python','must_have'),('JD-DE-SR-001','spark','must_have'),('JD-DE-SR-001','sql','must_have'),('JD-DE-SR-001','bigquery','must_have'),
 ('JD-DE-SR-001','dbt','nice_to_have'),('JD-DE-SR-001','kafka','nice_to_have'),('JD-DE-SR-001','gcp','nice_to_have'),
 ('JD-DO-SR-001','k8s','must_have'),('JD-DO-SR-001','terraform','must_have'),('JD-DO-SR-001','cicd','must_have'),('JD-DO-SR-001','aws','must_have'),
 ('JD-DO-SR-001','prometheus','nice_to_have'),('JD-DO-SR-001','grafana','nice_to_have'),('JD-DO-SR-001','ansible','nice_to_have'),
 ('JD-AI-SR-001','python','must_have'),('JD-AI-SR-001','pytorch','must_have'),('JD-AI-SR-001','mlops','must_have'),('JD-AI-SR-001','scikit_learn','must_have'),
 ('JD-AI-SR-001','langchain','nice_to_have'),('JD-AI-SR-001','llm','nice_to_have'),('JD-AI-SR-001','tensorflow','nice_to_have'),
 ('JD-FE-SR-001','react','must_have'),('JD-FE-SR-001','typescript','must_have'),('JD-FE-SR-001','restapi','must_have'),
 ('JD-FE-SR-001','communication','nice_to_have'),('JD-FE-SR-001','cicd','nice_to_have')
) as v(jd, skill, stype)
join ta.jd_template j on j.jd_code = v.jd
join core.skill s on s.skill_code = v.skill;

-- ===== scorecards (one per position) =====
insert into ta.scorecard (scorecard_code, role_id, position)
select v.code, (select role_id from core.role where role_code = v.role), v.position
from (values
 ('SC-BE-SR-001','BE','Senior Backend Developer'),
 ('SC-MOB-MID-001','Mobile','Mobile Developer (React Native)'),
 ('SC-QA-MID-001','QA','QA Automation Engineer'),
 ('SC-DE-SR-001','DevOps','Data Engineer'),
 ('SC-DO-SR-001','DevOps','DevOps Engineer'),
 ('SC-AI-SR-001','ML','AI/ML Engineer'),
 ('SC-FE-SR-001','FE','Senior Frontend Developer')
) as v(code, role, position);

-- ===== scorecard criteria (weights sum to exactly 1.000 per scorecard) =====
insert into ta.scorecard_criterion (scorecard_id, criteria, weight)
select sc.scorecard_id, v.criteria, v.weight
from (values
 ('SC-BE-SR-001','System Design',0.300),
 ('SC-BE-SR-001','Coding Test (Live)',0.250),
 ('SC-BE-SR-001','Technical Knowledge (Python/FastAPI)',0.200),
 ('SC-BE-SR-001','Problem Solving',0.150),
 ('SC-BE-SR-001','Communication & Culture Fit',0.100),
 ('SC-MOB-MID-001','Coding Test (Take-home)',0.300),
 ('SC-MOB-MID-001','React Native Proficiency',0.250),
 ('SC-MOB-MID-001','UI/UX Sense',0.150),
 ('SC-MOB-MID-001','Problem Solving',0.200),
 ('SC-MOB-MID-001','Communication & Culture Fit',0.100),
 ('SC-QA-MID-001','Automation Framework Knowledge',0.300),
 ('SC-QA-MID-001','Test Strategy & Planning',0.250),
 ('SC-QA-MID-001','Coding Skill (Python/Java)',0.200),
 ('SC-QA-MID-001','CI/CD Integration',0.150),
 ('SC-QA-MID-001','Communication & Culture Fit',0.100),
 ('SC-DE-SR-001','Data Pipeline Design',0.300),
 ('SC-DE-SR-001','SQL & Query Optimization',0.250),
 ('SC-DE-SR-001','Big Data Tools (Spark/Kafka)',0.200),
 ('SC-DE-SR-001','Problem Solving',0.150),
 ('SC-DE-SR-001','Communication & Culture Fit',0.100),
 ('SC-DO-SR-001','Infrastructure as Code',0.250),
 ('SC-DO-SR-001','Cloud Platform (AWS/GCP)',0.250),
 ('SC-DO-SR-001','CI/CD Pipeline Design',0.200),
 ('SC-DO-SR-001','Monitoring & Incident Response',0.150),
 ('SC-DO-SR-001','Communication & Culture Fit',0.150),
 ('SC-AI-SR-001','ML System Design',0.300),
 ('SC-AI-SR-001','Coding Test (Python/ML)',0.250),
 ('SC-AI-SR-001','Research & Paper Discussion',0.200),
 ('SC-AI-SR-001','MLOps & Deployment',0.150),
 ('SC-AI-SR-001','Communication & Culture Fit',0.100),
 ('SC-FE-SR-001','Frontend Architecture',0.250),
 ('SC-FE-SR-001','Coding Test (React/TS)',0.300),
 ('SC-FE-SR-001','Performance Optimization',0.150),
 ('SC-FE-SR-001','UI/UX Collaboration',0.150),
 ('SC-FE-SR-001','Communication & Culture Fit',0.150)
) as v(scorecard_code, criteria, weight)
join ta.scorecard sc on sc.scorecard_code = v.scorecard_code;

-- ===== BEGIN ENHANCED DATA =====
-- ── 5a. ta.business_context (new contexts only) ────────────────
INSERT INTO ta.business_context (context_code, project_name, roadmap_summary)
VALUES
  ('CTX-008', 'Project Theta', 'Expand backend engineering capacity for fintech payment system'),
  ('CTX-009', 'Project Iota', 'Develop enterprise chatbot for internal automation'),
  ('CTX-010', 'Project Kappa', 'Build loyalty mobile application for retail client'),
  ('CTX-011', 'Project Lambda', 'Modernize reporting infrastructure with data lake architecture'),
  ('CTX-012', 'Project Mu', 'Increase automation coverage for enterprise system'),
  ('CTX-013', 'Project Nu', 'Support cloud migration initiative'),
  ('CTX-014', 'Project Xi', 'Rebuild frontend architecture for SaaS dashboard'),
  ('CTX-015', 'Project Omicron', 'Build customer analytics platform'),
  ('CTX-016', 'Project Pi', 'Create AI recommendation engine for e-commerce'),
  ('CTX-017', 'Project Rho', 'Expand mobile engineering capability'),
  ('CTX-018', 'Project Sigma', 'Scale API gateway architecture'),
  ('CTX-019', 'Project Tau', 'Improve business intelligence reporting'),
  ('CTX-020', 'Project Upsilon', 'Establish centralized automation framework'),
  ('CTX-021', 'Project Vega', 'Build centralized data warehouse for cross-functional reporting'),
  ('CTX-022', 'Project Orion', 'Develop predictive churn model for enterprise customers'),
  ('CTX-023', 'Project Nova', 'Expand BI reporting capability for executive dashboard')
ON CONFLICT (context_code) DO NOTHING;

-- ── 5b. ta.headcount_plan (new plans only) ─────────────────────
INSERT INTO ta.headcount_plan
  (hc_plan_code, context_id, position, headcount,
   salary_min_scaled, salary_max_scaled, target_start_date)
SELECT
  v.code,
  (SELECT business_context_id FROM ta.business_context WHERE context_code = v.ctx),
  v.position, v.hc::int, v.smin, v.smax, v.tsd::date
FROM (VALUES
  ('HC-2025-Q2-008', 'CTX-008', 'Backend Developer', 2, 1.8, 2.5, '2025-07-01'),
  ('HC-2025-Q2-009', 'CTX-009', 'AI Agent Engineer', 2, 3.0, 4.0, '2025-07-15'),
  ('HC-2025-Q2-010', 'CTX-010', 'Flutter Developer', 2, 1.5, 2.2, '2025-08-01'),
  ('HC-2025-Q2-011', 'CTX-011', 'Data Engineer', 2, 2.2, 3.2, '2025-07-20'),
  ('HC-2025-Q2-012', 'CTX-012', 'QA Automation Engineer', 2, 1.4, 2.2, '2025-08-10'),
  ('HC-2025-Q2-013', 'CTX-013', 'DevOps Engineer', 2, 2.5, 3.5, '2025-07-25'),
  ('HC-2025-Q2-014', 'CTX-014', 'Frontend Developer', 3, 1.8, 2.6, '2025-08-05'),
  ('HC-2025-Q2-015', 'CTX-015', 'Python Developer', 2, 1.8, 2.6, '2025-07-10'),
  ('HC-2025-Q2-016', 'CTX-016', 'ML Engineer', 2, 3.0, 3.8, '2025-08-01'),
  ('HC-2025-Q2-017', 'CTX-017', 'Mobile Developer (React Native)', 2, 1.6, 2.3, '2025-08-15'),
  ('HC-2025-Q2-018', 'CTX-018', 'Senior Backend Developer', 2, 2.8, 3.5, '2025-07-01'),
  ('HC-2025-Q2-019', 'CTX-019', 'Data Analyst', 1, 1.4, 2.2, '2025-08-10'),
  ('HC-2025-Q2-020', 'CTX-020', 'QA Automation Engineer', 2, 1.5, 2.2, '2025-08-01'),
  ('HC-2025-Q2-021', 'CTX-021', 'Data Engineer', 2, 2.5, 3.5, '2025-07-15'),
  ('HC-2025-Q2-022', 'CTX-022', 'Data Scientist', 2, 3.0, 4.0, '2025-07-20'),
  ('HC-2025-Q2-023', 'CTX-023', 'BI Analyst', 2, 1.8, 2.5, '2025-08-01'),
  ('HC-2025-Q2-024', 'CTX-024', 'Data Engineer', 3, 2.8, 3.6, '2025-07-10'),
  ('HC-2025-Q2-025', 'CTX-025', 'Data Scientist', 2, 3.2, 4.2, '2025-08-01'),
  ('HC-2025-Q2-026', 'CTX-026', 'Data Engineer', 2, 2.2, 3.0, '2025-08-15'),
  ('HC-2025-Q2-027', 'CTX-027', 'NLP Data Scientist', 2, 3.2, 4.5, '2025-07-25'),
  ('HC-2025-Q2-028', 'CTX-028', 'BI Engineer', 2, 1.8, 2.6, '2025-08-05'),
  ('HC-2025-Q2-029', 'CTX-029', 'Senior Data Engineer', 2, 3.0, 3.8, '2025-07-15'),
  ('HC-2025-Q2-030', 'CTX-030', 'Data Scientist', 2, 3.2, 4.2, '2025-08-01')
) AS v(code, ctx, position, hc, smin, smax, tsd)
ON CONFLICT (hc_plan_code) DO NOTHING;

-- ── 5b3. ta.jd_template (enhanced JDs) ─────────────────────────
INSERT INTO ta.jd_template
  (jd_code, position, role_id, hc_plan_id,
   jd_version, jd_status, last_updated, min_yoe, max_yoe,
   seniority_level, english_level_required, work_mode,
   salary_min_scaled, salary_max_scaled,
   must_have_skills, nice_to_have_skills, key_responsibilities, jd_full_text)
SELECT v.code, v.pos,
  (SELECT role_id FROM core.role WHERE role_code = v.role),
  (SELECT headcount_plan_id FROM ta.headcount_plan WHERE hc_plan_code = v.hc),
  v.ver, v.status, v.lu::date, v.min_yoe::int, v.max_yoe::int,
  v.sen, v.eng, v.wm, v.smin::numeric, v.smax::numeric,
  v.mh, v.nth, v.kr, v.ft
FROM (VALUES
  ('JD-PY-MID-001','Python Developer','BE','HC-2025-Q2-015','v1.0','Ready','2025-04-16',1,2,'Junior','C1','On-site',1.0,1.5,'Python, Django/FastAPI, SQL','Docker, Redis','Develop Python applications, build APIs, optimize queries, maintain backend services','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title: Python Developer	
The job description:
- We are looking for a Python Developer to join our engineering team and help us develop and maintain various software products.
- The Python Developer responsibilities include writing and testing code, debugging programs and integrating applications with third-party web services. To be successful in this role, you should have experience using server-side logic and work well in a team.
- Ultimately, you’ll build highly responsive web applications that align with our business needs.


Your Skills and Experience:
- At least 1 year of experience in the Python programming language
- Familiar with at least one of Python RESTful frameworks, e.g. FastAPI, Django
- Having experience working with a distributed, microservice system is a bonus point
- Familiarity with Cloud platforms (AWS preferred)
- Having experience or knowledge of NodeJS is a plus
- Good team and communication skills
- Good at speaking English
- Willing to learn new technologies and tools
- Be willing to work with and learn ReactJS for frontend development when required
Nice to Have
Hands-on experience with CI/CD pipelines
Knowledge of Docker and Kubernetes for containerization and orchestration
Familiarity with monitoring tools (e.g., Prometheus, Grafana)
Understanding of security best practices in software development
Experience with relational and non-relational databases

Benefits
Salary: negotiate
Attractive salary and bonus based on performance.
Full benefits for employees according to the Vietnam Labor Laws: social and health insurance
An international, professional, young but innovative, knowledge-shared environment works closely with international experts. Have the opportunity to join conferences and workshops on exciting new technologies.
Holidays based on Vietnamese labor law + paid vacations
Company trip, Team Building


Contact:
SETA International Viet Nam
Adr.: HL Tower, 82 Duy Tan, Ha Noi
Email:  hr@setacinq.vn
Website: https://www.seta-international.com/
Fanpage: https://www.facebook.com/SETA.International.careers/
'),
  ('JD-FS-MID-001','Fullstack (ReactJS+Python)','BE','HC-2025-Q2-031','v1.0','Ready','2025-04-17',3,6,'Mid','B2','Hybrid',2.2,3.0,'ReactJS, Python, REST API','Docker, AWS, CI/CD','Develop frontend and backend features, integrate APIs, optimize performance','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title: Full-stack Developer (Strong ReactJS, Python Learning Mindset)
We are looking for a Full-stack Developer with strong expertise in ReactJS and solid knowledge (or willingness to learn) Python backend to join our dynamic engineering team for an international Education project.
In this role, you will primarily focus on building modern, scalable frontend applications while gradually contributing to backend development using Python. You will collaborate closely with international clients in a professional global environment.
Responsibilities
Develop, test, and maintain high-quality web applications using ReactJS (main focus) and Python.
Build reusable components and implement responsive UI based on modern frontend architecture.
Support backend development with Python and RESTful APIs (training/support provided if needed).
Collaborate with product and international teams to define and deliver new features.
Ensure performance, scalability, and responsiveness of applications.
Participate in code reviews and contribute to engineering best practices.
Join regular online meetings with international clients (evening meetings may be required).
Your Skills & Experience
At least 3 years of experience in Frontend or Full-stack development.
Strong experience with ReactJS (Hooks, Redux, component-based architecture).
Good understanding of modern JavaScript (ES6+), HTML5, CSS3.
Basic knowledge or hands-on experience with Python and at least one RESTful framework (FastAPI, Django, etc.) OR strong willingness to learn Python backend.
Experience working with RESTful APIs.
Familiarity with databases (MySQL, PostgreSQL, MongoDB, etc.).
Experience with Cloud platforms (AWS is a plus).
Good communication and teamwork skills.
English proficiency (able to communicate and join meetings with international clients).
Proactive mindset and strong learning attitude.
Nice to Have
Experience with CI/CD pipelines.
Knowledge of Docker & Kubernetes.
Familiarity with monitoring tools (Prometheus, Grafana).
Understanding of security best practices.
Experience with microservices architecture.
Benefits
Salary: Negotiable
Attractive salary & performance-based bonus.
Full benefits according to Vietnam Labor Law (Social & Health Insurance).
International, professional, young and innovative working environment.
Opportunity to work directly with global experts and join technology conferences/workshops.
Holidays and paid leave according to Vietnam Labor Law.
Company trip & team building activities.
Contact
SETA International Vietnam
📍 HL Tower, 82 Duy Tan, Ha Noi
📧 hr@setacinq.vn
🌐 https://www.seta-international.com/
📘 https://www.facebook.com/SETA.International.careers/

'),
  ('JD-QA-MID-002','QA Automation Engineer','QA','HC-2025-Q2-012','v1.0','Ready','2025-04-18',2,5,'Mid','C1','Hybrid',1.4,2.2,'Selenium, API Testing, SQL','Playwright, Jenkins','Build automation framework, execute test cases, maintain CI/CD integration','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title: Automation QA 
Key Responsibilities
Design, implement, and maintain scalable test automation frameworks for UI and backend API testing.
Write and execute comprehensive test cases for both manual and automated testing.
Perform end-to-end testing for UI-based features across different platforms.
Conduct functional, regression, integration, and verification tests in pre-production and production environments.
Validate data flow and data integrity across systems by working with databases and backend services.
Identify, document, and track bugs, and ensure thorough follow-up on resolution.
Contribute to test strategy discussions by providing insights based on system architecture and overall solution design.
Requirements
Strong English communication
Bachelor’s or Master’s degree in Engineering, Computer Science, Software Engineering, or equivalent discipline.
Minimum 5 years of experience in software testing, including both manual testing and automation testing.
Strong expertise in automation testing (MUST) using JavaScript/TypeScript or similar stacks.
Hands-on experience with Playwright, Big data and Linux
Proven ability to test both portal/UI and backend APIs (e.g., REST, GraphQL).
Strong understanding of AI Agent concepts, including agent workflow, reasoning/planning, tool calling, and integration with external services such as APIs, databases, browsers, and third-party systems.
Hands-on experience with AI tools and AI Agent platforms with practical daily usage in automation or software development workflows.
Good understanding of MCP (Model Context Protocol) and how AI Agents interact with MCP servers/tools, including autonomous decision-making compared to traditional chatbot or planner-based systems.
Deep understanding of the automation development lifecycle, including CI/CD integration.
Experience in executing tests and troubleshooting issues in staging, pre-production, and production environments
Benefits:
Attractive salary and bonus based on performance
Full benefits for employees according to the Vietnam Labor Laws: social and health insurance
An international, professional, young but innovative and dynamic environment working closely with international experts and joining conferences and workshops on exciting new technologies.
Holidays based on Vietnamese labor law + paid vacations
Company trip, Team Building
Contact:
SETA International Viet Nam
Add: HL Tower, 82 Duy Tan, Ha Noi
Email: hr@setacinq.vn
Website: https://www.seta-international.com/
Fanpage: https://www.facebook.com/SETA.International.careers/
Linkedin: https://www.linkedin.com/company/seta-international-careers/ 

'),
  ('JD-DO-SR-002','DevOps Engineer','DevOps','HC-2025-Q2-013','v1.1','Ready','2025-04-19',4,5,'Senior','B2','On-site',2.5,3.5,'Docker, Kubernetes, CI/CD','Terraform, AWS','Manage cloud infrastructure, automate deployment pipelines, monitor systems','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title:  DevOps Engineer
We''re looking for a DevOps Engineer to join our growing team and help us push the boundaries of computational technology. As an engineer in our team, you''ll design, implement, and manage scalable, high-performance clustered computing infrastructure to meet our complex computational needs.
Main responsibilities:
Design, develop, maintain and optimize infrastructure.
Collaborate with our software engineering team to integrate software applications with the underlying infrastructure.
Diagnose and troubleshoot systems and software issues.
Perform system administration tasks, including system configuration, system upgrades, and monitoring of cloud system health and performance.
Your Skills and Experience:
At least 3 years of experience in this role
Bachelor’s or master’s degree in engineering, Computer Science, Software Engineering, or equivalent discipline.
Experience with Linux/Unix environment, including scripting, network, and system administration.
Experience with GitOps and IaaC tools, such as Ansible, Terraform, Helm.
Familiarity with modern DevOps and Cloud Native development practices.
Familiarity with containerization technologies and their runtime: Docker, containerd, cgroups2.
Experience with orchestration tools, such as Kubernetes, Docker Swarm, and Slurm.
Strong problem-solving abilities, attention to detail, and excellent analytical skills.
Good communication skills and ability to work collaboratively in a team environment.
Experience with IaaS and Cloud Computing (AWS, GCP, Azure)
Experience with GPU programming (CUDA, OpenCL) or FPGA is an advantage .
Good at speaking English 
Benefits:
Salary: Negotiable
Attractive salary and quarterly bonus based on performance.
Flexible time
Full benefits according to the Vietnam Labor Laws: social and health insurance
An international, professional, young but innovative and dynamic environment working closely with international experts and joining conferences and workshops on exciting new technologies.
Holidays based on Vietnamese labor law + paid vacations, Company trip, Team Building
Contact:
SETA international Viet Nam
Add: HL Tower, 82 Duy Tan, Ha Noi
Email:  hr@seta.cinq.vn
Website: https://www.seta-international.com/
Fanpage: https://www.facebook.com/SETA.International.careers/
'),
  ('JD-FE-MID-002','Frontend Developer','FE','HC-2025-Q2-014','v1.0','Ready','2025-04-20',3,5,'Mid','B1','Hybrid',1.8,2.6,'ReactJS, TypeScript, REST API','NextJS, GraphQL','Develop UI features, optimize performance, collaborate with designers','SETA INTERNATIONAL VIETNAM- RECRUITMENT
Job Title: ReactJS Developer
The job description:
We are looking for an experienced JavaScript developer who is proficient with ReactJS. The primary focus of the selected candidate would be on developing user interface components implementing and executing them following well-known ReactJS best practices, also ensuring that these components and the overall application are robust and easy to manage. A commitment to collaborative problem solving, sophisticated design, and quality products are important. 
Your Skills and Experience:
At least 4 years of experience with ReactJS/JavaScript
Good at speaking English
Have a deep knowledge of javascript/web
Understand js deeply
Have knowledge of React/Redux/Thunk/Saga
Be able to utilize the component application
Have fundamental knowledge of IT:
Data structure and algorithms
Database
Programming techniques
Able to solve a high complexible task with the most utilized solution
CSS library
Having knowledge of  Python is a plus

Benefits:
- Attractive salary and bonus based on performance.
- Full benefits for employees according to the Vietnam Labor Laws: social and health insurance
- An international, professional, young but innovative and dynamic environment working closely with international experts and joining conferences and workshops on exciting new technologies.
- Holidays based on Vietnamese labor law + paid vacations
- Company trip, Team Building


Salary: Negotiable 
Contact:
SETA international Viet Nam
Add: HL Tower, 82 Duy Tan, Ha Noi
Email:  hr@setacinq.vn
Website: https://www.seta-international.com/
Fanpage: https://www.facebook.com/SETA.International.careers/








'),
  ('JD-MOB-MID-002','Mobile Developer (React Native)','Mobile','HC-2025-Q2-017','v1.0','Ready','2025-04-21',5,6,'Mid','C2','Hybrid',1.6,2.3,'React Native, JavaScript, REST API','Firebase, Redux','Build mobile applications, integrate APIs, optimize app performance','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title: Senior React Native Developer
Overview
We are seeking a highly skilled and experienced Senior React Native Developer to join our team. The ideal candidate will be responsible for leading the development, testing, and deployment of both mobile and web applications. This role requires deep expertise in the React (Native) ecosystem, a strong understanding of mobile development best practices, and exceptional communication skills to effectively collaborate with cross-functional teams and mentor junior developers.
Responsibilities
Lead the architecture, design, and development of high-quality, scalable web and mobile applications using React Native.
Collaborate closely with product managers, UX/UI designers, other teams and backend engineers to translate product requirements and figma designs into functional, performant features.
Write clean, well-documented, and testable code, participating in thorough code reviews to ensure code quality and adherence to established standards.
Diagnose and troubleshoot complex performance issues, memory leaks, and crashes across all platforms.
Manage Web Deployment process using CI/CD.
Manage the mobile deployment process to the Apple App Store and Google Play Store, including handling certificates, provisioning profiles, and release management.
Mentor and coach junior and mid-level developers, fostering a culture of technical excellence and continuous improvement.
Act as a key technical liaison, clearly communicating project status, technical risks, and architectural decisions to technical and non-technical audiences.
Stay up-to-date with the latest trends and technologies in the development and React/TypeScript space.
Required Qualifications

5+ years of professional software development experience, with at least 3+ years dedicated to building and launching production applications using React/React Native.
Expert-level proficiency in JavaScript/TypeScript, React, and the React Native framework (including hooks, functional components, and state management libraries like Redux, Zustand, or MobX).
Deep understanding of native build tools and ecosystems (Xcode, Android Studio, Gradle, CocoaPods).
Demonstrable experience with unit testing (e.g., Jest, Enzyme) and end-to-end testing (e.g., Detox, Appium).
Proven ability to integrate with RESTful APIs, GraphQL, and handle offline storage solutions.
Strong understanding of mobile performance optimization techniques and best practices (e.g., bundle size reduction, UI responsiveness).
Exceptional verbal and written communication skills. Must be comfortable presenting technical concepts, leading discussions, and writing clear, concise documentation.
Experience with version control systems (Git) and CI/CD pipelines for deployments (e.g., GitHub Actions).
Benefits:
Salary (Negotiate) Attractive salary and bonus based on performance
Salary review 1 time/year
Full benefits for employees according to the Vietnam Labor Laws: social and health insurance
An international, professional, young but innovative, knowledge-shared environment that works closely with international experts and joins conferences and workshops on exciting new technologies
Holidays based on Vietnamese labor law + paid vacations
Company trip, Team Building


Contact:
SETA International Viet Nam
Add: HL Tower, 82 Duy Tan, Ha Noi
Email: hr@setacinq.vn
Website: https://www.seta-international.com/
Fanpage: https://www.facebook.com/SETA.International.careers/
Linkedin: https://www.linkedin.com/company/seta-international-careers/ 

'),
  ('JD-FL-MID-001','Flutter Developer','Mobile','HC-2025-Q2-010','v1.0','Ready','2025-04-22',2,4,'Mid','B1','Hybrid',1.5,2.2,'Flutter, Dart, REST API','Firebase, CI/CD','Build mobile UI, integrate backend APIs, optimize user experience','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title: Flutter Developer (2+ Years Experience)
About the Project
You will join the product development team of AIcycle – a technology-driven platform focusing on smart solutions and AI-powered systems. The team is building scalable, user-friendly applications with a strong focus on performance and real user value.
Job Description
Develop and maintain mobile applications using Flutter
Collaborate with Product Owner, UI/UX Designer, and Backend team to build new features
Participate in designing application architecture and optimizing performance
Integrate APIs and ensure smooth data flow between systems
Support testing, debugging, and improving application quality
(Nice to have) Support or collaborate on web-related features using ReactJS
Requirements
At least 2 years of experience in mobile development
Strong experience with Flutter (Dart)
Understanding of RESTful APIs and mobile app architecture
Has native programming capabilities (Swift for iOS and Kotlin/Java for Android)
Basic knowledge or experience with ReactJS is a plus
Familiar with Git and Agile/Scrum working process
Good problem-solving mindset and proactive attitude
No English requirement (can read basic technical docs is a plus)
Your Benefits:
Salary: Attractive salary and bonus based on performance.
Full benefits for employees according to the Vietnam Labor Laws: social and health insurance
An international, professional, young but innovative, knowledge-sharing environment that works closely with international experts and joins conferences and workshops on exciting new technologies.
Holidays based on the Vietnamese labor law + paid vacations
Opportunity to onsite in the US
Company trip, Team Building

Contact:
SETA International Viet Nam
Add: HL Tower, 82 Duy Tan, Ha Noi
Email:  hr@setacinq.vn
Website: https://www.seta-international.com/
Fanpage: https://www.facebook.com/SETA.International.careers/

'),
  ('JD-SM-SR-001','Scrum Master','PM','HC-2025-Q2-032','v1.0','Ready','2025-04-23',1,2,'Junior',NULL,'Hybrid',1.5,2.0,'Scrum, Agile, Jira','PSM, Coaching','Facilitate Agile ceremonies, remove blockers, coordinate stakeholders','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title: Scrum Master
Description:
We''re looking for hands-on Scrum Masters to join our agile team. We are hiring for 2 levels:
• Fresher Scrum Master:
Candidates with an IT background who want to grow in the Scrum Master/Project Management path. Strong communication skills, a proactive mindset, and good English are required.
• Junior Scrum Master:
Candidates with at least 1 year of hands-on experience as a Scrum Master, Project Coordinator, or equivalent role in software development projects.


Responsibilities:
Facilitate core Scrum events: Sprint Planning, Daily Stand-up, Review, and Retrospective.
Coach the team on Scrum and Kanban; adapt to Waterfall or Hybrid (Water-Scrum-Fall) when needed.
Manage workstreams and documentation in Jira, Azure DevOps, Confluence,...
Track project health via KPIs: velocity, burndown, cycle time, lead time, throughput, defect leakage, etc.
Identify and remove impediments; shield the team from disruptions.
Report status and metrics to executive management and stakeholders.
Drive internal communication and cross-team collaboration.
Be the main contact for external communication, including evening calls with US/CA when needed.
Build a team culture of ownership, transparency, and data-driven decisions.
Required Skills and Experience:
For Fresher Scrum Master:
Bachelor’s degree in IT-related fields.
Open for Developers/QA/BA with strong communication skills and interest in Project Management/Scrum Master career path.
Good English communication skills.
Understanding of software development lifecycle and Agile/Scrum concepts.
Strong communication, organization, and problem-solving skills.
Proactive mindset and willingness to learn.
Able to support Scrum activities, team coordination, and project tracking.
For Junior Scrum Master:
At least 1 year of hands-on experience as a Scrum Master, Project Coordinator, or equivalent.
Solid practical knowledge of Scrum/Kanban and Agile delivery.
Experience facilitating Scrum ceremonies.
Familiar with Jira, Confluence, Azure DevOps, or equivalent tools.
Ability to track KPIs and project health metrics.
Strong stakeholder communication and coordination skills.
Comfortable working with US/CA clients and evening meetings when required.
Nice to have:
Experience applying AI tools in PM work (e.g., meeting summary, reporting, retro analysis, backlog refinement). (Strong plus)
Experience in planning, timeline building, defining deliverables, and managing stakeholder expectations.
Scrum certifications (PSM, CSM, or equivalent).
Experience working with US/CA clients or distributed teams.
Benefits:
Salary: Nego
Mentorship from experienced Scrum Masters
Attractive salary and bonus based on performance. 
Full benefits for employees according to the Vietnam Labor Laws: social and health insurance 
An international, professional, young but innovative, knowledge-sharing environment work closely with international experts and join conferences and workshops on exciting new technologies.
Holidays based on the Vietnamese labor law + paid vacation
Company trip, Team Building
Contact:
SETA International Viet Nam
Add: HL Tower, 82 Duy Tan, Ha Noi
Email:  hr@setacinq.vn
Website: https://www.seta-international.com/ 
Fanpage: https://www.facebook.com/SETA.International.careers/
'),
  ('JD-PQA-SR-001','PQA','QA','HC-2025-Q2-033','v1.0','Ready','2025-04-24',2,3,'Mid','C2','Hybrid',1.0,1.5,'Process Audit, Documentation, Risk Management','ISO 9001, Agile','Conduct process audits, improve SDLC processes, manage quality risks','SETA INTERNATIONAL VIETNAM - RECRUITMENT
Job Title: Process Quality Assurance (PQA)
1. Role Overview
The Process Quality Assurance (PQA) role is responsible for building, standardizing, and continuously improving the organization’s software development processes, with a strong focus on designing efficient processes, measuring effectiveness, and driving optimization through data-driven approaches.
2. Key Responsibilities
Process Design & Standardization
Build and standardize SDLC processes (Agile / Waterfall / Hybrid)
Design SOPs, guidelines, and templates (Project Plan, Requirements, Testing, Release, Reporting, etc.)
Define workflows, artifact structures, and data flows across development phases
Align processes with industry best practices and frameworks (CMMI, ISO, Agile, etc.)
Metrics & Continuous Improvement
Develop metrics systems to measure productivity, quality, and delivery performance
Define data models for tracking data from Jira, Azure DevOps, or other tools
Analyze data to identify bottlenecks, inefficiencies, and quality issues
Propose and design improvement initiatives, including process optimization, simplification, and automation
Process Asset Management
Manage and maintain process assets such as SOPs, templates, and guidelines
Ensure consistency and proper version control of process documentation
Improve process usability to ensure processes are clear, lean, and easy to adopt
Training & Awareness
Create training materials related to processes and best practices
Conduct regular training sessions and develop onboarding materials for teams
Promote a quality-focused and process-driven working mindset across the organization
3. Requirements
Experience
At least 2 years of experience in PQA / SEPG / QA Process / PMO roles
Experience building processes from scratch or re-engineering existing processes
Hands-on experience working within structured frameworks such as CMMI, ISO, Agile, etc.
Skills
Strong understanding of SDLC and software development methodologies
Strong analytical and system-thinking mindset with a data-driven approach
Proven process design capability, beyond documentation writing
Excellent documentation and structured writing skills
Ability to simplify complex processes into practical and usable workflows
Tools
Jira, Azure DevOps, or equivalent tools
Excel / Google Sheets (data modeling and tracking)


3. Benefits:
Salary: negotiate
Professional working environment with standardized processes
Opportunities for career growth in Quality/Process/PMO track
Dynamic work environment with strong opportunities for learning and professional growth.
Competitive salary based on capability + performance-based bonuses tied to analysis results and project outcomes.
Holidays based on the Vietnamese labor law + paid vacation
Company trip, Team Building
Contact:
SETA International Viet Nam
Add: HL Tower, 82 Duy Tan, Ha Noi
Email:  hr@setacinq.vn
Website: https://www.seta-international.com/ 
Fanpage: https://www.facebook.com/SETA.International.careers/
')
) AS v(code,pos,role,hc,ver,status,lu,min_yoe,max_yoe,sen,eng,wm,smin,smax,mh,nth,kr,ft)
ON CONFLICT (jd_code) DO NOTHING;

-- ── 5b4. ta.jd_required_skill (for enhanced JDs) ────────────────
INSERT INTO ta.jd_required_skill (jd_id, skill_id, skill_type)
SELECT j.jd_template_id, s.skill_id, v.stype
FROM (VALUES
  ('JD-PY-MID-001','python','must_have'),('JD-PY-MID-001','fastapi','must_have'),('JD-PY-MID-001','sql','must_have'),
  ('JD-PY-MID-001','docker','nice_to_have'),('JD-PY-MID-001','redis','nice_to_have'),
  ('JD-FS-MID-001','reactjs','must_have'),('JD-FS-MID-001','python','must_have'),('JD-FS-MID-001','restapi','must_have'),
  ('JD-FS-MID-001','docker','nice_to_have'),('JD-FS-MID-001','aws','nice_to_have'),('JD-FS-MID-001','cicd','nice_to_have'),
  ('JD-QA-MID-002','selenium','must_have'),('JD-QA-MID-002','api_testing','must_have'),('JD-QA-MID-002','sql','must_have'),
  ('JD-QA-MID-002','playwright','nice_to_have'),('JD-QA-MID-002','jenkins','nice_to_have'),
  ('JD-DO-SR-002','docker','must_have'),('JD-DO-SR-002','k8s','must_have'),('JD-DO-SR-002','cicd','must_have'),
  ('JD-DO-SR-002','terraform','nice_to_have'),('JD-DO-SR-002','aws','nice_to_have'),
  ('JD-FE-MID-002','reactjs','must_have'),('JD-FE-MID-002','typescript','must_have'),('JD-FE-MID-002','restapi','must_have'),
  ('JD-FE-MID-002','react','nice_to_have'),
  ('JD-MOB-MID-002','reactnative','must_have'),('JD-MOB-MID-002','restapi','must_have'),
  ('JD-MOB-MID-002','react','nice_to_have'),
  ('JD-FL-MID-001','restapi','must_have'),('JD-FL-MID-001','git','must_have'),
  ('JD-FL-MID-001','cicd','nice_to_have'),
  ('JD-SM-SR-001','agile','must_have'),('JD-SM-SR-001','communication','must_have'),('JD-SM-SR-001','project_mgmt','must_have'),
  ('JD-SM-SR-001','mentoring','nice_to_have'),
  ('JD-PQA-SR-001','communication','must_have'),('JD-PQA-SR-001','project_mgmt','must_have'),
  ('JD-PQA-SR-001','agile','nice_to_have'),('JD-PQA-SR-001','istqb','nice_to_have')
) AS v(jd, skill, stype)
JOIN ta.jd_template j ON j.jd_code = v.jd
JOIN core.skill s ON s.skill_code = v.skill
ON CONFLICT (jd_id, skill_id) DO NOTHING;

-- ===== END ENHANCED DATA =====
