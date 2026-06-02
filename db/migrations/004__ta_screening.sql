-- ta schema already created in 003__ta_hire.sql
create table ta.candidate (
  candidate_id bigint generated always as identity primary key,
  candidate_code text not null unique,
  full_name text not null,
  email text,
  phone text,
  applied_position text not null,
  role_id  bigint references core.role(role_id),
  salary_expectation_min_scaled numeric(6,2),
  salary_expectation_max_scaled numeric(6,2),
  status text not null check (status in ('Passed','In-pool','Rejected','Failed')),
  source text not null check (source in ('LinkedIn','TopCV','Email','FB')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_salary_band
    check (salary_expectation_max_scaled >= salary_expectation_min_scaled)
);

create table ta.candidate_skill (
  candidate_skill_id bigint generated always as identity primary key,
  candidate_id bigint not null references ta.candidate(candidate_id),
  skill_id     bigint not null references core.skill(skill_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, skill_id)
);

create table ta.screening_criteria (
  screening_criteria_id bigint generated always as identity primary key,
  criteria_code text not null unique,
  position text not null,
  role_id  bigint references core.role(role_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ta.screening_criteria_skill (
  screening_criteria_skill_id bigint generated always as identity primary key,
  criteria_id bigint not null references ta.screening_criteria(screening_criteria_id),
  skill_id    bigint not null references core.skill(skill_id),
  skill_type  text not null check (skill_type in ('must_have','nice_to_have')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (criteria_id, skill_id)
);

create table ta.outreach_template (
  outreach_template_id bigint generated always as identity primary key,
  template_code text not null unique,
  channel text not null check (channel in ('LinkedIn','Email','TopCV')),
  template_content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- candidate fit: must-have skill overlap count per (candidate x screening_criteria)
create view ta.v_candidate_fit as
select c.candidate_id, c.candidate_code, sc.screening_criteria_id, sc.criteria_code,
       count(*) filter (
         where scs.skill_type = 'must_have'
           and cs.candidate_skill_id is not null
       ) as must_have_overlap,
       count(*) filter (where scs.skill_type = 'must_have') as must_have_total
from ta.candidate c
cross join ta.screening_criteria sc
join ta.screening_criteria_skill scs on scs.criteria_id = sc.screening_criteria_id
left join ta.candidate_skill cs
       on cs.candidate_id = c.candidate_id and cs.skill_id = scs.skill_id
group by c.candidate_id, c.candidate_code, sc.screening_criteria_id, sc.criteria_code;

-- attach updated_at trigger to ta base tables that do not already have one
-- (Phase-3 tables already carry the trigger; only the new Phase-4 tables get it)
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'ta' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
      and not exists (
        select 1 from information_schema.triggers tr
        where tr.event_object_schema = 'ta'
          and tr.event_object_table = c.table_name
          and tr.trigger_name = c.table_name || '_set_updated_at'
      )
  loop
    execute format(
      'create trigger %I before update on ta.%I
         for each row execute function core.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
