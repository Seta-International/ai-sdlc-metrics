CREATE SCHEMA "directory";
--> statement-breakpoint
CREATE TABLE "directory"."external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_subject" text NOT NULL,
	"raw_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ext_identity_unique" ON "directory"."external_identities" USING btree ("provider_id","external_subject");