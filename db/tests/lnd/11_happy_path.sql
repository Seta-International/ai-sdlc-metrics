\set ON_ERROR_STOP on
BEGIN;
SELECT plan(8);

SELECT is( (SELECT count(*) FROM lnd.course_catalog)::int, 6, '6 courses seeded');
SELECT is( (SELECT count(*) FROM lnd.course_catalog WHERE status='Completed')::int, 5,
           '5 Completed courses');
SELECT is( (SELECT count(*) FROM lnd.training_norm)::int, 15, '15 NORM rules');
SELECT is( (SELECT count(*) FROM lnd.report_template_section)::int, 10, '10 report sections');

-- one cost row per course
SELECT is(
  (SELECT count(*) FROM lnd.course_catalog c
     WHERE NOT EXISTS (SELECT 1 FROM lnd.training_cost t WHERE t.course_id = c.course_id))::int,
  0, 'every course has a training_cost row');

-- every attendance row resolves to a real course + employee
SELECT is(
  (SELECT count(*) FROM lnd.attendance_log a
     JOIN lnd.course_catalog c USING (course_id)
     JOIN core.employee e USING (employee_id))::int,
  (SELECT count(*) FROM lnd.attendance_log)::int,
  'every attendance row resolves to course + employee');

-- every assessment row resolves to a real course + employee
SELECT is(
  (SELECT count(*) FROM lnd.assessment_score s
     JOIN lnd.course_catalog c USING (course_id)
     JOIN core.employee e USING (employee_id))::int,
  (SELECT count(*) FROM lnd.assessment_score)::int,
  'every assessment row resolves to course + employee');

-- v_course_effectiveness yields a numeric pass_rate for a Completed course
SELECT isnt(
  (SELECT pass_rate FROM lnd.v_course_effectiveness WHERE course_code = 'Golang_04_2026'),
  NULL, 'v_course_effectiveness.pass_rate is populated for the Golang course');

SELECT * FROM finish();
ROLLBACK;
