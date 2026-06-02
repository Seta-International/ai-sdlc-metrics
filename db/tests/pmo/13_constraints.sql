\set ON_ERROR_STOP on
BEGIN;
SELECT plan(10);

-- FK to a missing employee rejected
SELECT throws_ok(
  $$ insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category)
     select 999999, (select project_id from core.project limit 1), '2026-07-01', 8, 'Project' $$,
  '23503', NULL, 'timesheet_log FK to missing employee rejected');

-- FK to a missing project rejected
SELECT throws_ok(
  $$ insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category)
     select (select employee_id from core.employee limit 1), 999999, '2026-07-01', 8, 'Project' $$,
  '23503', NULL, 'timesheet_log FK to missing project rejected');

-- invalid log_category rejected
SELECT throws_ok(
  $$ insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category)
     select (select employee_id from core.employee limit 1),
            (select project_id from core.project limit 1), '2026-07-01', 8, 'Nope' $$,
  '23514', NULL, 'invalid timesheet_log.log_category rejected');

-- negative logged_hours rejected
SELECT throws_ok(
  $$ insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category)
     select (select employee_id from core.employee limit 1),
            (select project_id from core.project limit 1), '2026-07-01', -1, 'Project' $$,
  '23514', NULL, 'negative timesheet_log.logged_hours rejected');

-- project/category mismatch rejected (Internal row WITH a project)
SELECT throws_ok(
  $$ insert into pmo.timesheet_log (employee_id, project_id, work_date, logged_hours, log_category)
     select (select employee_id from core.employee limit 1),
            (select project_id from core.project limit 1), '2026-07-01', 4, 'Internal' $$,
  '23514', NULL, 'Internal log with a project_id rejected');

-- invalid leave_type rejected
SELECT throws_ok(
  $$ insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days)
     select 'LV-X1', (select employee_id from core.employee limit 1), '2026-07-01', 'Holiday', true, 1.0 $$,
  '23514', NULL, 'invalid leave_record.leave_type rejected');

-- non-half-day duration rejected
SELECT throws_ok(
  $$ insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days)
     select 'LV-X2', (select employee_id from core.employee limit 1), '2026-07-01', 'Annual Leave', true, 0.3 $$,
  '23514', NULL, 'non-half-day leave_record.duration_days rejected');

-- zero duration rejected
SELECT throws_ok(
  $$ insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days)
     select 'LV-X3', (select employee_id from core.employee limit 1), '2026-07-01', 'Annual Leave', true, 0.0 $$,
  '23514', NULL, 'zero leave_record.duration_days rejected');

-- non-Public-Holiday leave with NULL employee rejected
SELECT throws_ok(
  $$ insert into pmo.leave_record (leave_record_code, employee_id, leave_date, leave_type, approved, duration_days)
     select 'LV-X4', NULL, '2026-07-01', 'Annual Leave', true, 1.0 $$,
  '23514', NULL, 'company-wide (NULL employee) non-holiday leave rejected');

-- config red < yellow rejected
SELECT throws_ok(
  $$ insert into pmo.overbook_idle_config
       (config_code, rule_name, overbook_threshold, overbook_red_threshold,
        idle_threshold, mismatch_pct_threshold, ot_max_hours_per_week, effective_date)
     values ('CFG-BAD','bad',1.20,1.10,0.75,0.20,48.0,'2026-01-01') $$,
  '23514', NULL, 'overbook_red_threshold < overbook_threshold rejected');

SELECT * FROM finish();
ROLLBACK;
