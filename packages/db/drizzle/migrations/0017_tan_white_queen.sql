CREATE TABLE "identity"."sync_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"status" text NOT NULL,
	"users_created" integer DEFAULT 0 NOT NULL,
	"users_deactivated" integer DEFAULT 0 NOT NULL,
	"roles_changed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sync_history_tenant_started" ON "identity"."sync_history" USING btree ("tenant_id","started_at");