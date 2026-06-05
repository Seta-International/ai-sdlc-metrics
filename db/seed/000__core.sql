-- ---------- reference / lookups ----------
insert into core.worker_type (type_code, name) values
 ('Permanent','Permanent employee'),
 ('Contractor','Fixed-term contractor'),
 ('Subcontractor','Vendor / subcontracted staff'),
 ('Intern','Intern');

insert into core.employment_status (status_code, name, is_active) values
 ('Active','Active', true),
 ('Probation','On probation', true),
 ('On Leave','On leave', true),
 ('Resigned','Resigned / exited', false),
 ('PIP','Performance improvement plan', true);

insert into core.career_level (level_code, name, rank) values
 ('L1','Intern',1),('L2','Junior',2),('L3','Mid',3),('L4','Senior',4),
 ('L5','Lead',5),('L6','Principal/Manager',6),('L7','Executive',7);

insert into core.role (role_code, name) values
 ('BE','Backend Developer'),('FE','Frontend Developer'),('QA','QA Engineer'),
 ('PM','Project Manager'),('BA','Business Analyst'),('DevOps','DevOps Engineer'),
 ('ML','ML Engineer'),('Design','UX/UI Designer'),('Sec','Security Engineer'),
 ('Mobile','Mobile Developer'),('Fullstack','Fullstack Developer'),('UIUX','UI/UX Designer');

insert into core.skill_category (category_code, name) values
 ('technical','Technical'),('soft','Soft skills'),('certification','Certification'),
 ('language','Language'),('leadership','Leadership');

insert into core.proficiency_level (prof_code, name, rank) values
 ('Beginner','Beginner',1),('Intermediate','Intermediate',2),('Advanced','Advanced',3);

insert into core.project_type (type_code, name) values
 ('Software/Migration','Software / Migration'),('AI/ML Platform','AI/ML Platform'),
 ('Software','Software'),('Data','Data'),('Integration','Integration'),('Mobile','Mobile');

-- ---------- shared KPI metric norms (N01..N12) ----------
insert into core.metric_norm (norm_code, metric, formula, used_for) values
 ('N01','Busy Rate','Planned_h / Available_h','Overbook/idle'),
 ('N02','Utilization Rate','Worked_h / Available_h','Real intensity'),
 ('N03','Billable Rate','Billable_h / Worked_h','Revenue hours'),
 ('N04','Bench Rate','Bench_h / Available_h','Unassigned capacity'),
 ('N05','Overtime Ratio','OT_h / Standard_h','Burnout leading'),
 ('N06','Effort Consumption','Actual_h / Planned_h','RA vs timesheet'),
 ('N07','On-time Delivery','On-time_MS / Total_MS','Benchmark feasibility'),
 ('N08','SPI','EV / PV','Schedule realism'),
 ('N09','Velocity Variance','StdDev5 / Avg','Forecast reliability'),
 ('N10','THI','Non-dev_h / Total_h','Tech-debt budget'),
 ('N11','Risk Closure Rate','Risks_closed / Total','RAID alive'),
 ('N12','Training Compliance','Done / Required','Training edge');

insert into core.metric_norm_threshold (metric_norm_id, rag, rule_expr)
select m.metric_norm_id, v.rag, v.rule_expr
from (values
 ('N01','Green','85-110%'),('N01','Yellow','111-119%'),('N01','Red','>120% or <75%'),
 ('N02','Green','75-90%'),('N02','Yellow','60-74% or 91-100%'),('N02','Red','<60% or >100%'),
 ('N03','Green','>=80%'),('N03','Yellow','70-79%'),('N03','Red','<70%'),
 ('N04','Green','<=10%'),('N04','Yellow','11-20%'),('N04','Red','>20%'),
 ('N05','Green','<=5%'),('N05','Yellow','6-15%'),('N05','Red','>15%'),
 ('N06','Green','85-110%'),('N06','Yellow','75-84% or 111-119%'),('N06','Red','<=75% or >=120%'),
 ('N07','Green','>=90%'),('N07','Yellow','70-89%'),('N07','Red','<70%'),
 ('N08','Green','0.95-1.05'),('N08','Yellow','0.85-0.94 or 1.06-1.15'),('N08','Red','<0.85 or >1.15'),
 ('N09','Green','<=15%'),('N09','Yellow','16-25%'),('N09','Red','>25%'),
 ('N10','Green','15-25%'),('N10','Yellow','10-14% or 26-35%'),('N10','Red','<10% or >35%'),
 ('N11','Green','>=80%'),('N11','Yellow','60-79%'),('N11','Red','<60%'),
 ('N12','Green','100%'),('N12','Yellow','85-99%'),('N12','Red','<85%')
) as v(norm_code, rag, rule_expr)
join core.metric_norm m on m.norm_code = v.norm_code;

-- ---------- departments (org hierarchy) ----------
insert into core.department (dept_code, name) values
 ('ENG','Engineering'),('BE','Backend'),('FE','Frontend'),('QA','QA'),
 ('DATA','Data'),('PLATFORM','Platform/DevOps'),('DESIGN','Design'),
 ('AIML','AI/ML'),('BA','Business Analysis'),('PMO','PMO');
update core.department child set parent_department_id = parent.department_id
from core.department parent
where parent.dept_code = 'ENG'
  and child.dept_code in ('BE','FE','QA','DATA','PLATFORM','AIML');

-- ---------- accounts ----------
insert into core.account (account_code, name, is_internal) values
 ('ACC-A','Tập đoàn FPT', false),
 ('ACC-B','Tập đoàn VinGroup', false),
 ('ACC-C','Ngân hàng Techcombank', false),
 ('INTERNAL','Nội bộ / Dự phòng', true);

-- ---------- skills ----------
insert into core.skill (skill_code, name, skill_category_id)
select v.code, v.name, c.skill_category_id
from (values
 ('python','Python','technical'),('java','Java','technical'),('go','Golang','technical'),
 ('fastapi','FastAPI','technical'),('django','Django','technical'),('react','React','technical'),
 ('reactnative','React Native','technical'),('docker','Docker','technical'),('k8s','Kubernetes','technical'),
 ('aws','AWS','technical'),('terraform','Terraform','technical'),('postgres','PostgreSQL','technical'),
 ('spark','Spark','technical'),('mlops','MLOps','technical'),('pytest','PyTest','technical'),
 ('selenium','Selenium','technical'),('cypress','Cypress','technical'),('cicd','CI/CD','technical'),
 ('agile','Agile/Scrum','soft'),('communication','Communication','soft'),
 ('leadership','Team Leadership','leadership'),('mentoring','Mentoring','leadership'),
 ('cka','CKA','certification'),('istqb','ISTQB','certification'),
 ('aws_saa','AWS SAA','certification'),('english','English','language')
) as v(code, name, cat)
join core.skill_category c on c.category_code = v.cat;

-- ---------- projects (active + historical benchmarks) ----------
insert into core.project (project_code, name, account_id, project_type_id, status, is_historical, start_date, planned_end_date)
select v.code, v.name, a.account_id, pt.project_type_id, v.status, v.hist, v.sd::date, v.ed::date
from (values
 ('PRJ-001','Hệ thống ERP FPT Orion','ACC-A','Software/Migration','Active', false,'2026-05-01','2026-12-31'),
 ('PRJ-002','Nền tảng AI VinGroup Energent','ACC-B','AI/ML Platform','Active', false,'2026-04-06','2026-12-31'),
 ('PRJ-003','Công cụ Nội bộ','INTERNAL','Software','Active', false,'2026-03-01','2026-10-31'),
 ('PRJ-004','Ứng dụng Di động Techcombank Vega','ACC-C','Software','Active', false,'2026-04-11','2026-11-30'),
 ('PRJ-005','Tích hợp Đa đám mây FPT Lyra','ACC-A','Integration','On Hold', false,'2026-03-08','2026-10-16'),
 ('PRJ-006','Nền tảng Phân tích VinGroup Draco','ACC-B','Data','Active', false,'2026-04-27','2026-12-06'),
 ('PRJ-H-101','Di chuyển Hệ thống Mercury','ACC-A','Software/Migration','Completed', true,'2025-01-01','2025-09-30'),
 ('PRJ-H-103','Pipeline ML Comet','ACC-B','AI/ML Platform','Completed', true,'2025-02-01','2025-11-30')
) as v(code, name, acc, ptype, status, hist, sd, ed)
join core.account a on a.account_code = v.acc
join core.project_type pt on pt.type_code = v.ptype;

-- ---------- employees: explicit edge-case rows (EMP-001..013) ----------
-- Insert without managers first; subselects in a single INSERT cannot see sibling rows.
insert into core.employee
 (emp_code, full_name, email, department_id, role_id, career_level_id, worker_type_id,
  employment_type, employment_status_id, is_billable, std_hours_week, join_date, exit_date)
select v.emp_code, v.full_name, v.email,
       (select department_id from core.department where dept_code = v.dept),
       (select role_id from core.role where role_code = v.role),
       (select career_level_id from core.career_level where level_code = v.lvl),
       (select worker_type_id from core.worker_type where type_code = v.wtype),
       v.etype,
       (select employment_status_id from core.employment_status where status_code = v.status),
       v.billable, v.hours, v.jd::date, v.xd::date
from (values
 ('EMP-0001','Nguyễn Văn An',   'nguyen.van.an@hackathon.com',   'PMO','PM','L7','Permanent','FT','Active',  false,40,'2020-01-06',NULL),
 ('EMP-0002','Trần Thị Bích',   'tran.thi.bich@hackathon.com',   'ENG','PM','L6','Permanent','FT','Active',  false,40,'2021-02-01',NULL),
 ('EMP-0003','Lê Văn Cường',    'le.van.cuong@hackathon.com',    'BE','BE','L5','Permanent','FT','Active',   true, 40,'2021-06-01',NULL),
 ('EMP-0004','Phạm Thị Dung',   'pham.thi.dung@hackathon.com',   'BE','BE','L4','Permanent','FT','Active',   true, 40,'2022-03-01',NULL),
 ('EMP-0005','Võ Minh Đức',     'vo.minh.duc@hackathon.com',     'FE','FE','L3','Permanent','FT','Active',   true, 40,'2022-07-01',NULL),
 ('EMP-0006','Đặng Thị Phương', 'dang.thi.phuong@hackathon.com', 'QA','QA','L3','Permanent','FT','Resigned', true, 40,'2021-09-01','2026-03-31'),
 ('EMP-0007','Hoàng Văn Giang', 'hoang.van.giang@hackathon.com', 'DATA','DevOps','L2','Permanent','FT','Probation',true,40,'2026-05-01',NULL),
 ('EMP-0008','Ngô Thị Hằng',    'ngo.thi.hang@hackathon.com',    'AIML','ML','L3','Permanent','FT','PIP',    true, 40,'2023-01-01',NULL),
 ('EMP-0009','Đinh Thị Lan',    'dinh.thi.lan@hackathon.com',    'DESIGN','Design','L3','Permanent','FT','On Leave',true,40,'2022-11-01',NULL),
 ('EMP-0010','Bùi Văn Long',    'bui.van.long@hackathon.com',    'BA','BA','L3','Contractor','PT','Active',  true, 20,'2025-04-01',NULL),
 ('EMP-0011','Dương Thị Kim',   'duong.thi.kim@hackathon.com',   'PLATFORM','DevOps','L3','Subcontractor','FT','Active',true,40,'2025-08-01',NULL),
 ('EMP-0012','Lý Minh Khoa',    'ly.minh.khoa@hackathon.com',    'FE','FE','L1','Intern','FT','Active',      false,40,'2026-05-04',NULL),
 ('EMP-0013','Mai Thị Nga',     'mai.thi.nga@hackathon.com',     'BE','BE','L2','Permanent','FT','Active',   true, 40,'2026-06-01',NULL)
) as v(emp_code, full_name, email, dept, role, lvl, wtype, etype, status, billable, hours, jd, xd);

-- Wire up managers in hierarchy order so each UPDATE sees already-committed rows.
update core.employee e set line_manager_id = m.employee_id
from core.employee m
where (e.emp_code, m.emp_code) in (values
  ('EMP-0002','EMP-0001'),
  ('EMP-0003','EMP-0002'),('EMP-0006','EMP-0002'),('EMP-0007','EMP-0002'),
  ('EMP-0008','EMP-0002'),('EMP-0009','EMP-0002'),('EMP-0010','EMP-0002'),('EMP-0011','EMP-0002'),
  ('EMP-0004','EMP-0003'),('EMP-0005','EMP-0003'),('EMP-0013','EMP-0003'),
  ('EMP-0012','EMP-0005')
);

-- ---------- employees: deterministic filler (EMP-014..040) ----------
insert into core.employee
 (emp_code, full_name, email, department_id, role_id, career_level_id, worker_type_id,
  employment_type, employment_status_id, is_billable, std_hours_week, join_date, line_manager_id)
select
  'EMP-'||lpad(g::text,4,'0'),
  vn.full_name,
  vn.email,
  d.department_id, r.role_id, cl.career_level_id, wt.worker_type_id,
  'FT', es.employment_status_id, true, 40,
  date '2024-01-01' + (g * 7),
  (select employee_id from core.employee where emp_code = 'EMP-0002')
from generate_series(14,40) g
join (values
  (14,'Nguyễn Thị Hoa',   'nguyen.thi.hoa@hackathon.com'),
  (15,'Trần Văn Bình',    'tran.van.binh@hackathon.com'),
  (16,'Lê Thị Cẩm',      'le.thi.cam@hackathon.com'),
  (17,'Phạm Văn Dũng',   'pham.van.dung@hackathon.com'),
  (18,'Hoàng Thị Thảo',  'hoang.thi.thao@hackathon.com'),
  (19,'Huỳnh Văn Khải',  'huynh.van.khai@hackathon.com'),
  (20,'Phan Thị Linh',   'phan.thi.linh@hackathon.com'),
  (21,'Vũ Văn Mạnh',     'vu.van.manh@hackathon.com'),
  (22,'Võ Thị Nhung',    'vo.thi.nhung@hackathon.com'),
  (23,'Đặng Văn Phong',  'dang.van.phong@hackathon.com'),
  (24,'Bùi Thị Quế',     'bui.thi.que@hackathon.com'),
  (25,'Đỗ Văn Sáng',     'do.van.sang@hackathon.com'),
  (26,'Hồ Thị Tâm',      'ho.thi.tam@hackathon.com'),
  (27,'Ngô Văn Thịnh',   'ngo.van.thinh@hackathon.com'),
  (28,'Dương Thị Tú',    'duong.thi.tu@hackathon.com'),
  (29,'Lý Văn Uy',       'ly.van.uy@hackathon.com'),
  (30,'Nguyễn Thị Vân',  'nguyen.thi.van@hackathon.com'),
  (31,'Trần Văn Xuân',   'tran.van.xuan@hackathon.com'),
  (32,'Lê Thị Yến',      'le.thi.yen@hackathon.com'),
  (33,'Phạm Văn Ánh',    'pham.van.anh@hackathon.com'),
  (34,'Hoàng Thị Bảo',   'hoang.thi.bao@hackathon.com'),
  (35,'Huỳnh Văn Chi',   'huynh.van.chi@hackathon.com'),
  (36,'Phan Thị Diễm',   'phan.thi.diem@hackathon.com'),
  (37,'Vũ Văn Hào',      'vu.van.hao@hackathon.com'),
  (38,'Võ Thị Khánh',    'vo.thi.khanh@hackathon.com'),
  (39,'Đặng Văn Lộc',    'dang.van.loc@hackathon.com'),
  (40,'Bùi Thị Mỹ',      'bui.thi.my@hackathon.com')
) as vn(idx, full_name, email) on vn.idx = g
join core.worker_type wt on wt.type_code = 'Permanent'
join core.employment_status es on es.status_code = 'Active'
join lateral (select department_id from core.department
              order by department_id offset (g % (select count(*) from core.department)) limit 1) d on true
join lateral (select role_id from core.role
              order by role_id offset (g % (select count(*) from core.role)) limit 1) r on true
join lateral (select career_level_id from core.career_level
              order by rank offset (g % 5) limit 1) cl on true;

-- ---------- employee skills (all employees except the zero-skill new joiner EMP-013) ----------
insert into core.employee_skill (employee_id, skill_id, proficiency_level_id, years_experience, is_primary)
select e.employee_id, s.skill_id,
       (select proficiency_level_id from core.proficiency_level
          where rank = ((e.employee_id + s.rn)::int % 3) + 1),
       ((e.employee_id % 5) + 1)::numeric,
       (s.rn = 1)
from core.employee e
join lateral (
  select skill_id, row_number() over (order by skill_id) as rn
  from core.skill
  order by skill_id offset (e.employee_id % (select count(*) from core.skill)) limit 2
) s on true
where e.emp_code <> 'EMP-0013'
on conflict (employee_id, skill_id) do nothing;

-- ---------- trainers (4 internal + 1 external) ----------
insert into core.trainer (trainer_code, employee_id, display_name, availability_hours_per_month)
select v.code,
       (select employee_id from core.employee where emp_code = v.emp),
       v.display, v.hours
from (values
 ('TRN-001','EMP-0003',NULL,8),
 ('TRN-002','EMP-0002',NULL,6),
 ('TRN-003','EMP-0005',NULL,5),
 ('TRN-004','EMP-0008',NULL,4),
 ('TRN-005',NULL,'Công ty Đào tạo FPT',10)
) as v(code, emp, display, hours);

insert into core.trainer_skill (trainer_id, skill_id)
select t.trainer_id, s.skill_id
from core.trainer t
join lateral (
  select skill_id from core.skill
  order by skill_id offset (t.trainer_id % (select count(*) from core.skill)) limit 2
) s on true
on conflict (trainer_id, skill_id) do nothing;

-- ---------- calendar weeks + public holidays ----------
insert into core.calendar_week (week_start, working_days, holiday_hours_ft)
values ('2026-06-29',5,0),('2026-07-06',5,0),('2026-07-13',4,8),
       ('2026-07-20',5,0),('2026-07-27',5,0),('2026-08-03',5,0);

insert into core.public_holiday (holiday_date, name)
values ('2026-07-10','Ngày thành lập công ty'),('2026-09-02','Quốc khánh nước CHXHCN Việt Nam');

-- ===== BEGIN ENHANCED DATA =====
-- ── 1a. New departments ────────────────────────────────────────
INSERT INTO core.department (dept_code, name) VALUES
  ('IT-ENG', 'IT Engineering'),
  ('IT-QA', 'IT Quality Assurance'),
  ('IT-PM', 'IT Project Management'),
  ('IT-BA', 'IT Business Analysis'),
  ('IT-DEVOPS', 'IT DevOps'),
  ('IT-DELIVERY', 'IT Delivery'),
  ('ADMIN-FIN', 'Admin Finance'),
  ('ADMIN-GA', 'Admin General Affairs'),
  ('ADMIN-HR', 'Admin HR'),
  ('ADMIN-SALES', 'Admin Sales')
ON CONFLICT (dept_code) DO NOTHING;

-- ── 1b. New roles ──────────────────────────────────────────────
INSERT INTO core.role (role_code, name) VALUES
  ('TL', 'Tech Lead'),
  ('EM', 'Engineering Manager'),
  ('DM', 'Delivery Manager'),
  ('HR', 'HR'),
  ('Admin', 'Admin'),
  ('BD', 'Business Development'),
  ('Finance', 'Finance')
ON CONFLICT (role_code) DO NOTHING;

-- ── 1c. New accounts ───────────────────────────────────────────
INSERT INTO core.account (account_code, name, is_internal) VALUES
  ('ACC-D', 'Account Delta', false),
  ('ACC-E', 'Account Epsilon', false)
ON CONFLICT (account_code) DO NOTHING;

-- ── 1d. New projects (from ELC REF_Project_Master) ─────────────
INSERT INTO core.project
  (project_code, name, account_id, project_type_id, status, is_historical, start_date, planned_end_date)
SELECT v.code, v.name,
       (SELECT account_id FROM core.account WHERE account_code = v.acc),
       (SELECT project_type_id FROM core.project_type WHERE type_code = 'Software'),
       'Active', false, '2026-01-01', '2026-12-31'
FROM (VALUES
  ('ACC-A-P01', 'Project ACC-A-P01', 'ACC-A'),
  ('ACC-A-P02', 'Project ACC-A-P02', 'ACC-A'),
  ('ACC-A-P03', 'Project ACC-A-P03', 'ACC-A'),
  ('ACC-A-P04', 'Project ACC-A-P04', 'ACC-A'),
  ('ACC-B-P01', 'Project ACC-B-P01', 'ACC-B'),
  ('ACC-B-P02', 'Project ACC-B-P02', 'ACC-B'),
  ('ACC-B-P03', 'Project ACC-B-P03', 'ACC-B'),
  ('ACC-C-P01', 'Project ACC-C-P01', 'ACC-C'),
  ('ACC-C-P02', 'Project ACC-C-P02', 'ACC-C'),
  ('ACC-C-P03', 'Project ACC-C-P03', 'ACC-C'),
  ('ACC-D-P01', 'Project ACC-D-P01', 'ACC-D'),
  ('ACC-D-P02', 'Project ACC-D-P02', 'ACC-D'),
  ('ACC-E-P01', 'Project ACC-E-P01', 'ACC-E'),
  ('ACC-E-P02', 'Project ACC-E-P02', 'ACC-E'),
  ('INT-P00', 'Bench / Internal', 'INTERNAL')
) AS v(code, name, acc)
ON CONFLICT (project_code) DO NOTHING;

-- ── 1e. New skills (from training & candidate data) ─────────────
INSERT INTO core.skill (skill_code, name, skill_category_id)
SELECT v.code, v.name, c.skill_category_id
FROM (VALUES
  ('csharp', 'C#', 'technical'),
  ('angular', 'Angular', 'technical'),
  ('nodejs', 'NodeJS', 'technical'),
  ('mysql', 'MySQL', 'technical'),
  ('redis', 'Redis', 'technical'),
  ('kafka', 'Kafka', 'technical'),
  ('rabbitmq', 'RabbitMQ', 'technical'),
  ('flask', 'Flask', 'technical'),
  ('sqlalchemy', 'SQLAlchemy', 'technical'),
  ('elasticsearch', 'Elasticsearch', 'technical'),
  ('spring_boot', 'Spring Boot', 'technical'),
  ('kotlin', 'Kotlin', 'technical'),
  ('gcp', 'GCP', 'technical'),
  ('azure', 'Azure', 'technical'),
  ('jenkins', 'Jenkins', 'technical'),
  ('nginx', 'Nginx', 'technical'),
  ('prometheus', 'Prometheus', 'technical'),
  ('grafana', 'Grafana', 'technical'),
  ('ansible', 'Ansible', 'technical'),
  ('dbt', 'dbt', 'technical'),
  ('pytorch', 'PyTorch', 'technical'),
  ('tensorflow', 'TensorFlow', 'technical'),
  ('langchain', 'LangChain', 'technical'),
  ('playwright', 'Playwright', 'technical'),
  ('jmeter', 'JMeter', 'technical'),
  ('reactjs', 'ReactJS', 'technical'),
  ('sql', 'SQL', 'technical'),
  ('mongodb', 'MongoDB', 'technical'),
  ('bash', 'Bash', 'technical'),
  ('restapi', 'REST API', 'technical'),
  ('microservices', 'Microservices', 'technical'),
  ('system_design', 'System Design', 'technical'),
  ('llm', 'LLM', 'technical'),
  ('agentic_ai', 'Agentic AI', 'technical'),
  ('bigquery', 'BigQuery', 'technical'),
  ('scikit_learn', 'Scikit-learn', 'technical'),
  ('celery', 'Celery', 'technical'),
  ('typescript', 'TypeScript', 'technical'),
  ('swift', 'Swift', 'technical'),
  ('revit', 'Revit', 'technical'),
  ('project_mgmt', 'Project Management', 'soft'),
  ('strategic_plan', 'Strategic Planning', 'soft'),
  ('cloud_general', 'Cloud', 'technical'),
  ('git', 'Git', 'technical'),
  ('containerization', 'Containerization', 'technical'),
  ('automation', 'Automation', 'technical'),
  ('api_testing', 'API Testing', 'technical'),
  ('perf_testing', 'Performance Testing', 'technical'),
  ('gcp_pro_de', 'GCP Professional Data Engineer', 'certification'),
  ('ckad', 'CKAD', 'certification'),
  ('aws_sarch', 'AWS Solutions Architect', 'certification')
) AS v(code, name, cat)
JOIN core.skill_category c ON c.category_code = v.cat
ON CONFLICT (skill_code) DO NOTHING;

-- ── 1f. New trainers (TRN-006..TRN-010) ────────────────────────
INSERT INTO core.trainer (trainer_code, employee_id, display_name, availability_hours_per_month)
VALUES
  ('TRN-006', NULL, 'Trainer 006', 4),
  ('TRN-007', NULL, 'Trainer 007', 4),
  ('TRN-008', NULL, 'Trainer 008', 4),
  ('TRN-009', NULL, 'Trainer 009', 4),
  ('TRN-010', NULL, 'Trainer 010', 4)
ON CONFLICT (trainer_code) DO NOTHING;

-- ── 2. Employees ────────────────────────────────────────────────
INSERT INTO core.employee
  (emp_code, full_name, email,
   department_id, role_id, career_level_id, worker_type_id,
   employment_type, employment_status_id, is_billable,
   std_hours_week, join_date, exit_date)
SELECT v.emp_code, v.full_name, v.email,
       (SELECT department_id FROM core.department WHERE dept_code = v.dept),
       (SELECT role_id       FROM core.role       WHERE role_code = v.role),
       (SELECT career_level_id FROM core.career_level WHERE level_code = v.lvl),
       (SELECT worker_type_id FROM core.worker_type WHERE type_code = 'Permanent'),
       'FT',
       (SELECT employment_status_id FROM core.employment_status WHERE status_code = v.status),
       true, 40, v.join_date::date, NULL
FROM (VALUES
  ('EMP-001', 'Employee EMP-001', 'emp.001@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2020-03-25'),
  ('EMP-002', 'Employee EMP-002', 'emp.002@company.com', 'IT-QA', 'QA', 'L2', 'Active', '2025-04-25'),
  ('EMP-003', 'Employee EMP-003', 'emp.003@company.com', 'IT-ENG', 'EM', 'L6', 'Active', '2020-06-01'),
  ('EMP-004', 'Employee EMP-004', 'emp.004@company.com', 'IT-QA', 'QA', 'L5', 'Active', '2022-10-05'),
  ('EMP-005', 'Employee EMP-005', 'emp.005@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2022-03-10'),
  ('EMP-006', 'Employee EMP-006', 'emp.006@company.com', 'IT-DEVOPS', 'DevOps', 'L4', 'Active', '2025-04-25'),
  ('EMP-007', 'Employee EMP-007', 'emp.007@company.com', 'IT-QA', 'QA', 'L3', 'Active', '2024-07-25'),
  ('EMP-008', 'Employee EMP-008', 'emp.008@company.com', 'IT-QA', 'QA', 'L1', 'Active', '2024-02-01'),
  ('EMP-009', 'Employee EMP-009', 'emp.009@company.com', 'IT-QA', 'QA', 'L4', 'Active', '2025-01-25'),
  ('EMP-010', 'Employee EMP-010', 'emp.010@company.com', 'IT-ENG', 'BE', 'L1', 'Active', '2021-09-05'),
  ('EMP-011', 'Employee EMP-011', 'emp.011@company.com', 'IT-ENG', 'BE', 'L1', 'Active', '2022-08-01'),
  ('EMP-012', 'Employee EMP-012', 'emp.012@company.com', 'IT-DEVOPS', 'DevOps', 'L3', 'Active', '2025-03-05'),
  ('EMP-013', 'Employee EMP-013', 'emp.013@company.com', 'IT-ENG', 'TL', 'L5', 'Active', '2025-08-01'),
  ('EMP-014', 'Employee EMP-014', 'emp.014@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-02-20'),
  ('EMP-015', 'Employee EMP-015', 'emp.015@company.com', 'IT-QA', 'QA', 'L2', 'Active', '2018-02-25'),
  ('EMP-016', 'Employee EMP-016', 'emp.016@company.com', 'IT-DEVOPS', 'DevOps', 'L4', 'Active', '2020-04-05'),
  ('EMP-017', 'Employee EMP-017', 'emp.017@company.com', 'IT-BA', 'BA', 'L4', 'Active', '2017-11-20'),
  ('EMP-018', 'Employee EMP-018', 'emp.018@company.com', 'IT-ENG', 'BE', 'L1', 'Resigned', '2023-01-15'),
  ('EMP-019', 'Employee EMP-019', 'emp.019@company.com', 'IT-QA', 'QA', 'L3', 'Active', '2017-10-25'),
  ('EMP-020', 'Employee EMP-020', 'emp.020@company.com', 'IT-QA', 'QA', 'L1', 'Active', '2018-10-01'),
  ('EMP-021', 'Employee EMP-021', 'emp.021@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2025-06-10'),
  ('EMP-022', 'Employee EMP-022', 'emp.022@company.com', 'IT-ENG', 'BE', 'L2', 'PIP', '2024-10-20'),
  ('EMP-023', 'Employee EMP-023', 'emp.023@company.com', 'IT-DELIVERY', 'DM', 'L7', 'Active', '2024-09-25'),
  ('EMP-024', 'Employee EMP-024', 'emp.024@company.com', 'IT-ENG', 'TL', 'L5', 'Active', '2018-12-20'),
  ('EMP-025', 'Employee EMP-025', 'emp.025@company.com', 'IT-QA', 'QA', 'L3', 'Resigned', '2018-11-15'),
  ('EMP-026', 'Employee EMP-026', 'emp.026@company.com', 'IT-DEVOPS', 'DevOps', 'L3', 'Active', '2017-02-01'),
  ('EMP-027', 'Employee EMP-027', 'emp.027@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2022-01-10'),
  ('EMP-028', 'Employee EMP-028', 'emp.028@company.com', 'IT-ENG', 'BE', 'L4', 'PIP', '2017-03-25'),
  ('EMP-029', 'Employee EMP-029', 'emp.029@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2020-04-15'),
  ('EMP-030', 'Employee EMP-030', 'emp.030@company.com', 'IT-ENG', 'TL', 'L5', 'Active', '2022-11-20'),
  ('EMP-031', 'Employee EMP-031', 'emp.031@company.com', 'IT-DEVOPS', 'DevOps', 'L4', 'Active', '2023-06-25'),
  ('EMP-032', 'Employee EMP-032', 'emp.032@company.com', 'IT-ENG', 'BE', 'L1', 'Active', '2025-09-25'),
  ('EMP-033', 'Employee EMP-033', 'emp.033@company.com', 'ADMIN-SALES', 'BD', 'L3', 'Active', '2021-09-10'),
  ('EMP-034', 'Employee EMP-034', 'emp.034@company.com', 'IT-BA', 'BA', 'L3', 'Active', '2017-05-10'),
  ('EMP-035', 'Employee EMP-035', 'emp.035@company.com', 'ADMIN-HR', 'HR', 'L2', 'Active', '2018-05-20'),
  ('EMP-036', 'Employee EMP-036', 'emp.036@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2024-10-01'),
  ('EMP-037', 'Employee EMP-037', 'emp.037@company.com', 'IT-BA', 'BA', 'L4', 'Active', '2020-03-25'),
  ('EMP-038', 'Employee EMP-038', 'emp.038@company.com', 'IT-ENG', 'BE', 'L5', 'Active', '2025-07-20'),
  ('EMP-039', 'Employee EMP-039', 'emp.039@company.com', 'IT-ENG', 'TL', 'L5', 'Active', '2024-02-25'),
  ('EMP-040', 'Employee EMP-040', 'emp.040@company.com', 'IT-QA', 'QA', 'L4', 'Active', '2023-06-20'),
  ('EMP-041', 'Employee EMP-041', 'emp.041@company.com', 'IT-ENG', 'BE', 'L1', 'Active', '2022-05-15'),
  ('EMP-042', 'Employee EMP-042', 'emp.042@company.com', 'IT-ENG', 'BE', 'L2', 'Active', '2023-12-05'),
  ('EMP-043', 'Employee EMP-043', 'emp.043@company.com', 'IT-PM', 'PM', 'L5', 'Active', '2024-03-01'),
  ('EMP-044', 'Employee EMP-044', 'emp.044@company.com', 'IT-QA', 'QA', 'L1', 'Active', '2025-01-10'),
  ('EMP-045', 'Employee EMP-045', 'emp.045@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2019-08-25'),
  ('EMP-046', 'Employee EMP-046', 'emp.046@company.com', 'IT-QA', 'QA', 'L4', 'Active', '2017-05-20'),
  ('EMP-047', 'Employee EMP-047', 'emp.047@company.com', 'ADMIN-FIN', 'Finance', 'L2', 'Active', '2018-10-01'),
  ('EMP-048', 'Employee EMP-048', 'emp.048@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2024-12-05'),
  ('EMP-049', 'Employee EMP-049', 'emp.049@company.com', 'IT-DEVOPS', 'DevOps', 'L4', 'Active', '2022-04-01'),
  ('EMP-050', 'Employee EMP-050', 'emp.050@company.com', 'IT-QA', 'QA', 'L2', 'Active', '2021-06-10'),
  ('EMP-051', 'Employee EMP-051', 'emp.051@company.com', 'IT-DELIVERY', 'DM', 'L7', 'Active', '2025-04-25'),
  ('EMP-052', 'Employee EMP-052', 'emp.052@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2024-09-20'),
  ('EMP-053', 'Employee EMP-053', 'emp.053@company.com', 'ADMIN-SALES', 'BD', 'L3', 'Active', '2020-06-01'),
  ('EMP-054', 'Employee EMP-054', 'emp.054@company.com', 'IT-QA', 'QA', 'L2', 'Resigned', '2021-04-10'),
  ('EMP-055', 'Employee EMP-055', 'emp.055@company.com', 'IT-ENG', 'BE', 'L2', 'Active', '2021-08-15'),
  ('EMP-056', 'Employee EMP-056', 'emp.056@company.com', 'IT-PM', 'PM', 'L5', 'Active', '2017-03-05'),
  ('EMP-057', 'Employee EMP-057', 'emp.057@company.com', 'IT-QA', 'QA', 'L3', 'Resigned', '2024-08-10'),
  ('EMP-058', 'Employee EMP-058', 'emp.058@company.com', 'IT-BA', 'BA', 'L4', 'Active', '2018-03-05'),
  ('EMP-059', 'Employee EMP-059', 'emp.059@company.com', 'ADMIN-GA', 'Admin', 'L2', 'Active', '2021-12-15'),
  ('EMP-060', 'Employee EMP-060', 'emp.060@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2017-03-10'),
  ('EMP-061', 'Employee EMP-061', 'emp.061@company.com', 'IT-QA', 'QA', 'L3', 'Active', '2024-08-01'),
  ('EMP-062', 'Employee EMP-062', 'emp.062@company.com', 'IT-ENG', 'BE', 'L2', 'Active', '2024-09-25'),
  ('EMP-063', 'Employee EMP-063', 'emp.063@company.com', 'IT-ENG', 'BE', 'L1', 'Active', '2022-11-01'),
  ('EMP-064', 'Employee EMP-064', 'emp.064@company.com', 'IT-QA', 'QA', 'L4', 'Active', '2022-02-15'),
  ('EMP-065', 'Employee EMP-065', 'emp.065@company.com', 'IT-QA', 'QA', 'L3', 'Active', '2020-05-20'),
  ('EMP-066', 'Employee EMP-066', 'emp.066@company.com', 'IT-ENG', 'BE', 'L2', 'Active', '2025-07-01'),
  ('EMP-067', 'Employee EMP-067', 'emp.067@company.com', 'IT-ENG', 'EM', 'L6', 'Active', '2024-04-15'),
  ('EMP-068', 'Employee EMP-068', 'emp.068@company.com', 'IT-ENG', 'BE', 'L5', 'PIP', '2021-10-20'),
  ('EMP-069', 'Employee EMP-069', 'emp.069@company.com', 'ADMIN-FIN', 'Finance', 'L5', 'Active', '2020-10-15'),
  ('EMP-070', 'Employee EMP-070', 'emp.070@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2019-09-20'),
  ('EMP-071', 'Employee EMP-071', 'emp.071@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2024-05-10'),
  ('EMP-072', 'Employee EMP-072', 'emp.072@company.com', 'IT-ENG', 'BE', 'L3', 'Resigned', '2018-04-25'),
  ('EMP-073', 'Employee EMP-073', 'emp.073@company.com', 'IT-QA', 'QA', 'L2', 'Active', '2017-06-01'),
  ('EMP-074', 'Employee EMP-074', 'emp.074@company.com', 'IT-ENG', 'BE', 'L5', 'Active', '2023-10-25'),
  ('EMP-075', 'Employee EMP-075', 'emp.075@company.com', 'ADMIN-HR', 'HR', 'L5', 'Active', '2025-03-01'),
  ('EMP-076', 'Employee EMP-076', 'emp.076@company.com', 'IT-DEVOPS', 'DevOps', 'L4', 'Active', '2020-07-20'),
  ('EMP-077', 'Employee EMP-077', 'emp.077@company.com', 'IT-ENG', 'TL', 'L5', 'Active', '2024-05-05'),
  ('EMP-078', 'Employee EMP-078', 'emp.078@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2024-01-20'),
  ('EMP-079', 'Employee EMP-079', 'emp.079@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2025-09-10'),
  ('EMP-080', 'Employee EMP-080', 'emp.080@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2020-11-25'),
  ('EMP-081', 'Employee EMP-081', 'emp.081@company.com', 'IT-QA', 'QA', 'L5', 'Active', '2022-11-25'),
  ('EMP-082', 'Employee EMP-082', 'emp.082@company.com', 'IT-BA', 'BA', 'L3', 'PIP', '2018-11-15'),
  ('EMP-083', 'Employee EMP-083', 'emp.083@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2025-03-15'),
  ('EMP-084', 'Employee EMP-084', 'emp.084@company.com', 'IT-DELIVERY', 'DM', 'L7', 'Active', '2023-05-01'),
  ('EMP-085', 'Employee EMP-085', 'emp.085@company.com', 'IT-DEVOPS', 'DevOps', 'L3', 'Active', '2021-04-01'),
  ('EMP-086', 'Employee EMP-086', 'emp.086@company.com', 'IT-ENG', 'BE', 'L4', 'Active', '2019-10-05'),
  ('EMP-087', 'Employee EMP-087', 'emp.087@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2019-09-10'),
  ('EMP-088', 'Employee EMP-088', 'emp.088@company.com', 'IT-ENG', 'BE', 'L2', 'Active', '2021-01-05'),
  ('EMP-089', 'Employee EMP-089', 'emp.089@company.com', 'IT-ENG', 'BE', 'L5', 'Active', '2017-12-25'),
  ('EMP-090', 'Employee EMP-090', 'emp.090@company.com', 'IT-ENG', 'BE', 'L4', 'Resigned', '2018-06-20'),
  ('EMP-091', 'Employee EMP-091', 'emp.091@company.com', 'ADMIN-FIN', 'Finance', 'L5', 'Active', '2018-11-25'),
  ('EMP-092', 'Employee EMP-092', 'emp.092@company.com', 'IT-QA', 'QA', 'L4', 'Active', '2018-06-15'),
  ('EMP-093', 'Employee EMP-093', 'emp.093@company.com', 'ADMIN-SALES', 'BD', 'L6', 'Active', '2022-03-20'),
  ('EMP-094', 'Employee EMP-094', 'emp.094@company.com', 'IT-PM', 'PM', 'L6', 'Active', '2022-02-20'),
  ('EMP-095', 'Employee EMP-095', 'emp.095@company.com', 'IT-BA', 'BA', 'L3', 'Active', '2023-09-20'),
  ('EMP-096', 'Employee EMP-096', 'emp.096@company.com', 'IT-ENG', 'BE', 'L2', 'Active', '2022-01-05'),
  ('EMP-097', 'Employee EMP-097', 'emp.097@company.com', 'IT-QA', 'QA', 'L3', 'Active', '2023-07-15'),
  ('EMP-098', 'Employee EMP-098', 'emp.098@company.com', 'IT-QA', 'QA', 'L3', 'Active', '2018-05-15'),
  ('EMP-099', 'Employee EMP-099', 'emp.099@company.com', 'IT-ENG', 'BE', 'L5', 'Active', '2024-09-25'),
  ('EMP-100', 'Employee EMP-100', 'emp.100@company.com', 'IT-QA', 'QA', 'L5', 'Active', '2022-02-01'),
  ('EMP-101', 'Employee EMP-101', 'emp.101@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-102', 'Employee EMP-102', 'emp.102@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-103', 'Employee EMP-103', 'emp.103@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-104', 'Employee EMP-104', 'emp.104@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-105', 'Employee EMP-105', 'emp.105@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-106', 'Employee EMP-106', 'emp.106@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-107', 'Employee EMP-107', 'emp.107@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-108', 'Employee EMP-108', 'emp.108@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-109', 'Employee EMP-109', 'emp.109@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-110', 'Employee EMP-110', 'emp.110@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-111', 'Employee EMP-111', 'emp.111@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-112', 'Employee EMP-112', 'emp.112@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-113', 'Employee EMP-113', 'emp.113@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-114', 'Employee EMP-114', 'emp.114@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-115', 'Employee EMP-115', 'emp.115@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-116', 'Employee EMP-116', 'emp.116@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-117', 'Employee EMP-117', 'emp.117@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-118', 'Employee EMP-118', 'emp.118@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-119', 'Employee EMP-119', 'emp.119@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-120', 'Employee EMP-120', 'emp.120@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-121', 'Employee EMP-121', 'emp.121@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-122', 'Employee EMP-122', 'emp.122@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-123', 'Employee EMP-123', 'emp.123@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-124', 'Employee EMP-124', 'emp.124@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-125', 'Employee EMP-125', 'emp.125@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-126', 'Employee EMP-126', 'emp.126@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-127', 'Employee EMP-127', 'emp.127@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-128', 'Employee EMP-128', 'emp.128@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-129', 'Employee EMP-129', 'emp.129@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-130', 'Employee EMP-130', 'emp.130@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-131', 'Employee EMP-131', 'emp.131@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-132', 'Employee EMP-132', 'emp.132@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-133', 'Employee EMP-133', 'emp.133@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-134', 'Employee EMP-134', 'emp.134@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-135', 'Employee EMP-135', 'emp.135@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-136', 'Employee EMP-136', 'emp.136@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-137', 'Employee EMP-137', 'emp.137@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-138', 'Employee EMP-138', 'emp.138@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-139', 'Employee EMP-139', 'emp.139@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-140', 'Employee EMP-140', 'emp.140@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-141', 'Employee EMP-141', 'emp.141@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-142', 'Employee EMP-142', 'emp.142@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-143', 'Employee EMP-143', 'emp.143@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-144', 'Employee EMP-144', 'emp.144@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-145', 'Employee EMP-145', 'emp.145@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-146', 'Employee EMP-146', 'emp.146@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-147', 'Employee EMP-147', 'emp.147@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-148', 'Employee EMP-148', 'emp.148@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-149', 'Employee EMP-149', 'emp.149@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-150', 'Employee EMP-150', 'emp.150@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-151', 'Employee EMP-151', 'emp.151@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-152', 'Employee EMP-152', 'emp.152@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-153', 'Employee EMP-153', 'emp.153@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-154', 'Employee EMP-154', 'emp.154@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-155', 'Employee EMP-155', 'emp.155@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-156', 'Employee EMP-156', 'emp.156@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-157', 'Employee EMP-157', 'emp.157@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-158', 'Employee EMP-158', 'emp.158@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-159', 'Employee EMP-159', 'emp.159@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-160', 'Employee EMP-160', 'emp.160@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-161', 'Employee EMP-161', 'emp.161@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-162', 'Employee EMP-162', 'emp.162@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-163', 'Employee EMP-163', 'emp.163@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-164', 'Employee EMP-164', 'emp.164@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-165', 'Employee EMP-165', 'emp.165@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-166', 'Employee EMP-166', 'emp.166@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-167', 'Employee EMP-167', 'emp.167@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-168', 'Employee EMP-168', 'emp.168@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-169', 'Employee EMP-169', 'emp.169@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-170', 'Employee EMP-170', 'emp.170@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-171', 'Employee EMP-171', 'emp.171@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-172', 'Employee EMP-172', 'emp.172@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-173', 'Employee EMP-173', 'emp.173@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-174', 'Employee EMP-174', 'emp.174@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-175', 'Employee EMP-175', 'emp.175@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-176', 'Employee EMP-176', 'emp.176@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-177', 'Employee EMP-177', 'emp.177@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-178', 'Employee EMP-178', 'emp.178@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-179', 'Employee EMP-179', 'emp.179@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-180', 'Employee EMP-180', 'emp.180@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-181', 'Employee EMP-181', 'emp.181@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-182', 'Employee EMP-182', 'emp.182@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-183', 'Employee EMP-183', 'emp.183@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-184', 'Employee EMP-184', 'emp.184@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-185', 'Employee EMP-185', 'emp.185@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-186', 'Employee EMP-186', 'emp.186@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-187', 'Employee EMP-187', 'emp.187@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-188', 'Employee EMP-188', 'emp.188@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-189', 'Employee EMP-189', 'emp.189@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-190', 'Employee EMP-190', 'emp.190@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-191', 'Employee EMP-191', 'emp.191@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-192', 'Employee EMP-192', 'emp.192@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-193', 'Employee EMP-193', 'emp.193@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-194', 'Employee EMP-194', 'emp.194@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-195', 'Employee EMP-195', 'emp.195@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-196', 'Employee EMP-196', 'emp.196@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-197', 'Employee EMP-197', 'emp.197@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-198', 'Employee EMP-198', 'emp.198@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-199', 'Employee EMP-199', 'emp.199@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-200', 'Employee EMP-200', 'emp.200@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-201', 'Employee EMP-201', 'emp.201@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-202', 'Employee EMP-202', 'emp.202@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-203', 'Employee EMP-203', 'emp.203@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-204', 'Employee EMP-204', 'emp.204@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01'),
  ('EMP-205', 'Employee EMP-205', 'emp.205@company.com', 'IT-ENG', 'BE', 'L3', 'Active', '2022-01-01')
) AS v(emp_code, full_name, email, dept, role, lvl, status, join_date)
ON CONFLICT (emp_code) DO NOTHING;

-- ===== END ENHANCED DATA =====
