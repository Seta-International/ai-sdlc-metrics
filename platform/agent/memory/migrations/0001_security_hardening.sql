-- FORCE RLS plus tenant_user GRANTs. drizzle-kit 0.31.10 does not model
-- these clauses, so they live in a hand-authored migration. Mirrors the
-- platform/oauth pattern in 0001_security_hardening.sql.
ALTER TABLE "agent_memory"."threads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_memory"."messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_memory"."resources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT USAGE ON SCHEMA "agent_memory" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."threads" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."messages" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."resources" TO "tenant_user";
