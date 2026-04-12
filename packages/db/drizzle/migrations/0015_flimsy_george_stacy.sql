CREATE SCHEMA "preferences";
--> statement-breakpoint
CREATE TABLE "preferences"."saved_view" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"resource_key" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"state_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "saved_view_tenant_actor_resource_idx" ON "preferences"."saved_view" USING btree ("tenant_id","actor_id","resource_key");--> statement-breakpoint
CREATE INDEX "saved_view_unique_default_idx" ON "preferences"."saved_view" USING btree ("tenant_id","actor_id","resource_key") WHERE is_default = true;
