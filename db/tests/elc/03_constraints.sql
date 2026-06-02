\set ON_ERROR_STOP on
BEGIN;
SELECT plan(9);

-- duplicate (employee, period) review rejected
SELECT throws_ok(
  $$ insert into elc.performance_review (employee_id, report_period, total_point, classification)
     select employee_id, '2026-03', 3.0, 'Good' from core.employee where emp_code='EMP-0001' $$,
  '23505', NULL, 'duplicate (employee, report_period) review rejected');

-- invalid classification rejected
SELECT throws_ok(
  $$ insert into elc.performance_review (employee_id, report_period, total_point, classification)
     select employee_id, '2026-05', 3.0, 'Stellar' from core.employee where emp_code='EMP-0001' $$,
  '23514', NULL, 'invalid review.classification rejected');

-- total_point out of range rejected
SELECT throws_ok(
  $$ insert into elc.performance_review (employee_id, report_period, total_point, classification)
     select employee_id, '2026-06', 6.0, 'Good' from core.employee where emp_code='EMP-0001' $$,
  '23514', NULL, 'total_point > 5 rejected');

-- duplicate violation_code rejected
SELECT throws_ok(
  $$ insert into elc.violation (violation_code, employee_id, violation_type_code, severity, status, incident_date)
     select 'VIO-0055', (select employee_id from core.employee where emp_code='EMP-0002'),
            'ATT-01','Low','Open','2026-01-01' $$,
  '23505', NULL, 'duplicate violation_code rejected');

-- FK to a missing violation_type_code rejected
SELECT throws_ok(
  $$ insert into elc.violation (violation_code, employee_id, violation_type_code, severity, status, incident_date)
     select 'VIO-9999', (select employee_id from core.employee where emp_code='EMP-0002'),
            'NOPE-99','Low','Open','2026-01-01' $$,
  '23503', NULL, 'FK to missing violation_type_code rejected');

-- invalid violation severity rejected
SELECT throws_ok(
  $$ insert into elc.violation (violation_code, employee_id, violation_type_code, severity, status, incident_date)
     select 'VIO-9998', (select employee_id from core.employee where emp_code='EMP-0002'),
            'ATT-01','Catastrophic','Open','2026-01-01' $$,
  '23514', NULL, 'invalid violation.severity rejected');

-- readiness_score > 1 rejected
SELECT throws_ok(
  $$ insert into elc.promotion_intent (employee_id, current_level_id, target_level_id, readiness_score)
     select (select employee_id from core.employee where emp_code='EMP-0040'),
            (select career_level_id from core.career_level where level_code='L3'),
            (select career_level_id from core.career_level where level_code='L4'), 1.5 $$,
  '23514', NULL, 'readiness_score > 1 rejected');

-- invalid salary_band rejected
SELECT throws_ok(
  $$ insert into elc.salary_band (employee_id, salary_band, effective_date)
     select employee_id, 'Z', '2026-01-01' from core.employee where emp_code='EMP-0040' $$,
  '23514', NULL, 'invalid salary_band rejected');

-- duplicate (employee, effective_date) salary rejected
SELECT throws_ok(
  $$ insert into elc.salary_band (employee_id, salary_band, effective_date)
     select employee_id, 'B', '2025-01-01' from core.employee where emp_code='EMP-0002' $$,
  '23505', NULL, 'duplicate (employee, effective_date) salary rejected');

SELECT * FROM finish();
ROLLBACK;
