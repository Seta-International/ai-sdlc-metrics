\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

-- FK to a missing course rejected
SELECT throws_ok(
  $$ insert into lnd.attendance_log (course_id, session_no, employee_id, attendance_status, training_hours)
     select 999999, 1, (select employee_id from core.employee limit 1), 'Present', 2.0 $$,
  '23503', NULL, 'attendance FK to missing course rejected');

-- FK to a missing trainer rejected
SELECT throws_ok(
  $$ insert into lnd.course_catalog (course_code, course_name, topic_category, trainer_id,
        total_sessions, hours_per_session, total_hours, pass_threshold_score, start_date, end_date, status)
     select 'C-X','x','QA', 999999, 6, 2.0, 12.0, 6.0, '2026-01-01','2026-01-31','Completed' $$,
  '23503', NULL, 'course FK to missing trainer rejected');

-- invalid course status rejected
SELECT throws_ok(
  $$ insert into lnd.course_catalog (course_code, course_name, topic_category, trainer_id,
        total_sessions, hours_per_session, total_hours, pass_threshold_score, start_date, end_date, status)
     select 'C-Y','y','QA', (select trainer_id from core.trainer limit 1),
        6, 2.0, 12.0, 6.0, '2026-01-01','2026-01-31','Done' $$,
  '23514', NULL, 'invalid course status rejected');

-- invalid attendance_status rejected
SELECT throws_ok(
  $$ insert into lnd.attendance_log (course_id, session_no, employee_id, attendance_status, training_hours)
     select (select course_id from lnd.course_catalog limit 1), 1,
            (select employee_id from core.employee limit 1), 'Maybe', 2.0 $$,
  '23514', NULL, 'invalid attendance_status rejected');

-- score out of 0..10 rejected
SELECT throws_ok(
  $$ insert into lnd.assessment_score (course_id, employee_id, score_0_to_10, pass_status)
     select (select course_id from lnd.course_catalog limit 1),
            (select employee_id from core.employee limit 1), 11.0, true $$,
  '23514', NULL, 'score > 10 rejected');

-- trainer_rating out of 1..5 rejected
SELECT throws_ok(
  $$ insert into lnd.feedback_survey (course_id, employee_id, trainer_rating, content_rating)
     select (select course_id from lnd.course_catalog limit 1),
            (select employee_id from core.employee limit 1), 6.0, 4.0 $$,
  '23514', NULL, 'trainer_rating > 5 rejected');

-- duplicate (course, session, employee) attendance rejected
SELECT throws_ok(
  $$ insert into lnd.attendance_log (course_id, session_no, employee_id, attendance_status, training_hours)
     select course_id, session_no, employee_id, 'Present', 2.0 from lnd.attendance_log limit 1 $$,
  '23505', NULL, 'duplicate (course,session,employee) attendance rejected');

-- duplicate (course, employee) assessment rejected
SELECT throws_ok(
  $$ insert into lnd.assessment_score (course_id, employee_id, score_0_to_10, pass_status)
     select course_id, employee_id, 5.0, false from lnd.assessment_score limit 1 $$,
  '23505', NULL, 'duplicate (course,employee) assessment rejected');

SELECT * FROM finish();
ROLLBACK;
