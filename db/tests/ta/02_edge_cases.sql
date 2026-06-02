\set ON_ERROR_STOP on
BEGIN;
SELECT plan(4);

-- a business context with NULL project_id (brand-new project) exists
SELECT cmp_ok( (SELECT count(*) FROM ta.business_context WHERE project_id IS NULL)::int, '>=', 1,
               'a business context with NULL project_id exists');

-- two JD versions for the same position exist
SELECT cmp_ok( (
  SELECT count(*) FROM (
    SELECT position FROM ta.jd_template
    GROUP BY position HAVING count(*) >= 2
  ) g)::int, '>=', 1, 'a position with two JD versions exists');

-- a wide salary-band headcount plan exists (band >= 1.0 scaled unit)
SELECT cmp_ok( (SELECT count(*) FROM ta.headcount_plan
                WHERE salary_max_scaled - salary_min_scaled >= 1.0)::int, '>=', 1,
               'a wide salary-band headcount plan exists');

-- every scorecard's criterion weights sum to exactly 1.0 (weight-balance edge)
SELECT is(
  (SELECT count(*) FROM (
     SELECT scorecard_id, sum(weight) AS s
     FROM ta.scorecard_criterion GROUP BY scorecard_id
   ) g WHERE g.s <> 1.000)::int,
  0, 'every scorecard criterion weights sum to 1.0');

SELECT * FROM finish();
ROLLBACK;
