CREATE SCHEMA "agent";
--> statement-breakpoint
CREATE TABLE "agent"."agent_actions" (
	"action_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"spec" jsonb NOT NULL,
	"auth" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent"."agent_profiles" (
	"agent_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"slug" text,
	"name" text NOT NULL,
	"description" text,
	"instructions" text NOT NULL,
	"model" text NOT NULL,
	"tool_ids" text[] DEFAULT '{}' NOT NULL,
	"working_memory_template" text,
	"temperature" numeric(3, 2),
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_check" CHECK ("agent"."agent_profiles"."status" IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE INDEX "agent_actions_by_agent" ON "agent"."agent_actions" USING btree ("agent_id","tenant_id");--> statement-breakpoint
CREATE INDEX "agent_profiles_by_tenant_slug" ON "agent"."agent_profiles" USING btree ("tenant_id","slug");