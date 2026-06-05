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

-- ===== JD templates (JD-BE-SR-001 v2.0 + JD-BE-SR-002 v3.0 = two versions for one position) =====
insert into ta.jd_template (jd_code, position, role_id, jd_version)
select v.code, v.position, (select role_id from core.role where role_code = v.role), v.ver
from (values
 ('JD-BE-SR-001','Senior Backend Developer','BE','v2.0'),
 ('JD-BE-SR-002','Senior Backend Developer','BE','v3.0'),
 ('JD-MOB-MID-001','Mobile Developer (React Native)','Mobile','v1.2'),
 ('JD-QA-MID-001','QA Automation Engineer','QA','v1.5'),
 ('JD-DE-SR-001','Data Engineer','DevOps','v3.0'),
 ('JD-DO-SR-001','DevOps Engineer','DevOps','v2.1'),
 ('JD-AI-SR-001','AI/ML Engineer','ML','v1.0'),
 ('JD-FE-SR-001','Senior Frontend Developer','FE','v2.3')
) as v(code, position, role, ver);

-- ===== JD required skills (CSV normalized; mapped to existing core.skill codes) =====
insert into ta.jd_required_skill (jd_id, skill_id)
select j.jd_template_id, s.skill_id
from (values
 ('JD-BE-SR-001','python'),('JD-BE-SR-001','fastapi'),('JD-BE-SR-001','postgres'),('JD-BE-SR-001','docker'),
 ('JD-BE-SR-002','python'),('JD-BE-SR-002','fastapi'),('JD-BE-SR-002','postgres'),('JD-BE-SR-002','docker'),('JD-BE-SR-002','k8s'),
 ('JD-MOB-MID-001','reactnative'),('JD-MOB-MID-001','react'),('JD-MOB-MID-001','postgres'),
 ('JD-QA-MID-001','selenium'),('JD-QA-MID-001','python'),('JD-QA-MID-001','cicd'),
 ('JD-DE-SR-001','python'),('JD-DE-SR-001','spark'),('JD-DE-SR-001','postgres'),
 ('JD-DO-SR-001','k8s'),('JD-DO-SR-001','terraform'),('JD-DO-SR-001','aws'),('JD-DO-SR-001','cicd'),
 ('JD-AI-SR-001','python'),('JD-AI-SR-001','mlops'),('JD-AI-SR-001','postgres'),
 ('JD-FE-SR-001','react'),('JD-FE-SR-001','communication')
) as v(jd, skill)
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

-- ===== END ENHANCED DATA =====
