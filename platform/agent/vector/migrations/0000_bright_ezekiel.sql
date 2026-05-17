CREATE SCHEMA "agent_vector";
--> statement-breakpoint
CREATE TABLE "agent_vector"."chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"content" text NOT NULL,
	"content_hash" char(64) NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_vector"."chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_tenant_source_hash_unique" ON "agent_vector"."chunks" USING btree ("tenant_id","source_id","content_hash");--> statement-breakpoint
CREATE POLICY "tenant_isolation_chunks" ON "agent_vector"."chunks" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_vector"."chunks"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_vector"."chunks"."tenant_id" = current_setting('app.tenant_id', true)::uuid);