CREATE TABLE IF NOT EXISTS "planner"."task_daily_snapshot" (
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
CREATE INDEX IF NOT EXISTS "task_daily_snapshot_plan_date_idx" ON "planner"."task_daily_snapshot" ("plan_id","snapshot_date" DESC);
--> statement-breakpoint
ALTER TABLE "planner"."task_daily_snapshot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task_daily_snapshot" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task_daily_snapshot"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
