\set ON_ERROR_STOP on
BEGIN;
SELECT plan(56);

SELECT has_schema('core', 'schema core exists');
SELECT has_function('core', 'set_updated_at', 'updated_at trigger fn exists');

-- lookups exist with PK + natural key
SELECT has_table('core', 'worker_type', 'worker_type exists');
SELECT has_table('core', 'employment_status', 'employment_status exists');
SELECT has_table('core', 'career_level', 'career_level exists');
SELECT has_table('core', 'role', 'role exists');
SELECT has_table('core', 'skill_category', 'skill_category exists');
SELECT has_table('core', 'proficiency_level', 'proficiency_level exists');
SELECT has_table('core', 'project_type', 'project_type exists');
SELECT has_pk('core', 'worker_type', 'worker_type has pk');
SELECT col_is_unique('core', 'worker_type', 'type_code', 'worker_type.type_code unique');
SELECT col_is_unique('core', 'employment_status', 'status_code', 'employment_status.status_code unique');
SELECT col_is_unique('core', 'career_level', 'level_code', 'career_level.level_code unique');
SELECT col_is_unique('core', 'role', 'role_code', 'role.role_code unique');
SELECT col_is_unique('core', 'proficiency_level', 'prof_code', 'proficiency_level.prof_code unique');
SELECT has_column('core', 'employment_status', 'is_active', 'employment_status.is_active present');

-- masters
SELECT has_table('core', 'department', 'department exists');
SELECT has_table('core', 'employee', 'employee exists');
SELECT has_table('core', 'account', 'account exists');
SELECT has_table('core', 'project', 'project exists');
SELECT has_table('core', 'skill', 'skill exists');
SELECT has_table('core', 'trainer', 'trainer exists');
SELECT has_table('core', 'calendar_week', 'calendar_week exists');
SELECT has_table('core', 'public_holiday', 'public_holiday exists');
SELECT has_table('core', 'metric_norm', 'metric_norm exists');
-- employee keys + FKs
SELECT col_is_unique('core', 'employee', 'emp_code', 'employee.emp_code unique');
SELECT col_is_pk('core', 'employee', 'employee_id', 'employee pk');
SELECT fk_ok('core','employee','department_id','core','department','department_id');
SELECT fk_ok('core','employee','role_id','core','role','role_id');
SELECT fk_ok('core','employee','worker_type_id','core','worker_type','worker_type_id');
SELECT fk_ok('core','employee','employment_status_id','core','employment_status','employment_status_id');
SELECT fk_ok('core','employee','line_manager_id','core','employee','employee_id');
-- self-FK + nullable columns present
SELECT has_column('core','employee','is_billable','employee.is_billable present');
SELECT has_column('core','employee','exit_date','employee.exit_date present');
-- project FKs + key
SELECT col_is_unique('core','project','project_code','project.project_code unique');
SELECT fk_ok('core','project','account_id','core','account','account_id');
SELECT fk_ok('core','project','project_type_id','core','project_type','project_type_id');
SELECT fk_ok('core','project','pm_id','core','employee','employee_id');
-- trainer self-link to employee is nullable FK
SELECT fk_ok('core','trainer','employee_id','core','employee','employee_id');
SELECT col_is_unique('core','calendar_week','week_start','calendar_week.week_start unique');
SELECT col_is_unique('core','public_holiday','holiday_date','public_holiday.holiday_date unique');
SELECT col_is_unique('core','metric_norm','norm_code','metric_norm.norm_code unique');
SELECT col_is_unique('core','account','account_code','account.account_code unique');
SELECT col_is_unique('core','department','dept_code','department.dept_code unique');

SELECT has_table('core','employee_skill','employee_skill exists');
SELECT has_table('core','trainer_skill','trainer_skill exists');
SELECT has_table('core','metric_norm_threshold','metric_norm_threshold exists');
SELECT fk_ok('core','employee_skill','employee_id','core','employee','employee_id');
SELECT fk_ok('core','employee_skill','skill_id','core','skill','skill_id');
SELECT fk_ok('core','employee_skill','proficiency_level_id','core','proficiency_level','proficiency_level_id');
SELECT col_has_check('core','employee_skill','years_experience','employee_skill.years_experience checked');
SELECT fk_ok('core','trainer_skill','trainer_id','core','trainer','trainer_id');
SELECT fk_ok('core','metric_norm_threshold','metric_norm_id','core','metric_norm','metric_norm_id');
SELECT col_has_check('core','metric_norm_threshold','rag','metric_norm_threshold.rag checked');
-- updated_at trigger present on employee
SELECT trigger_is('core','employee','employee_set_updated_at','core','set_updated_at',
  'employee has updated_at trigger');
-- composite uniqueness on employee_skill
SELECT col_is_unique('core','employee_skill', ARRAY['employee_id','skill_id'],
  'employee_skill unique per (employee,skill)');

SELECT * FROM finish();
ROLLBACK;
