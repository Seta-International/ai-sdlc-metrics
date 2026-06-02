create schema if not exists core;

create or replace function core.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table core.worker_type (
  worker_type_id bigint generated always as identity primary key,
  type_code text not null unique,
  name      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.employment_status (
  employment_status_id bigint generated always as identity primary key,
  status_code text not null unique,
  name        text not null,
  is_active   boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.career_level (
  career_level_id bigint generated always as identity primary key,
  level_code text not null unique,
  name       text not null,
  rank       int  not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.role (
  role_id bigint generated always as identity primary key,
  role_code text not null unique,
  name      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.skill_category (
  skill_category_id bigint generated always as identity primary key,
  category_code text not null unique,
  name          text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.proficiency_level (
  proficiency_level_id bigint generated always as identity primary key,
  prof_code text not null unique,
  name      text not null,
  rank      int  not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.project_type (
  project_type_id bigint generated always as identity primary key,
  type_code text not null unique,
  name      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.department (
  department_id bigint generated always as identity primary key,
  dept_code text not null unique,
  name      text not null,
  parent_department_id bigint references core.department(department_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.account (
  account_id bigint generated always as identity primary key,
  account_code text not null unique,
  name         text not null,
  is_internal  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.employee (
  employee_id bigint generated always as identity primary key,
  emp_code text not null unique,
  full_name text not null,
  email     text unique,
  department_id        bigint not null references core.department(department_id),
  role_id              bigint not null references core.role(role_id),
  career_level_id      bigint references core.career_level(career_level_id),
  worker_type_id       bigint not null references core.worker_type(worker_type_id),
  employment_type      text not null check (employment_type in ('FT','PT')),
  employment_status_id bigint not null references core.employment_status(employment_status_id),
  is_billable          boolean not null default true,
  std_hours_week       numeric(5,2) not null check (std_hours_week > 0),
  join_date            date not null,
  exit_date            date,
  line_manager_id      bigint references core.employee(employee_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_exit_after_join check (exit_date is null or exit_date >= join_date)
);

create table core.project (
  project_id bigint generated always as identity primary key,
  project_code text not null unique,
  name         text not null,
  account_id      bigint not null references core.account(account_id),
  project_type_id bigint not null references core.project_type(project_type_id),
  status text not null check (status in ('Active','On Hold','Completed','Cancelled')),
  is_historical boolean not null default false,
  pm_id bigint references core.employee(employee_id),
  start_date date not null,
  planned_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_end_after_start check (planned_end_date is null or planned_end_date >= start_date)
);

create table core.skill (
  skill_id bigint generated always as identity primary key,
  skill_code text not null unique,
  name       text not null,
  skill_category_id bigint not null references core.skill_category(skill_category_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.trainer (
  trainer_id bigint generated always as identity primary key,
  trainer_code text not null unique,
  employee_id  bigint references core.employee(employee_id),
  display_name text,
  availability_hours_per_month numeric(5,2) check (availability_hours_per_month >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_identity check (employee_id is not null or display_name is not null)
);

create table core.calendar_week (
  calendar_week_id bigint generated always as identity primary key,
  week_start date not null unique,
  working_days int not null check (working_days between 0 and 7),
  holiday_hours_ft numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.public_holiday (
  public_holiday_id bigint generated always as identity primary key,
  holiday_date date not null unique,
  name         text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.metric_norm (
  metric_norm_id bigint generated always as identity primary key,
  norm_code text not null unique,
  metric    text not null,
  formula   text,
  used_for  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.employee_skill (
  employee_skill_id bigint generated always as identity primary key,
  employee_id          bigint not null references core.employee(employee_id),
  skill_id             bigint not null references core.skill(skill_id),
  proficiency_level_id bigint not null references core.proficiency_level(proficiency_level_id),
  years_experience numeric(4,1) check (years_experience >= 0),
  is_primary       boolean not null default false,
  last_used_date   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, skill_id)
);

create table core.trainer_skill (
  trainer_skill_id bigint generated always as identity primary key,
  trainer_id bigint not null references core.trainer(trainer_id),
  skill_id   bigint not null references core.skill(skill_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, skill_id)
);

create table core.metric_norm_threshold (
  metric_norm_threshold_id bigint generated always as identity primary key,
  metric_norm_id bigint not null references core.metric_norm(metric_norm_id),
  rag      text not null check (rag in ('Green','Yellow','Red')),
  rule_expr text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (metric_norm_id, rag)
);

-- attach updated_at trigger to every core table that has the column
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'core' and column_name = 'updated_at'
  loop
    execute format(
      'create trigger %I before update on core.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
