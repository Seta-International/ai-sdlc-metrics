ALTER TABLE connector_ms365_planner.planner_tasks_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.planner_task_details_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.planner_plans_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.planner_buckets_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.sync_watermarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_tasks_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_task_details_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_plans_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_buckets_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.sync_watermarks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT USAGE ON SCHEMA connector_ms365_planner TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA connector_ms365_planner TO tenant_user;
