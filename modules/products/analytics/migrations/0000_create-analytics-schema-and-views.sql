CREATE SCHEMA IF NOT EXISTS analytics;

-- Workload per assignee per plan
CREATE MATERIALIZED VIEW analytics.mv_assignee_workload AS
SELECT
  t.tenant_id,
  user_id.value                                                                  AS user_id,
  t.plan_id,
  COUNT(*) FILTER (WHERE t.percent_complete < 100)                               AS open_tasks,
  COUNT(*) FILTER (WHERE t.due_date < now()
                     AND t.percent_complete < 100)                               AS overdue_tasks,
  COUNT(*) FILTER (WHERE t.due_date BETWEEN now() AND now() + INTERVAL '7 days'
                     AND t.percent_complete < 100)                               AS due_this_week,
  COUNT(*) FILTER (WHERE t.percent_complete = 100
                     AND t.last_modified_at_graph > now() - INTERVAL '7 days')  AS completed_this_week
FROM connector_ms365_planner.planner_tasks_cache t
CROSS JOIN LATERAL UNNEST(t.assignee_ids) AS user_id(value)
WHERE t.soft_deleted_at IS NULL
GROUP BY t.tenant_id, user_id.value, t.plan_id;

CREATE UNIQUE INDEX ON analytics.mv_assignee_workload (tenant_id, user_id, plan_id);

-- Weekly completed task velocity per plan
CREATE MATERIALIZED VIEW analytics.mv_plan_weekly_velocity AS
SELECT
  tenant_id,
  plan_id,
  date_trunc('week', last_modified_at_graph)  AS week,
  COUNT(*)                                    AS tasks_completed
FROM connector_ms365_planner.planner_tasks_cache
WHERE percent_complete       = 100
  AND last_modified_at_graph IS NOT NULL
  AND soft_deleted_at        IS NULL
GROUP BY tenant_id, plan_id, date_trunc('week', last_modified_at_graph);

CREATE UNIQUE INDEX ON analytics.mv_plan_weekly_velocity (tenant_id, plan_id, week);