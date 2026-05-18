-- Grant tenant_user access to jwks_cache so bot-framework JWKS persistence works.
-- The table was created in 0002 without a GRANT; writes inside verifyBotFrameworkJwt
-- were silently turned into 401s when caught by the jose error handler.
GRANT USAGE ON SCHEMA auth TO tenant_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.jwks_cache TO tenant_user;
--> statement-breakpoint

-- Resolve the SETA tenant UUID for an incoming Microsoft Entra tenant ID.
-- Used by the Teams bot route before the request tenant context is established;
-- SECURITY DEFINER bypasses the FORCE RLS policy on auth.sso_configs so the
-- lookup works without app.tenant_id being set.
CREATE OR REPLACE FUNCTION auth.resolve_tenant_by_entra_id(p_entra_tenant_id text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
  SELECT tenant_id
  FROM auth.sso_configs
  WHERE config->>'entra_tenant_id' = p_entra_tenant_id
    AND provider = 'entra'
    AND enabled
  LIMIT 1;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth.resolve_tenant_by_entra_id(text) FROM public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.resolve_tenant_by_entra_id(text) TO tenant_user;
