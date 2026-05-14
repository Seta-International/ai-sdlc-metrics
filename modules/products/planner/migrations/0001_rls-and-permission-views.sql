-- Custom SQL migration file, put your code below! --

-- RLS on write_continuations
ALTER TABLE planner.write_continuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY write_continuations_tenant ON planner.write_continuations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Permission views: intra-tenant task + plan visibility
CREATE VIEW planner.v_visible_tasks AS
SELECT t.*
FROM connector_ms365_planner.planner_tasks_cache t
WHERE t.tenant_id       = current_setting('app.tenant_id')::uuid
  AND t.soft_deleted_at IS NULL
  AND (
    -- Rule 1: actor is a plan member
    EXISTS (
      SELECT 1
      FROM connector_ms365_planner.plan_members pm
      WHERE pm.tenant_id = t.tenant_id
        AND pm.plan_id   = t.plan_id
        AND pm.user_id   = current_setting('app.user_id')
    )
    OR
    -- Rule 2: actor manages any assignee
    EXISTS (
      SELECT 1
      FROM connector_ms365_directory.directory_users du
      WHERE du.tenant_id       = t.tenant_id
        AND du.entra_object_id = ANY(t.assignee_ids)
        AND du.manager_id      = current_setting('app.user_id')
    )
  );

CREATE VIEW planner.v_visible_plans AS
SELECT p.*
FROM connector_ms365_planner.planner_plans_cache p
WHERE p.tenant_id       = current_setting('app.tenant_id')::uuid
  AND p.soft_deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM connector_ms365_planner.plan_members pm
    WHERE pm.tenant_id = p.tenant_id
      AND pm.plan_id   = p.graph_plan_id
      AND pm.user_id   = current_setting('app.user_id')
  );