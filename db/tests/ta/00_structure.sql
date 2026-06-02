\set ON_ERROR_STOP on
BEGIN;
SELECT plan(23);
SELECT has_schema('ta', 'schema ta exists');
SELECT has_table('ta','business_context','business_context exists');
SELECT has_table('ta','headcount_plan','headcount_plan exists');
SELECT col_is_unique('ta','business_context','context_code','business_context.context_code unique');
SELECT col_is_unique('ta','headcount_plan','hc_plan_code','headcount_plan.hc_plan_code unique');
SELECT fk_ok('ta','business_context','project_id','core','project','project_id');
SELECT fk_ok('ta','headcount_plan','context_id','ta','business_context','business_context_id');
SELECT fk_ok('ta','headcount_plan','role_id','core','role','role_id');
SELECT col_has_check('ta','headcount_plan','headcount','headcount_plan.headcount checked');
SELECT has_table('ta','jd_template','jd_template exists');
SELECT has_table('ta','jd_required_skill','jd_required_skill exists');
SELECT col_is_unique('ta','jd_template','jd_code','jd_template.jd_code unique');
SELECT fk_ok('ta','jd_template','role_id','core','role','role_id');
SELECT fk_ok('ta','jd_required_skill','jd_id','ta','jd_template','jd_template_id');
SELECT fk_ok('ta','jd_required_skill','skill_id','core','skill','skill_id');
SELECT has_table('ta','scorecard','scorecard exists');
SELECT has_table('ta','scorecard_criterion','scorecard_criterion exists');
SELECT col_is_unique('ta','scorecard','scorecard_code','scorecard.scorecard_code unique');
SELECT fk_ok('ta','scorecard','role_id','core','role','role_id');
SELECT fk_ok('ta','scorecard_criterion','scorecard_id','ta','scorecard','scorecard_id');
SELECT col_has_check('ta','scorecard_criterion','weight','scorecard_criterion.weight checked');
SELECT col_is_unique('ta','scorecard_criterion', ARRAY['scorecard_id','criteria'],
  'scorecard_criterion unique per (scorecard,criteria)');
SELECT trigger_is('ta','scorecard','scorecard_set_updated_at','core','set_updated_at',
  'scorecard has updated_at trigger');
SELECT * FROM finish();
ROLLBACK;
