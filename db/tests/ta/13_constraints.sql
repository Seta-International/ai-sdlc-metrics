\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

-- duplicate candidate_code rejected
SELECT throws_ok(
  $$ insert into ta.candidate (candidate_code, full_name, applied_position, status, source)
     values ('CAND-1001','dup','x','Passed','LinkedIn') $$,
  '23505', NULL, 'duplicate candidate_code rejected');

-- invalid status rejected
SELECT throws_ok(
  $$ insert into ta.candidate (candidate_code, full_name, applied_position, status, source)
     values ('CAND-X','x','x','Maybe','LinkedIn') $$,
  '23514', NULL, 'invalid candidate.status rejected');

-- invalid source rejected
SELECT throws_ok(
  $$ insert into ta.candidate (candidate_code, full_name, applied_position, status, source)
     values ('CAND-Y','y','y','Passed','Carrier Pigeon') $$,
  '23514', NULL, 'invalid candidate.source rejected');

-- invalid skill_type rejected
SELECT throws_ok(
  $$ insert into ta.screening_criteria_skill (criteria_id, skill_id, skill_type)
     select (select screening_criteria_id from ta.screening_criteria limit 1),
            (select skill_id from core.skill limit 1), 'maybe_have' $$,
  '23514', NULL, 'invalid screening_criteria_skill.skill_type rejected');

-- invalid channel rejected
SELECT throws_ok(
  $$ insert into ta.outreach_template (template_code, channel, template_content)
     values ('OUT-X','SMS','x') $$,
  '23514', NULL, 'invalid outreach_template.channel rejected');

-- salary_max < salary_min rejected
SELECT throws_ok(
  $$ insert into ta.candidate (candidate_code, full_name, applied_position, status, source,
        salary_expectation_min_scaled, salary_expectation_max_scaled)
     values ('CAND-Z','z','z','Passed','LinkedIn',3.0,2.0) $$,
  '23514', NULL, 'candidate salary_max < salary_min rejected');

-- duplicate (candidate_id, skill_id) rejected
SELECT throws_ok(
  $$ insert into ta.candidate_skill (candidate_id, skill_id)
     select candidate_id, skill_id from ta.candidate_skill limit 1 $$,
  '23505', NULL, 'duplicate (candidate_id, skill_id) rejected');

-- duplicate (criteria_id, skill_id) rejected
SELECT throws_ok(
  $$ insert into ta.screening_criteria_skill (criteria_id, skill_id, skill_type)
     select criteria_id, skill_id, 'nice_to_have' from ta.screening_criteria_skill limit 1 $$,
  '23505', NULL, 'duplicate (criteria_id, skill_id) rejected');

SELECT * FROM finish();
ROLLBACK;
