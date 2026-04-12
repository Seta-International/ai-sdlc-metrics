CREATE TABLE "admin"."tenant_email_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"from_address" text NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"credential_ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_email_config_tenant_id_unique" UNIQUE("tenant_id")
);
