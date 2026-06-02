\set ON_ERROR_STOP on
BEGIN;
SELECT plan(9);

-- missing risk register: a plan with zero registered risks
SELECT cmp_ok( (SELECT registered_risk_count FROM pmo.plan WHERE plan_code='PLAN-002')::int,
               '=', 0, 'PLAN-002 has a missing risk register (count 0)');

-- a Missing and a Custom section check both exist
SELECT cmp_ok( (SELECT count(*) FROM pmo.plan_section_check WHERE status='Missing')::int, '>=', 1,
               'a Missing section check exists');
SELECT cmp_ok( (SELECT count(*) FROM pmo.plan_section_check WHERE status='Custom' AND custom_name IS NOT NULL)::int,
               '>=', 1, 'a Custom section check exists');

-- a dependency cycle exists (reachability returns to start)
SELECT cmp_ok( (
  WITH RECURSIVE reach(start_id, cur) AS (
    SELECT plan_task_id, depends_on_task_id FROM pmo.plan_task_dependency
    UNION
    SELECT r.start_id, d.depends_on_task_id
    FROM reach r JOIN pmo.plan_task_dependency d ON d.plan_task_id = r.cur
  )
  SELECT count(*) FROM reach WHERE start_id = cur)::int,
  '>=', 1, 'a dependency cycle exists');

-- a test-before-build ordering exists (Testing task starts before a Development prereq ends)
SELECT cmp_ok( (
  SELECT count(*) FROM pmo.plan_task_dependency d
  JOIN pmo.plan_task t   ON t.plan_task_id   = d.plan_task_id
  JOIN pmo.plan_task pre ON pre.plan_task_id = d.depends_on_task_id
  WHERE t.phase='Testing' AND pre.phase='Development' AND t.start_date < pre.end_date)::int,
  '>=', 1, 'a test-before-build ordering exists');

-- overbooked + idle members via the busy-rate view
SELECT cmp_ok( (SELECT count(*) FROM pmo.v_member_busy_rate WHERE busy_rate > 1.20)::int, '>=', 1,
               'an overbooked member (busy_rate > 1.2) exists');
SELECT cmp_ok( (SELECT count(*) FROM pmo.v_member_busy_rate WHERE busy_rate > 0 AND busy_rate < 0.75)::int, '>=', 1,
               'an idle member (0 < busy_rate < 0.75) exists');

-- a benchmark outlier exists
SELECT cmp_ok( (SELECT count(*) FROM pmo.historical_benchmark WHERE is_outlier)::int, '>=', 1,
               'a benchmark outlier exists');

-- v_plan_summary yields a numeric velocity for the green plan
SELECT isnt(
  (SELECT velocity_md_month FROM pmo.v_plan_summary WHERE plan_code = 'PLAN-001'),
  NULL, 'v_plan_summary.velocity_md_month is populated for PLAN-001');

SELECT * FROM finish();
ROLLBACK;
