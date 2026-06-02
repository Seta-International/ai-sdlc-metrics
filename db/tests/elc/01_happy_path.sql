\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

SELECT is( (SELECT count(*) FROM elc.violation_type)::int, 26, '26 violation types' );
SELECT is( (SELECT count(*) FROM elc.performance_norm)::int, 27, '27 performance NORM rules' );

-- 39 employees reviewed for both periods (EMP-040 deliberately missing review data)
SELECT is( (SELECT count(*) FROM elc.performance_review)::int, 78, '78 review rows (39 employees x 2 periods)' );
SELECT is( (SELECT count(DISTINCT report_period) FROM elc.performance_review)::int, 2,
           'reviews span exactly two periods (2026-03, 2026-04)' );

-- all 40 employees have both monthly timesheets
SELECT is( (SELECT count(*) FROM elc.timesheet_monthly)::int, 80, '80 timesheet rows (40 employees x 2 periods)' );

-- every classification is within the allowed set (FK-free CHECK already guarantees; assert no orphan)
SELECT is(
  (SELECT count(*) FROM elc.performance_review
    WHERE classification NOT IN ('Excellent','Good','Meets Expectations','Below Expectations','Poor'))::int,
  0, 'every review classification is valid');

-- profile view returns exactly one row per core employee
SELECT is(
  (SELECT count(*) FROM elc.v_perf_profile)::int,
  (SELECT count(*) FROM core.employee)::int,
  'v_perf_profile returns one row per employee');

-- EMP-008 (PIP) avg_score equals the mean of its two seeded scores (2.22, 2.05) = 2.135
SELECT is(
  (SELECT round(avg_score,3) FROM elc.v_perf_profile WHERE emp_code='EMP-0008')::numeric,
  2.135::numeric, 'v_perf_profile.avg_score = mean of EMP-008 T3/T4 scores');

SELECT * FROM finish();
ROLLBACK;
