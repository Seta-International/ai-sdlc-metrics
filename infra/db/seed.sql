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
