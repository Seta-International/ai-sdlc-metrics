CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TABLE "audit"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"provider_id" text,
	"connector_id" text,
	"operation" text NOT NULL,
	"resource_type" text,
	"resource_ids" text[],
	"result" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
