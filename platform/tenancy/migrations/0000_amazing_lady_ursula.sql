CREATE SCHEMA "tenant";
--> statement-breakpoint
CREATE TABLE "tenant"."tenant_connectors" (
	"tenant_id" uuid NOT NULL,
	"connector_id" text NOT NULL,
	"status" text DEFAULT 'pending_consent' NOT NULL,
	"consented_at" timestamp with time zone,
	"consented_by_user_id" uuid,
	"scope_set" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_connectors_tenant_id_connector_id_pk" PRIMARY KEY("tenant_id","connector_id")
);
--> statement-breakpoint
CREATE TABLE "tenant"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "tenant"."tenant_connectors" ADD CONSTRAINT "tenant_connectors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenant"."tenants"("id") ON DELETE no action ON UPDATE no action;