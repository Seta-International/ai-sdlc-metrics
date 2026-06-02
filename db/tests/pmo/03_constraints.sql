\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

-- FK to a missing project rejected
SELECT throws_ok(
  $$ insert into pmo.plan (plan_code, project_id, plan_template_id)
     select 'PLAN-X', 999999, (select plan_template_id from pmo.plan_template limit 1) $$,
  '23503', NULL, 'plan FK to missing project rejected');

-- invalid task status rejected
SELECT throws_ok(
  $$ insert into pmo.plan_task (plan_id, task_code, task_name, start_date, end_date, effort_days, status, phase)
     select (select plan_id from pmo.plan limit 1),'TASK-X','x','2026-01-01','2026-01-02',1,'Wrong','Design' $$,
  '23514', NULL, 'invalid plan_task.status rejected');

-- invalid phase rejected
SELECT throws_ok(
  $$ insert into pmo.plan_task (plan_id, task_code, task_name, start_date, end_date, effort_days, status, phase)
     select (select plan_id from pmo.plan limit 1),'TASK-Y','y','2026-01-01','2026-01-02',1,'Not Started','Nope' $$,
  '23514', NULL, 'invalid plan_task.phase rejected');

-- self-dependency rejected
SELECT throws_ok(
  $$ insert into pmo.plan_task_dependency (plan_task_id, depends_on_task_id)
     select plan_task_id, plan_task_id from pmo.plan_task limit 1 $$,
  '23514', NULL, 'self-dependency rejected');

-- section check with BOTH component and custom_name rejected
SELECT throws_ok(
  $$ insert into pmo.plan_section_check (plan_id, template_component_id, custom_name, status)
     select (select plan_id from pmo.plan limit 1),
            (select template_component_id from pmo.template_component limit 1),
            'both','Complete' $$,
  '23514', NULL, 'section check with both component and custom_name rejected');

-- section check with NEITHER component nor custom_name rejected
SELECT throws_ok(
  $$ insert into pmo.plan_section_check (plan_id, status)
     select (select plan_id from pmo.plan limit 1),'Missing' $$,
  '23514', NULL, 'section check with neither component nor custom_name rejected');

-- weight > 1 rejected
SELECT throws_ok(
  $$ insert into pmo.template_component (plan_template_id, component_code, section_code, component_name, weight)
     select (select plan_template_id from pmo.plan_template limit 1),'COMP-X','S09','x',1.5 $$,
  '23514', NULL, 'template_component.weight > 1 rejected');

-- duplicate (project, sprint) velocity rejected
SELECT throws_ok(
  $$ insert into pmo.velocity_history (project_id, sprint_no, sprint_duration_days, planned_points, completed_points)
     select project_id, sprint_no, 14, 40, 30 from pmo.velocity_history limit 1 $$,
  '23505', NULL, 'duplicate (project, sprint_no) rejected');

SELECT * FROM finish();
ROLLBACK;
