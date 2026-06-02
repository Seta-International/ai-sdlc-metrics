create schema if not exists elc;

create table elc.performance_review (
  performance_review_id bigint generated always as identity primary key,
  employee_id bigint not null references core.employee(employee_id),
  reviewer_id bigint references core.employee(employee_id),
  report_period text not null,
  total_point numeric(3,2) not null check (total_point >= 0 and total_point <= 5),
  classification text not null
    check (classification in ('Excellent','Good','Meets Expectations','Below Expectations','Poor')),
  feedback_category text,
  review_frequency text not null default 'Monthly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_period)
);

create table elc.timesheet_monthly (
  timesheet_monthly_id bigint generated always as identity primary key,
  employee_id bigint not null references core.employee(employee_id),
  report_period text not null,
  work_days_in_month int not null,
  days_probation numeric(4,1) not null default 0,
  days_official numeric(4,1) not null default 0,
  days_holiday_official numeric(4,1) not null default 0,
  days_leave_approved numeric(4,1) not null default 0,
  days_late numeric(4,1) not null default 0,
  days_absent_unapproved numeric(4,1) not null default 0,
  actual_work_days numeric(4,1) not null default 0,
  ot_hours_weekday numeric(5,1) not null default 0,
  ot_hours_weekend numeric(5,1) not null default 0,
  ot_hours_holiday numeric(5,1) not null default 0,
  total_ot_hours numeric(6,1) not null default 0,
  night_shift_hours numeric(6,1) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_period)
);

create table elc.violation_type (
  violation_type_id bigint generated always as identity primary key,
  violation_type_code text not null unique,
  category text not null
    check (category in ('Attendance','Attitude','Performance','Policy','Conduct')),
  violation_type_desc text not null,
  typical_severity text not null check (typical_severity in ('Low','Medium','High')),
  typical_consequence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table elc.violation (
  violation_id bigint generated always as identity primary key,
  violation_code text not null unique,
  employee_id bigint not null references core.employee(employee_id),
  violation_type_code text not null references elc.violation_type(violation_type_code),
  severity text not null check (severity in ('Low','Medium','High','Critical')),
  consequence text,
  status text not null
    check (status in ('Open','Under Review','Resolved','Escalated','Closed - No Action')),
  incident_date date not null,
  reported_by text,
  action_taken text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table elc.promotion_intent (
  promotion_intent_id bigint generated always as identity primary key,
  employee_id bigint not null references core.employee(employee_id) unique,
  current_level_id bigint not null references core.career_level(career_level_id),
  target_level_id  bigint not null references core.career_level(career_level_id),
  readiness_score numeric(3,2) not null check (readiness_score >= 0 and readiness_score <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table elc.salary_band (
  salary_band_id bigint generated always as identity primary key,
  employee_id bigint not null references core.employee(employee_id),
  salary_band text not null check (salary_band in ('A','B','C','D','E','F')),
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, effective_date)
);

create table elc.performance_norm (
  performance_norm_id bigint generated always as identity primary key,
  norm_code text not null unique,
  category text not null,
  rule_description text not null,
  threshold text,
  classification_label text,
  action_if_triggered text,
  priority text not null check (priority in ('Critical','High','Medium','Low')),
  applies_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- per-employee violation rollup (replaces stored DS04c_Violation_Summary)
create view elc.v_violation_summary as
select e.employee_id,
       e.emp_code,
       count(v.violation_id) as total_violations,
       count(v.violation_id) filter (where v.severity = 'Critical') as critical_count,
       count(v.violation_id) filter (where v.severity = 'High')     as high_count,
       count(v.violation_id) filter (where v.severity = 'Medium')   as medium_count,
       count(v.violation_id) filter (where v.severity = 'Low')      as low_count,
       count(v.violation_id) filter (where v.status in ('Open','Under Review','Escalated')) as open_cases,
       case
         when count(v.violation_id) = 0 then 'None'
         when count(v.violation_id) filter (where v.severity = 'Critical') > 0
              or count(v.violation_id) filter (where v.status in ('Open','Under Review','Escalated')) >= 3
           then 'High Risk'
         when count(v.violation_id) filter (where v.severity = 'High') > 0
              or count(v.violation_id) filter (where v.status in ('Open','Under Review','Escalated')) >= 1
           then 'Watch'
         else 'Minor'
       end as risk_flag
from core.employee e
left join elc.violation v on v.employee_id = e.employee_id
group by e.employee_id, e.emp_code;

-- per-employee performance profile snapshot (replaces stored DS08_Perf_Profile_Agg)
create view elc.v_perf_profile as
with latest_review as (
  select distinct on (employee_id) employee_id, report_period, classification
  from elc.performance_review
  order by employee_id, report_period desc
),
avg_review as (
  select employee_id, avg(total_point) as avg_score
  from elc.performance_review
  group by employee_id
),
latest_ts as (
  select distinct on (employee_id)
         employee_id, report_period, days_late, days_absent_unapproved, total_ot_hours
  from elc.timesheet_monthly
  order by employee_id, report_period desc
)
select e.employee_id,
       e.emp_code,
       ar.avg_score,                                  -- NULL when no review data
       lr.classification as classification_latest,
       case
         when lt.employee_id is null then 'No data'
         when lt.days_absent_unapproved >= 1 then 'Unapproved Absence'
         when lt.days_late >= 3 then 'Late Pattern'
         when lt.days_late > 0 then 'Minor Late'
         else 'Compliant'
       end as ts_compliance_label,
       coalesce(lt.total_ot_hours, 0) as total_ot_hours_latest,
       vs.risk_flag as violation_risk_flag,
       vs.open_cases as open_violation_count,
       case
         when br.busy_rate is null or br.busy_rate = 0 then 'Bench'
         when br.busy_rate > 1.2 then 'Overloaded'
         when br.busy_rate < 0.75 then 'Under-allocated'
         else 'Active'
       end as allocation_status,
       trim(both '; ' from
         concat_ws('; ',
           case when ar.avg_score < 2.5 then 'Low KPI (<2.5)' end,
           case when vs.critical_count > 0 or vs.high_count > 0 then 'High-Risk Violation' end,
           case when vs.open_cases >= 3 then 'Multiple Open Violations' end
         )
       ) as perf_risk_note
from core.employee e
left join latest_review lr on lr.employee_id = e.employee_id
left join avg_review   ar on ar.employee_id = e.employee_id
left join latest_ts    lt on lt.employee_id = e.employee_id
left join elc.v_violation_summary vs on vs.employee_id = e.employee_id
left join pmo.v_member_busy_rate br on br.employee_id = e.employee_id;

-- attach updated_at trigger to every elc base table (views have no updated_at column)
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'elc' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger %I before update on elc.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
