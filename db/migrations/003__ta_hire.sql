create schema if not exists ta;

create table ta.business_context (
  business_context_id bigint generated always as identity primary key,
  context_code text not null unique,
  project_id bigint references core.project(project_id),
  project_name text not null,
  roadmap_summary text,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint headcount_salary_band check (salary_max_scaled >= salary_min_scaled)
);

create table ta.jd_template (
  jd_template_id bigint generated always as identity primary key,
  jd_code text not null unique,
  position text not null,
  role_id  bigint references core.role(role_id),
  jd_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.jd_required_skill (
  jd_required_skill_id bigint generated always as identity primary key,
  jd_id    bigint not null references ta.jd_template(jd_template_id),
  skill_id bigint not null references core.skill(skill_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jd_id, skill_id)
);

create table ta.scorecard (
  scorecard_id bigint generated always as identity primary key,
  scorecard_code text not null unique,
  role_id  bigint references core.role(role_id),
  position text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.scorecard_criterion (
  scorecard_criterion_id bigint generated always as identity primary key,
  scorecard_id bigint not null references ta.scorecard(scorecard_id),
  criteria text not null,
  weight numeric(4,3) not null check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scorecard_id, criteria)
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
