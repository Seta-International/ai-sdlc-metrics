\set ON_ERROR_STOP on
BEGIN;
SELECT plan(19);
SELECT has_table('ta','candidate','ta.candidate exists');
SELECT col_is_unique('ta','candidate','candidate_code','candidate.candidate_code unique');
SELECT fk_ok('ta','candidate','role_id','core','role','role_id');
SELECT col_has_check('ta','candidate','status','candidate.status checked');
SELECT col_has_check('ta','candidate','source','candidate.source checked');
SELECT has_table('ta','candidate_skill','candidate_skill exists');
SELECT fk_ok('ta','candidate_skill','candidate_id','ta','candidate','candidate_id');
SELECT has_table('ta','screening_criteria','screening_criteria exists');
SELECT has_table('ta','screening_criteria_skill','screening_criteria_skill exists');
SELECT col_is_unique('ta','screening_criteria','criteria_code','screening_criteria.criteria_code unique');
SELECT fk_ok('ta','screening_criteria','role_id','core','role','role_id');
SELECT fk_ok('ta','screening_criteria_skill','criteria_id','ta','screening_criteria','screening_criteria_id');
SELECT fk_ok('ta','screening_criteria_skill','skill_id','core','skill','skill_id');
SELECT col_has_check('ta','screening_criteria_skill','skill_type','screening_criteria_skill.skill_type checked');
SELECT has_table('ta','outreach_template','outreach_template exists');
SELECT col_is_unique('ta','outreach_template','template_code','outreach_template.template_code unique');
SELECT col_has_check('ta','outreach_template','channel','outreach_template.channel checked');
SELECT has_view('ta','v_candidate_fit','v_candidate_fit view exists');
SELECT trigger_is('ta','candidate','candidate_set_updated_at','core','set_updated_at',
  'candidate has updated_at trigger');
SELECT * FROM finish();
ROLLBACK;
