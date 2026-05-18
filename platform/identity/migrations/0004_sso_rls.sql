-- sso_configs
ALTER TABLE auth.sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sso_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY sso_configs_tenant ON auth.sso_configs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.sso_configs TO tenant_user;
--> statement-breakpoint

-- sso_email_domains
ALTER TABLE auth.sso_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sso_email_domains FORCE ROW LEVEL SECURITY;
-- domain lookup must work BEFORE we know the tenant; we expose it via a
-- SECURITY DEFINER function rather than a policy that bypasses RLS for
-- arbitrary callers.
CREATE POLICY sso_email_domains_tenant ON auth.sso_email_domains
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.sso_email_domains TO tenant_user;
--> statement-breakpoint

-- Lookup function used by /sso/discover (no tenant set yet at that point).
-- SECURITY DEFINER lets it bypass RLS, but it returns only the tenant_id
-- and provider — nothing tenant-private.
CREATE OR REPLACE FUNCTION auth.resolve_sso_by_domain(p_domain text)
RETURNS TABLE(tenant_id uuid, provider text, enabled boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
  SELECT c.tenant_id, c.provider, c.enabled
  FROM auth.sso_email_domains d
  JOIN auth.sso_configs c
    ON c.tenant_id = d.tenant_id AND c.enabled
  WHERE d.domain = lower(p_domain)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION auth.resolve_sso_by_domain(text) FROM public;
GRANT EXECUTE ON FUNCTION auth.resolve_sso_by_domain(text) TO tenant_user;
--> statement-breakpoint

-- magic_links
ALTER TABLE auth.magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.magic_links FORCE ROW LEVEL SECURITY;
CREATE POLICY magic_links_tenant ON auth.magic_links
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.magic_links TO tenant_user;
