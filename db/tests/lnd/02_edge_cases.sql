\set ON_ERROR_STOP on
BEGIN;
SELECT plan(4);

-- non-response: an active employee with no survey row in any wave
SELECT cmp_ok( (
  SELECT count(*) FROM core.employee e
  WHERE NOT EXISTS (SELECT 1 FROM lnd.training_need_survey s WHERE s.employee_id = e.employee_id))::int,
  '>=', 1, 'an employee with no survey response exists');

-- high-frequency gap: a skill missed by many employees
SELECT cmp_ok( (SELECT max(gap_count) FROM lnd.v_skill_gap_frequency)::int, '>=', 8,
               'a high-frequency skill gap (>=8 employees) exists');

-- low-availability internal trainer (re-asserted from lnd context)
SELECT cmp_ok( (SELECT count(*) FROM core.trainer
                WHERE availability_hours_per_month <= 5)::int, '>=', 1,
               'a low-availability internal trainer exists');

-- coverage gap: a project requires a critical skill held by zero active employees
SELECT cmp_ok( (
  SELECT count(*) FROM lnd.project_required_skill r
  JOIN core.project p ON p.project_id = r.project_id AND p.status = 'Active'
  WHERE r.is_critical
    AND NOT EXISTS (
      SELECT 1 FROM core.employee_skill es
      JOIN core.employee e ON e.employee_id = es.employee_id
      JOIN core.employment_status st ON st.employment_status_id = e.employment_status_id
      WHERE es.skill_id = r.skill_id AND st.is_active))::int,
  '>=', 1, 'a project requires a critical skill no active employee holds');

SELECT * FROM finish();
ROLLBACK;
