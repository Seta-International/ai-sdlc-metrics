-- RLS policies for core schema
-- Run after the Drizzle-generated DDL migration.
-- No RLS on core.tenant because tenant lookups are root-level.

ALTER TABLE core.actor ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.actor FORCE ROW LEVEL SECURITY;
CREATE POLICY actor_tenant_isolation ON core.actor
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE core.user_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.user_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY user_identity_tenant_isolation ON core.user_identity
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE core.role_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY role_grant_tenant_isolation ON core.role_grant
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE core.department ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.department FORCE ROW LEVEL SECURITY;
CREATE POLICY department_tenant_isolation ON core.department
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX idx_role_grant_actor ON core.role_grant (tenant_id, actor_id);
