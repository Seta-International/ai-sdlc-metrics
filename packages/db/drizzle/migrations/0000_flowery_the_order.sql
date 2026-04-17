CREATE SCHEMA "admin";
--> statement-breakpoint
CREATE SCHEMA "agents";
--> statement-breakpoint
CREATE SCHEMA "documents";
--> statement-breakpoint
CREATE SCHEMA "finance";
--> statement-breakpoint
CREATE SCHEMA "goals";
--> statement-breakpoint
CREATE SCHEMA "hiring";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "insights";
--> statement-breakpoint
CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE SCHEMA "people";
--> statement-breakpoint
CREATE SCHEMA "performance";
--> statement-breakpoint
CREATE SCHEMA "planner";
--> statement-breakpoint
CREATE SCHEMA "preferences";
--> statement-breakpoint
CREATE SCHEMA "projects";
--> statement-breakpoint
CREATE SCHEMA "time";
--> statement-breakpoint
CREATE TABLE "admin"."tenant_email_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"from_address" text NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"credential_ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_email_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_insight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"module" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"action_label" text,
	"action_href" text,
	"is_dismissed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_name" text,
	"tool_args" jsonb,
	"model_used" text,
	"tokens_used" integer,
	"is_error" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"agent_id" uuid,
	"channel_type" text DEFAULT 'web_chat' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"context_module" text,
	"context_entity" text,
	"context_entity_id" text,
	"context_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents"."generation_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_data" jsonb NOT NULL,
	"output_file_key" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "documents"."template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents"."tenant_branding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"logo_file_key" text,
	"primary_color" text,
	"font_family" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_branding_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."api_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_last_four" text NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."identity_provider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_type" text NOT NULL,
	"display_name" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ref" text NOT NULL,
	"directory_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."idp_group_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"external_group_id" text NOT NULL,
	"external_group_name" text NOT NULL,
	"role_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."magic_link_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."sync_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"status" text NOT NULL,
	"users_created" integer DEFAULT 0 NOT NULL,
	"users_deactivated" integer DEFAULT 0 NOT NULL,
	"roles_changed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."actor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"module" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."decision_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."decision_outcome" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"final_action" text NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp DEFAULT now() NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "core"."decision_step" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approver_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."delegation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delegator_id" uuid NOT NULL,
	"delegatee_id" uuid NOT NULL,
	"role" text NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."department" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"cost_center_code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."exposure_contract" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"allowed_roles" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."external_identity_map" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"system_name" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."org_placement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"manager_id" uuid,
	"effective_from" timestamp NOT NULL,
	"effective_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."outbox_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."role_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"granted_by" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."role_permission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."tenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan_tier" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "core"."user_identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"email" text NOT NULL,
	"sso_subject" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."visibility_scope" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sender_id" uuid,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"resource_type" text,
	"resource_id" uuid,
	"resource_url" text,
	"read_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notification_preference" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."profile_change_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"batch_id" uuid,
	"field_path" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb NOT NULL,
	"effective_date" date,
	"status" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_note" text,
	"decision_case_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."completeness_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"weight" integer NOT NULL,
	"is_required" boolean NOT NULL,
	"country_code" text,
	"employment_type" text,
	"deadline_days" integer,
	"label" text NOT NULL,
	"section" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."document_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"employment_type" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"is_required" boolean NOT NULL,
	"deadline_days" integer,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employee_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"title" text NOT NULL,
	"expiry_date" date,
	"is_confidential" boolean NOT NULL,
	"requires_acknowledgment" boolean NOT NULL,
	"acknowledged_at" timestamp,
	"acknowledged_by" uuid,
	"version" integer NOT NULL,
	"parent_document_id" uuid,
	"status" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."country_field_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"label_locale" jsonb,
	"field_type" text NOT NULL,
	"field_group" text NOT NULL,
	"is_required" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"validation" jsonb,
	"options" jsonb
);
--> statement-breakpoint
CREATE TABLE "people"."custom_field_definition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"field_group" text,
	"is_required" boolean NOT NULL,
	"is_searchable" boolean NOT NULL,
	"is_filterable" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"validation" jsonb,
	"options" jsonb,
	"visibility_tier" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."field_edit_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"edit_mode" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."field_visibility_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"visibility_tier" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."bulk_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation_type" text NOT NULL,
	"employment_ids" uuid[] NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_count" integer NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people"."contract_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"max_fixed_term_months" integer,
	"max_fixed_term_renewals" integer,
	"force_indefinite_after" boolean DEFAULT false NOT NULL,
	"probation_requires_contract" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."contract_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"contract_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"probation_end_date" date,
	"notice_period_days" integer,
	"work_hours_per_week" numeric,
	"base_salary" numeric,
	"salary_currency" text,
	"salary_frequency" text,
	"document_id" uuid,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"signed_at" timestamp,
	"signed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "people"."directory_search_index" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"full_name_unaccented" text NOT NULL,
	"company_email" text,
	"job_title" text,
	"job_level" text,
	"department_name" text,
	"location_name" text,
	"manager_name" text,
	"work_arrangement" text NOT NULL,
	"employment_status" text NOT NULL,
	"hire_date" date,
	"skills" text[],
	"country_code" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."email_generation_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"pattern" text NOT NULL,
	"transliteration" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_profile_id" uuid NOT NULL,
	"employee_code" text,
	"company_email" text,
	"worker_type" text NOT NULL,
	"employment_type" text NOT NULL,
	"country_code" text,
	"employment_status" text DEFAULT 'pre_hire' NOT NULL,
	"termination_date" date,
	"termination_reason" text,
	"hire_date" date NOT NULL,
	"original_hire_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employment_detail" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"national_id" text,
	"national_id_type" text,
	"national_id_issued_date" date,
	"national_id_expiry_date" date,
	"tax_id" text,
	"social_insurance_id" text,
	"passport_number" text,
	"passport_expiry_date" date,
	"bank_account_number" text,
	"bank_name" text,
	"bank_branch" text,
	"bank_account_holder" text,
	"bank_swift_code" text,
	"personal_email" text,
	"personal_phone" text,
	"permanent_address" jsonb,
	"current_address" jsonb,
	"emergency_contacts" jsonb,
	"country_data" jsonb,
	"custom_fields" jsonb
);
--> statement-breakpoint
CREATE TABLE "people"."import_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_document_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"column_mapping" jsonb,
	"mapping_profile" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"valid_count" integer,
	"error_count" integer,
	"warning_count" integer,
	"validation_report" jsonb,
	"created_count" integer,
	"updated_count" integer,
	"skipped_count" integer,
	"error_details" jsonb,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people"."job_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"job_profile_id" uuid,
	"department_id" uuid,
	"location_id" uuid,
	"cost_center_id" uuid,
	"work_arrangement" text DEFAULT 'onsite' NOT NULL,
	"manager_id" uuid,
	"event_type" text NOT NULL,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."job_family" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."job_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_family_id" uuid,
	"title" text NOT NULL,
	"level" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
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
	"description" text,
	"assignee_role" text NOT NULL,
	"assignee_actor_id" uuid,
	"due_date" timestamp,
	"is_required" boolean DEFAULT true NOT NULL,
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
	"country_code" text,
	"termination_reason" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
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
	"description" text,
	"assignee_role" text NOT NULL,
	"assignee_actor_id" uuid,
	"due_date" timestamp,
	"is_required" boolean DEFAULT true NOT NULL,
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
	"display_order" integer DEFAULT 0 NOT NULL,
	"document_requirement_id" uuid
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country_code" text,
	"worker_type" text,
	"employment_type" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."person_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"family_name" text,
	"middle_name" text,
	"given_name" text,
	"full_name" text,
	"full_name_unaccented" text,
	"preferred_name" text,
	"name_display_order" text DEFAULT 'given_first' NOT NULL,
	"date_of_birth" date,
	"gender" text,
	"nationality" text,
	"marital_status" text,
	"photo_document_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."probation_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"job_level_category" text NOT NULL,
	"default_duration_days" integer NOT NULL,
	"max_duration_days" integer NOT NULL,
	"allow_extension" boolean NOT NULL,
	"max_extensions" integer DEFAULT 0 NOT NULL,
	"extension_days" integer,
	"min_salary_percentage" numeric DEFAULT '100' NOT NULL,
	"auto_confirm" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."probation_record" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"original_end_date" date NOT NULL,
	"current_end_date" date NOT NULL,
	"extension_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"outcome_date" date,
	"outcome_by" uuid,
	"outcome_note" text,
	"probation_policy_id" uuid NOT NULL,
	"salary_percentage" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "people"."profile_share_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"max_views" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "preferences"."saved_view" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"resource_key" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"state_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_company" text,
	"description" text,
	"domain" text,
	"location" text,
	"timezone" text,
	"billing_model" text,
	"status" text DEFAULT 'active' NOT NULL,
	"account_manager_id" uuid,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."allocation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_role_id" uuid NOT NULL,
	"actor_id" uuid,
	"position" text,
	"hours_per_day" numeric(4, 2) NOT NULL,
	"billing_type" text NOT NULL,
	"member_type" text DEFAULT 'core' NOT NULL,
	"status" text DEFAULT 'tentative' NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."project" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"delivery_model" text,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."project_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role_name" text NOT NULL,
	"skills_required" text[],
	"headcount" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_identity_provider_tenant_primary" ON "identity"."identity_provider" USING btree ("tenant_id","is_primary") WHERE "identity"."identity_provider"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_idp_group_mapping_role_scope_scoped" ON "identity"."idp_group_mapping" USING btree ("tenant_id","external_group_id","role_key","scope_type","scope_id") WHERE "identity"."idp_group_mapping"."scope_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_idp_group_mapping_role_scope_global" ON "identity"."idp_group_mapping" USING btree ("tenant_id","external_group_id","role_key","scope_type") WHERE "identity"."idp_group_mapping"."scope_id" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_magic_link_token_hash_unused" ON "identity"."magic_link_token" USING btree ("token_hash") WHERE "identity"."magic_link_token"."used_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_sync_history_tenant_started" ON "identity"."sync_history" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_permission_tenant_role_perm" ON "core"."role_permission" USING btree ("tenant_id","role_key","permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_identity_tenant_sso_subject" ON "core"."user_identity" USING btree ("tenant_id","sso_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_preference" ON "notifications"."notification_preference" USING btree ("tenant_id","actor_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "country_field_config_country_key_uidx" ON "people"."country_field_config" USING btree ("tenant_id","country_code","field_key");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definition_tenant_key_uidx" ON "people"."custom_field_definition" USING btree ("tenant_id","field_key");--> statement-breakpoint
CREATE UNIQUE INDEX "field_edit_policy_tenant_path_uidx" ON "people"."field_edit_policy" USING btree ("tenant_id","field_path");--> statement-breakpoint
CREATE UNIQUE INDEX "field_visibility_config_tenant_path_uidx" ON "people"."field_visibility_config" USING btree ("tenant_id","field_path");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_directory_search_index_employment" ON "people"."directory_search_index" USING btree ("tenant_id","employment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employment_detail_tenant_employment_uidx" ON "people"."employment_detail" USING btree ("tenant_id","employment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_profile_tenant_actor_uidx" ON "people"."person_profile" USING btree ("tenant_id","actor_id");--> statement-breakpoint
CREATE INDEX "saved_view_tenant_actor_resource_idx" ON "preferences"."saved_view" USING btree ("tenant_id","actor_id","resource_key");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_unique_default_idx" ON "preferences"."saved_view" USING btree ("tenant_id","actor_id","resource_key") WHERE is_default = true;