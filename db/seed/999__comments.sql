-- ===== core =====
COMMENT ON COLUMN core.account.account_code        IS 'Natural key, e.g. ACC-A';
COMMENT ON COLUMN core.account.name                IS 'Client or internal account name';
COMMENT ON COLUMN core.account.is_internal         IS 'True for bench/internal accounts (no external billing)';

COMMENT ON COLUMN core.calendar_week.week_start        IS 'Monday of the ISO week (date)';
COMMENT ON COLUMN core.calendar_week.working_days      IS 'Working days in this week (0–7)';
COMMENT ON COLUMN core.calendar_week.holiday_hours_ft  IS 'Holiday hours for full-time staff in this week';

COMMENT ON COLUMN core.career_level.level_code  IS 'Natural key, e.g. L1–L7';
COMMENT ON COLUMN core.career_level.name        IS 'Label: Intern, Junior, Mid, Senior, Lead, Principal/Manager, Executive';
COMMENT ON COLUMN core.career_level.rank        IS 'Numeric rank for ordering (1 = most junior)';

COMMENT ON COLUMN core.department.dept_code           IS 'Natural key, e.g. ENG, BE, FE';
COMMENT ON COLUMN core.department.name                IS 'Department display name';
COMMENT ON COLUMN core.department.parent_department_id IS 'Self-referencing FK for org hierarchy';

COMMENT ON COLUMN core.employee.emp_code          IS 'Natural key, e.g. EMP-0001';
COMMENT ON COLUMN core.employee.full_name         IS 'Vietnamese full name';
COMMENT ON COLUMN core.employee.email             IS 'Work email, domain @hackathon.com';
COMMENT ON COLUMN core.employee.employment_type   IS 'FT = full-time, PT = part-time';
COMMENT ON COLUMN core.employee.is_billable       IS 'Whether hours are billed to a client account';
COMMENT ON COLUMN core.employee.std_hours_week    IS 'Contracted standard hours per week';
COMMENT ON COLUMN core.employee.join_date         IS 'Employment start date';
COMMENT ON COLUMN core.employee.exit_date         IS 'Employment end date (NULL if still active)';

COMMENT ON COLUMN core.employee_skill.years_experience IS 'Self-reported years of experience with this skill';
COMMENT ON COLUMN core.employee_skill.is_primary       IS 'True if this is the employee''s primary / headline skill';
COMMENT ON COLUMN core.employee_skill.last_used_date   IS 'Date the skill was last used on a project';

COMMENT ON COLUMN core.employment_status.status_code IS 'Natural key: Active, Probation, On Leave, Resigned, PIP';
COMMENT ON COLUMN core.employment_status.name        IS 'Human-readable label';
COMMENT ON COLUMN core.employment_status.is_active   IS 'False only for Resigned; used to filter active headcount';

COMMENT ON COLUMN core.metric_norm.norm_code  IS 'Natural key, e.g. N01–N12';
COMMENT ON COLUMN core.metric_norm.metric     IS 'Metric name, e.g. Busy Rate';
COMMENT ON COLUMN core.metric_norm.formula    IS 'Calculation formula as text';
COMMENT ON COLUMN core.metric_norm.used_for   IS 'Business purpose of the metric';

COMMENT ON COLUMN core.metric_norm_threshold.rag       IS 'RAG band: Green, Yellow, or Red';
COMMENT ON COLUMN core.metric_norm_threshold.rule_expr IS 'Threshold expression, e.g. >=80%';

COMMENT ON COLUMN core.proficiency_level.prof_code IS 'Natural key: Beginner, Intermediate, Advanced';
COMMENT ON COLUMN core.proficiency_level.name      IS 'Display label';
COMMENT ON COLUMN core.proficiency_level.rank      IS 'Numeric rank for ordering (1 = lowest)';

COMMENT ON COLUMN core.project.project_code      IS 'Natural key, e.g. PRJ-001 or PRJ-H-101 for historical';
COMMENT ON COLUMN core.project.name              IS 'Project display name (Vietnamese client context)';
COMMENT ON COLUMN core.project.status            IS 'Active, On Hold, Completed, or Cancelled';
COMMENT ON COLUMN core.project.is_historical     IS 'True for completed benchmark projects used in PMO analysis';
COMMENT ON COLUMN core.project.start_date        IS 'Project kick-off date';
COMMENT ON COLUMN core.project.planned_end_date  IS 'Original planned completion date';

COMMENT ON COLUMN core.project_type.type_code IS 'Natural key, e.g. Software/Migration, AI/ML Platform';
COMMENT ON COLUMN core.project_type.name      IS 'Display label';

COMMENT ON COLUMN core.public_holiday.holiday_date IS 'Calendar date of the holiday';
COMMENT ON COLUMN core.public_holiday.name         IS 'Holiday name (Vietnamese)';

COMMENT ON COLUMN core.role.role_code IS 'Natural key, e.g. BE, FE, QA, PM';
COMMENT ON COLUMN core.role.name      IS 'Full role title';

COMMENT ON COLUMN core.skill.skill_code IS 'Natural key, e.g. python, k8s, react';
COMMENT ON COLUMN core.skill.name       IS 'Display name';

COMMENT ON COLUMN core.skill_category.category_code IS 'Natural key: technical, soft, certification, language, leadership';
COMMENT ON COLUMN core.skill_category.name          IS 'Display label';

COMMENT ON COLUMN core.trainer.trainer_code                  IS 'Natural key, e.g. TRN-001';
COMMENT ON COLUMN core.trainer.display_name                  IS 'Override display name — populated for external trainers without an employee record';
COMMENT ON COLUMN core.trainer.availability_hours_per_month  IS 'Max training hours this trainer can deliver per month';

COMMENT ON COLUMN core.worker_type.type_code IS 'Natural key: Permanent, Contractor, Subcontractor, Intern';
COMMENT ON COLUMN core.worker_type.name      IS 'Display label';

-- ===== pmo =====
COMMENT ON COLUMN pmo.historical_benchmark.team_size             IS 'Number of people on the project';
COMMENT ON COLUMN pmo.historical_benchmark.duration_days         IS 'Actual duration in calendar days';
COMMENT ON COLUMN pmo.historical_benchmark.planned_duration_days IS 'Originally planned duration in calendar days';
COMMENT ON COLUMN pmo.historical_benchmark.total_effort_days     IS 'Sum of all effort in person-days';
COMMENT ON COLUMN pmo.historical_benchmark.total_budget_scaled   IS 'Total budget (scaled/anonymised monetary unit)';
COMMENT ON COLUMN pmo.historical_benchmark.avg_velocity_ratio    IS 'Average completed/planned story-point ratio across sprints';
COMMENT ON COLUMN pmo.historical_benchmark.risk_count            IS 'Number of risks registered during the project';
COMMENT ON COLUMN pmo.historical_benchmark.key_risks             IS 'Summary of top risks (Vietnamese)';
COMMENT ON COLUMN pmo.historical_benchmark.pmo_standard_ver      IS 'PMO template version used, e.g. 2.1';
COMMENT ON COLUMN pmo.historical_benchmark.final_outcome         IS 'On Time, Early, or Late';
COMMENT ON COLUMN pmo.historical_benchmark.is_outlier            IS 'True for POC / non-representative projects excluded from benchmark analysis';

COMMENT ON COLUMN pmo.leave_record.leave_record_code IS 'Natural key';
COMMENT ON COLUMN pmo.leave_record.leave_date        IS 'Date of leave';
COMMENT ON COLUMN pmo.leave_record.leave_type        IS 'Type: Annual, Sick, Compensatory, etc.';
COMMENT ON COLUMN pmo.leave_record.approved          IS 'Whether the leave was approved';
COMMENT ON COLUMN pmo.leave_record.duration_days     IS 'Duration in days (0.5 for half-day)';
COMMENT ON COLUMN pmo.leave_record.note              IS 'Optional free-text note';

COMMENT ON COLUMN pmo.overbook_idle_config.config_code             IS 'Natural key for the config record';
COMMENT ON COLUMN pmo.overbook_idle_config.rule_name               IS 'Human label for this config set';
COMMENT ON COLUMN pmo.overbook_idle_config.overbook_threshold      IS 'Allocation % above which an employee is considered overbooked (e.g. 1.10)';
COMMENT ON COLUMN pmo.overbook_idle_config.overbook_red_threshold  IS 'Allocation % for hard-red overbook alert (e.g. 1.30)';
COMMENT ON COLUMN pmo.overbook_idle_config.idle_threshold          IS 'Allocation % below which an employee is considered idle (e.g. 0.20)';
COMMENT ON COLUMN pmo.overbook_idle_config.mismatch_pct_threshold  IS 'Allowed variance between planned and logged hours before flagging mismatch';
COMMENT ON COLUMN pmo.overbook_idle_config.ot_max_hours_per_week   IS 'OT hours/week threshold for burnout alert';
COMMENT ON COLUMN pmo.overbook_idle_config.effective_date          IS 'Date from which this config is active';

COMMENT ON COLUMN pmo.plan.plan_code               IS 'Natural key, e.g. PLAN-001';
COMMENT ON COLUMN pmo.plan.plan_set                IS 'Review stage label, e.g. To_Review';
COMMENT ON COLUMN pmo.plan.planned_duration_months IS 'Planned project length in months';
COMMENT ON COLUMN pmo.plan.team_size_planned       IS 'Planned headcount for the project';
COMMENT ON COLUMN pmo.plan.registered_risk_count   IS 'Number of risks entered in the plan';
COMMENT ON COLUMN pmo.plan.top_risk_score          IS 'Highest individual risk score (0–100)';
COMMENT ON COLUMN pmo.plan.thi_pct                 IS 'Technical Health Index — % of non-development effort';
COMMENT ON COLUMN pmo.plan.peak_role_busy_rate_pct IS 'Highest role-level busy rate across all allocated roles';
COMMENT ON COLUMN pmo.plan.on_time_history_pct     IS '% of historical projects of this type delivered on time';
COMMENT ON COLUMN pmo.plan.feasibility_status      IS 'AI/PMO feasibility verdict (Vietnamese), e.g. Khả thi (Xanh)';

COMMENT ON COLUMN pmo.plan_section_check.custom_name IS 'Override name for a template component in this plan';
COMMENT ON COLUMN pmo.plan_section_check.status      IS 'Completion status: Done, Partial, Missing';
COMMENT ON COLUMN pmo.plan_section_check.note        IS 'Reviewer note on this section';

COMMENT ON COLUMN pmo.plan_task.task_code        IS 'Natural key, e.g. TASK-O01';
COMMENT ON COLUMN pmo.plan_task.task_name        IS 'Task description (Vietnamese)';
COMMENT ON COLUMN pmo.plan_task.start_date       IS 'Planned start date';
COMMENT ON COLUMN pmo.plan_task.end_date         IS 'Planned end date';
COMMENT ON COLUMN pmo.plan_task.effort_days      IS 'Estimated effort in person-days';
COMMENT ON COLUMN pmo.plan_task.percent_complete IS 'Progress 0.00–1.00';
COMMENT ON COLUMN pmo.plan_task.status           IS 'Not Started, In Progress, or Completed';
COMMENT ON COLUMN pmo.plan_task.is_milestone     IS 'True if this task is a milestone gate';
COMMENT ON COLUMN pmo.plan_task.phase            IS 'Project phase: Discovery, Design, Development, Testing, Deployment';
COMMENT ON COLUMN pmo.plan_task.risk_note        IS 'Free-text risk flag for this task (Vietnamese)';

COMMENT ON COLUMN pmo.plan_template.template_code  IS 'Natural key, e.g. TPL-2026-v3';
COMMENT ON COLUMN pmo.plan_template.name           IS 'Template display name (Vietnamese)';
COMMENT ON COLUMN pmo.plan_template.version        IS 'Semantic version string';
COMMENT ON COLUMN pmo.plan_template.effective_date IS 'Date this template version became active';

COMMENT ON COLUMN pmo.resource_allocation.allocation_pct IS 'Fraction of the employee''s time allocated (0–1, can exceed 1.0 = overbooked)';
COMMENT ON COLUMN pmo.resource_allocation.start_date     IS 'Allocation start date';
COMMENT ON COLUMN pmo.resource_allocation.end_date       IS 'Allocation end date';

COMMENT ON COLUMN pmo.role_capacity.headcount          IS 'Number of employees in this role';
COMMENT ON COLUMN pmo.role_capacity.capacity_md_month  IS 'Total available man-days per month for this role';
COMMENT ON COLUMN pmo.role_capacity.busy_rate_pct      IS 'Current busy rate % for this role';
COMMENT ON COLUMN pmo.role_capacity.available_md_month IS 'Available (unallocated) man-days per month';
COMMENT ON COLUMN pmo.role_capacity.note               IS 'Capacity commentary (Vietnamese)';

COMMENT ON COLUMN pmo.template_component.component_code  IS 'Natural key, e.g. COMP-001';
COMMENT ON COLUMN pmo.template_component.section_code    IS 'Short section identifier, e.g. S01';
COMMENT ON COLUMN pmo.template_component.component_name  IS 'Component display name';
COMMENT ON COLUMN pmo.template_component.is_required     IS 'Whether this component is mandatory in all plans';
COMMENT ON COLUMN pmo.template_component.validation_rule IS 'Rule description for AI/PMO validation';
COMMENT ON COLUMN pmo.template_component.weight          IS 'Weight in plan completeness score (all weights sum to 1.000)';

COMMENT ON COLUMN pmo.timesheet_log.work_date     IS 'Date the hours were logged';
COMMENT ON COLUMN pmo.timesheet_log.logged_hours  IS 'Hours logged for this entry';
COMMENT ON COLUMN pmo.timesheet_log.log_category  IS 'Category: Development, Meeting, Admin, Leave, etc.';
COMMENT ON COLUMN pmo.timesheet_log.task_ref      IS 'Optional reference to a task code';

COMMENT ON COLUMN pmo.velocity_history.sprint_no            IS 'Sequential sprint number within the project';
COMMENT ON COLUMN pmo.velocity_history.sprint_duration_days IS 'Sprint length in days';
COMMENT ON COLUMN pmo.velocity_history.planned_points       IS 'Story points planned for this sprint';
COMMENT ON COLUMN pmo.velocity_history.completed_points     IS 'Story points completed';
COMMENT ON COLUMN pmo.velocity_history.team_size            IS 'Team size during this sprint';
COMMENT ON COLUMN pmo.velocity_history.outcome              IS 'Sprint outcome: Completed, Partial, Failed';

-- ===== ta =====
COMMENT ON COLUMN ta.business_context.context_code    IS 'Natural key, e.g. CTX-001';
COMMENT ON COLUMN ta.business_context.project_name    IS 'Project name this hiring context supports (Vietnamese)';
COMMENT ON COLUMN ta.business_context.roadmap_summary IS 'Brief hiring rationale linked to the project roadmap (Vietnamese)';

COMMENT ON COLUMN ta.candidate.candidate_code               IS 'Natural key, e.g. CAND-1001';
COMMENT ON COLUMN ta.candidate.full_name                    IS 'Candidate full name (Vietnamese)';
COMMENT ON COLUMN ta.candidate.email                        IS 'Candidate email @hackathon.com';
COMMENT ON COLUMN ta.candidate.phone                        IS 'Candidate phone number';
COMMENT ON COLUMN ta.candidate.applied_position             IS 'Job title applied for';
COMMENT ON COLUMN ta.candidate.salary_expectation_min_scaled IS 'Minimum salary expectation (scaled monetary unit)';
COMMENT ON COLUMN ta.candidate.salary_expectation_max_scaled IS 'Maximum salary expectation (scaled monetary unit)';
COMMENT ON COLUMN ta.candidate.status                       IS 'Screening outcome: Passed, Failed, Rejected, In-pool';
COMMENT ON COLUMN ta.candidate.source                       IS 'Recruitment channel: LinkedIn, TopCV, FB, Email';

COMMENT ON COLUMN ta.headcount_plan.hc_plan_code         IS 'Natural key, e.g. HC-2025-Q2-001';
COMMENT ON COLUMN ta.headcount_plan.position             IS 'Job title for this headcount request';
COMMENT ON COLUMN ta.headcount_plan.headcount            IS 'Number of positions to fill';
COMMENT ON COLUMN ta.headcount_plan.salary_min_scaled    IS 'Minimum offered salary (scaled)';
COMMENT ON COLUMN ta.headcount_plan.salary_max_scaled    IS 'Maximum offered salary (scaled)';
COMMENT ON COLUMN ta.headcount_plan.target_start_date    IS 'Target onboarding date for new hires';
COMMENT ON COLUMN ta.headcount_plan.quarter              IS 'Planning quarter, e.g. 2025-Q2';

COMMENT ON COLUMN ta.jd_template.jd_code     IS 'Natural key, e.g. JD-BE-SR-001';
COMMENT ON COLUMN ta.jd_template.position    IS 'Job title this JD covers';
COMMENT ON COLUMN ta.jd_template.jd_version  IS 'Version string, e.g. v2.0';

COMMENT ON COLUMN ta.outreach_template.template_code    IS 'Natural key, e.g. OUT-001';
COMMENT ON COLUMN ta.outreach_template.channel          IS 'Outreach channel: LinkedIn, Email, TopCV';
COMMENT ON COLUMN ta.outreach_template.template_content IS 'Message template with {name}, {skill}, {position} placeholders';

COMMENT ON COLUMN ta.scorecard.scorecard_code IS 'Natural key, e.g. SC-BE-SR-001';
COMMENT ON COLUMN ta.scorecard.position       IS 'Job title this scorecard applies to';

COMMENT ON COLUMN ta.scorecard_criterion.criteria IS 'Evaluation criterion name';
COMMENT ON COLUMN ta.scorecard_criterion.weight   IS 'Weight in final score (all weights per scorecard sum to 1.000)';

COMMENT ON COLUMN ta.screening_criteria.criteria_code IS 'Natural key, e.g. SCR-BE-001';
COMMENT ON COLUMN ta.screening_criteria.position      IS 'Job title this screening criteria applies to';

COMMENT ON COLUMN ta.screening_criteria_skill.skill_type IS 'must_have or nice_to_have';

-- ===== elc =====
COMMENT ON COLUMN elc.performance_norm.norm_code            IS 'Natural key, e.g. NORM-P01';
COMMENT ON COLUMN elc.performance_norm.category             IS 'KPI Score, Timesheet, Resource Allocation, Violation, Composite Risk, Report Guard';
COMMENT ON COLUMN elc.performance_norm.rule_description     IS 'Human-readable rule description';
COMMENT ON COLUMN elc.performance_norm.threshold            IS 'Trigger condition expression';
COMMENT ON COLUMN elc.performance_norm.classification_label IS 'Label assigned when rule triggers, e.g. At Risk';
COMMENT ON COLUMN elc.performance_norm.action_if_triggered  IS 'Recommended HR action when triggered';
COMMENT ON COLUMN elc.performance_norm.priority             IS 'Rule priority: Low, Medium, High, Critical';
COMMENT ON COLUMN elc.performance_norm.applies_to           IS 'Scope, e.g. All employees, Senior employees (L5+)';

COMMENT ON COLUMN elc.performance_review.report_period      IS 'Month reviewed in YYYY-MM format';
COMMENT ON COLUMN elc.performance_review.total_point        IS 'Performance score 0–5';
COMMENT ON COLUMN elc.performance_review.classification     IS 'Excellent, Good, Meets Expectations, Below Expectations, Poor';
COMMENT ON COLUMN elc.performance_review.feedback_category  IS 'Short narrative feedback label (Vietnamese)';

COMMENT ON COLUMN elc.promotion_intent.readiness_score IS 'Readiness score 0–1 for promotion to target level';

COMMENT ON COLUMN elc.salary_band.salary_band    IS 'Salary band label or range description';
COMMENT ON COLUMN elc.salary_band.effective_date IS 'Date from which this band applies';

COMMENT ON COLUMN elc.timesheet_monthly.report_period           IS 'Month in YYYY-MM format';
COMMENT ON COLUMN elc.timesheet_monthly.work_days_in_month      IS 'Total working days in the month';
COMMENT ON COLUMN elc.timesheet_monthly.days_probation          IS 'Days under probation status';
COMMENT ON COLUMN elc.timesheet_monthly.days_official           IS 'Days on official leave (approved)';
COMMENT ON COLUMN elc.timesheet_monthly.days_holiday_official   IS 'Days on public holiday';
COMMENT ON COLUMN elc.timesheet_monthly.days_leave_approved     IS 'Days on approved annual/sick leave';
COMMENT ON COLUMN elc.timesheet_monthly.days_late               IS 'Number of late-arrival days';
COMMENT ON COLUMN elc.timesheet_monthly.days_absent_unapproved  IS 'Unapproved absent days (policy violation)';
COMMENT ON COLUMN elc.timesheet_monthly.actual_work_days        IS 'Days actually worked';
COMMENT ON COLUMN elc.timesheet_monthly.ot_hours_weekday        IS 'Overtime hours on weekdays';
COMMENT ON COLUMN elc.timesheet_monthly.ot_hours_weekend        IS 'Overtime hours on weekends';
COMMENT ON COLUMN elc.timesheet_monthly.ot_hours_holiday        IS 'Overtime hours on public holidays';
COMMENT ON COLUMN elc.timesheet_monthly.total_ot_hours          IS 'Total overtime hours in the month';
COMMENT ON COLUMN elc.timesheet_monthly.night_shift_hours       IS 'Hours worked during night shift (22:00–06:00)';

COMMENT ON COLUMN elc.violation.violation_code      IS 'Natural key, e.g. VIO-0055';
COMMENT ON COLUMN elc.violation.violation_type_code IS 'FK to violation_type, e.g. CON-02';
COMMENT ON COLUMN elc.violation.severity            IS 'Low, Medium, High, or Critical';
COMMENT ON COLUMN elc.violation.consequence         IS 'Consequence applied, e.g. Final warning / PIP';
COMMENT ON COLUMN elc.violation.status              IS 'Open, Under Review, Resolved, Escalated, Closed - No Action';
COMMENT ON COLUMN elc.violation.incident_date       IS 'Date the violation occurred';
COMMENT ON COLUMN elc.violation.reported_by         IS 'Reporter code: HR-001, MGR-XXX, PEER-ANON, SELF';
COMMENT ON COLUMN elc.violation.action_taken        IS 'Action taken or current status note (Vietnamese)';

COMMENT ON COLUMN elc.violation_type.violation_type_code  IS 'Natural key, e.g. ATT-01, CON-03';
COMMENT ON COLUMN elc.violation_type.category             IS 'Attendance, Attitude, Performance, Policy, Conduct';
COMMENT ON COLUMN elc.violation_type.violation_type_desc  IS 'Description of this violation type';
COMMENT ON COLUMN elc.violation_type.typical_severity     IS 'Default severity: Low, Medium, or High';
COMMENT ON COLUMN elc.violation_type.typical_consequence  IS 'Default consequence text';

-- ===== lnd =====
COMMENT ON COLUMN lnd.assessment_score.score_0_to_10      IS 'Score on a 0–10 scale; 0.0 = did not submit';
COMMENT ON COLUMN lnd.assessment_score.pass_status        IS 'True if score >= course pass_threshold_score';
COMMENT ON COLUMN lnd.assessment_score.generalized_feedback IS 'Trainer feedback summary for the trainee';

COMMENT ON COLUMN lnd.attendance_log.session_no         IS 'Session number within the course (1-indexed)';
COMMENT ON COLUMN lnd.attendance_log.attendance_status  IS 'Present, Absent, or Late';
COMMENT ON COLUMN lnd.attendance_log.training_hours     IS 'Hours of training for this session';

COMMENT ON COLUMN lnd.bod_training_goal.goal_code        IS 'Natural key, e.g. GOAL-2026-04';
COMMENT ON COLUMN lnd.bod_training_goal.goal_description IS 'Strategic L&D goal set by BOD (Vietnamese)';
COMMENT ON COLUMN lnd.bod_training_goal.target_quarter   IS 'Target delivery quarter, e.g. Q2_2026';

COMMENT ON COLUMN lnd.course_catalog.course_code          IS 'Natural key, e.g. Golang_04_2026';
COMMENT ON COLUMN lnd.course_catalog.course_name          IS 'Course display name';
COMMENT ON COLUMN lnd.course_catalog.topic_category       IS 'Topic grouping, e.g. Backend Development, AI/ML';
COMMENT ON COLUMN lnd.course_catalog.total_sessions       IS 'Number of sessions in the course';
COMMENT ON COLUMN lnd.course_catalog.hours_per_session    IS 'Duration of each session in hours';
COMMENT ON COLUMN lnd.course_catalog.total_hours          IS 'Total training hours (sessions × hours_per_session)';
COMMENT ON COLUMN lnd.course_catalog.pass_threshold_score IS 'Minimum score (0–10) required to pass';
COMMENT ON COLUMN lnd.course_catalog.start_date           IS 'Course start date';
COMMENT ON COLUMN lnd.course_catalog.end_date             IS 'Course end date';
COMMENT ON COLUMN lnd.course_catalog.status               IS 'Planned, In Progress, or Completed';

COMMENT ON COLUMN lnd.employee_skill_gap.gap_source IS 'Source of the gap: Project, Role, or Market';
COMMENT ON COLUMN lnd.employee_skill_gap.priority   IS 'Gap priority: Low, Medium, or High';
COMMENT ON COLUMN lnd.employee_skill_gap.note       IS 'Context note explaining the gap';

COMMENT ON COLUMN lnd.feedback_survey.trainer_rating  IS 'Trainer rating 1–5';
COMMENT ON COLUMN lnd.feedback_survey.content_rating  IS 'Content quality rating 1–5';
COMMENT ON COLUMN lnd.feedback_survey.comment         IS 'Free-text feedback comment (Vietnamese)';

COMMENT ON COLUMN lnd.project_required_skill.is_critical IS 'True if this skill is a hard requirement for the project';

COMMENT ON COLUMN lnd.report_template_section.section_code        IS 'Natural key, e.g. SEC-01';
COMMENT ON COLUMN lnd.report_template_section.section_name        IS 'Section display name';
COMMENT ON COLUMN lnd.report_template_section.content_description IS 'What this section should contain';
COMMENT ON COLUMN lnd.report_template_section.data_source         IS 'Data source codes for this section, e.g. DS07+DS08';
COMMENT ON COLUMN lnd.report_template_section.is_required         IS 'Whether this section is mandatory in the report';

COMMENT ON COLUMN lnd.training_cost.cost_per_session_scaled    IS 'Cost per session (scaled monetary unit)';
COMMENT ON COLUMN lnd.training_cost.total_cost_scaled          IS 'Total course cost (scaled)';
COMMENT ON COLUMN lnd.training_cost.post_training_perf_delta   IS 'Avg performance score change after training (NULL for in-progress)';

COMMENT ON COLUMN lnd.training_need_survey.survey_response_code IS 'Natural key, e.g. SUR-2025Q4-EMP-0003';
COMMENT ON COLUMN lnd.training_need_survey.survey_wave          IS 'Survey batch identifier, e.g. SUR_2025_Q4';
COMMENT ON COLUMN lnd.training_need_survey.training_topic       IS 'Requested training topic (Vietnamese)';
COMMENT ON COLUMN lnd.training_need_survey.priority             IS 'Employee-stated priority: Low, Medium, High';
COMMENT ON COLUMN lnd.training_need_survey.delivery_mode_hint   IS 'Preferred delivery: internal, online, self-learning';

COMMENT ON COLUMN lnd.training_norm.rule_code          IS 'Natural key, e.g. NORM-01';
COMMENT ON COLUMN lnd.training_norm.category           IS 'Effectiveness, Attendance, Individual, Trainer, ROI, Reporting, Feedback';
COMMENT ON COLUMN lnd.training_norm.rule_description   IS 'Human-readable rule description';
COMMENT ON COLUMN lnd.training_norm.threshold          IS 'Trigger condition expression';
COMMENT ON COLUMN lnd.training_norm.action_if_triggered IS 'Action to take when rule fires';
COMMENT ON COLUMN lnd.training_norm.priority           IS 'Rule priority: Low, Medium, High';
