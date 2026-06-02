\set ON_ERROR_STOP on
BEGIN;
SELECT plan(9);

-- Resigned employee (EMP-006) still carries stale performance + timesheet rows
SELECT cmp_ok(
  (SELECT count(*) FROM elc.performance_review pr
     JOIN core.employee e ON e.employee_id = pr.employee_id
     JOIN core.employment_status s ON s.employment_status_id = e.employment_status_id
    WHERE e.emp_code='EMP-0006' AND s.status_code='Resigned' AND e.exit_date IS NOT NULL)::int,
  '>=', 1, 'resigned EMP-006 has stale performance rows');
SELECT cmp_ok(
  (SELECT count(*) FROM elc.timesheet_monthly t
     JOIN core.employee e ON e.employee_id = t.employee_id
    WHERE e.emp_code='EMP-0006')::int,
  '>=', 1, 'resigned EMP-006 has stale timesheet rows');

-- PIP employee EMP-008: low KPI (<2.5) AND a High/Critical violation -> composite risk note
SELECT cmp_ok(
  (SELECT count(*) FROM elc.v_perf_profile
    WHERE emp_code='EMP-0008' AND avg_score < 2.5
      AND perf_risk_note LIKE '%Low KPI%' AND perf_risk_note LIKE '%High-Risk Violation%')::int,
  '>=', 1, 'EMP-008 shows composite Low-KPI + violation risk');

-- a High Risk employee in v_violation_summary: 1 Critical + Highs + open cases (EMP-004)
SELECT is(
  (SELECT risk_flag FROM elc.v_violation_summary WHERE emp_code='EMP-0004'),
  'High Risk', 'EMP-004 is High Risk in violation summary');
SELECT cmp_ok(
  (SELECT critical_count FROM elc.v_violation_summary WHERE emp_code='EMP-0004')::int,
  '>=', 1, 'EMP-004 has >=1 Critical violation');

-- Probation (EMP-007) and On-Leave (EMP-009) employees present in the period
SELECT cmp_ok(
  (SELECT count(*) FROM elc.performance_review pr
     JOIN core.employee e ON e.employee_id = pr.employee_id
     JOIN core.employment_status s ON s.employment_status_id = e.employment_status_id
    WHERE s.status_code IN ('Probation','On Leave'))::int,
  '>=', 2, 'probation and on-leave employees have review rows');

-- sporadic night shifts: some non-zero, most zero
SELECT cmp_ok(
  (SELECT count(*) FROM elc.timesheet_monthly WHERE night_shift_hours > 0)::int,
  '>=', 1, 'at least one night-shift timesheet row exists');
SELECT cmp_ok(
  (SELECT count(*) FROM elc.timesheet_monthly WHERE night_shift_hours = 0)::int,
  '>', (SELECT count(*) FROM elc.timesheet_monthly WHERE night_shift_hours > 0)::int,
  'night shifts are sporadic (zero rows outnumber non-zero)');

-- both an old (2024/2025) and a recent (2026) violation exist
SELECT cmp_ok(
  (SELECT count(*) FROM elc.violation WHERE incident_date < date '2026-01-01')::int
  * (SELECT count(*) FROM elc.violation WHERE incident_date >= date '2026-01-01')::int,
  '>=', 1, 'both an old (<2026) and a recent (>=2026) violation exist');

SELECT * FROM finish();
ROLLBACK;
