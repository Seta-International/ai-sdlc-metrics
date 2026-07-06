-- Local-only seed data for the Grafana dev stack (infra/docker/compose.local.yml).
-- Loaded automatically by the local Postgres after init.sql + views.sql.
-- Never run this against a real reporting database.

-- Three sprints for Future with an improving trend, so stat panels, gauges,
-- and the sprint trend timeseries all have data to draw.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('S1', DATE '2026-06-29', DATE '2026-07-13'),
  ('S2', DATE '2026-07-13', DATE '2026-07-27'),
  ('S3', DATE '2026-07-27', DATE '2026-08-10')
),
vals(period_key, metric_key, value) AS (VALUES
  -- adoption
  ('S1','ai_users_weekly_avg',6.0), ('S2','ai_users_weekly_avg',8.0), ('S3','ai_users_weekly_avg',10.0),
  ('S1','engineers_active',12), ('S2','engineers_active',13), ('S3','engineers_active',14),
  ('S1','ai_prs',16),  ('S2','ai_prs',22),  ('S3','ai_prs',30),
  ('S1','total_prs',40),('S2','total_prs',44),('S3','total_prs',48),
  ('S1','agent_tasks',8), ('S2','agent_tasks',12),('S3','agent_tasks',18),
  ('S1','ai_tasks',30),  ('S2','ai_tasks',34),  ('S3','ai_tasks',40),
  ('S1','total_tasks',50),('S2','total_tasks',52),('S3','total_tasks',55),
  -- delivery / DORA
  ('S1','lead_time_h',60),('S2','lead_time_h',48),('S3','lead_time_h',36),
  ('S1','deploys',6),  ('S2','deploys',8),  ('S3','deploys',10),
  ('S1','weeks',2.0),  ('S2','weeks',2.0),  ('S3','weeks',2.0),
  ('S1','incidents',2),('S2','incidents',1),('S3','incidents',1),
  ('S1','mttr_h',8),   ('S2','mttr_h',6),   ('S3','mttr_h',5),
  -- quality / security
  ('S1','rework_prs',4),('S2','rework_prs',3),('S3','rework_prs',2),
  ('S1','ai_prs_reviewed',12),('S2','ai_prs_reviewed',18),('S3','ai_prs_reviewed',27),
  ('S1','security_alerts',3),('S2','security_alerts',2),('S3','security_alerts',1),
  -- agent maturity
  ('S1','agent_prs_total',6), ('S2','agent_prs_total',9), ('S3','agent_prs_total',14),
  ('S1','agent_prs_merged',5),('S2','agent_prs_merged',8),('S3','agent_prs_merged',13),
  ('S1','agent_prs_human_fixed',3),('S2','agent_prs_human_fixed',3),('S3','agent_prs_human_fixed',4),
  ('S1','agent_prs_autonomous',3),('S2','agent_prs_autonomous',6),('S3','agent_prs_autonomous',10),
  ('S1','agent_cycle_h',10),('S2','agent_cycle_h',8),('S3','agent_cycle_h',6),
  -- predictability
  ('S1','sprint_committed',20),('S2','sprint_committed',22),('S3','sprint_committed',24),
  ('S1','sprint_completed',15),('S2','sprint_completed',19),('S3','sprint_completed',22)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'sprint', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- Two month windows (used by the monthly view rows and the quarterly auto-check).
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_h',58),('2026-07','lead_time_h',40),
  ('2026-06','mttr_h',8),      ('2026-07','mttr_h',5),
  ('2026-06','deploys',12),    ('2026-07','deploys',18),
  ('2026-06','weeks',4.3),     ('2026-07','weeks',4.3),
  ('2026-06','incidents',3),   ('2026-07','incidents',2),
  ('2026-06','agent_cycle_h',10),('2026-07','agent_cycle_h',6),
  ('2026-06','total_prs',85),  ('2026-07','total_prs',92),
  ('2026-06','ai_prs',34),     ('2026-07','ai_prs',50),
  ('2026-06','ai_users_weekly_avg',7.5),('2026-07','ai_users_weekly_avg',10.0),
  ('2026-06','engineers_active',16),('2026-07','engineers_active',17),
  ('2026-06','total_tasks',105),('2026-07','total_tasks',112)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- A second project (TeacherZone) so the BOD portfolio dashboard shows real
-- cross-project comparison. Same sprint windows as Future, lower-but-improving
-- adoption. (Not in projects.json — that's the production onboarding switch.)
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('S1', DATE '2026-06-29', DATE '2026-07-13'),
  ('S2', DATE '2026-07-13', DATE '2026-07-27'),
  ('S3', DATE '2026-07-27', DATE '2026-08-10')
),
vals(period_key, metric_key, value) AS (VALUES
  ('S1','ai_users_weekly_avg',4.0), ('S2','ai_users_weekly_avg',5.0), ('S3','ai_users_weekly_avg',7.0),
  ('S1','engineers_active',9), ('S2','engineers_active',10), ('S3','engineers_active',11),
  ('S1','ai_prs',10), ('S2','ai_prs',16), ('S3','ai_prs',24),
  ('S1','total_prs',50),('S2','total_prs',52),('S3','total_prs',55),
  ('S1','agent_tasks',4), ('S2','agent_tasks',7), ('S3','agent_tasks',11),
  ('S1','ai_tasks',16),  ('S2','ai_tasks',22),  ('S3','ai_tasks',30),
  ('S1','total_tasks',40),('S2','total_tasks',44),('S3','total_tasks',48),
  ('S1','lead_time_h',80),('S2','lead_time_h',70),('S3','lead_time_h',55),
  ('S1','deploys',4),  ('S2','deploys',5),  ('S3','deploys',7),
  ('S1','weeks',2.0),  ('S2','weeks',2.0),  ('S3','weeks',2.0),
  ('S1','incidents',3),('S2','incidents',2),('S3','incidents',1),
  ('S1','mttr_h',12),  ('S2','mttr_h',9),   ('S3','mttr_h',7),
  ('S1','rework_prs',6),('S2','rework_prs',5),('S3','rework_prs',3),
  ('S1','ai_prs_reviewed',6),('S2','ai_prs_reviewed',12),('S3','ai_prs_reviewed',20),
  ('S1','security_alerts',5),('S2','security_alerts',4),('S3','security_alerts',2),
  ('S1','agent_prs_total',4), ('S2','agent_prs_total',6), ('S3','agent_prs_total',9),
  ('S1','agent_prs_merged',3),('S2','agent_prs_merged',5),('S3','agent_prs_merged',8),
  ('S1','agent_prs_human_fixed',3),('S2','agent_prs_human_fixed',4),('S3','agent_prs_human_fixed',4),
  ('S1','agent_prs_autonomous',1),('S2','agent_prs_autonomous',2),('S3','agent_prs_autonomous',5),
  ('S1','agent_cycle_h',14),('S2','agent_cycle_h',12),('S3','agent_cycle_h',9),
  ('S1','sprint_committed',18),('S2','sprint_committed',20),('S3','sprint_committed',22),
  ('S1','sprint_completed',12),('S2','sprint_completed',15),('S3','sprint_completed',19)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'sprint', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- TeacherZone month windows.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_h',78),('2026-07','lead_time_h',60),
  ('2026-06','mttr_h',11),     ('2026-07','mttr_h',7),
  ('2026-06','deploys',8),     ('2026-07','deploys',12),
  ('2026-06','weeks',4.3),     ('2026-07','weeks',4.3),
  ('2026-06','incidents',5),   ('2026-07','incidents',3),
  ('2026-06','agent_cycle_h',13),('2026-07','agent_cycle_h',9),
  ('2026-06','total_prs',95),  ('2026-07','total_prs',100),
  ('2026-06','ai_prs',24),     ('2026-07','ai_prs',38),
  ('2026-06','ai_users_weekly_avg',4.5),('2026-07','ai_users_weekly_avg',6.0),
  ('2026-06','engineers_active',11),('2026-07','engineers_active',12),
  ('2026-06','total_tasks',82),('2026-07','total_tasks',90)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- Segmented AI-vs-non-AI metrics: these power the "delta not two numbers"
-- evidence panels (lead-time / PR-size / review-latency comparison), the ROI
-- panel (ai_time_saved_h), AI-PR test coverage, and AI rework. Without them
-- those panels correctly render "No data". AI PRs merge faster, smaller, with
-- fewer review rounds than non-AI PRs.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('S1', DATE '2026-06-29', DATE '2026-07-13'),
  ('S2', DATE '2026-07-13', DATE '2026-07-27'),
  ('S3', DATE '2026-07-27', DATE '2026-08-10')
),
vals(period_key, metric_key, value) AS (VALUES
  ('S1','lead_time_ai_h',45),('S2','lead_time_ai_h',36),('S3','lead_time_ai_h',27),
  ('S1','lead_time_nonai_h',72),('S2','lead_time_nonai_h',58),('S3','lead_time_nonai_h',44),
  ('S1','pr_size_ai',180),('S2','pr_size_ai',165),('S3','pr_size_ai',150),
  ('S1','pr_size_nonai',320),('S2','pr_size_nonai',300),('S3','pr_size_nonai',280),
  ('S1','first_review_ai_h',4.0),('S2','first_review_ai_h',3.5),('S3','first_review_ai_h',3.0),
  ('S1','first_review_nonai_h',8.0),('S2','first_review_nonai_h',7.0),('S3','first_review_nonai_h',6.0),
  ('S1','review_rounds_ai',1.4),('S2','review_rounds_ai',1.3),('S3','review_rounds_ai',1.2),
  ('S1','review_rounds_nonai',2.1),('S2','review_rounds_nonai',2.0),('S3','review_rounds_nonai',1.9),
  ('S1','ai_time_saved_h',40),('S2','ai_time_saved_h',60),('S3','ai_time_saved_h',90),
  ('S1','ai_prs_with_tests',12),('S2','ai_prs_with_tests',18),('S3','ai_prs_with_tests',26),
  ('S1','rework_from_ai_prs',2),('S2','rework_from_ai_prs',2),('S3','rework_from_ai_prs',1)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'sprint', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_ai_h',42),('2026-07','lead_time_ai_h',30),
  ('2026-06','lead_time_nonai_h',68),('2026-07','lead_time_nonai_h',50),
  ('2026-06','pr_size_ai',170),('2026-07','pr_size_ai',155),
  ('2026-06','pr_size_nonai',310),('2026-07','pr_size_nonai',290),
  ('2026-06','first_review_ai_h',3.8),('2026-07','first_review_ai_h',3.2),
  ('2026-06','first_review_nonai_h',7.5),('2026-07','first_review_nonai_h',6.5),
  ('2026-06','review_rounds_ai',1.3),('2026-07','review_rounds_ai',1.2),
  ('2026-06','review_rounds_nonai',2.0),('2026-07','review_rounds_nonai',1.9),
  ('2026-06','ai_time_saved_h',120),('2026-07','ai_time_saved_h',180),
  ('2026-06','ai_prs_with_tests',26),('2026-07','ai_prs_with_tests',42),
  ('2026-06','rework_from_ai_prs',3),('2026-07','rework_from_ai_prs',2)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

WITH periods(period_key, period_start, period_end) AS (VALUES
  ('S1', DATE '2026-06-29', DATE '2026-07-13'),
  ('S2', DATE '2026-07-13', DATE '2026-07-27'),
  ('S3', DATE '2026-07-27', DATE '2026-08-10')
),
vals(period_key, metric_key, value) AS (VALUES
  ('S1','lead_time_ai_h',65),('S2','lead_time_ai_h',55),('S3','lead_time_ai_h',42),
  ('S1','lead_time_nonai_h',88),('S2','lead_time_nonai_h',78),('S3','lead_time_nonai_h',64),
  ('S1','pr_size_ai',210),('S2','pr_size_ai',195),('S3','pr_size_ai',180),
  ('S1','pr_size_nonai',340),('S2','pr_size_nonai',320),('S3','pr_size_nonai',300),
  ('S1','first_review_ai_h',6.0),('S2','first_review_ai_h',5.0),('S3','first_review_ai_h',4.0),
  ('S1','first_review_nonai_h',10.0),('S2','first_review_nonai_h',9.0),('S3','first_review_nonai_h',7.0),
  ('S1','review_rounds_ai',1.6),('S2','review_rounds_ai',1.5),('S3','review_rounds_ai',1.4),
  ('S1','review_rounds_nonai',2.3),('S2','review_rounds_nonai',2.2),('S3','review_rounds_nonai',2.0),
  ('S1','ai_time_saved_h',20),('S2','ai_time_saved_h',35),('S3','ai_time_saved_h',55),
  ('S1','ai_prs_with_tests',6),('S2','ai_prs_with_tests',11),('S3','ai_prs_with_tests',18),
  ('S1','rework_from_ai_prs',3),('S2','rework_from_ai_prs',3),('S3','rework_from_ai_prs',2)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'sprint', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_ai_h',62),('2026-07','lead_time_ai_h',48),
  ('2026-06','lead_time_nonai_h',86),('2026-07','lead_time_nonai_h',68),
  ('2026-06','pr_size_ai',200),('2026-07','pr_size_ai',185),
  ('2026-06','pr_size_nonai',330),('2026-07','pr_size_nonai',305),
  ('2026-06','first_review_ai_h',5.5),('2026-07','first_review_ai_h',4.5),
  ('2026-06','first_review_nonai_h',9.5),('2026-07','first_review_nonai_h',7.5),
  ('2026-06','review_rounds_ai',1.5),('2026-07','review_rounds_ai',1.4),
  ('2026-06','review_rounds_nonai',2.2),('2026-07','review_rounds_nonai',2.0),
  ('2026-06','ai_time_saved_h',70),('2026-07','ai_time_saved_h',110),
  ('2026-06','ai_prs_with_tests',18),('2026-07','ai_prs_with_tests',30),
  ('2026-06','rework_from_ai_prs',4),('2026-07','rework_from_ai_prs',3)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- Manual inputs: monthly numbers (drive the Manual KPI panels) + a few
-- quarterly governance flags.
INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Future','2026-06','total_engineers','18','seed'),
  ('Future','2026-06','coverage_ai','0.55','seed'),
  ('Future','2026-06','cost_baseline','45','seed'),
  ('Future','2026-06','cost_actual','33','seed'),
  ('Future','2026-07','total_engineers','19','seed'),
  ('Future','2026-07','coverage_ai','0.60','seed'),
  ('Future','2026-07','cost_baseline','45','seed'),
  ('Future','2026-07','cost_actual','30','seed'),
  ('Future','2026-Q3','g1_agents_md','Yes','auto-check'),
  ('Future','2026-Q3','a2_dashboard','Yes','auto-check'),
  ('Future','2026-Q3','g2_ai_policy','Yes','pm@seta'),
  ('TeacherZone','2026-06','total_engineers','12','seed'),
  ('TeacherZone','2026-06','coverage_ai','0.40','seed'),
  ('TeacherZone','2026-06','cost_baseline','30','seed'),
  ('TeacherZone','2026-06','cost_actual','26','seed'),
  ('TeacherZone','2026-07','total_engineers','13','seed'),
  ('TeacherZone','2026-07','coverage_ai','0.48','seed'),
  ('TeacherZone','2026-07','cost_baseline','30','seed'),
  ('TeacherZone','2026-07','cost_actual','24','seed'),
  ('TeacherZone','2026-Q3','g1_agents_md','No','auto-check'),
  ('TeacherZone','2026-Q3','a2_dashboard','Yes','auto-check');

-- Gated-Demo: high adoption, empty governance -> A high, E=1, overall capped to 1.
INSERT INTO reporting.metric_counts (project, period_type, period_key, period_start, period_end, metric_key, value) VALUES
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','ai_users_weekly_avg',12),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','ai_prs',40),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','total_prs',60),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','deploys',6),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','weeks',4),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','incidents',1),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','mttr_h',5),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','lead_time_h',40),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','total_tasks',80),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','rework_prs',6);
INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Gated-Demo','2026-06','total_engineers','15','seed'),
  ('Gated-Demo','2026-Q2','a2_dashboard','Yes','seed');

-- Tiny-Sample: n<20 so the presentation layer greys its percentages.
INSERT INTO reporting.metric_counts (project, period_type, period_key, period_start, period_end, metric_key, value) VALUES
  ('Tiny-Sample','sprint','S1',DATE '2026-06-29',DATE '2026-07-13','total_prs',8),
  ('Tiny-Sample','sprint','S1',DATE '2026-06-29',DATE '2026-07-13','ai_prs',3),
  ('Tiny-Sample','sprint','S1',DATE '2026-06-29',DATE '2026-07-13','agent_prs_total',2);

-- Future/TeacherZone quarterly flags so their levels render (Q3 in seed).
INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Future','2026-Q3','g3_required_review','Yes','auto-check'),
  ('Future','2026-Q3','c3_scan_ci','Yes','auto-check'),
  ('Future','2026-Q3','b4_dora_improving','Yes','auto-check')
ON CONFLICT (project, period_key, field) DO NOTHING;

-- A practice-change annotation for the trend charts.
INSERT INTO reporting.events (ts, project, title, tag) VALUES
  (TIMESTAMPTZ '2026-07-01 09:00+00', 'Future', 'Enabled branch protection', 'practice-change');
