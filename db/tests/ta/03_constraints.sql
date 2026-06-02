\set ON_ERROR_STOP on
BEGIN;
SELECT plan(7);

-- duplicate hc_plan_code rejected
SELECT throws_ok(
  $$ insert into ta.headcount_plan (hc_plan_code, position, headcount, salary_min_scaled, salary_max_scaled)
     values ('HC-2025-Q2-001','dup',1,1.0,2.0) $$,
  '23505', NULL, 'duplicate hc_plan_code rejected');

-- FK to a missing core.role rejected
SELECT throws_ok(
  $$ insert into ta.jd_template (jd_code, position, role_id, jd_version)
     values ('JD-X','x',999999,'v1') $$,
  '23503', NULL, 'jd_template FK to missing role rejected');

-- headcount <= 0 rejected
SELECT throws_ok(
  $$ insert into ta.headcount_plan (hc_plan_code, position, headcount, salary_min_scaled, salary_max_scaled)
     values ('HC-Z','z',0,1.0,2.0) $$,
  '23514', NULL, 'headcount <= 0 rejected');

-- salary_max < salary_min rejected
SELECT throws_ok(
  $$ insert into ta.headcount_plan (hc_plan_code, position, headcount, salary_min_scaled, salary_max_scaled)
     values ('HC-Y','y',1,3.0,2.0) $$,
  '23514', NULL, 'salary_max < salary_min rejected');

-- scorecard criterion weight > 1 rejected
SELECT throws_ok(
  $$ insert into ta.scorecard_criterion (scorecard_id, criteria, weight)
     select scorecard_id, 'overweight', 1.5 from ta.scorecard limit 1 $$,
  '23514', NULL, 'scorecard_criterion.weight > 1 rejected');

-- duplicate (jd_id, skill_id) rejected
SELECT throws_ok(
  $$ insert into ta.jd_required_skill (jd_id, skill_id)
     select jd_id, skill_id from ta.jd_required_skill limit 1 $$,
  '23505', NULL, 'duplicate (jd_id, skill_id) rejected');

-- duplicate (scorecard_id, criteria) rejected
SELECT throws_ok(
  $$ insert into ta.scorecard_criterion (scorecard_id, criteria, weight)
     select scorecard_id, criteria, 0.1 from ta.scorecard_criterion limit 1 $$,
  '23505', NULL, 'duplicate (scorecard_id, criteria) rejected');

SELECT * FROM finish();
ROLLBACK;
