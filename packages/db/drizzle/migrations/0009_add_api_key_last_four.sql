ALTER TABLE "identity"."api_key" ADD COLUMN "key_last_four" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "identity"."api_key" ALTER COLUMN "key_last_four" DROP DEFAULT;
