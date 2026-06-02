\set ON_ERROR_STOP on
BEGIN;
SELECT plan(6);

-- re-engagement pool: at least one Rejected and one Failed candidate
SELECT cmp_ok( (SELECT count(*) FROM ta.candidate WHERE status='Rejected')::int, '>=', 1,
               'a Rejected candidate exists (re-engagement pool)');
SELECT cmp_ok( (SELECT count(*) FROM ta.candidate WHERE status='Failed')::int, '>=', 1,
               'a Failed candidate exists (re-engagement pool)');

-- all four status values and all four source values present
SELECT is( (SELECT count(DISTINCT status) FROM ta.candidate)::int, 4, 'all four status values present');
SELECT is( (SELECT count(DISTINCT source) FROM ta.candidate)::int, 4, 'all four source values present');

-- a candidate whose skills miss ALL must-haves of their applied position
SELECT cmp_ok( (
  SELECT must_have_overlap FROM ta.v_candidate_fit
   WHERE candidate_code = 'CAND-1010' AND criteria_code = 'SCR-MOB-001')::int,
  '=', 0, 'CAND-1010 overlaps zero Mobile must-haves');

-- a Vietnamese TopCV outreach template exists (bilingual / channel-varied)
SELECT cmp_ok( (SELECT count(*) FROM ta.outreach_template WHERE channel='TopCV')::int, '>=', 1,
               'a TopCV (Vietnamese) outreach template exists');

SELECT * FROM finish();
ROLLBACK;
