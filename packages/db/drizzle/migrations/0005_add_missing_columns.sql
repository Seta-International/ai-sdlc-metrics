ALTER TABLE "people"."employment_profile" ALTER COLUMN "employee_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."employment_profile" ALTER COLUMN "company_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."employment_profile" ALTER COLUMN "job_title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."offboarding_task" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "people"."onboarding_task" ADD COLUMN "description" text;