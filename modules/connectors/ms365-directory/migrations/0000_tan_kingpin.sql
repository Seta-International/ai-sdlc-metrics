CREATE SCHEMA "connector_ms365_directory";
--> statement-breakpoint
CREATE TABLE "connector_ms365_directory"."directory_group_members" (
	"tenant_id" uuid NOT NULL,
	"entra_group_id" text NOT NULL,
	"entra_object_id" text NOT NULL,
	"role" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_group_members_tenant_id_entra_group_id_entra_object_id_pk" PRIMARY KEY("tenant_id","entra_group_id","entra_object_id")
);
--> statement-breakpoint
CREATE TABLE "connector_ms365_directory"."directory_groups" (
	"tenant_id" uuid NOT NULL,
	"entra_group_id" text NOT NULL,
	"display_name" text,
	"group_type" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_groups_tenant_id_entra_group_id_pk" PRIMARY KEY("tenant_id","entra_group_id")
);
--> statement-breakpoint
CREATE TABLE "connector_ms365_directory"."directory_users" (
	"tenant_id" uuid NOT NULL,
	"entra_object_id" text NOT NULL,
	"user_principal_name" text,
	"mail" text,
	"display_name" text,
	"manager_id" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_users_tenant_id_entra_object_id_pk" PRIMARY KEY("tenant_id","entra_object_id")
);
--> statement-breakpoint
CREATE TABLE "connector_ms365_directory"."sync_state" (
	"tenant_id" uuid NOT NULL,
	"resource_kind" text NOT NULL,
	"delta_token" text,
	"last_full_sync_at" timestamp with time zone,
	"last_delta_sync_at" timestamp with time zone,
	"status" text DEFAULT 'idle' NOT NULL,
	CONSTRAINT "sync_state_tenant_id_resource_kind_pk" PRIMARY KEY("tenant_id","resource_kind")
);
