\set ON_ERROR_STOP on
BEGIN;
SELECT plan(9);

-- a NULL-project Training/Internal log exists and is excluded from project_logged_hours
SELECT cmp_ok( (SELECT count(*) FROM pmo.timesheet_log
                WHERE project_id IS NULL AND log_category IN ('Training','Internal'))::int,
               '>=', 1, 'a NULL-project Training/Internal log exists');
SELECT cmp_ok(
  (SELECT logged_hours - project_logged_hours FROM pmo.v_member_week_hours
     WHERE emp_code = 'EMP-0007' AND week_start = '2026-06-29')::numeric,
  '>', 0::numeric, 'EMP-007 W1 has non-project hours excluded from project_logged_hours');

-- onboarding gap: new joiner EMP-013 has an allocation but ZERO logs in weeks W1 + W2
SELECT is(
  (SELECT logged_hours FROM pmo.v_member_week_hours
     WHERE emp_code = 'EMP-0013' AND week_start = '2026-06-29')::numeric,
  0::numeric, 'EMP-013 has zero logged hours in onboarding week W1');
SELECT cmp_ok(
  (SELECT planned_hours FROM pmo.v_member_week_hours
     WHERE emp_code = 'EMP-0013' AND week_start = '2026-06-29')::numeric,
  '>', 0::numeric, 'EMP-013 still has a planned allocation in W1 (gap, not absence of plan)');

-- approved Annual Leave day + company-wide Public Holiday (employee_id NULL) both exist
SELECT cmp_ok( (SELECT count(*) FROM pmo.leave_record
                WHERE leave_type='Annual Leave' AND approved)::int, '>=', 1,
               'an approved Annual Leave day exists');
SELECT cmp_ok( (SELECT count(*) FROM pmo.leave_record
                WHERE leave_type='Public Holiday' AND employee_id IS NULL)::int, '>=', 1,
               'a company-wide Public Holiday (NULL employee) exists');

-- an RA-vs-logged mismatch member exists in the week view
SELECT cmp_ok( (SELECT count(*) FROM pmo.v_member_week_hours WHERE is_mismatch)::int, '>=', 1,
               'a member with an RA-vs-logged mismatch exists');

-- an approved-OT week (>48h logged) exists WITH a matching approved OT-Comp leave record (excludable)
SELECT cmp_ok( (
  SELECT count(*) FROM pmo.v_member_week_hours v
  WHERE v.logged_hours > 48
    AND EXISTS (SELECT 1 FROM pmo.leave_record lr
                WHERE lr.employee_id = v.employee_id
                  AND lr.leave_type = 'Approved OT Comp' AND lr.approved))::int,
  '>=', 1, 'an approved-OT week exists and is excludable via an approved OT-Comp record');

-- the Phase-1 overbooked member EMP-003 shows is_overbook in the week view
SELECT cmp_ok( (SELECT count(*) FROM pmo.v_member_week_hours
                WHERE emp_code='EMP-0003' AND is_overbook)::int, '>=', 1,
               'EMP-003 is flagged overbook in the week view');

SELECT * FROM finish();
ROLLBACK;
