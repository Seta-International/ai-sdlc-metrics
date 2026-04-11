CREATE TABLE "people"."account_membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people"."contract_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"contract_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"probation_end_date" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employment_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"employee_code" text NOT NULL,
	"company_email" text NOT NULL,
	"employment_type" text NOT NULL,
	"employment_status" text DEFAULT 'pre_hire' NOT NULL,
	"work_arrangement" text DEFAULT 'onsite' NOT NULL,
	"hire_date" timestamp NOT NULL,
	"termination_date" timestamp,
	"job_title" text NOT NULL,
	"job_level" text,
	"cost_center" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employment_profile_detail" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"national_id" text,
	"national_id_issued_date" date,
	"national_id_issued_place" text,
	"old_national_id" text,
	"old_national_id_issued_date" date,
	"old_national_id_issued_place" text,
	"tax_id" text,
	"social_insurance_number" text,
	"bank_account_number" text,
	"bank_name" text,
	"bank_branch" text,
	"dob" date,
	"gender" text,
	"marital_status" text,
	"permanent_address" text,
	"current_address" text,
	"personal_phone" text,
	"personal_email" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"motorbike_plate" text
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"template_id" uuid,
	"reason" text NOT NULL,
	"reason_category" text,
	"decision_case_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assignee_role" text NOT NULL,
	"assignee_actor_id" uuid,
	"due_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_task_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_role" text NOT NULL,
	"due_days_before_last_day" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"employment_type" text,
	"reason_category" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"template_id" uuid,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assignee_role" text NOT NULL,
	"assignee_actor_id" uuid,
	"due_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_task_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_role" text NOT NULL,
	"due_days_after_hire" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"employment_type" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."periodic_profile_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people"."profile_change_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_case_id" uuid,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."profile_section" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"section_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."decision_outcome" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "core"."decision_step" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "people"."employment_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."employment_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "employment_profile_tenant_isolation" ON "people"."employment_profile" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."employment_profile_detail" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."employment_profile_detail" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "employment_profile_detail_tenant_isolation" ON "people"."employment_profile_detail" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."profile_section" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."profile_section" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "profile_section_tenant_isolation" ON "people"."profile_section" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."profile_change_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."profile_change_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "profile_change_request_tenant_isolation" ON "people"."profile_change_request" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."periodic_profile_review" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."periodic_profile_review" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "periodic_profile_review_tenant_isolation" ON "people"."periodic_profile_review" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_template_tenant_isolation" ON "people"."onboarding_template" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_task_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_task_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_task_template_tenant_isolation" ON "people"."onboarding_task_template" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_case" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_case" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_case_tenant_isolation" ON "people"."onboarding_case" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_task" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_task_tenant_isolation" ON "people"."onboarding_task" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "offboarding_template_tenant_isolation" ON "people"."offboarding_template" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_task_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_task_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "offboarding_task_template_tenant_isolation" ON "people"."offboarding_task_template" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_case" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_case" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "offboarding_case_tenant_isolation" ON "people"."offboarding_case" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_task" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "offboarding_task_tenant_isolation" ON "people"."offboarding_task" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."account_membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."account_membership" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "account_membership_tenant_isolation" ON "people"."account_membership" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."contract_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."contract_version" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contract_version_tenant_isolation" ON "people"."contract_version" USING (tenant_id = current_setting('app.tenant_id', true)::uuid);