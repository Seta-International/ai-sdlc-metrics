ALTER TABLE "auth"."sso_configs" ADD COLUMN "last_tested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."sso_configs" ADD COLUMN "last_test_result" text;