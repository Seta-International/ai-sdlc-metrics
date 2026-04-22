CREATE TABLE "agents"."agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"router_prompt_hash" text NOT NULL,
	"permission_narrative_hash" text NOT NULL,
	"tool_catalog_hash" text NOT NULL,
	"directive_schema_hash" text NOT NULL,
	"canonicalizer_version_hash" text NOT NULL,
	"pinned_sub_agent_prompt_hashes" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_stored_sub_agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_stored_sub_agent_status_check" CHECK ("agents"."agent_stored_sub_agent"."status" IN ('draft', 'active', 'retired'))
);
--> statement-breakpoint
CREATE INDEX "agent_session_conversation_lookup_idx" ON "agents"."agent_session" USING btree ("tenant_id","user_id","conversation_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_stored_sub_agent_tenant_key_version_uidx" ON "agents"."agent_stored_sub_agent" USING btree ("tenant_id","key","version");--> statement-breakpoint
CREATE INDEX "agent_stored_sub_agent_tenant_key_status_idx" ON "agents"."agent_stored_sub_agent" USING btree ("tenant_id","key","status");--> statement-breakpoint
CREATE INDEX "agent_stored_sub_agent_tenant_key_version_desc_idx" ON "agents"."agent_stored_sub_agent" USING btree ("tenant_id","key","version" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "agents"."agent_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."agent_session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_session"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "agents"."agent_stored_sub_agent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."agent_stored_sub_agent" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_stored_sub_agent"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);