-- Migration: people-onboarding-events
-- Adds country_code, worker_type to onboarding_template
-- Adds document_requirement_id to onboarding_task_template
-- Renames profile_id → employment_id on onboarding_case
-- Adds country_code, termination_reason to offboarding_template
-- Renames profile_id → employment_id on offboarding_case
-- Note: employment_type enum change (remove 'contractor') is Drizzle-level only;
--       no DDL needed since the column is plain text in PostgreSQL.

ALTER TABLE "people"."onboarding_template" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "people"."onboarding_template" ADD COLUMN "worker_type" text;--> statement-breakpoint
ALTER TABLE "people"."onboarding_task_template" ADD COLUMN "document_requirement_id" uuid;--> statement-breakpoint
ALTER TABLE "people"."onboarding_case" RENAME COLUMN "profile_id" TO "employment_id";--> statement-breakpoint
ALTER TABLE "people"."offboarding_template" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "people"."offboarding_template" ADD COLUMN "termination_reason" text;--> statement-breakpoint
ALTER TABLE "people"."offboarding_case" RENAME COLUMN "profile_id" TO "employment_id";
