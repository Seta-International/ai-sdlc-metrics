ALTER TABLE connector_ms365_planner.plan_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connector_ms365_planner.plan_members
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);