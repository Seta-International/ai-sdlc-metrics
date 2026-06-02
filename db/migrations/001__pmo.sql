create schema if not exists pmo;

create table pmo.plan_template (
  plan_template_id bigint generated always as identity primary key,
  template_code text not null unique,
  name      text not null,
  version   text not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pmo.template_component (
  template_component_id bigint generated always as identity primary key,
  plan_template_id bigint not null references pmo.plan_template(plan_template_id),
  component_code text not null,
  section_code   text not null,
  component_name text not null,
  is_required boolean not null default true,
  validation_rule text,
  weight numeric(4,3) not null check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_template_id, component_code)
);

create table pmo.plan (
  plan_id bigint generated always as identity primary key,
  plan_code text not null unique,
  project_id bigint not null references core.project(project_id),
  plan_template_id bigint not null references pmo.plan_template(plan_template_id),
  plan_set text,
  planned_duration_months numeric(5,2),
  team_size_planned int,
  registered_risk_count int not null default 0,
  top_risk_score numeric(5,2),
  thi_pct numeric(5,2),
  peak_role_busy_rate_pct numeric(6,2),
  on_time_history_pct numeric(5,2),
  feasibility_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pmo.plan_section_check (
  plan_section_check_id bigint generated always as identity primary key,
  plan_id bigint not null references pmo.plan(plan_id),
  template_component_id bigint references pmo.template_component(template_component_id),
  custom_name text,
  status text not null check (status in ('Complete','Weak','Missing','Custom')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint section_check_component_xor
    check ( (template_component_id is not null and custom_name is null)
         or (template_component_id is null and custom_name is not null) )
);

create table pmo.plan_task (
  plan_task_id bigint generated always as identity primary key,
  plan_id bigint not null references pmo.plan(plan_id),
  task_code text not null,
  task_name text not null,
  assignee_id bigint references core.employee(employee_id),
  start_date date not null,
  end_date   date not null,
  effort_days numeric(6,2) not null check (effort_days >= 0),
  percent_complete numeric(3,2) not null default 0 check (percent_complete between 0 and 1),
  status text not null check (status in ('Not Started','In Progress','Completed','Blocked','Delayed')),
  is_milestone boolean not null default false,
  phase  text not null check (phase in ('Discovery','Design','Development','Testing','Deployment')),
  risk_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, task_code),
  constraint plan_task_end_after_start check (end_date >= start_date)
);

create table pmo.plan_task_dependency (
  plan_task_dependency_id bigint generated always as identity primary key,
  plan_task_id       bigint not null references pmo.plan_task(plan_task_id),
  depends_on_task_id bigint not null references pmo.plan_task(plan_task_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_task_id, depends_on_task_id),
  constraint dependency_no_self check (plan_task_id <> depends_on_task_id)
);

create table pmo.resource_allocation (
  resource_allocation_id bigint generated always as identity primary key,
  employee_id bigint not null references core.employee(employee_id),
  project_id  bigint not null references core.project(project_id),
  role_id     bigint not null references core.role(role_id),
  allocation_pct numeric(4,2) not null check (allocation_pct > 0),
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, project_id, start_date),
  constraint allocation_end_after_start check (end_date >= start_date)
);

create table pmo.role_capacity (
  role_capacity_id bigint generated always as identity primary key,
  role_id bigint not null references core.role(role_id) unique,
  headcount int not null,
  capacity_md_month numeric(7,2) not null,
  busy_rate_pct numeric(6,2) not null,
  available_md_month numeric(7,2) not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pmo.historical_benchmark (
  historical_benchmark_id bigint generated always as identity primary key,
  project_id bigint not null references core.project(project_id) unique,
  team_size int,
  duration_days int,
  planned_duration_days int,
  total_effort_days numeric(8,2),
  total_budget_scaled numeric(8,2),
  avg_velocity_ratio numeric(4,3),
  risk_count int,
  key_risks text,
  pmo_standard_ver text,
  final_outcome text check (final_outcome in ('On Time','Delayed','Cancelled','Early')),
  is_outlier boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pmo.velocity_history (
  velocity_history_id bigint generated always as identity primary key,
  project_id bigint not null references core.project(project_id),
  sprint_no int not null,
  sprint_duration_days int not null,
  planned_points numeric(6,2) not null,
  completed_points numeric(6,2) not null,
  velocity_ratio numeric generated always as (completed_points / nullif(planned_points,0)) stored,
  team_size int,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, sprint_no)
);

create view pmo.v_plan_summary as
select p.plan_id, p.plan_code, p.project_id,
       coalesce(sum(t.effort_days),0) as effort_md,
       count(t.plan_task_id) as task_count,
       count(t.plan_task_id) filter (where t.is_milestone) as milestone_count,
       case when p.planned_duration_months > 0
            then coalesce(sum(t.effort_days),0) / p.planned_duration_months end as velocity_md_month,
       p.team_size_planned, p.registered_risk_count, p.thi_pct,
       p.peak_role_busy_rate_pct, p.on_time_history_pct, p.feasibility_status
from pmo.plan p
left join pmo.plan_task t on t.plan_id = p.plan_id
group by p.plan_id;

create view pmo.v_member_busy_rate as
select e.employee_id, e.emp_code,
       coalesce(sum(ra.allocation_pct),0) as busy_rate
from core.employee e
left join pmo.resource_allocation ra on ra.employee_id = e.employee_id
group by e.employee_id, e.emp_code;

-- attach updated_at trigger to every pmo base table (views have no updated_at column)
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'pmo' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger %I before update on pmo.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
