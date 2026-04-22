ALTER TABLE "agents"."agent_narrative_store" RENAME COLUMN "role_id" TO "role_key";--> statement-breakpoint
ALTER TABLE "agents"."agent_narrative_store" ALTER COLUMN "role_key" SET DATA TYPE text;
