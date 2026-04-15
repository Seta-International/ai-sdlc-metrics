-- ─── Directory Search Index ────────────────────────────────────────────────────
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
	"search_vector" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_directory_search_index_employment" ON "people"."directory_search_index" USING btree ("tenant_id","employment_id");
--> statement-breakpoint

-- ─── Email Generation Config ───────────────────────────────────────────────────
CREATE TABLE "people"."email_generation_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"pattern" text NOT NULL,
	"transliteration" text NOT NULL
);
--> statement-breakpoint

-- ─── Profile Share Link ────────────────────────────────────────────────────────
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

-- ─── Bulk Operation ────────────────────────────────────────────────────────────
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

-- ─── Import Job ────────────────────────────────────────────────────────────────
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

-- ─── tsvector GIN Index for full-text search ────────────────────────────────────
CREATE INDEX "idx_directory_search_vector" ON "people"."directory_search_index" USING GIN (
  to_tsvector(
    'simple',
    coalesce(full_name, '') || ' ' ||
    coalesce(full_name_unaccented, '') || ' ' ||
    coalesce(company_email, '') || ' ' ||
    coalesce(job_title, '') || ' ' ||
    coalesce(department_name, '')
  )
);
