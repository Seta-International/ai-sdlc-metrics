CREATE SCHEMA "agent";
--> statement-breakpoint
CREATE TABLE "agent"."write_continuations" (
	"token" text PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"etag_snapshot" jsonb NOT NULL,
	"result_card" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "write_continuations_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE INDEX "write_continuations_active" ON "agent"."write_continuations" USING btree ("tenant_id","user_id","expires_at");