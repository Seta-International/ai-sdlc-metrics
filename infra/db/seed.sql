-- Local-only seed data for the Grafana dev stack (infra/docker/compose.local.yml).
-- Loaded automatically by the local Postgres after init.sql + views.sql.
-- Never run this against a real reporting database.

-- Four months for Future: 2026-06 (Q2 tail, for trend history across a
-- quarter boundary) plus a full 2026-Q3 (07/08/09), so the BOD dashboard's
-- $granularity=quarter option has real, complete-quarter data to roll up.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  -- adoption
  ('2026-06','ai_users_weekly_avg',7.5), ('2026-07','ai_users_weekly_avg',10.0),
  ('2026-08','ai_users_weekly_avg',11.0), ('2026-09','ai_users_weekly_avg',12.0),
  ('2026-06','engineers_active',16), ('2026-07','engineers_active',17),
  ('2026-08','engineers_active',18), ('2026-09','engineers_active',18),
  ('2026-06','ai_prs',34),  ('2026-07','ai_prs',50),  ('2026-08','ai_prs',58),  ('2026-09','ai_prs',64),
  ('2026-06','total_prs',85),('2026-07','total_prs',92),('2026-08','total_prs',96),('2026-09','total_prs',100),
  ('2026-06','agent_tasks',16), ('2026-07','agent_tasks',24),
  ('2026-08','agent_tasks',30), ('2026-09','agent_tasks',36),
  ('2026-06','ai_tasks',60),  ('2026-07','ai_tasks',68),  ('2026-08','ai_tasks',74),  ('2026-09','ai_tasks',80),
  ('2026-06','total_tasks',105),('2026-07','total_tasks',112),('2026-08','total_tasks',116),('2026-09','total_tasks',120),
  -- delivery / DORA
  ('2026-06','lead_time_h',58),('2026-07','lead_time_h',40),('2026-08','lead_time_h',34),('2026-09','lead_time_h',28),
  ('2026-06','deploys',12),  ('2026-07','deploys',18),  ('2026-08','deploys',20),  ('2026-09','deploys',22),
  ('2026-06','weeks',4.3),   ('2026-07','weeks',4.3),   ('2026-08','weeks',4.3),   ('2026-09','weeks',4.3),
  ('2026-06','incidents',3), ('2026-07','incidents',2), ('2026-08','incidents',2), ('2026-09','incidents',1),
  ('2026-06','mttr_h',8),    ('2026-07','mttr_h',5),    ('2026-08','mttr_h',5),    ('2026-09','mttr_h',4),
  -- quality / security
  ('2026-06','rework_prs',8),('2026-07','rework_prs',6),('2026-08','rework_prs',5),('2026-09','rework_prs',4),
  ('2026-06','ai_prs_reviewed',24),('2026-07','ai_prs_reviewed',36),
  ('2026-08','ai_prs_reviewed',44),('2026-09','ai_prs_reviewed',50),
  ('2026-06','security_alerts',4),('2026-07','security_alerts',3),
  ('2026-08','security_alerts',2),('2026-09','security_alerts',1),
  -- agent maturity
  -- 2026-06 stays under the 20 sample-size floor (shows the guard greying it); later months cross it.
  ('2026-06','agent_prs_total',18), ('2026-07','agent_prs_total',28),
  ('2026-08','agent_prs_total',36), ('2026-09','agent_prs_total',44),
  ('2026-06','agent_prs_merged',15),('2026-07','agent_prs_merged',24),
  ('2026-08','agent_prs_merged',32),('2026-09','agent_prs_merged',40),
  ('2026-06','agent_prs_human_fixed',7),('2026-07','agent_prs_human_fixed',9),
  ('2026-08','agent_prs_human_fixed',10),('2026-09','agent_prs_human_fixed',11),
  ('2026-06','agent_prs_autonomous',12),('2026-07','agent_prs_autonomous',20),
  ('2026-08','agent_prs_autonomous',27),('2026-09','agent_prs_autonomous',33),
  ('2026-06','agent_cycle_h',10),('2026-07','agent_cycle_h',6),
  ('2026-08','agent_cycle_h',5),('2026-09','agent_cycle_h',4)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- TeacherZone: same four months, lower-but-improving adoption (second project
-- so the BOD portfolio dashboard shows real cross-project comparison).
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','ai_users_weekly_avg',4.5), ('2026-07','ai_users_weekly_avg',6.0),
  ('2026-08','ai_users_weekly_avg',6.5), ('2026-09','ai_users_weekly_avg',7.0),
  ('2026-06','engineers_active',11), ('2026-07','engineers_active',12),
  ('2026-08','engineers_active',12), ('2026-09','engineers_active',13),
  ('2026-06','ai_prs',24), ('2026-07','ai_prs',38), ('2026-08','ai_prs',44), ('2026-09','ai_prs',48),
  ('2026-06','total_prs',95),('2026-07','total_prs',100),('2026-08','total_prs',104),('2026-09','total_prs',108),
  ('2026-06','agent_tasks',8), ('2026-07','agent_tasks',14),
  ('2026-08','agent_tasks',18), ('2026-09','agent_tasks',22),
  ('2026-06','ai_tasks',40),  ('2026-07','ai_tasks',46),  ('2026-08','ai_tasks',50),  ('2026-09','ai_tasks',54),
  ('2026-06','total_tasks',82),('2026-07','total_tasks',90),('2026-08','total_tasks',94),('2026-09','total_tasks',98),
  ('2026-06','lead_time_h',78),('2026-07','lead_time_h',60),('2026-08','lead_time_h',52),('2026-09','lead_time_h',46),
  ('2026-06','deploys',8),  ('2026-07','deploys',12),  ('2026-08','deploys',14),  ('2026-09','deploys',16),
  ('2026-06','weeks',4.3),  ('2026-07','weeks',4.3),   ('2026-08','weeks',4.3),   ('2026-09','weeks',4.3),
  ('2026-06','incidents',5),('2026-07','incidents',3), ('2026-08','incidents',3), ('2026-09','incidents',2),
  ('2026-06','mttr_h',11),  ('2026-07','mttr_h',7),    ('2026-08','mttr_h',7),    ('2026-09','mttr_h',6),
  ('2026-06','rework_prs',10),('2026-07','rework_prs',8),('2026-08','rework_prs',7),('2026-09','rework_prs',6),
  ('2026-06','ai_prs_reviewed',12),('2026-07','ai_prs_reviewed',24),
  ('2026-08','ai_prs_reviewed',30),('2026-09','ai_prs_reviewed',36),
  ('2026-06','security_alerts',6),('2026-07','security_alerts',4),
  ('2026-08','security_alerts',3),('2026-09','security_alerts',2),
  -- 2026-06 stays under the 20 sample-size floor here too.
  ('2026-06','agent_prs_total',14), ('2026-07','agent_prs_total',22),
  ('2026-08','agent_prs_total',28), ('2026-09','agent_prs_total',34),
  ('2026-06','agent_prs_merged',11),('2026-07','agent_prs_merged',18),
  ('2026-08','agent_prs_merged',24),('2026-09','agent_prs_merged',29),
  ('2026-06','agent_prs_human_fixed',6),('2026-07','agent_prs_human_fixed',8),
  ('2026-08','agent_prs_human_fixed',9),('2026-09','agent_prs_human_fixed',10),
  ('2026-06','agent_prs_autonomous',8),('2026-07','agent_prs_autonomous',14),
  ('2026-08','agent_prs_autonomous',19),('2026-09','agent_prs_autonomous',23),
  ('2026-06','agent_cycle_h',13),('2026-07','agent_cycle_h',9),
  ('2026-08','agent_cycle_h',8),('2026-09','agent_cycle_h',7)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- Segmented AI-vs-non-AI metrics: power the "delta not two numbers" evidence
-- panels, the ROI panel (ai_time_saved_h), AI-PR test coverage, and AI
-- rework. AI PRs merge faster, smaller, with fewer review rounds than non-AI.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_ai_h',42),('2026-07','lead_time_ai_h',30),
  ('2026-08','lead_time_ai_h',25),('2026-09','lead_time_ai_h',20),
  ('2026-06','lead_time_nonai_h',68),('2026-07','lead_time_nonai_h',50),
  ('2026-08','lead_time_nonai_h',44),('2026-09','lead_time_nonai_h',38),
  ('2026-06','pr_size_ai',170),('2026-07','pr_size_ai',155),
  ('2026-08','pr_size_ai',148),('2026-09','pr_size_ai',140),
  ('2026-06','pr_size_nonai',310),('2026-07','pr_size_nonai',290),
  ('2026-08','pr_size_nonai',280),('2026-09','pr_size_nonai',270),
  ('2026-06','first_review_ai_h',3.8),('2026-07','first_review_ai_h',3.2),
  ('2026-08','first_review_ai_h',2.8),('2026-09','first_review_ai_h',2.4),
  ('2026-06','first_review_nonai_h',7.5),('2026-07','first_review_nonai_h',6.5),
  ('2026-08','first_review_nonai_h',6.0),('2026-09','first_review_nonai_h',5.5),
  ('2026-06','review_rounds_ai',1.3),('2026-07','review_rounds_ai',1.2),
  ('2026-08','review_rounds_ai',1.1),('2026-09','review_rounds_ai',1.0),
  ('2026-06','review_rounds_nonai',2.0),('2026-07','review_rounds_nonai',1.9),
  ('2026-08','review_rounds_nonai',1.8),('2026-09','review_rounds_nonai',1.7),
  ('2026-06','ai_time_saved_h',120),('2026-07','ai_time_saved_h',180),
  ('2026-08','ai_time_saved_h',210),('2026-09','ai_time_saved_h',240),
  ('2026-06','ai_prs_with_tests',26),('2026-07','ai_prs_with_tests',42),
  ('2026-08','ai_prs_with_tests',48),('2026-09','ai_prs_with_tests',54),
  ('2026-06','rework_from_ai_prs',3),('2026-07','rework_from_ai_prs',2),
  ('2026-08','rework_from_ai_prs',2),('2026-09','rework_from_ai_prs',1)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_ai_h',62),('2026-07','lead_time_ai_h',48),
  ('2026-08','lead_time_ai_h',42),('2026-09','lead_time_ai_h',36),
  ('2026-06','lead_time_nonai_h',86),('2026-07','lead_time_nonai_h',68),
  ('2026-08','lead_time_nonai_h',60),('2026-09','lead_time_nonai_h',52),
  ('2026-06','pr_size_ai',200),('2026-07','pr_size_ai',185),
  ('2026-08','pr_size_ai',178),('2026-09','pr_size_ai',170),
  ('2026-06','pr_size_nonai',330),('2026-07','pr_size_nonai',305),
  ('2026-08','pr_size_nonai',295),('2026-09','pr_size_nonai',285),
  ('2026-06','first_review_ai_h',5.5),('2026-07','first_review_ai_h',4.5),
  ('2026-08','first_review_ai_h',4.0),('2026-09','first_review_ai_h',3.5),
  ('2026-06','first_review_nonai_h',9.5),('2026-07','first_review_nonai_h',7.5),
  ('2026-08','first_review_nonai_h',7.0),('2026-09','first_review_nonai_h',6.5),
  ('2026-06','review_rounds_ai',1.5),('2026-07','review_rounds_ai',1.4),
  ('2026-08','review_rounds_ai',1.3),('2026-09','review_rounds_ai',1.2),
  ('2026-06','review_rounds_nonai',2.2),('2026-07','review_rounds_nonai',2.0),
  ('2026-08','review_rounds_nonai',1.9),('2026-09','review_rounds_nonai',1.8),
  ('2026-06','ai_time_saved_h',70),('2026-07','ai_time_saved_h',110),
  ('2026-08','ai_time_saved_h',130),('2026-09','ai_time_saved_h',150),
  ('2026-06','ai_prs_with_tests',18),('2026-07','ai_prs_with_tests',30),
  ('2026-08','ai_prs_with_tests',34),('2026-09','ai_prs_with_tests',38),
  ('2026-06','rework_from_ai_prs',4),('2026-07','rework_from_ai_prs',3),
  ('2026-08','rework_from_ai_prs',3),('2026-09','rework_from_ai_prs',2)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- AI tasks split by tool (drives the "AI Tasks by Tool" bar chart). Keys look
-- like ai_tasks_tool_<Tool>; the dashboard strips the prefix for the label.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(project, period_key, metric_key, value) AS (VALUES
  ('Future','2026-07','ai_tasks_tool_Claude Code',24),('Future','2026-07','ai_tasks_tool_GitHub Copilot',8),('Future','2026-07','ai_tasks_tool_Cursor',2),
  ('Future','2026-08','ai_tasks_tool_Claude Code',28),('Future','2026-08','ai_tasks_tool_GitHub Copilot',8),('Future','2026-08','ai_tasks_tool_Cursor',2),
  ('Future','2026-09','ai_tasks_tool_Claude Code',32),('Future','2026-09','ai_tasks_tool_GitHub Copilot',8),('Future','2026-09','ai_tasks_tool_Cursor',2),
  ('TeacherZone','2026-07','ai_tasks_tool_Claude Code',15),('TeacherZone','2026-07','ai_tasks_tool_GitHub Copilot',7),
  ('TeacherZone','2026-08','ai_tasks_tool_Claude Code',18),('TeacherZone','2026-08','ai_tasks_tool_GitHub Copilot',8),
  ('TeacherZone','2026-09','ai_tasks_tool_Claude Code',22),('TeacherZone','2026-09','ai_tasks_tool_GitHub Copilot',8)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT v.project, 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- Manual inputs: monthly numbers (drive the Manual KPI panels) + quarterly
-- governance flags. 2026-Q3 is now a *complete* quarter (07/08/09 all seeded).
INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Future','2026-06','total_engineers','18','seed'),
  ('Future','2026-06','coverage_ai','0.55','seed'),
  ('Future','2026-06','cost_baseline','45','seed'),
  ('Future','2026-06','cost_actual','33','seed'),
  ('Future','2026-07','total_engineers','19','seed'),
  ('Future','2026-07','coverage_ai','0.60','seed'),
  ('Future','2026-07','cost_baseline','45','seed'),
  ('Future','2026-07','cost_actual','30','seed'),
  ('Future','2026-08','total_engineers','19','seed'),
  ('Future','2026-08','coverage_ai','0.63','seed'),
  ('Future','2026-08','cost_baseline','45','seed'),
  ('Future','2026-08','cost_actual','28','seed'),
  ('Future','2026-09','total_engineers','20','seed'),
  ('Future','2026-09','coverage_ai','0.66','seed'),
  ('Future','2026-09','cost_baseline','45','seed'),
  ('Future','2026-09','cost_actual','26','seed'),
  ('Future','2026-Q3','g1_agents_md','Yes','auto-check'),
  ('Future','2026-Q3','a2_dashboard','Yes','auto-check'),
  ('Future','2026-Q3','g2_ai_policy','Yes','pm@seta'),
  ('Future','2026-Q3','g3_required_review','Yes','auto-check'),
  ('Future','2026-Q3','c3_scan_ci','Yes','auto-check'),
  ('Future','2026-Q3','b4_dora_improving','Yes','auto-check'),
  ('TeacherZone','2026-06','total_engineers','12','seed'),
  ('TeacherZone','2026-06','coverage_ai','0.40','seed'),
  ('TeacherZone','2026-06','cost_baseline','30','seed'),
  ('TeacherZone','2026-06','cost_actual','26','seed'),
  ('TeacherZone','2026-07','total_engineers','13','seed'),
  ('TeacherZone','2026-07','coverage_ai','0.48','seed'),
  ('TeacherZone','2026-07','cost_baseline','30','seed'),
  ('TeacherZone','2026-07','cost_actual','24','seed'),
  ('TeacherZone','2026-08','total_engineers','13','seed'),
  ('TeacherZone','2026-08','coverage_ai','0.50','seed'),
  ('TeacherZone','2026-08','cost_baseline','30','seed'),
  ('TeacherZone','2026-08','cost_actual','23','seed'),
  ('TeacherZone','2026-09','total_engineers','14','seed'),
  ('TeacherZone','2026-09','coverage_ai','0.53','seed'),
  ('TeacherZone','2026-09','cost_baseline','30','seed'),
  ('TeacherZone','2026-09','cost_actual','21','seed'),
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
  ('Tiny-Sample','month','2026-07',DATE '2026-07-01',DATE '2026-07-31','total_prs',8),
  ('Tiny-Sample','month','2026-07',DATE '2026-07-01',DATE '2026-07-31','ai_prs',3),
  ('Tiny-Sample','month','2026-07',DATE '2026-07-01',DATE '2026-07-31','agent_prs_total',2);

-- A practice-change annotation for the trend charts.
INSERT INTO reporting.events (ts, project, title, tag) VALUES
  (TIMESTAMPTZ '2026-07-01 09:00+00', 'Future', 'Enabled branch protection', 'practice-change');
