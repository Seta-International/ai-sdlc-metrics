\set ON_ERROR_STOP on
BEGIN;
SELECT plan(5);

-- In-Progress course has NULL derived metrics in the view
SELECT ok(
  (SELECT completion_rate IS NULL AND avg_score IS NULL AND pass_rate IS NULL
     FROM lnd.v_course_effectiveness WHERE course_code = 'Leadership_06_2026'),
  'in-progress course has NULL derived metrics');

-- a score 0.0 with pass_status false exists (did-not-submit)
SELECT cmp_ok( (SELECT count(*) FROM lnd.assessment_score
                WHERE score_0_to_10 = 0 AND pass_status = false)::int, '>=', 1,
               'a score 0.0 / pass-false (did-not-submit) row exists');

-- a NULL generalized_feedback exists
SELECT cmp_ok( (SELECT count(*) FROM lnd.assessment_score
                WHERE generalized_feedback IS NULL)::int, '>=', 1,
               'a NULL generalized_feedback row exists');

-- a trainer_rating = 3.0 exists (low, near NORM-08 threshold)
SELECT cmp_ok( (SELECT count(*) FROM lnd.feedback_survey
                WHERE trainer_rating = 3.0)::int, '>=', 1,
               'a trainer_rating = 3.0 row exists');

-- a Late attendance exists (NORM-12 partial attendance)
SELECT cmp_ok( (SELECT count(*) FROM lnd.attendance_log
                WHERE attendance_status = 'Late')::int, '>=', 1,
               'a Late attendance row exists');

SELECT * FROM finish();
ROLLBACK;
