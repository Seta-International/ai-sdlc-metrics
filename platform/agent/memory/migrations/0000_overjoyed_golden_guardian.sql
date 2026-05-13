CREATE SCHEMA "agent_memory";
--> statement-breakpoint
CREATE TABLE "agent_memory"."turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_id" text,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"tool_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memory"."turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_memory"."working_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"working_memory" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "working_memory_8k" CHECK (octet_length("agent_memory"."working_memory"."working_memory") <= 8192)
);
--> statement-breakpoint
ALTER TABLE "agent_memory"."working_memory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_memory"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_id" text,
	"title" text,
	"metadata" jsonb,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memory"."conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "turns_thread_created_idx" ON "agent_memory"."turns" USING btree ("tenant_id","thread_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "conversations_tenant_resource_updated_idx" ON "agent_memory"."conversations" USING btree ("tenant_id","resource_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "tenant_isolation_turns" ON "agent_memory"."turns" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_memory"."turns"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_memory"."turns"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_working_memory" ON "agent_memory"."working_memory" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_memory"."working_memory"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_memory"."working_memory"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_conversations" ON "agent_memory"."conversations" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_memory"."conversations"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_memory"."conversations"."tenant_id" = current_setting('app.tenant_id', true)::uuid);