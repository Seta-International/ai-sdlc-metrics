-- Replace v_visible_plans to add manager visibility rule.
--
-- A user sees a plan if:
--   Rule 1 (unchanged): they are a direct plan_member (member or owner), OR
--   Rule 2 (new):       they are the manager of a user who is a plan_member
--
-- Rule 2 ensures a manager automatically sees any plan their direct reports
-- are working on, even without being explicitly added as a plan_member.
-- Isolation is still enforced because we never add a team member to another
-- manager's plan.

CREATE OR REPLACE VIEW planner.v_visible_plans AS
SELECT p.*
FROM connector_ms365_planner.planner_plans_cache p
WHERE p.tenant_id       = current_setting('app.tenant_id')::uuid
  AND p.soft_deleted_at IS NULL
  AND (
    -- Rule 1: actor is a direct plan member (includes owners)
    EXISTS (
      SELECT 1
      FROM connector_ms365_planner.plan_members pm
      WHERE pm.tenant_id = p.tenant_id
        AND pm.plan_id   = p.graph_plan_id
        AND pm.user_id   = current_setting('app.user_id')
    )
    OR
    -- Rule 2: actor manages a direct report who is a plan member
    EXISTS (
      SELECT 1
      FROM connector_ms365_planner.plan_members pm
      JOIN connector_ms365_directory.directory_users du
        ON  du.tenant_id       = pm.tenant_id
        AND du.entra_object_id = pm.user_id
      WHERE pm.tenant_id  = p.tenant_id
        AND pm.plan_id    = p.graph_plan_id
        AND du.manager_id = current_setting('app.user_id')
    )
  );
