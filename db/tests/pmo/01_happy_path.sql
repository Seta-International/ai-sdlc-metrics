\set ON_ERROR_STOP on
BEGIN;
SELECT plan(7);

-- template weights sum to exactly 1.0
SELECT is(
  (SELECT sum(weight) FROM pmo.template_component c
     JOIN pmo.plan_template t USING (plan_template_id)
    WHERE t.template_code = 'TPL-2026-v3')::numeric,
  1.000::numeric, 'TPL-2026-v3 component weights sum to 1.0');

SELECT is( (SELECT count(*) FROM pmo.template_component)::int, 8, '8 template components (S01..S08)');
SELECT is( (SELECT count(*) FROM pmo.role_capacity)::int, 12, 'one role_capacity per core role');
SELECT cmp_ok( (SELECT count(*) FROM pmo.historical_benchmark)::int, '>=', 6, '>=6 historical benchmarks');
SELECT cmp_ok( (SELECT count(*) FROM pmo.velocity_history)::int, '>=', 10, '>=10 velocity sprints');

-- every plan has at least one task
SELECT is(
  (SELECT count(*) FROM pmo.plan p
     WHERE NOT EXISTS (SELECT 1 FROM pmo.plan_task t WHERE t.plan_id = p.plan_id))::int,
  0, 'every plan has >=1 task');

-- velocity_ratio is computed
SELECT is(
  (SELECT round(velocity_ratio,2) FROM pmo.velocity_history
    WHERE planned_points = 40 AND completed_points = 38 LIMIT 1)::numeric,
  0.95::numeric, 'generated velocity_ratio computes 38/40 = 0.95');

SELECT * FROM finish();
ROLLBACK;
