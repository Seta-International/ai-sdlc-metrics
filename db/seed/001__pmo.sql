-- ===== extra historical projects into core (data-only cross-phase seed) =====
insert into core.project (project_code, name, account_id, project_type_id, status, is_historical, start_date, planned_end_date)
select v.code, v.name, a.account_id, pt.project_type_id, 'Completed', true, v.sd::date, v.ed::date
from (values
 ('PRJ-H-102','Nâng cấp Ngân hàng FPT Saturn','ACC-A','Software/Migration','2025-01-01','2025-08-31'),
 ('PRJ-H-104','Engine Dự báo VinGroup Nebula','ACC-B','AI/ML Platform','2025-02-01','2025-10-31'),
 ('PRJ-H-105','Hệ thống CRM Techcombank Pulsar','ACC-C','Software','2025-03-01','2025-07-31'),
 ('PRJ-H-206','Dự án Tích hợp FPT Falcon','ACC-A','Integration','2025-01-15','2025-09-15'),
 ('PRJ-H-199','PoC Flux VinGroup','ACC-B','AI/ML Platform','2025-05-01','2025-05-20')
) as v(code, name, acc, ptype, sd, ed)
join core.account a on a.account_code = v.acc
join core.project_type pt on pt.type_code = v.ptype;

-- ===== historical benchmarks (PRJ-H-199 is the outlier) =====
insert into pmo.historical_benchmark
 (project_id, team_size, duration_days, planned_duration_days, total_effort_days,
  total_budget_scaled, avg_velocity_ratio, risk_count, key_risks, pmo_standard_ver, final_outcome, is_outlier)
select p.project_id, v.team_size, v.dur, v.pdur, v.eff, v.bud, v.vel, v.risk, v.risks, v.ver, v.outcome, v.outlier
from (values
 ('PRJ-H-101',8,240,225,180.0,8.6,0.920,5,'Di chuyển dữ liệu legacy; rủi ro cutover','2.1','On Time',false),
 ('PRJ-H-102',7,210,210,155.0,7.4,0.950,4,'API vendor trễ; mở rộng phạm vi ngoài kế hoạch','2.1','On Time',false),
 ('PRJ-H-103',9,270,255,400.0,14.2,0.900,6,'Chất lượng dữ liệu; model drift','2.2','On Time',false),
 ('PRJ-H-104',8,255,240,380.0,13.1,0.930,5,'Độ chính xác dự báo; công suất GPU','2.2','On Time',false),
 ('PRJ-H-105',5,120,120,88.0,4.0,0.940,3,'Phụ thuộc tích hợp bên thứ ba','2.0','On Time',false),
 ('PRJ-H-206',4,240,225,246.4,6.2,0.890,3,'Rủi ro giao hàng thông thường','2.1','On Time',false),
 ('PRJ-H-199',2,15,14,15.0,0.6,1.000,0,'Chỉ là PoC — không đại diện','2.2','Early',true)
) as v(code, team_size, dur, pdur, eff, bud, vel, risk, risks, ver, outcome, outlier)
join core.project p on p.project_code = v.code;

-- ===== velocity history (5 sprints each for 3 benchmark projects) =====
insert into pmo.velocity_history (project_id, sprint_no, sprint_duration_days, planned_points, completed_points, team_size, outcome)
select p.project_id, s.sprint_no, 14, 40,
       36 + (s.sprint_no * 0.4), 8, 'Completed'
from core.project p
join generate_series(1,5) as s(sprint_no) on true
where p.project_code in ('PRJ-H-101','PRJ-H-103','PRJ-H-104');

-- ===== PMO standard template + 8 components (weights sum to 1.000) =====
insert into pmo.plan_template (template_code, name, version, effective_date)
values ('TPL-2026-v3','Mẫu Kế hoạch Dự án Chuẩn','3.0','2026-01-01');

insert into pmo.template_component
 (plan_template_id, component_code, section_code, component_name, is_required, validation_rule, weight)
select t.plan_template_id, v.cc, v.sc, v.cn, true, v.vr, v.w
from (values
 ('COMP-001','S01','Scope','Scope statement + in/out-of-scope list',0.120),
 ('COMP-002','S02','Objectives','>=1 measurable objective (SMART)',0.100),
 ('COMP-003','S03','Milestones','All milestones have target dates',0.120),
 ('COMP-004','S04','WBS_Effort','Every WBS task has effort estimate',0.130),
 ('COMP-005','S05','Resource_Plan','Role x allocation table present',0.130),
 ('COMP-006','S06','Dependencies','Dependency graph is acyclic',0.120),
 ('COMP-007','S07','Risk_RAID','>=1 risk entry with severity + owner',0.160),
 ('COMP-008','S08','Acceptance_Criteria','Each deliverable has measurable AC',0.120)
) as v(cc, sc, cn, vr, w)
join pmo.plan_template t on t.template_code = 'TPL-2026-v3';

-- ===== role capacity (one per core role; Sec is the bottleneck) =====
insert into pmo.role_capacity (role_id, headcount, capacity_md_month, busy_rate_pct, available_md_month, note)
select r.role_id, v.hc, v.cap, v.busy, v.avail, v.note
from (values
 ('BE',8,176,92,14,'Gần đầy'),
 ('FE',4,88,60,35,'Còn nhiều dư địa'),
 ('QA',4,88,75,22,'Bình thường'),
 ('PM',3,66,80,13,'Bình thường'),
 ('BA',2,44,55,20,'Còn nhiều dư địa'),
 ('DevOps',3,66,70,20,'Bình thường'),
 ('ML',4,88,85,13,'Khá bận'),
 ('Design',3,66,65,23,'Bình thường'),
 ('Sec',2,44,95,2,'Nút cổ chai — PCI/kiểm toán'),
 ('Mobile',2,44,60,18,'Bình thường'),
 ('Fullstack',2,44,70,13,'Bình thường'),
 ('UIUX',2,44,60,18,'Bình thường')
) as v(role_code, hc, cap, busy, avail, note)
join core.role r on r.role_code = v.role_code;

-- ===== resource allocation (overbook: EMP-003 = 1.30; idle: EMP-004 = 0.60) =====
insert into pmo.resource_allocation (employee_id, project_id, role_id, allocation_pct, start_date, end_date)
select e.employee_id, p.project_id, r.role_id, v.pct, '2026-06-29','2026-08-07'
from (values
 ('EMP-0003','PRJ-001','BE',0.80),
 ('EMP-0003','PRJ-002','BE',0.50),
 ('EMP-0004','PRJ-001','BE',0.60),
 ('EMP-0005','PRJ-002','FE',0.80),
 ('EMP-0007','PRJ-002','DevOps',0.30),
 ('EMP-0008','PRJ-002','ML',1.00),
 ('EMP-0009','PRJ-001','Design',0.80),
 ('EMP-0010','PRJ-003','BA',0.50),
 ('EMP-0011','PRJ-001','DevOps',0.90),
 ('EMP-0014','PRJ-004','BE',0.85),
 ('EMP-0015','PRJ-005','FE',0.70),
 ('EMP-0016','PRJ-006','QA',0.95)
) as v(emp, proj, role, pct)
join core.employee e on e.emp_code = v.emp
join core.project p on p.project_code = v.proj
join core.role r on r.role_code = v.role;

-- ===== plans: PLAN-001 green (PRJ-001), PLAN-002 red (PRJ-002) =====
insert into pmo.plan
 (plan_code, project_id, plan_template_id, plan_set, planned_duration_months,
  team_size_planned, registered_risk_count, top_risk_score, thi_pct,
  peak_role_busy_rate_pct, on_time_history_pct, feasibility_status)
select v.plan_code, p.project_id, t.plan_template_id, 'To_Review', v.dur, v.team, v.risks,
       v.topscore, v.thi, v.peak, v.ontime, v.feas
from (values
 ('PLAN-001','PRJ-001',7.0,16,5,20.0,18.0,95.0,92.0,'Khả thi (Xanh)'),
 ('PLAN-002','PRJ-002',9.0,10,0,NULL,9.0,135.0,90.0,'Không khả thi (Đỏ): thiếu Risk Register; khoảng cách năng lực; THI 9%')
) as v(plan_code, proj, dur, team, risks, topscore, thi, peak, ontime, feas)
join core.project p on p.project_code = v.proj
join pmo.plan_template t on t.template_code = 'TPL-2026-v3';

-- ===== PLAN-001 tasks (linear, acyclic) =====
insert into pmo.plan_task
 (plan_id, task_code, task_name, assignee_id, start_date, end_date, effort_days,
  percent_complete, status, is_milestone, phase, risk_note)
select pl.plan_id, v.tc, v.tn,
       (select employee_id from core.employee where emp_code = v.emp),
       v.sd::date, v.ed::date, v.eff, v.pc, v.st, v.ms, v.ph, v.rn
from (values
 ('TASK-O01','Workshop yêu cầu & phạm vi','EMP-0010','2026-05-19','2026-05-29', 8,1.00,'Completed',  false,'Discovery',NULL),
 ('TASK-O02','Đánh giá hiện trạng hệ thống','EMP-0004','2026-05-19','2026-06-05',12,1.00,'Completed', true ,'Discovery',NULL),
 ('TASK-O03','Thiết kế kiến trúc mục tiêu','EMP-0004','2026-06-08','2026-06-26',15,0.80,'In Progress',false,'Design',NULL),
 ('TASK-O04','Thiết kế Bảo mật & PCI','EMP-0006','2026-06-15','2026-07-03',12,0.60,'In Progress',false,'Design','Phụ thuộc kiểm toán PCI'),
 ('TASK-O05','Di chuyển dịch vụ Account','EMP-0003','2026-07-06','2026-08-28',30,0.20,'In Progress',false,'Development',NULL),
 ('TASK-O06','Xây dựng Transaction Engine','EMP-0003','2026-07-20','2026-09-18',35,0.10,'Not Started',true ,'Development',NULL),
 ('TASK-O07','Tự động hóa CI/CD & hạ tầng','EMP-0011','2026-07-06','2026-08-14',18,0.30,'In Progress',false,'Development',NULL),
 ('TASK-O08','Kiểm thử tích hợp hệ thống','EMP-0016','2026-09-21','2026-10-16',20,0.00,'Not Started',false,'Testing',NULL),
 ('TASK-O09','Kiểm thử xâm nhập bảo mật','EMP-0006','2026-10-05','2026-10-23',10,0.00,'Not Started',false,'Testing',NULL),
 ('TASK-O10','Cutover & triển khai thực tế','EMP-0011','2026-11-02','2026-11-20', 8,0.00,'Not Started',true ,'Deployment','Thời gian rollback hạn hẹp')
) as v(tc, tn, emp, sd, ed, eff, pc, st, ms, ph, rn)
join pmo.plan pl on pl.plan_code = 'PLAN-001';

-- ===== PLAN-002 tasks (plants cycle E07<->E08 and test-before-build E06->E04) =====
insert into pmo.plan_task
 (plan_id, task_code, task_name, assignee_id, start_date, end_date, effort_days,
  percent_complete, status, is_milestone, phase, risk_note)
select pl.plan_id, v.tc, v.tn,
       (select employee_id from core.employee where emp_code = v.emp),
       v.sd::date, v.ed::date, v.eff, v.pc, v.st, v.ms, v.ph, v.rn
from (values
 ('TASK-E01','Ánh xạ nguồn dữ liệu & phạm vi','EMP-0010','2026-04-06','2026-04-17',12,1.00,'Completed', false,'Discovery',NULL),
 ('TASK-E02','Thiết kế Feature Store & pipeline','EMP-0005','2026-04-20','2026-05-15',30,0.90,'In Progress',true ,'Design',NULL),
 ('TASK-E03','Xây dựng pipeline thu thập dữ liệu','EMP-0005','2026-05-18','2026-07-10',70,0.50,'In Progress',false,'Development',NULL),
 ('TASK-E04','Dịch vụ huấn luyện mô hình AI','EMP-0008','2026-06-01','2026-08-21',110,0.40,'In Progress',true ,'Development','Chỉ một kỹ sư ML — rủi ro phụ thuộc nhân lực chủ chốt'),
 ('TASK-E05','Dashboard Frontend phân tích','EMP-0005','2026-07-13','2026-09-04',55,0.00,'Not Started',false,'Development',NULL),
 ('TASK-E06','Kiểm thử xác thực mô hình','EMP-0016','2026-06-15','2026-08-30',35,0.00,'Not Started',false,'Testing','Bắt đầu trước khi dịch vụ mô hình hoàn thành'),
 ('TASK-E07','Tích hợp & phát hành','EMP-0011','2026-09-07','2026-09-25',28,0.00,'Not Started',true ,'Deployment','Phụ thuộc vòng tròn với E08'),
 ('TASK-E08','Kiểm thử chấp nhận end-to-end','EMP-0016','2026-09-28','2026-10-16',30,0.00,'Not Started',false,'Testing','Phụ thuộc vòng tròn với E07'),
 ('TASK-E09','Thiết lập giám sát MLOps','EMP-0011','2026-08-03','2026-08-28',30,0.00,'Not Started',false,'Development',NULL),
 ('TASK-E10','Triển khai Production','EMP-0011','2026-10-19','2026-11-06',26,0.00,'Not Started',true ,'Deployment',NULL)
) as v(tc, tn, emp, sd, ed, eff, pc, st, ms, ph, rn)
join pmo.plan pl on pl.plan_code = 'PLAN-002';

-- ===== dependencies =====
insert into pmo.plan_task_dependency (plan_task_id, depends_on_task_id)
select t.plan_task_id, d.plan_task_id
from (values
 ('PLAN-001','TASK-O02','TASK-O01'),
 ('PLAN-001','TASK-O03','TASK-O02'),
 ('PLAN-001','TASK-O04','TASK-O02'),
 ('PLAN-001','TASK-O05','TASK-O03'),
 ('PLAN-001','TASK-O06','TASK-O03'),
 ('PLAN-001','TASK-O07','TASK-O03'),
 ('PLAN-001','TASK-O08','TASK-O05'),
 ('PLAN-001','TASK-O09','TASK-O06'),
 ('PLAN-001','TASK-O10','TASK-O08'),
 ('PLAN-002','TASK-E02','TASK-E01'),
 ('PLAN-002','TASK-E03','TASK-E02'),
 ('PLAN-002','TASK-E04','TASK-E02'),
 ('PLAN-002','TASK-E05','TASK-E03'),
 ('PLAN-002','TASK-E06','TASK-E04'),
 ('PLAN-002','TASK-E09','TASK-E04'),
 ('PLAN-002','TASK-E07','TASK-E08'),
 ('PLAN-002','TASK-E08','TASK-E07'),
 ('PLAN-002','TASK-E10','TASK-E07')
) as v(plan_code, task, dep)
join pmo.plan p on p.plan_code = v.plan_code
join pmo.plan_task t on t.plan_id = p.plan_id and t.task_code = v.task
join pmo.plan_task d on d.plan_id = p.plan_id and d.task_code = v.dep;

-- ===== section checks: PLAN-001 all Complete =====
insert into pmo.plan_section_check (plan_id, template_component_id, status, note)
select p.plan_id, c.template_component_id, 'Complete', NULL
from pmo.plan p
join pmo.template_component c on c.plan_template_id = p.plan_template_id
where p.plan_code = 'PLAN-001';

-- ===== section checks: PLAN-002 mixed (Missing S07, Weak S05/S08) =====
insert into pmo.plan_section_check (plan_id, template_component_id, status, note)
select p.plan_id, c.template_component_id, v.status, v.note
from (values
 ('S01','Complete',NULL),('S02','Complete',NULL),('S03','Complete',NULL),('S04','Complete',NULL),
 ('S05','Weak','Present but thin — missing role x allocation table'),
 ('S06','Complete',NULL),
 ('S07','Missing','Risk Register entirely absent'),
 ('S08','Weak','Acceptance criteria not measurable')
) as v(section_code, status, note)
join pmo.plan p on p.plan_code = 'PLAN-002'
join pmo.template_component c
  on c.plan_template_id = p.plan_template_id and c.section_code = v.section_code;

-- ===== section check: PLAN-002 custom (component NULL, custom_name set) =====
insert into pmo.plan_section_check (plan_id, custom_name, status, note)
select p.plan_id, 'EVM_Cost_Tracking', 'Custom', 'PM own section -> flag for review, not a gap'
from pmo.plan p where p.plan_code = 'PLAN-002';

-- ===== BEGIN ENHANCED DATA =====

-- ── E1. New projects (historical benchmarks + active plan projects) ──────────
insert into core.project (project_code, name, account_id, project_type_id, status, is_historical, start_date, planned_end_date)
select v.code, v.name, a.account_id, pt.project_type_id, v.status, v.hist, v.sd::date, v.ed::date
from (values
 ('PRJ-H-201','Migration Project Saturn 2','ACC-A','Software/Migration','Completed',true,'2025-04-01','2025-10-31'),
 ('PRJ-H-202','Migration Project Saturn 3','ACC-A','Software/Migration','Completed',true,'2025-05-01','2025-09-30'),
 ('PRJ-H-203','Software Project Neptune',  'ACC-C','Software','Completed',true,'2025-02-01','2025-09-30'),
 ('PRJ-H-204','Data Platform Helios',       'ACC-B','Data','Completed',true,'2025-03-01','2025-09-30'),
 ('PRJ-H-205','Software Project Ceres',     'ACC-C','Software','Completed',true,'2025-04-01','2025-09-30'),
 ('PRJ-101','Project Apollo','ACC-A','Software','Active',false,'2026-04-05','2026-11-05'),
 ('PRJ-102','Project Vega','ACC-B','Software','Active',false,'2026-04-11','2026-12-11'),
 ('PRJ-103','Project Lyra','ACC-A','Integration','Active',false,'2026-03-08','2026-10-31'),
 ('PRJ-104','Project Draco','ACC-B','Data','Active',false,'2026-04-27','2026-12-31')
) as v(code,name,acc,ptype,status,hist,sd,ed)
join core.account a on a.account_code = v.acc
join core.project_type pt on pt.type_code = v.ptype
on conflict (project_code) do nothing;

-- ── E2. Historical benchmarks ────────────────────────────────────────────────
insert into pmo.historical_benchmark
  (project_id, team_size, duration_days, planned_duration_days, total_effort_days,
   total_budget_scaled, avg_velocity_ratio, risk_count, key_risks, pmo_standard_ver, final_outcome, is_outlier)
select p.project_id, v.ts, v.dur, v.pdur, v.eff, v.bud, v.vel, v.risks, v.rn, v.ver, v.outcome, v.outlier
from (values
 ('PRJ-H-201',7,210,210,165.3,4.1,0.953,2,'Standard delivery risks','2.1','On Time',false),
 ('PRJ-H-202',6,150,150,119.4,3,0.892,3,'Standard delivery risks','2.1','Delayed',false),
 ('PRJ-H-203',10,240,210,172.4,4.3,0.907,3,'Standard delivery risks','2.1','Delayed',false),
 ('PRJ-H-204',4,150,150,143.7,3.6,0.9,6,'Standard delivery risks','2.1','Delayed',false),
 ('PRJ-H-205',6,120,105,82.9,2.1,0.945,3,'Standard delivery risks','2.1','On Time',false)
) as v(code,ts,dur,pdur,eff,bud,vel,risks,rn,ver,outcome,outlier)
join core.project p on p.project_code = v.code
on conflict (project_id) do nothing;

-- ── E3. Velocity history (velocity_ratio is a generated column, omitted) ─────
insert into pmo.velocity_history
  (project_id, sprint_no, sprint_duration_days, planned_points, completed_points, team_size, outcome)
select p.project_id, v.sp, v.dur, v.plan_pts, v.done_pts, v.team, v.outcome
from (values
 ('PRJ-H-102',1,14,40,36.8,7,'Completed'),
 ('PRJ-H-102',2,14,40,38,7,'Completed'),
 ('PRJ-H-102',3,14,40,38.4,7,'Completed'),
 ('PRJ-H-102',4,14,40,38,7,'Completed'),
 ('PRJ-H-102',5,14,40,38.8,7,'Completed'),
 ('PRJ-H-105',1,14,40,36,5,'Completed'),
 ('PRJ-H-105',2,14,40,37.2,5,'Completed'),
 ('PRJ-H-105',3,14,40,38,5,'Completed'),
 ('PRJ-H-105',4,14,40,38.4,5,'Completed'),
 ('PRJ-H-105',5,14,40,38.4,5,'Completed'),
 ('PRJ-H-199',1,7,40,40,2,'Completed'),
 ('PRJ-H-201',1,14,40,39.8,7,'Completed'),
 ('PRJ-H-201',2,14,40,38.4,7,'Completed'),
 ('PRJ-H-201',3,14,40,37,7,'Completed'),
 ('PRJ-H-201',4,14,40,40.1,7,'Completed'),
 ('PRJ-H-201',5,14,40,39.3,7,'Completed'),
 ('PRJ-H-202',1,14,40,36.2,6,'Completed'),
 ('PRJ-H-202',2,14,40,37,6,'Completed'),
 ('PRJ-H-202',3,14,40,35.2,6,'Completed'),
 ('PRJ-H-202',4,14,40,36.3,6,'Completed'),
 ('PRJ-H-202',5,14,40,34.8,6,'Completed'),
 ('PRJ-H-203',1,14,40,38.2,10,'Completed'),
 ('PRJ-H-203',2,14,40,35.1,10,'Completed'),
 ('PRJ-H-203',3,14,40,34.4,10,'Completed'),
 ('PRJ-H-203',4,14,40,38.2,10,'Completed'),
 ('PRJ-H-203',5,14,40,36.9,10,'Completed'),
 ('PRJ-H-204',1,14,40,37.8,4,'Completed'),
 ('PRJ-H-204',2,14,40,34.6,4,'Completed'),
 ('PRJ-H-204',3,14,40,34.6,4,'Completed'),
 ('PRJ-H-204',4,14,40,34.3,4,'Completed'),
 ('PRJ-H-204',5,14,40,37.4,4,'Completed'),
 ('PRJ-H-205',1,14,40,38.6,6,'Completed'),
 ('PRJ-H-205',2,14,40,39.2,6,'Completed'),
 ('PRJ-H-205',3,14,40,36,6,'Completed'),
 ('PRJ-H-205',4,14,40,37.4,6,'Completed'),
 ('PRJ-H-205',5,14,40,39.6,6,'Completed'),
 ('PRJ-H-206',1,14,40,35.8,4,'Completed'),
 ('PRJ-H-206',2,14,40,35.6,4,'Completed'),
 ('PRJ-H-206',3,14,40,35,4,'Completed'),
 ('PRJ-H-206',4,14,40,34.8,4,'Completed'),
 ('PRJ-H-206',5,14,40,36.4,4,'Completed')
) as v(code,sp,dur,plan_pts,done_pts,team,outcome)
join core.project p on p.project_code = v.code
on conflict do nothing;

-- ── E4. New plans PLAN-101..104 ─────────────────────────────────────────────
insert into pmo.plan
  (plan_code, project_id, plan_template_id, plan_set,
   planned_duration_months, team_size_planned, registered_risk_count,
   top_risk_score, thi_pct, peak_role_busy_rate_pct, on_time_history_pct, feasibility_status)
select v.code, p.project_id, pt.plan_template_id, 'To_Review',
       v.dur, v.ts, v.risks, v.top_risk, v.thi, v.busy, v.otpct, v.status
from (values
 ('PLAN-101','PRJ-101',7,6,6,8,18.9,103,94,'Feasible (Green)'),
 ('PLAN-102','PRJ-102',8,8,4,10,21.8,108,89,'Feasible (Green)'),
 ('PLAN-103','PRJ-103',8,8,6,13,21.2,89,91,'Feasible (Green)'),
 ('PLAN-104','PRJ-104',5,12,4,13,17.9,96,93,'Feasible (Green)')
) as v(code,proj,dur,ts,risks,top_risk,thi,busy,otpct,status)
join core.project p on p.project_code = v.proj
join pmo.plan_template pt on pt.template_code = 'TPL-2026-v3'
on conflict (plan_code) do nothing;

-- ── E5. Plan tasks (6 per plan) ─────────────────────────────────────────────
insert into pmo.plan_task
  (plan_id, task_code, task_name, start_date, end_date, effort_days,
   percent_complete, status, is_milestone, phase)
select pl.plan_id, v.tc, v.tn, v.sd::date, v.ed::date, v.eff,
       v.pct, v.status, v.ms, v.phase
from (values
 ('PLAN-101','TASK-101-01','Discovery work package 1','2026-04-05','2026-09-12',26.2,0.54,'Completed',false,'Discovery'),
 ('PLAN-101','TASK-101-02','Design work package 2','2026-04-05','2026-09-12',26.3,0,'In Progress',true,'Design'),
 ('PLAN-101','TASK-101-03','Development work package 3','2026-04-05','2026-09-12',26.2,0.29,'In Progress',false,'Development'),
 ('PLAN-101','TASK-101-04','Development work package 4','2026-04-05','2026-09-12',26.3,0.35,'In Progress',false,'Development'),
 ('PLAN-101','TASK-101-05','Testing work package 5','2026-04-05','2026-09-12',26.2,0.15,'In Progress',false,'Testing'),
 ('PLAN-101','TASK-101-06','Deployment work package 6','2026-04-05','2026-09-12',26.3,0.07,'Completed',true,'Deployment'),
 ('PLAN-102','TASK-102-01','Discovery work package 1','2026-04-11','2026-11-11',30,0.35,'In Progress',false,'Discovery'),
 ('PLAN-102','TASK-102-02','Design work package 2','2026-04-11','2026-11-11',30,0.07,'Not Started',true,'Design'),
 ('PLAN-102','TASK-102-03','Development work package 3','2026-04-11','2026-11-11',30,0.4,'Completed',false,'Development'),
 ('PLAN-102','TASK-102-04','Development work package 4','2026-04-11','2026-11-11',30,0.41,'In Progress',false,'Development'),
 ('PLAN-102','TASK-102-05','Testing work package 5','2026-04-11','2026-11-11',30,0.31,'Not Started',false,'Testing'),
 ('PLAN-102','TASK-102-06','Deployment work package 6','2026-04-11','2026-11-11',30,0.53,'Completed',true,'Deployment'),
 ('PLAN-103','TASK-103-01','Discovery work package 1','2026-03-08','2026-10-16',30,0.41,'Not Started',false,'Discovery'),
 ('PLAN-103','TASK-103-02','Design work package 2','2026-03-08','2026-10-16',30,0.27,'Not Started',true,'Design'),
 ('PLAN-103','TASK-103-03','Development work package 3','2026-03-08','2026-10-16',30,0.19,'In Progress',false,'Development'),
 ('PLAN-103','TASK-103-04','Development work package 4','2026-03-08','2026-10-16',30,0.42,'In Progress',false,'Development'),
 ('PLAN-103','TASK-103-05','Testing work package 5','2026-03-08','2026-10-16',30,0.3,'Not Started',false,'Testing'),
 ('PLAN-103','TASK-103-06','Deployment work package 6','2026-03-08','2026-10-16',30,0.35,'Completed',true,'Deployment'),
 ('PLAN-104','TASK-104-01','Discovery work package 1','2026-04-27','2026-12-06',23.3,0.36,'Completed',false,'Discovery'),
 ('PLAN-104','TASK-104-02','Design work package 2','2026-04-27','2026-12-06',23.3,0.02,'In Progress',true,'Design'),
 ('PLAN-104','TASK-104-03','Development work package 3','2026-04-27','2026-12-06',23.4,0.29,'In Progress',false,'Development'),
 ('PLAN-104','TASK-104-04','Development work package 4','2026-04-27','2026-12-06',23.3,0.31,'In Progress',false,'Development'),
 ('PLAN-104','TASK-104-05','Testing work package 5','2026-04-27','2026-12-06',23.4,0.52,'Completed',false,'Testing'),
 ('PLAN-104','TASK-104-06','Deployment work package 6','2026-04-27','2026-12-06',23.3,0.43,'Completed',true,'Deployment')
) as v(plan_code,tc,tn,sd,ed,eff,pct,status,ms,phase)
join pmo.plan pl on pl.plan_code = v.plan_code
on conflict (plan_id, task_code) do nothing;

-- ── E6. Task dependencies ────────────────────────────────────────────────────
insert into pmo.plan_task_dependency (plan_task_id, depends_on_task_id)
select t.plan_task_id, d.plan_task_id
from (values
 ('TASK-101-02','TASK-101-01'),
 ('TASK-101-03','TASK-101-02'),
 ('TASK-101-04','TASK-101-03'),
 ('TASK-101-05','TASK-101-04'),
 ('TASK-101-06','TASK-101-05'),
 ('TASK-102-02','TASK-102-01'),
 ('TASK-102-03','TASK-102-02'),
 ('TASK-102-04','TASK-102-03'),
 ('TASK-102-05','TASK-102-04'),
 ('TASK-102-06','TASK-102-05'),
 ('TASK-103-02','TASK-103-01'),
 ('TASK-103-03','TASK-103-02'),
 ('TASK-103-04','TASK-103-03'),
 ('TASK-103-05','TASK-103-04'),
 ('TASK-103-06','TASK-103-05'),
 ('TASK-104-02','TASK-104-01'),
 ('TASK-104-03','TASK-104-02'),
 ('TASK-104-04','TASK-104-03'),
 ('TASK-104-05','TASK-104-04'),
 ('TASK-104-06','TASK-104-05')
) as v(task_code, dep_code)
join pmo.plan_task t on t.task_code = v.task_code
join pmo.plan_task d on d.task_code = v.dep_code
on conflict (plan_task_id, depends_on_task_id) do nothing;

-- ── E7. Plan section checks ──────────────────────────────────────────────────
insert into pmo.plan_section_check
  (plan_id, template_component_id, status, note)
select pl.plan_id, tc.template_component_id, v.status, v.note
from (values
 ('PLAN-101','COMP-001','Complete',''),
 ('PLAN-101','COMP-002','Complete',''),
 ('PLAN-101','COMP-003','Complete',''),
 ('PLAN-101','COMP-004','Complete',''),
 ('PLAN-101','COMP-005','Complete',''),
 ('PLAN-101','COMP-006','Complete',''),
 ('PLAN-101','COMP-007','Complete',''),
 ('PLAN-101','COMP-008','Complete',''),
 ('PLAN-102','COMP-001','Complete',''),
 ('PLAN-102','COMP-002','Complete',''),
 ('PLAN-102','COMP-003','Complete',''),
 ('PLAN-102','COMP-004','Complete',''),
 ('PLAN-102','COMP-005','Complete',''),
 ('PLAN-102','COMP-006','Complete',''),
 ('PLAN-102','COMP-007','Complete',''),
 ('PLAN-102','COMP-008','Complete',''),
 ('PLAN-103','COMP-001','Complete',''),
 ('PLAN-103','COMP-002','Complete',''),
 ('PLAN-103','COMP-003','Complete',''),
 ('PLAN-103','COMP-004','Complete',''),
 ('PLAN-103','COMP-005','Complete',''),
 ('PLAN-103','COMP-006','Complete',''),
 ('PLAN-103','COMP-007','Complete',''),
 ('PLAN-103','COMP-008','Complete',''),
 ('PLAN-104','COMP-001','Complete',''),
 ('PLAN-104','COMP-002','Complete',''),
 ('PLAN-104','COMP-003','Complete',''),
 ('PLAN-104','COMP-004','Complete',''),
 ('PLAN-104','COMP-005','Complete',''),
 ('PLAN-104','COMP-006','Complete',''),
 ('PLAN-104','COMP-007','Complete',''),
 ('PLAN-104','COMP-008','Complete','')
) as v(plan_code,comp_code,status,note)
join pmo.plan pl on pl.plan_code = v.plan_code
join pmo.template_component tc on tc.component_code = v.comp_code
on conflict do nothing;

-- ===== END ENHANCED DATA =====
