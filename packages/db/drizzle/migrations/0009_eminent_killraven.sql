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
ALTER TABLE "people"."employment" ADD COLUMN "previous_profile_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "job_history_tenant_profile_from_uidx" ON "people"."job_history" USING btree ("tenant_id","profile_id","effective_from");--> statement-breakpoint
ALTER TABLE "people"."job_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."job_history"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employment_detail_custom_fields_gin_idx"
  ON "people"."employment_detail" USING gin (custom_fields);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_history_tenant_profile_eto_idx"
  ON "people"."job_history" ("tenant_id", "profile_id", "effective_to");
