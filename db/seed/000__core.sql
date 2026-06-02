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
