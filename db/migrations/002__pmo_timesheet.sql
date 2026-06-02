create schema if not exists pmo;

create table pmo.overbook_idle_config (
  overbook_idle_config_id bigint generated always as identity primary key,
  config_code text not null unique,
  rule_name   text not null,
  overbook_threshold     numeric(4,2) not null check (overbook_threshold > 0),
  overbook_red_threshold numeric(4,2) not null check (overbook_red_threshold > 0),
  idle_threshold         numeric(4,2) not null check (idle_threshold > 0),
  mismatch_pct_threshold numeric(4,2) not null check (mismatch_pct_threshold > 0),
  ot_max_hours_per_week  numeric(5,2) not null check (ot_max_hours_per_week > 0),
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint config_red_gt_yellow
    check (overbook_red_threshold >= overbook_threshold)
);

create table pmo.timesheet_log (
  timesheet_log_id bigint generated always as identity primary key,
  employee_id bigint not null references core.employee(employee_id),
  project_id  bigint references core.project(project_id),
  work_date   date not null,
  logged_hours numeric(4,2) not null check (logged_hours >= 0),
  log_category text not null check (log_category in ('Project','Internal','Training','Admin')),
  task_ref    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timesheet_project_category_consistency
    check ( (log_category = 'Project' and project_id is not null)
         or (log_category <> 'Project' and project_id is null) )
);

create table pmo.leave_record (
  leave_record_id bigint generated always as identity primary key,
  leave_record_code text not null unique,
  employee_id bigint references core.employee(employee_id),
  leave_date  date not null,
  leave_type  text not null check (leave_type in
    ('Annual Leave','Sick','Maternity','Public Holiday','Training','Approved OT Comp')),
  approved boolean not null default false,
  duration_days numeric(3,1) not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_duration_positive check (duration_days > 0),
  constraint leave_duration_half_day check (duration_days = round(duration_days * 2) / 2),
  constraint leave_holiday_member
    check (employee_id is not null or leave_type = 'Public Holiday')
);

-- per member x calendar week: planned (RA, PT-aware) vs logged hours + overbook/idle/mismatch flags
create view pmo.v_member_week_hours as
with cfg as (
  select * from pmo.overbook_idle_config
  order by effective_date desc, overbook_idle_config_id desc
  limit 1
),
planned as (
  select ra.employee_id, w.calendar_week_id,
         sum(ra.allocation_pct) * e.std_hours_week as planned_hours,
         sum(ra.allocation_pct)                    as busy_rate
  from pmo.resource_allocation ra
  join core.employee e on e.employee_id = ra.employee_id
  join core.calendar_week w
    on ra.start_date <= (w.week_start + 6) and ra.end_date >= w.week_start
  group by ra.employee_id, w.calendar_week_id, e.std_hours_week
),
logged as (
  select tl.employee_id, w.calendar_week_id,
         sum(tl.logged_hours) as logged_hours,
         sum(tl.logged_hours) filter (where tl.project_id is not null) as project_logged_hours
  from pmo.timesheet_log tl
  join core.calendar_week w
    on tl.work_date >= w.week_start and tl.work_date <= (w.week_start + 6)
  group by tl.employee_id, w.calendar_week_id
)
select
  e.employee_id, e.emp_code, w.calendar_week_id, w.week_start,
  coalesce(p.planned_hours, 0)         as planned_hours,
  coalesce(p.busy_rate, 0)             as busy_rate,
  coalesce(l.logged_hours, 0)          as logged_hours,
  coalesce(l.project_logged_hours, 0)  as project_logged_hours,
  coalesce(p.busy_rate,0) > c.overbook_threshold      as is_overbook,
  coalesce(p.busy_rate,0) > c.overbook_red_threshold  as is_overbook_red,
  (coalesce(p.busy_rate,0) > 0 and coalesce(p.busy_rate,0) < c.idle_threshold) as is_idle,
  (coalesce(p.planned_hours,0) > 0
    and abs(coalesce(l.logged_hours,0) - p.planned_hours) / p.planned_hours
        > c.mismatch_pct_threshold)                   as is_mismatch
from core.employee e
cross join core.calendar_week w
cross join cfg c
left join planned p on p.employee_id = e.employee_id and p.calendar_week_id = w.calendar_week_id
left join logged  l on l.employee_id = e.employee_id and l.calendar_week_id = w.calendar_week_id;

-- per member across the whole window: utilization roll-up (company-wide RA summary)
create view pmo.v_member_utilization as
select
  v.employee_id, v.emp_code,
  sum(v.planned_hours)         as total_planned_hours,
  sum(v.logged_hours)          as total_logged_hours,
  sum(v.project_logged_hours)  as total_project_logged_hours,
  case when sum(v.planned_hours) > 0
       then sum(v.project_logged_hours) / sum(v.planned_hours) end as utilization_pct
from pmo.v_member_week_hours v
group by v.employee_id, v.emp_code;

-- attach updated_at trigger to every pmo phase-2 BASE TABLE that has the column and lacks a trigger
do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'pmo' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
      and not exists (
        select 1 from pg_trigger g
        where g.tgname = c.table_name || '_set_updated_at'
          and not g.tgisinternal
      )
  loop
    execute format(
      'create trigger %I before update on pmo.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
