\set ON_ERROR_STOP on
BEGIN;
SELECT plan(26);

SELECT has_table('lnd','course_catalog','course_catalog exists');
SELECT has_table('lnd','attendance_log','attendance_log exists');
SELECT col_is_unique('lnd','course_catalog','course_code','course_catalog.course_code unique');
SELECT fk_ok('lnd','course_catalog','trainer_id','core','trainer','trainer_id');
SELECT col_has_check('lnd','course_catalog','status','course_catalog.status checked');
SELECT col_has_check('lnd','course_catalog','pass_threshold_score','course_catalog.pass_threshold_score checked');
SELECT fk_ok('lnd','attendance_log','course_id','lnd','course_catalog','course_id');
SELECT fk_ok('lnd','attendance_log','employee_id','core','employee','employee_id');
SELECT col_has_check('lnd','attendance_log','attendance_status','attendance_log.attendance_status checked');
SELECT col_is_unique('lnd','attendance_log', ARRAY['course_id','session_no','employee_id'],
  'attendance_log unique per (course,session,employee)');
SELECT has_column('lnd','attendance_log','training_hours','attendance_log.training_hours present');

SELECT has_table('lnd','assessment_score','assessment_score exists');
SELECT has_table('lnd','feedback_survey','feedback_survey exists');
SELECT has_table('lnd','training_cost','training_cost exists');
SELECT has_table('lnd','training_norm','training_norm exists');
SELECT has_table('lnd','report_template_section','report_template_section exists');
SELECT fk_ok('lnd','assessment_score','course_id','lnd','course_catalog','course_id');
SELECT col_is_unique('lnd','assessment_score', ARRAY['course_id','employee_id'],
  'assessment_score unique per (course,employee)');
SELECT col_has_check('lnd','assessment_score','score_0_to_10','assessment_score.score_0_to_10 checked');
SELECT fk_ok('lnd','feedback_survey','course_id','lnd','course_catalog','course_id');
SELECT col_has_check('lnd','feedback_survey','trainer_rating','feedback_survey.trainer_rating checked');
SELECT col_is_unique('lnd','training_cost','course_id','training_cost.course_id unique');
SELECT col_is_unique('lnd','training_norm','rule_code','training_norm.rule_code unique');
SELECT col_is_unique('lnd','report_template_section','section_code','report_template_section.section_code unique');

SELECT has_view('lnd','v_course_effectiveness','v_course_effectiveness view exists');
SELECT trigger_is('lnd','course_catalog','course_catalog_set_updated_at',
  'core','set_updated_at','course_catalog has updated_at trigger');

SELECT * FROM finish();
ROLLBACK;
