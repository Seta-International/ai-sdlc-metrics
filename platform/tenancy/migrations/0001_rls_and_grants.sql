ALTER TABLE "tenant"."tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenants_self_only" ON "tenant"."tenants"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
GRANT SELECT ON "tenant"."tenants" TO "tenant_user";
--> statement-breakpoint
ALTER TABLE "tenant"."tenant_connectors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."tenant_connectors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_tenant_connectors" ON "tenant"."tenant_connectors"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant"."tenant_connectors" TO "tenant_user";
--> statement-breakpoint
ALTER TABLE "tenant"."tenant_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."tenant_members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_tenant_members" ON "tenant"."tenant_members"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY "self_read_tenant_members" ON "tenant"."tenant_members"
  AS PERMISSIVE FOR SELECT TO "tenant_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant"."tenant_members" TO "tenant_user";
