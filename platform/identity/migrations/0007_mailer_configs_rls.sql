ALTER TABLE auth.mailer_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.mailer_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY mailer_configs_tenant ON auth.mailer_configs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.mailer_configs TO tenant_user;
