CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE TABLE "identity"."api_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."identity_provider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_type" text NOT NULL,
	"display_name" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ref" text NOT NULL,
	"directory_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."idp_group_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"external_group_id" text NOT NULL,
	"external_group_name" text NOT NULL,
	"role_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."magic_link_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_identity_provider_tenant_primary" ON "identity"."identity_provider" USING btree ("tenant_id","is_primary") WHERE "identity"."identity_provider"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_idp_group_mapping_role_scope" ON "identity"."idp_group_mapping" USING btree ("tenant_id","external_group_id","role_key","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "idx_magic_link_token_hash_unused" ON "identity"."magic_link_token" USING btree ("token_hash") WHERE "identity"."magic_link_token"."used_at" IS NULL;

-- RLS for identity schema
ALTER TABLE "identity"."identity_provider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."identity_provider"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "identity"."idp_group_mapping" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."idp_group_mapping"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "identity"."magic_link_token" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."magic_link_token"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "identity"."api_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."api_key"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));