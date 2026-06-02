\set ON_ERROR_STOP on
BEGIN;
SELECT plan(6);

-- duplicate natural key rejected
SELECT throws_ok(
  $$ insert into core.worker_type (type_code, name) values ('Permanent','dup') $$,
  '23505', NULL, 'duplicate worker_type.type_code rejected');

-- duplicate emp_code rejected
SELECT throws_ok(
  $$ insert into core.employee (emp_code, full_name, department_id, role_id, worker_type_id,
        employment_type, employment_status_id, std_hours_week, join_date)
     select 'EMP-0001','Clash',
        (select department_id from core.department limit 1),
        (select role_id from core.role limit 1),
        (select worker_type_id from core.worker_type limit 1),
        'FT',(select employment_status_id from core.employment_status limit 1),40,'2026-01-01' $$,
  '23505', NULL, 'duplicate emp_code rejected');

-- invalid employment_type rejected (check constraint)
SELECT throws_ok(
  $$ insert into core.employee (emp_code, full_name, department_id, role_id, worker_type_id,
        employment_type, employment_status_id, std_hours_week, join_date)
     select 'EMP-0999','BadType',
        (select department_id from core.department limit 1),
        (select role_id from core.role limit 1),
        (select worker_type_id from core.worker_type limit 1),
        'XX',(select employment_status_id from core.employment_status limit 1),40,'2026-01-01' $$,
  '23514', NULL, 'invalid employment_type rejected');

-- exit_date before join_date rejected
SELECT throws_ok(
  $$ insert into core.employee (emp_code, full_name, department_id, role_id, worker_type_id,
        employment_type, employment_status_id, std_hours_week, join_date, exit_date)
     select 'EMP-0998','TimeTravel',
        (select department_id from core.department limit 1),
        (select role_id from core.role limit 1),
        (select worker_type_id from core.worker_type limit 1),
        'FT',(select employment_status_id from core.employment_status limit 1),40,'2026-01-01','2025-01-01' $$,
  '23514', NULL, 'exit_date before join_date rejected');

-- FK to non-existent department rejected
SELECT throws_ok(
  $$ insert into core.employee (emp_code, full_name, department_id, role_id, worker_type_id,
        employment_type, employment_status_id, std_hours_week, join_date)
     select 'EMP-0997','NoDept', 999999,
        (select role_id from core.role limit 1),
        (select worker_type_id from core.worker_type limit 1),
        'FT',(select employment_status_id from core.employment_status limit 1),40,'2026-01-01' $$,
  '23503', NULL, 'FK to missing department rejected');

-- duplicate (norm, rag) band rejected
SELECT throws_ok(
  $$ insert into core.metric_norm_threshold (metric_norm_id, rag, rule_expr)
     select metric_norm_id, 'Green', 'dup' from core.metric_norm where norm_code='N01' $$,
  '23505', NULL, 'duplicate (metric_norm, rag) rejected');

SELECT * FROM finish();
ROLLBACK;
