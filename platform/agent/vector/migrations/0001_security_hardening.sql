-- FORCE RLS plus tenant_user GRANTs. drizzle-kit 0.31.10 does not model
-- these clauses, so they live in a hand-authored migration. Mirrors the
-- platform/oauth and platform/agent/memory 0001_security_hardening.sql
-- pattern.
ALTER TABLE "agent_vector"."chunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT USAGE ON SCHEMA "agent_vector" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_vector"."chunks" TO "tenant_user";