\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

-- exactly one config row
SELECT is( (SELECT count(*) FROM pmo.overbook_idle_config)::int, 1, 'one overbook/idle config row');
SELECT is( (SELECT config_code FROM pmo.overbook_idle_config LIMIT 1), 'CFG-001', 'config code is CFG-001');

-- timesheet logs were seeded for the subset
SELECT cmp_ok( (SELECT count(*) FROM pmo.timesheet_log)::int, '>=', 200, '>=200 timesheet log rows seeded');
SELECT cmp_ok( (SELECT count(DISTINCT employee_id) FROM pmo.timesheet_log)::int, '>=', 8,
               '>=8 distinct members logged time');

-- project/category consistency holds across all rows
SELECT is(
  (SELECT count(*) FROM pmo.timesheet_log
     WHERE (log_category = 'Project' AND project_id IS NULL)
        OR (log_category <> 'Project' AND project_id IS NOT NULL))::int,
  0, 'every Project log has a project and every non-Project log has NULL project');

-- the busy member EMP-003 has a populated planned + logged week
SELECT isnt(
  (SELECT planned_hours FROM pmo.v_member_week_hours
     WHERE emp_code = 'EMP-0003' AND week_start = '2026-07-20'), NULL,
  'v_member_week_hours.planned_hours populated for EMP-003 week of 2026-07-20');
SELECT cmp_ok(
  (SELECT logged_hours FROM pmo.v_member_week_hours
     WHERE emp_code = 'EMP-0003' AND week_start = '2026-07-20')::numeric, '>', 0::numeric,
  'EMP-003 logged hours > 0 in the week of 2026-07-20');

-- utilization roll-up yields a numeric utilization for EMP-003
SELECT isnt(
  (SELECT utilization_pct FROM pmo.v_member_utilization WHERE emp_code = 'EMP-0003'), NULL,
  'v_member_utilization.utilization_pct populated for EMP-003');

SELECT * FROM finish();
ROLLBACK;
