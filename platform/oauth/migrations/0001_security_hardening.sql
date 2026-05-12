ALTER TABLE "oauth"."oauth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth"."oauth_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation_oauth_tokens" ON "oauth"."oauth_tokens" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("oauth"."oauth_tokens"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("oauth"."oauth_tokens"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "oauth"."oauth_tokens" TO "tenant_user";
