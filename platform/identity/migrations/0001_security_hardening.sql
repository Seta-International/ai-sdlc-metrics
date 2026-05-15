ALTER TABLE "auth"."sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."users" TO "tenant_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."user_identities" TO "tenant_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."sessions" TO "tenant_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."api_keys" TO "tenant_user";
