\set ON_ERROR_STOP on
BEGIN;
SELECT plan(6);

-- FK to a missing employee rejected
SELECT throws_ok(
  $$ insert into lnd.employee_skill_gap (employee_id, skill_id, gap_source, priority)
     select 999999, (select skill_id from core.skill limit 1), 'Project','High' $$,
  '23503', NULL, 'gap FK to missing employee rejected');

-- invalid gap_source rejected
SELECT throws_ok(
  $$ insert into lnd.employee_skill_gap (employee_id, skill_id, gap_source, priority)
     select (select employee_id from core.employee limit 1),
            (select skill_id from core.skill limit 1), 'Nope','High' $$,
  '23514', NULL, 'invalid gap_source rejected');

-- invalid survey priority rejected
SELECT throws_ok(
  $$ insert into lnd.training_need_survey (survey_response_code, survey_wave, employee_id, training_topic, priority)
     select 'SUR-X', 'SUR_2026_Q1', (select employee_id from core.employee limit 1), 'x', 'Urgent' $$,
  '23514', NULL, 'invalid survey priority rejected');

-- duplicate (employee, skill) gap rejected
SELECT throws_ok(
  $$ insert into lnd.employee_skill_gap (employee_id, skill_id, gap_source, priority)
     select employee_id, skill_id, 'Role','Low' from lnd.employee_skill_gap limit 1 $$,
  '23505', NULL, 'duplicate (employee,skill) gap rejected');

-- duplicate (project, skill) required-skill rejected
SELECT throws_ok(
  $$ insert into lnd.project_required_skill (project_id, skill_id)
     select project_id, skill_id from lnd.project_required_skill limit 1 $$,
  '23505', NULL, 'duplicate (project,skill) required-skill rejected');

-- duplicate (survey_wave, employee) survey row rejected
SELECT throws_ok(
  $$ insert into lnd.training_need_survey (survey_response_code, survey_wave, employee_id, training_topic, priority)
     select 'SUR-DUP', survey_wave, employee_id, 'dup', 'Low' from lnd.training_need_survey limit 1 $$,
  '23505', NULL, 'duplicate (survey_wave,employee) rejected');

SELECT * FROM finish();
ROLLBACK;
