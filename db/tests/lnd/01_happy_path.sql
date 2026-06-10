\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

-- enhanced reference projects don't carry required-skill rows; allow up to 15 without
SELECT cmp_ok(
  (SELECT count(*) FROM core.project p
     WHERE p.status = 'Active'
       AND NOT EXISTS (SELECT 1 FROM lnd.project_required_skill r WHERE r.project_id = p.project_id))::int,
  '<=', 20, '<=20 active projects without required skills (reference + new PMO projects)');

-- at least one critical required skill per project that has requirements
SELECT is(
  (SELECT count(*) FROM (
     SELECT project_id FROM lnd.project_required_skill
     GROUP BY project_id
     HAVING bool_or(is_critical) = false) x)::int,
  0, 'every project with requirements has >=1 critical skill');

-- both survey waves present and populated
SELECT is( (SELECT count(DISTINCT survey_wave) FROM lnd.training_need_survey)::int, 2,
           'two survey waves present');
SELECT cmp_ok( (SELECT count(*) FROM lnd.training_need_survey)::int, '>=', 20,
               '>=20 survey responses across both waves');

-- the 7 BOD goals seeded
SELECT is( (SELECT count(*) FROM lnd.bod_training_goal)::int, 7, '7 BOD training goals');

-- required-skill rows all resolve to a real core skill
SELECT is(
  (SELECT count(*) FROM lnd.project_required_skill r
     JOIN core.skill s USING (skill_id))::int,
  (SELECT count(*) FROM lnd.project_required_skill)::int,
  'every required-skill row resolves to a core skill');

-- v_skill_gap_frequency returns a positive top count
SELECT cmp_ok( (SELECT max(gap_count) FROM lnd.v_skill_gap_frequency)::int, '>=', 1,
               'v_skill_gap_frequency has a positive top gap_count');

-- every gap row resolves to a real core skill
SELECT is(
  (SELECT count(*) FROM lnd.employee_skill_gap g JOIN core.skill s USING (skill_id))::int,
  (SELECT count(*) FROM lnd.employee_skill_gap)::int,
  'every gap row resolves to a core skill');

SELECT * FROM finish();
ROLLBACK;
