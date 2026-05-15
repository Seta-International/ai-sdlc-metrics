-- Partial unique indexes (handle NULL tenant_id — PostgreSQL UNIQUE ignores NULLs)
CREATE UNIQUE INDEX agent_profiles_global_slug
  ON agent.agent_profiles (slug)
  WHERE tenant_id IS NULL AND slug IS NOT NULL;

CREATE UNIQUE INDEX agent_profiles_tenant_slug
  ON agent.agent_profiles (tenant_id, slug)
  WHERE tenant_id IS NOT NULL AND slug IS NOT NULL;

-- RLS
ALTER TABLE agent.agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_profiles_select ON agent.agent_profiles FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY agent_profiles_insert ON agent.agent_profiles FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY agent_profiles_update ON agent.agent_profiles FOR UPDATE
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY agent_profiles_delete ON agent.agent_profiles FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE agent.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_actions_rls ON agent.agent_actions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);