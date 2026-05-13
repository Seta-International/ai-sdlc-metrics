-- Drop RLS policies that cast user_id to uuid before altering column type
DROP POLICY "user_owns_row_d" ON "agent"."write_continuations";
DROP POLICY "user_owns_row_w" ON "agent"."write_continuations";

ALTER TABLE "agent"."write_continuations" ALTER COLUMN "user_id" SET DATA TYPE text;

-- Recreate policies using text comparison (no cast needed)
CREATE POLICY "user_owns_row_d" ON "agent"."write_continuations"
  FOR DELETE USING (user_id = current_setting('app.user_id', true));
CREATE POLICY "user_owns_row_w" ON "agent"."write_continuations"
  FOR UPDATE USING (user_id = current_setting('app.user_id', true));
