\set ON_ERROR_STOP on
BEGIN;
SELECT plan(6);

SELECT is( (SELECT count(*) FROM ta.candidate)::int, 10, '10 candidates' );
SELECT cmp_ok( (SELECT count(*) FROM ta.screening_criteria)::int, '>=', 7, '>=7 screening criteria' );

-- every candidate skill resolves to a core.skill
SELECT is(
  (SELECT count(*) FROM ta.candidate_skill cs JOIN core.skill s USING (skill_id))::int,
  (SELECT count(*) FROM ta.candidate_skill)::int,
  'every candidate_skill resolves to a core.skill');

-- every screening criteria has at least one must-have skill
SELECT is(
  (SELECT count(*) FROM ta.screening_criteria sc
     WHERE NOT EXISTS (SELECT 1 FROM ta.screening_criteria_skill s
                         WHERE s.criteria_id = sc.screening_criteria_id
                           AND s.skill_type = 'must_have'))::int,
  0, 'every screening criteria has >=1 must-have skill');

-- every candidate has a valid salary band
SELECT is(
  (SELECT count(*) FROM ta.candidate
     WHERE salary_expectation_max_scaled < salary_expectation_min_scaled)::int,
  0, 'every candidate has salary_max >= salary_min');

-- a strong candidate has positive must-have overlap in v_candidate_fit
SELECT cmp_ok( (
  SELECT must_have_overlap FROM ta.v_candidate_fit
   WHERE candidate_code = 'CAND-1001' AND criteria_code = 'SCR-BE-001')::int,
  '>=', 2, 'CAND-1001 overlaps >=2 Backend must-haves');

SELECT * FROM finish();
ROLLBACK;
