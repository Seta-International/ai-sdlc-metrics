\set ON_ERROR_STOP on
BEGIN;
SELECT plan(11);

-- ~40 employees
SELECT is( (SELECT count(*) FROM core.employee)::int, 40, '40 employees seeded' );

-- lifecycle edge states each present
SELECT cmp_ok( (SELECT count(*) FROM core.employee e JOIN core.employment_status s USING (employment_status_id)
                WHERE s.status_code='Resigned' AND e.exit_date IS NOT NULL)::int, '>=', 1,
               'a resigned employee with exit_date exists');
SELECT cmp_ok( (SELECT count(*) FROM core.employee e JOIN core.employment_status s USING (employment_status_id)
                WHERE s.status_code='Probation')::int, '>=', 1, 'a probation employee exists');
SELECT cmp_ok( (SELECT count(*) FROM core.employee e JOIN core.employment_status s USING (employment_status_id)
                WHERE s.status_code='PIP')::int, '>=', 1, 'a PIP employee exists');
SELECT cmp_ok( (SELECT count(*) FROM core.employee e JOIN core.employment_status s USING (employment_status_id)
                WHERE s.status_code='On Leave')::int, '>=', 1, 'an on-leave employee exists');

-- part-time + every worker_type used
SELECT cmp_ok( (SELECT count(*) FROM core.employee WHERE employment_type='PT')::int, '>=', 1,
               'a part-time employee exists');
SELECT is( (SELECT count(DISTINCT worker_type_id) FROM core.employee)::int, 4,
           'all four worker types are used');

-- manager-less CEO + manager chain depth >= 3
SELECT is( (SELECT count(*) FROM core.employee WHERE line_manager_id IS NULL)::int, 1,
           'exactly one manager-less employee (CEO)');
WITH RECURSIVE chain AS (
  SELECT employee_id, line_manager_id, 1 AS depth FROM core.employee WHERE line_manager_id IS NULL
  UNION ALL
  SELECT e.employee_id, e.line_manager_id, c.depth + 1
  FROM core.employee e JOIN chain c ON e.line_manager_id = c.employee_id
)
SELECT cmp_ok( (SELECT max(depth) FROM chain)::int, '>=', 3, 'management chain at least 3 deep');

-- non-billable employee + employee with zero skills + a primary skill row
SELECT cmp_ok( (SELECT count(*) FROM core.employee WHERE is_billable = false)::int, '>=', 1,
               'a non-billable employee exists');
SELECT cmp_ok( (SELECT count(*) FROM core.employee e
                WHERE NOT EXISTS (SELECT 1 FROM core.employee_skill es WHERE es.employee_id = e.employee_id))::int,
               '>=', 1, 'a zero-skill (new joiner) employee exists');

SELECT * FROM finish();
ROLLBACK;
