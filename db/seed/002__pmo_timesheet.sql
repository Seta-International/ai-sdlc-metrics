-- ===== overbook/idle rule config (SETA-08-SOP-001) =====
insert into pmo.overbook_idle_config
 (config_code, rule_name, overbook_threshold, overbook_red_threshold,
  idle_threshold, mismatch_pct_threshold, ot_max_hours_per_week, effective_date)
values ('CFG-001','SETA-08-SOP-001',1.10,1.20,0.75,0.20,48.0,'2026-01-01');

-- ===== resource-allocation top-up (Phase 1 already seeded EMP-003/004/005/...; add stories) =====
--   EMP-013 new joiner: has an allocation but NO early-week logs (onboarding gap)
--   EMP-005 (Phase1 FE 0.80 on PRJ-002): the RA-vs-logged MISMATCH member (logs >> planned one week)
--   EMP-014 (Phase1 BE 0.85 on PRJ-004): the APPROVED-OT member (logs >48h one week)
insert into pmo.resource_allocation (employee_id, project_id, role_id, allocation_pct, start_date, end_date)
select e.employee_id, p.project_id, r.role_id, v.pct, '2026-06-29','2026-08-07'
from (values
 ('EMP-0013','PRJ-001','BE',0.80)
) as v(emp, proj, role, pct)
join core.employee e on e.emp_code = v.emp
join core.project  p on p.project_code = v.proj
join core.role     r on r.role_code = v.role;

-- ===== daily timesheet logs over weekdays of the 6 calendar weeks =====
-- weekday work-date helper: all Mon-Fri in the monitoring window 2026-06-29..2026-08-07,
-- minus the company holiday 2026-07-10.
-- EMP-003: full busy member, ~8h/day to PRJ-001 (confirms Phase 1 overbook/busy story).
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, p.project_id, d::date, 8.0, 'Project', 'TASK-A'
from generate_series('2026-06-29'::date, '2026-08-07'::date, interval '1 day') g(d)
join core.employee e on e.emp_code = 'EMP-0003'
join core.project  p on p.project_code = 'PRJ-001'
where extract(isodow from d) < 6           -- Mon-Fri only
  and d::date <> '2026-07-10';             -- skip company holiday

-- EMP-004: idle member, ~5h/day to PRJ-001 (under-logged but excluded once leave/holiday checked).
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, p.project_id, d::date, 5.0, 'Project', 'TASK-B'
from generate_series('2026-06-29'::date, '2026-08-07'::date, interval '1 day') g(d)
join core.employee e on e.emp_code = 'EMP-0004'
join core.project  p on p.project_code = 'PRJ-001'
where extract(isodow from d) < 6 and d::date <> '2026-07-10';

-- EMP-007: project time PLUS a NULL-project Training/Internal block (excluded from project util).
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, p.project_id, d::date, 6.0, 'Project', 'TASK-C'
from generate_series('2026-06-29'::date, '2026-08-07'::date, interval '1 day') g(d)
join core.employee e on e.emp_code = 'EMP-0007'
join core.project  p on p.project_code = 'PRJ-002'
where extract(isodow from d) < 6 and d::date <> '2026-07-10';
-- ... and a week of NULL-project Training time (no project_id) for EMP-007 in week W1
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, NULL, d::date, 2.0,
       case when extract(isodow from d) in (1,2) then 'Training' else 'Internal' end, NULL
from generate_series('2026-06-29'::date, '2026-07-03'::date, interval '1 day') g(d)
join core.employee e on e.emp_code = 'EMP-0007'
where extract(isodow from d) < 6;

-- EMP-008/009/010/011: ordinary ~7h/day project loggers (volume + distinct-member count).
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, p.project_id, d::date, v.hrs, 'Project', 'TASK-D'
from (values
 ('EMP-0008','PRJ-002',7.0),
 ('EMP-0009','PRJ-001',7.0),
 ('EMP-0010','PRJ-001',4.0),  -- PT member (std 20h/wk)
 ('EMP-0011','PRJ-001',7.5)
) as v(emp, proj, hrs)
join core.employee e on e.emp_code = v.emp
join core.project  p on p.project_code = v.proj
join generate_series('2026-06-29'::date, '2026-08-07'::date, interval '1 day') g(d) on true
where extract(isodow from d) < 6 and d::date <> '2026-07-10';

-- EMP-005: MISMATCH member. Phase 1 planned 0.80 x 40 = 32h/wk; log ~9h/day (~45h) in week W4
-- (2026-07-20..2026-07-24) so |45-32|/32 = 0.41 > 0.20 mismatch. Other weeks ~6.4h/day (~32h, matched).
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, p.project_id, d::date,
       case when d::date between '2026-07-20' and '2026-07-24' then 9.0 else 6.4 end,
       'Project', 'TASK-E'
from generate_series('2026-06-29'::date, '2026-08-07'::date, interval '1 day') g(d)
join core.employee e on e.emp_code = 'EMP-0005'
join core.project  p on p.project_code = 'PRJ-002'
where extract(isodow from d) < 6 and d::date <> '2026-07-10';

-- EMP-014: APPROVED-OT member. Log ~10h/day (50h) in week W5 (2026-07-27..2026-07-31) > OT max 48,
-- excludable because a matching approved 'Approved OT Comp' leave_record exists (seeded in Task 5).
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, p.project_id, d::date,
       case when d::date between '2026-07-27' and '2026-07-31' then 10.0 else 7.0 end,
       'Project', 'TASK-F'
from generate_series('2026-06-29'::date, '2026-08-07'::date, interval '1 day') g(d)
join core.employee e on e.emp_code = 'EMP-0014'
join core.project  p on p.project_code = 'PRJ-004'
where extract(isodow from d) < 6 and d::date <> '2026-07-10';

-- EMP-013: new joiner — NO logs in weeks W1 (2026-06-29) and W2 (2026-07-06); normal from W3.
insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category, task_ref)
select e.employee_id, p.project_id, d::date, 7.0, 'Project', 'TASK-G'
from generate_series('2026-07-13'::date, '2026-08-07'::date, interval '1 day') g(d)
join core.employee e on e.emp_code = 'EMP-0013'
join core.project  p on p.project_code = 'PRJ-001'
where extract(isodow from d) < 6 and d::date <> '2026-07-10';

-- ===== leave / holiday records =====
-- company-wide Public Holiday on 2026-07-10 (employee_id NULL; matches core.public_holiday).
insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days, note)
values ('LV-0001', NULL, '2026-07-10', 'Public Holiday', true, 1.0, 'Company Foundation Day (all members)');

-- approved Annual Leave (full day) for EMP-004.
insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days, note)
select 'LV-0002', e.employee_id, '2026-07-06', 'Annual Leave', true, 1.0, 'Approved annual leave'
from core.employee e where e.emp_code = 'EMP-0004';

-- half-day approved Sick leave for EMP-009 (exercises the 0.5 increment check).
insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days, note)
select 'LV-0003', e.employee_id, '2026-07-21', 'Sick', true, 0.5, 'Half-day sick'
from core.employee e where e.emp_code = 'EMP-0009';

-- approved OT-Comp record for EMP-014 covering the >48h week W5 (makes the OT excludable).
insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days, note)
select 'LV-0004', e.employee_id, '2026-08-03', 'Approved OT Comp', true, 1.0, 'Comp day for approved OT in week of 2026-07-27'
from core.employee e where e.emp_code = 'EMP-0014';

-- a Training leave-type record for EMP-007 (paired with the NULL-project Training logs).
insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days, note)
select 'LV-0005', e.employee_id, '2026-06-29', 'Training', true, 1.0, 'Internal training day'
from core.employee e where e.emp_code = 'EMP-0007';
