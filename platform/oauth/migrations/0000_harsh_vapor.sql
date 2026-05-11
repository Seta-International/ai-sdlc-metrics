CREATE SCHEMA "oauth";
--> statement-breakpoint
CREATE TABLE "oauth"."oauth_state" (
	"state" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"connector_ids" text[] NOT NULL,
	"nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth"."oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"partition_key" text NOT NULL,
	"scope_set" jsonb NOT NULL,
	"envelope_version" smallint DEFAULT 1 NOT NULL,
	"kms_key_id" text NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_tokens_unique" ON "oauth"."oauth_tokens" USING btree ("tenant_id","provider_id","partition_key");