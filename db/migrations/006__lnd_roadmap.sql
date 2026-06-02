create schema if not exists lnd;

create table lnd.employee_skill_gap (
  employee_skill_gap_id bigint generated always as identity primary key,
  employee_id bigint not null references core.employee(employee_id),
  skill_id    bigint not null references core.skill(skill_id),
  gap_source  text not null check (gap_source in ('Project','Market','Role')),
  priority    text not null check (priority in ('High','Medium','Low')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, skill_id)
);

create table lnd.project_required_skill (
  project_required_skill_id bigint generated always as identity primary key,
  project_id bigint not null references core.project(project_id),
  skill_id   bigint not null references core.skill(skill_id),
  min_proficiency_id bigint references core.proficiency_level(proficiency_level_id),
  is_critical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, skill_id)
);

create table lnd.training_need_survey (
  training_need_survey_id bigint generated always as identity primary key,
  survey_response_code text not null unique,
  survey_wave text not null,
  employee_id bigint not null references core.employee(employee_id),
  training_topic text not null,
  priority text not null check (priority in ('High','Medium','Low')),
  delivery_mode_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (survey_wave, employee_id)
);

create table lnd.bod_training_goal (
  bod_training_goal_id bigint generated always as identity primary key,
  goal_code text not null unique,
  goal_description text not null,
  target_quarter text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create view lnd.v_skill_gap_frequency as
select s.skill_id, s.skill_code, s.name,
       count(distinct g.employee_id) as gap_count
from core.skill s
left join lnd.employee_skill_gap g on g.skill_id = s.skill_id
group by s.skill_id, s.skill_code, s.name;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'lnd' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger %I before update on lnd.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
