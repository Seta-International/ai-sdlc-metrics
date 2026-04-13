CREATE UNIQUE INDEX IF NOT EXISTS "uq_notification_preference" ON "notifications"."notification_preference" USING btree ("tenant_id","actor_id","category");
