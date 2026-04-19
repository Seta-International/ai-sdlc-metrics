ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_views_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_grid_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_schedule_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_charts_enabled" boolean DEFAULT false NOT NULL;
