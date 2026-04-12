CREATE TABLE "core"."role_permission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_permission_tenant_role_perm" ON "core"."role_permission" USING btree ("tenant_id","role_key","permission_key");

-- RLS for role_permission
ALTER TABLE "core"."role_permission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permission_tenant_isolation" ON "core"."role_permission"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));