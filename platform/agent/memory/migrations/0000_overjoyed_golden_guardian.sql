CREATE SCHEMA "agent_memory";
--> statement-breakpoint
CREATE TABLE "agent_memory"."messages" (
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
ALTER TABLE "agent_memory"."messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_memory"."resources" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"working_memory" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "working_memory_8k" CHECK (octet_length("agent_memory"."resources"."working_memory") <= 8192)
);
--> statement-breakpoint
ALTER TABLE "agent_memory"."resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_memory"."threads" (
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
ALTER TABLE "agent_memory"."threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "agent_memory"."messages" USING btree ("tenant_id","thread_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "threads_tenant_resource_updated_idx" ON "agent_memory"."threads" USING btree ("tenant_id","resource_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "tenant_isolation_messages" ON "agent_memory"."messages" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_memory"."messages"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_memory"."messages"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_resources" ON "agent_memory"."resources" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_memory"."resources"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_memory"."resources"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_threads" ON "agent_memory"."threads" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_memory"."threads"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_memory"."threads"."tenant_id" = current_setting('app.tenant_id', true)::uuid);