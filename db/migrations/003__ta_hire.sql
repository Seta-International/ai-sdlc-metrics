create schema if not exists ta;

create table ta.business_context (
  business_context_id bigint generated always as identity primary key,
  context_code text not null unique,
  project_id bigint references core.project(project_id),
  project_name text not null,
  roadmap_summary text,
  business_unit text,
  strategic_priority text,
  project_stage text,
  requested_by text,
  request_date date,
  team_size_current int,
  hiring_urgency text,
  budget_approved text,
  additional_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.headcount_plan (
  headcount_plan_id bigint generated always as identity primary key,
  hc_plan_code text not null unique,
  context_id bigint references ta.business_context(business_context_id),
  position text not null,
  role_id  bigint references core.role(role_id),
  headcount int not null check (headcount > 0),
  salary_min_scaled numeric(6,2),
  salary_max_scaled numeric(6,2),
  target_start_date date,
  quarter text,
  seniority_level text,
  filled_count int,
  salary_range text,
  approval_status text,
  approved_by text,
  priority text,
  jd_status text,
  linked_jd_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint headcount_salary_band check (salary_max_scaled >= salary_min_scaled)
);

create table ta.jd_template (
  jd_template_id bigint generated always as identity primary key,
  jd_code text not null unique,
  position text not null,
  role_id  bigint references core.role(role_id),
  hc_plan_id bigint references ta.headcount_plan(headcount_plan_id),
  jd_type text not null default 'Template'
    check (jd_type in ('Template', 'Custom')),
  jd_status text not null default 'In Draft'
    check (jd_status in ('In Draft', 'Not Started', 'Ready', 'Approved', 'Archived')),
  jd_version text not null,
  last_updated date,
  min_yoe int check (min_yoe >= 0),
  max_yoe int check (max_yoe >= 0),
  seniority_level text
    check (seniority_level in ('Junior', 'Mid', 'Senior', 'Lead', 'Principal')),
  english_level_required text
    check (english_level_required in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  work_mode text
    check (work_mode in ('On-site', 'Hybrid', 'Remote', 'Any')),
  salary_min_scaled numeric(6,2),
  salary_max_scaled numeric(6,2),
  must_have_skills text,
  nice_to_have_skills text,
  key_responsibilities text,
  jd_full_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.jd_required_skill (
  jd_required_skill_id bigint generated always as identity primary key,
  jd_id    bigint not null references ta.jd_template(jd_template_id),
  skill_id bigint not null references core.skill(skill_id),
  skill_type text not null default 'must_have'
    check (skill_type in ('must_have', 'nice_to_have')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jd_id, skill_id)
);

create table ta.scorecard (
  scorecard_id bigint generated always as identity primary key,
  scorecard_code text not null unique,
  role_id  bigint references core.role(role_id),
  position text not null,
  scorecard_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.scorecard_criterion (
  scorecard_criterion_id bigint generated always as identity primary key,
  scorecard_id bigint not null references ta.scorecard(scorecard_id),
  criteria text not null,
  weight numeric(4,3) not null check (weight >= 0 and weight <= 1),
  interview_stage text,
  description text,
  passing_threshold text,
  sample_questions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scorecard_id, criteria)
);

create table ta.team_skills_matrix (
  team_skills_matrix_id bigint generated always as identity primary key,
  member_id text not null,
  member_role text,
  team_name text,
  seniority_level text,
  skill text not null,
  proficiency_level text,
  last_assessed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, skill)
);

create table ta.hire_request (
  hire_request_id bigint generated always as identity primary key,
  request_code text not null unique,
  context_id bigint references ta.business_context(business_context_id),
  hc_plan_id bigint references ta.headcount_plan(headcount_plan_id),
  request_date date,
  requesting_manager text,
  position_title text,
  urgency_level text,
  headcount_requested int,
  business_justification text,
  team_skill_gap_summary text,
  key_deliverables text,
  approval_status text,
  approved_by text,
  approval_date date,
  hr_owner text,
  target_jd_id text,
  request_status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.shortlist_cv (
  shortlist_cv_id bigint generated always as identity primary key,
  cv_code text not null unique,
  request_id bigint references ta.hire_request(hire_request_id),
  hc_plan_id bigint references ta.headcount_plan(headcount_plan_id),
  jd_id bigint references ta.jd_template(jd_template_id),
  candidate_id bigint,  -- FK to ta.candidate added in 004__ta_screening
  full_name text,
  current_title text,
  current_company text,
  past_companies text,
  years_of_experience numeric(4,1),
  cv_skills text,
  english_level text,
  salary_expectation text,
  shortlisted_by text,
  shortlisted_date date,
  cv_summary_by_ta text,
  agent_recommendation text,
  agent_fit_score numeric(3,1),
  agent_fit_summary text,
  agent_gap_summary text,
  agent_suggested_questions text,
  agent_shortlist_rank int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.hm_feedback_tracker (
  hm_feedback_tracker_id bigint generated always as identity primary key,
  feedback_code text not null unique,
  cv_id bigint references ta.shortlist_cv(shortlist_cv_id),
  request_id bigint references ta.hire_request(hire_request_id),
  jd_id bigint references ta.jd_template(jd_template_id),
  candidate_name text,
  position text,
  hiring_manager text,
  shortlisted_datetime timestamptz,
  feedback_deadline_48h timestamptz,
  sla_breach text,
  reminder_24h_sent text,
  reminder_36h_sent text,
  escalation_48h_sent text,
  feedback_status text,
  hm_decision text,
  feedback_submitted_datetime timestamptz,
  hm_feedback_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- attach updated_at trigger to every ta base table (views have no updated_at column)
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'ta' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger %I before update on ta.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
