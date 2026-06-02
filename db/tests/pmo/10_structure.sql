\set ON_ERROR_STOP on
BEGIN;
SELECT plan(25);

SELECT has_table('pmo','overbook_idle_config','overbook_idle_config exists');
SELECT has_pk('pmo','overbook_idle_config','overbook_idle_config has pk');
SELECT col_is_unique('pmo','overbook_idle_config','config_code','overbook_idle_config.config_code unique');
SELECT col_has_check('pmo','overbook_idle_config','overbook_red_threshold','red>=yellow check present');
SELECT col_has_check('pmo','overbook_idle_config','overbook_threshold','thresholds-positive check present');

-- timesheet_log
SELECT has_table('pmo','timesheet_log','timesheet_log exists');
SELECT has_pk('pmo','timesheet_log','timesheet_log has pk');
SELECT fk_ok('pmo','timesheet_log','employee_id','core','employee','employee_id');
SELECT fk_ok('pmo','timesheet_log','project_id','core','project','project_id');
SELECT col_has_check('pmo','timesheet_log','logged_hours','timesheet_log.logged_hours checked');
SELECT col_has_check('pmo','timesheet_log','log_category','timesheet_log.log_category checked');
SELECT has_column('pmo','timesheet_log','task_ref','timesheet_log.task_ref present');

-- leave_record
SELECT has_table('pmo','leave_record','leave_record exists');
SELECT col_is_unique('pmo','leave_record','leave_record_code','leave_record.leave_record_code unique');
SELECT fk_ok('pmo','leave_record','employee_id','core','employee','employee_id');
SELECT col_has_check('pmo','leave_record','leave_type','leave_record.leave_type checked');
SELECT col_has_check('pmo','leave_record','duration_days','leave_record.duration_days checked');
SELECT has_column('pmo','leave_record','approved','leave_record.approved present');
SELECT has_column('pmo','leave_record','note','leave_record.note present');
SELECT has_column('pmo','leave_record','leave_date','leave_record.leave_date present');

SELECT has_view('pmo','v_member_week_hours','v_member_week_hours view exists');
SELECT has_view('pmo','v_member_utilization','v_member_utilization view exists');
SELECT trigger_is('pmo','timesheet_log','timesheet_log_set_updated_at','core','set_updated_at',
  'timesheet_log has updated_at trigger');
SELECT trigger_is('pmo','leave_record','leave_record_set_updated_at','core','set_updated_at',
  'leave_record has updated_at trigger');
SELECT trigger_is('pmo','overbook_idle_config','overbook_idle_config_set_updated_at','core','set_updated_at',
  'overbook_idle_config has updated_at trigger');

SELECT * FROM finish();
ROLLBACK;
