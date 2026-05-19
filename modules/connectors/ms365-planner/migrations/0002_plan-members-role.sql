ALTER TABLE connector_ms365_planner.plan_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

ALTER TABLE connector_ms365_planner.plan_members
  ADD CONSTRAINT plan_members_role_check CHECK (role IN ('owner', 'member'));
