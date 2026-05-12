ALTER TABLE agent.write_continuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agent.write_continuations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY user_owns_row_w ON agent.write_continuations FOR UPDATE
  USING (user_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY user_owns_row_d ON agent.write_continuations FOR DELETE
  USING (user_id = current_setting('app.user_id', true)::uuid);

GRANT USAGE ON SCHEMA agent TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent.write_continuations TO tenant_user;
