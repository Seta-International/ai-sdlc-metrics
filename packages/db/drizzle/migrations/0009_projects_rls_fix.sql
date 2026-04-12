-- Fix critical RLS issues in projects schema introduced in 0008_spooky_magdalene
-- 1. Add FORCE ROW LEVEL SECURITY so the table owner cannot bypass RLS
-- 2. Recreate policies using 2-arg current_setting (returns NULL instead of throwing when unset)
-- 3. Add indexes on FK/tenant_id columns for query performance

-- Critical Fix 1: FORCE ROW LEVEL SECURITY
ALTER TABLE "projects"."account" FORCE ROW LEVEL SECURITY;
ALTER TABLE "projects"."project" FORCE ROW LEVEL SECURITY;
ALTER TABLE "projects"."project_role" FORCE ROW LEVEL SECURITY;
ALTER TABLE "projects"."allocation" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Critical Fix 2: Recreate policies with correct 2-arg current_setting
DROP POLICY "tenant_isolation" ON "projects"."account";
CREATE POLICY "tenant_isolation" ON "projects"."account"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint

DROP POLICY "tenant_isolation" ON "projects"."project";
CREATE POLICY "tenant_isolation" ON "projects"."project"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint

DROP POLICY "tenant_isolation" ON "projects"."project_role";
CREATE POLICY "tenant_isolation" ON "projects"."project_role"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint

DROP POLICY "tenant_isolation" ON "projects"."allocation";
CREATE POLICY "tenant_isolation" ON "projects"."allocation"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint

-- Important Fix 3: Add indexes on FK/tenant_id columns
CREATE INDEX ON "projects"."project" ("tenant_id", "account_id");
CREATE INDEX ON "projects"."project_role" ("tenant_id", "project_id");
CREATE INDEX ON "projects"."allocation" ("tenant_id", "project_id");
CREATE INDEX ON "projects"."allocation" ("tenant_id", "project_role_id");
CREATE INDEX ON "projects"."allocation" ("tenant_id", "actor_id") WHERE actor_id IS NOT NULL;
