ALTER TABLE "tenant"."tenant_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant"."tenant_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation_tenant_members" ON "tenant"."tenant_members"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("tenant"."tenant_members"."tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant"."tenant_members"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "self_read_tenant_members" ON "tenant"."tenant_members"
  AS PERMISSIVE FOR SELECT TO "tenant_user"
  USING ("tenant"."tenant_members"."user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant"."tenant_members" TO "tenant_user";