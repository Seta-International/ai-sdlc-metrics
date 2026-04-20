ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_personal_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin"."tenant_settings" ADD COLUMN "timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL;
