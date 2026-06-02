\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

SELECT is( (SELECT count(*) FROM ta.business_context)::int, 7, '7 business contexts' );
SELECT is( (SELECT count(*) FROM ta.headcount_plan)::int, 7, '7 headcount plans' );
SELECT is( (SELECT count(*) FROM ta.jd_template)::int, 8, '8 JD templates (one position has two versions)' );
SELECT cmp_ok( (SELECT count(*) FROM ta.scorecard)::int, '>=', 7, '>=7 scorecards' );

-- every headcount plan has a valid salary band
SELECT is(
  (SELECT count(*) FROM ta.headcount_plan
     WHERE salary_max_scaled < salary_min_scaled)::int,
  0, 'every headcount plan has salary_max >= salary_min');

-- every scorecard's criterion weights sum to exactly 1.0
SELECT is(
  (SELECT count(*) FROM (
     SELECT scorecard_id, sum(weight) AS s
     FROM ta.scorecard_criterion GROUP BY scorecard_id
   ) g WHERE g.s <> 1.000)::int,
  0, 'every scorecard criterion weights sum to 1.0');

-- every JD has at least one required skill, all resolving to core.skill
SELECT is(
  (SELECT count(*) FROM ta.jd_template j
     WHERE NOT EXISTS (SELECT 1 FROM ta.jd_required_skill rs WHERE rs.jd_id = j.jd_template_id))::int,
  0, 'every JD template has >=1 required skill');
SELECT is(
  (SELECT count(*) FROM ta.jd_required_skill rs JOIN core.skill s USING (skill_id))::int,
  (SELECT count(*) FROM ta.jd_required_skill)::int,
  'every jd_required_skill resolves to a core.skill');

SELECT * FROM finish();
ROLLBACK;
