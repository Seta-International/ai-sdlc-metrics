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
