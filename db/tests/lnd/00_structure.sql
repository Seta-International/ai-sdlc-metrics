\set ON_ERROR_STOP on
BEGIN;
SELECT plan(21);

SELECT has_schema('lnd', 'schema lnd exists');

SELECT has_table('lnd','employee_skill_gap','employee_skill_gap exists');
SELECT has_table('lnd','project_required_skill','project_required_skill exists');
SELECT fk_ok('lnd','employee_skill_gap','employee_id','core','employee','employee_id');
SELECT fk_ok('lnd','employee_skill_gap','skill_id','core','skill','skill_id');
SELECT col_is_unique('lnd','employee_skill_gap', ARRAY['employee_id','skill_id'],
  'employee_skill_gap unique per (employee,skill)');
SELECT col_has_check('lnd','employee_skill_gap','priority','employee_skill_gap.priority checked');
SELECT col_has_check('lnd','employee_skill_gap','gap_source','employee_skill_gap.gap_source checked');
SELECT fk_ok('lnd','project_required_skill','project_id','core','project','project_id');
SELECT fk_ok('lnd','project_required_skill','skill_id','core','skill','skill_id');
SELECT col_is_unique('lnd','project_required_skill', ARRAY['project_id','skill_id'],
  'project_required_skill unique per (project,skill)');

SELECT has_table('lnd','training_need_survey','training_need_survey exists');
SELECT has_table('lnd','bod_training_goal','bod_training_goal exists');
SELECT col_is_unique('lnd','training_need_survey','survey_response_code',
  'training_need_survey.survey_response_code unique');
SELECT col_is_unique('lnd','training_need_survey', ARRAY['survey_wave','employee_id'],
  'training_need_survey unique per (wave,employee)');
SELECT fk_ok('lnd','training_need_survey','employee_id','core','employee','employee_id');
SELECT col_has_check('lnd','training_need_survey','priority','training_need_survey.priority checked');
SELECT col_is_unique('lnd','bod_training_goal','goal_code','bod_training_goal.goal_code unique');
SELECT has_column('lnd','training_need_survey','delivery_mode_hint',
  'training_need_survey.delivery_mode_hint present');

SELECT has_view('lnd','v_skill_gap_frequency','v_skill_gap_frequency view exists');
SELECT trigger_is('lnd','employee_skill_gap','employee_skill_gap_set_updated_at',
  'core','set_updated_at','employee_skill_gap has updated_at trigger');

SELECT * FROM finish();
ROLLBACK;
