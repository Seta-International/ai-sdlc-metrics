CREATE TABLE "people"."job_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"job_title" text,
	"department_id" uuid,
	"manager_profile_id" uuid,
	"change_type" text NOT NULL,
	"change_reason" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."my_day_entry" (
	"actor_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"added_date" date NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "my_day_entry_actor_id_task_id_added_date_pk" PRIMARY KEY("actor_id","task_id","added_date")
);
--> statement-breakpoint
CREATE TABLE "planner"."task_daily_snapshot" (
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_count" integer NOT NULL,
	"open_count" integer NOT NULL,
	"completed_count" integer NOT NULL,
	"by_priority" jsonb NOT NULL,
	"by_bucket" jsonb NOT NULL,
	"by_assignee" jsonb NOT NULL,
	"completed_in_day" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_daily_snapshot_tenant_id_plan_id_snapshot_date_pk" PRIMARY KEY("tenant_id","plan_id","snapshot_date")
);
--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_views_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_grid_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_schedule_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_charts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_charts_trends_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_personal_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."employment" ADD COLUMN "previous_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "planner"."plan" ADD COLUMN "owner_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "planner"."plan" ADD COLUMN "sync_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_history_tenant_profile_from_uidx" ON "people"."job_history" USING btree ("tenant_id","profile_id","effective_from");--> statement-breakpoint
CREATE INDEX "idx_my_day_entry_today" ON "planner"."my_day_entry" USING btree ("tenant_id","actor_id","added_date");--> statement-breakpoint
CREATE INDEX "idx_my_day_entry_task" ON "planner"."my_day_entry" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_plan_tenant_owner_actor" ON "planner"."plan" USING btree ("tenant_id","owner_actor_id") WHERE "planner"."plan"."owner_actor_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "people"."job_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."job_history"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING (tenant_id::text = current_setting('app.tenant_id', true));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employment_detail_custom_fields_gin_idx"
  ON "people"."employment_detail" USING gin (custom_fields);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_history_tenant_profile_eto_idx"
  ON "people"."job_history" ("tenant_id", "profile_id", "effective_to");