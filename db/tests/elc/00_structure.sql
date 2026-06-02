\set ON_ERROR_STOP on
BEGIN;
SELECT plan(33);
SELECT has_schema('elc', 'schema elc exists');
SELECT has_table('elc','performance_review','performance_review exists');
SELECT has_table('elc','timesheet_monthly','timesheet_monthly exists');
SELECT fk_ok('elc','performance_review','employee_id','core','employee','employee_id');
SELECT fk_ok('elc','performance_review','reviewer_id','core','employee','employee_id');
SELECT col_is_unique('elc','performance_review', ARRAY['employee_id','report_period'],
  'performance_review unique per (employee,period)');
SELECT col_has_check('elc','performance_review','total_point','performance_review.total_point checked');
SELECT col_has_check('elc','performance_review','classification','performance_review.classification checked');
SELECT fk_ok('elc','timesheet_monthly','employee_id','core','employee','employee_id');
SELECT col_is_unique('elc','timesheet_monthly', ARRAY['employee_id','report_period'],
  'timesheet_monthly unique per (employee,period)');
SELECT has_column('elc','timesheet_monthly','night_shift_hours','timesheet_monthly.night_shift_hours present');
SELECT has_table('elc','violation_type','violation_type exists');
SELECT has_table('elc','violation','violation exists');
SELECT col_is_unique('elc','violation_type','violation_type_code','violation_type.violation_type_code unique');
SELECT col_has_check('elc','violation_type','category','violation_type.category checked');
SELECT col_has_check('elc','violation_type','typical_severity','violation_type.typical_severity checked');
SELECT col_is_unique('elc','violation','violation_code','violation.violation_code unique');
SELECT fk_ok('elc','violation','employee_id','core','employee','employee_id');
SELECT col_has_check('elc','violation','severity','violation.severity checked');
SELECT col_has_check('elc','violation','status','violation.status checked');
SELECT has_table('elc','promotion_intent','promotion_intent exists');
SELECT has_table('elc','salary_band','salary_band exists');
SELECT has_table('elc','performance_norm','performance_norm exists');
SELECT col_is_unique('elc','promotion_intent','employee_id','promotion_intent.employee_id unique');
SELECT fk_ok('elc','promotion_intent','current_level_id','core','career_level','career_level_id');
SELECT fk_ok('elc','promotion_intent','target_level_id','core','career_level','career_level_id');
SELECT col_has_check('elc','promotion_intent','readiness_score','promotion_intent.readiness_score checked');
SELECT fk_ok('elc','salary_band','employee_id','core','employee','employee_id');
SELECT col_is_unique('elc','salary_band', ARRAY['employee_id','effective_date'],
  'salary_band unique per (employee,effective_date)');
SELECT col_has_check('elc','salary_band','salary_band','salary_band.salary_band checked');
SELECT col_is_unique('elc','performance_norm','norm_code','performance_norm.norm_code unique');
SELECT has_view('elc','v_violation_summary','v_violation_summary view exists');
SELECT has_view('elc','v_perf_profile','v_perf_profile view exists');
SELECT * FROM finish();
ROLLBACK;
