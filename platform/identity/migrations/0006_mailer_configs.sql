CREATE TABLE "auth"."mailer_configs" (
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb NOT NULL,
	"secret_vault_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailer_configs_tenant_id_provider_pk" PRIMARY KEY("tenant_id","provider")
);
