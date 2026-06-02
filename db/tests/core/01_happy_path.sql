\set ON_ERROR_STOP on
BEGIN;
SELECT plan(10);

SELECT is( (SELECT count(*) FROM core.worker_type)::int, 4, '4 worker types' );
SELECT is( (SELECT count(*) FROM core.employment_status)::int, 5, '5 employment statuses' );
SELECT is( (SELECT count(*) FROM core.career_level)::int, 7, '7 career levels' );
SELECT is( (SELECT count(*) FROM core.metric_norm)::int, 12, '12 metric norms (N01..N12)' );
SELECT is( (SELECT count(*) FROM core.account WHERE is_internal)::int, 1, 'exactly one internal account' );
-- every metric norm has its RAG bands
SELECT is(
  (SELECT count(*) FROM core.metric_norm m
     WHERE NOT EXISTS (SELECT 1 FROM core.metric_norm_threshold t
                         WHERE t.metric_norm_id = m.metric_norm_id))::int,
  0, 'every metric_norm has >=1 threshold');
-- masters non-empty
SELECT cmp_ok( (SELECT count(*) FROM core.department)::int, '>=', 5, '>=5 departments' );
SELECT cmp_ok( (SELECT count(*) FROM core.project)::int, '>=', 6, '>=6 projects' );
SELECT cmp_ok( (SELECT count(*) FROM core.skill)::int, '>=', 15, '>=15 skills' );
-- referential sanity: no project without a valid account (FK guarantees, assert join count)
SELECT is(
  (SELECT count(*) FROM core.project p JOIN core.account a USING (account_id))::int,
  (SELECT count(*) FROM core.project)::int,
  'every project resolves to an account');

SELECT * FROM finish();
ROLLBACK;
