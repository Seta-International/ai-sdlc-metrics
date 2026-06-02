-- lnd schema already exists (Phase 6); this migration only adds tables/view/triggers.
create table lnd.course_catalog (
  course_id bigint generated always as identity primary key,
  course_code text not null unique,
  course_name text not null,
  topic_category text not null,
  trainer_id bigint not null references core.trainer(trainer_id),
  total_sessions int not null check (total_sessions > 0),
  hours_per_session numeric(5,2) not null check (hours_per_session > 0),
  total_hours numeric(7,2) not null check (total_hours >= 0),
  pass_threshold_score numeric(4,2) not null check (pass_threshold_score between 0 and 10),
  start_date date not null,
  end_date   date not null,
  status text not null check (status in ('Completed','In Progress','Planned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_end_after_start check (end_date >= start_date)
);

create table lnd.attendance_log (
  attendance_log_id bigint generated always as identity primary key,
  course_id   bigint not null references lnd.course_catalog(course_id),
  session_no  int not null check (session_no > 0),
  employee_id bigint not null references core.employee(employee_id),
  attendance_status text not null check (attendance_status in ('Present','Absent','Late')),
  training_hours numeric(5,2) not null check (training_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, session_no, employee_id)
);

create table lnd.assessment_score (
  assessment_score_id bigint generated always as identity primary key,
  course_id   bigint not null references lnd.course_catalog(course_id),
  employee_id bigint not null references core.employee(employee_id),
  score_0_to_10 numeric(4,2) not null check (score_0_to_10 between 0 and 10),
  pass_status boolean not null,
  generalized_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, employee_id)
);

create table lnd.feedback_survey (
  feedback_survey_id bigint generated always as identity primary key,
  course_id   bigint not null references lnd.course_catalog(course_id),
  employee_id bigint not null references core.employee(employee_id),
  trainer_rating numeric(2,1) not null check (trainer_rating between 1 and 5),
  content_rating numeric(2,1) not null check (content_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, employee_id)
);

create table lnd.training_cost (
  training_cost_id bigint generated always as identity primary key,
  course_id bigint not null references lnd.course_catalog(course_id) unique,
  cost_per_session_scaled numeric(6,2) not null check (cost_per_session_scaled >= 0),
  total_cost_scaled numeric(8,2) not null check (total_cost_scaled >= 0),
  post_training_perf_delta numeric(5,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lnd.training_norm (
  training_norm_id bigint generated always as identity primary key,
  rule_code text not null unique,
  category  text not null,
  rule_description text not null,
  threshold text not null,
  action_if_triggered text not null,
  priority text not null check (priority in ('High','Medium','Low')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lnd.report_template_section (
  report_template_section_id bigint generated always as identity primary key,
  section_code text not null unique,
  section_name text not null,
  content_description text not null,
  data_source text not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create view lnd.v_course_effectiveness as
with att as (
  select a.course_id, a.employee_id,
         sum(case a.attendance_status
               when 'Present' then 1.0
               when 'Late'    then 0.5
               else 0 end) as sessions_attended
  from lnd.attendance_log a
  group by a.course_id, a.employee_id
),
att_done as (
  select att.course_id, att.employee_id,
         (att.sessions_attended >= 0.70 * c.total_sessions) as completed
  from att
  join lnd.course_catalog c on c.course_id = att.course_id
),
asmt as (
  select course_id,
         avg(score_0_to_10) as avg_score,
         (count(*) filter (where pass_status))::numeric
           / nullif(count(*),0) as pass_rate
  from lnd.assessment_score
  group by course_id
),
fb as (
  select course_id,
         avg(trainer_rating) as avg_trainer_rating,
         avg(content_rating) as avg_content_rating
  from lnd.feedback_survey
  group by course_id
)
select c.course_id, c.course_code, c.status,
       (select count(distinct employee_id) from lnd.attendance_log a
          where a.course_id = c.course_id) as trainee_count,
       case when c.status = 'Completed' then
         (select count(*) filter (where completed)::numeric / nullif(count(*),0)
            from att_done d where d.course_id = c.course_id)
       end as completion_rate,
       case when c.status = 'Completed' then asmt.avg_score end as avg_score,
       case when c.status = 'Completed' then asmt.pass_rate end as pass_rate,
       fb.avg_trainer_rating,
       fb.avg_content_rating
from lnd.course_catalog c
left join asmt on asmt.course_id = c.course_id
left join fb   on fb.course_id   = c.course_id;

-- attach updated_at trigger to every lnd base table that still lacks one
-- (Phase 6 already triggered its tables; this loop adds the Phase-7 tables).
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'lnd' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
      and not exists (
        select 1 from information_schema.triggers tg
        where tg.event_object_schema = 'lnd'
          and tg.event_object_table = c.table_name
          and tg.trigger_name = c.table_name || '_set_updated_at')
  loop
    execute format(
      'create trigger %I before update on lnd.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
