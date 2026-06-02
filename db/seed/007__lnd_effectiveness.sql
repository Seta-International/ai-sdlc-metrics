-- ===== course catalog (5 Completed + 1 In Progress) =====
insert into lnd.course_catalog
 (course_code, course_name, topic_category, trainer_id, total_sessions,
  hours_per_session, total_hours, pass_threshold_score, start_date, end_date, status)
select v.code, v.name, v.cat,
       (select trainer_id from core.trainer where trainer_code = v.trn),
       v.sess, v.hps, v.th, v.pass, v.sd::date, v.ed::date, v.status
from (values
 ('Automation_testing_01_2026','Automation Testing with Playwright','QA & Testing','TRN-001',6,2.0,12.0,6.0,'2026-01-06','2026-01-31','Completed'),
 ('DevOps_02_2026','DevOps Fundamentals: CI/CD, K8s, Monitoring','DevOps & Infrastructure','TRN-001',15,1.5,22.5,6.0,'2026-02-03','2026-02-28','Completed'),
 ('CloudAWS_03_2026','AWS Cloud Architecture & Services','Cloud','TRN-001',10,2.0,20.0,6.5,'2026-03-03','2026-03-28','Completed'),
 ('Golang_04_2026','Golang Backend Development','Backend Development','TRN-004',6,2.0,12.0,6.0,'2026-04-07','2026-04-25','Completed'),
 ('AIAgent_05_2026','AI Agent & LLM Application Development','AI/ML','TRN-004',8,2.0,16.0,6.5,'2026-05-05','2026-05-30','Completed'),
 ('Leadership_06_2026','Technical Leadership & Communication','Soft Skills / Leadership','TRN-002',6,1.5,9.0,7.0,'2026-06-02','2026-06-27','In Progress')
) as v(code, name, cat, trn, sess, hps, th, pass, sd, ed, status);

-- ===== training cost (input only; In-Progress course keeps NULL perf delta) =====
insert into lnd.training_cost (course_id, cost_per_session_scaled, total_cost_scaled, post_training_perf_delta)
select c.course_id, v.cps, v.total, v.delta
from (values
 ('Automation_testing_01_2026',1.0,6.0,0.026),
 ('DevOps_02_2026',1.0,15.0,0.031),
 ('CloudAWS_03_2026',1.1,11.0,0.022),
 ('Golang_04_2026',1.0,6.0,0.022),
 ('AIAgent_05_2026',1.2,9.6,0.031),
 ('Leadership_06_2026',0.8,4.8,NULL)
) as v(code, cps, total, delta)
join lnd.course_catalog c on c.course_code = v.code;

-- ===== L&D training NORM (15 rules) =====
insert into lnd.training_norm (rule_code, category, rule_description, threshold, action_if_triggered, priority)
values
 ('NORM-01','Effectiveness','Pass rate per course below threshold','Pass_Rate < 0.70','Flag course for content review; notify L&D manager','High'),
 ('NORM-02','Effectiveness','Average score below minimum acceptable level','Avg_Score < 6.5','Trigger course redesign review; consider re-delivery','High'),
 ('NORM-03','Attendance','Attendance rate per course below target','Attendance_Rate < 0.75','Send reminder to absentees; flag to direct manager','Medium'),
 ('NORM-04','Individual','Trainee passes with low attendance','Score >= Pass_Threshold AND Attendance_Rate < 0.70','Flag for L&D review; verify with manager','Medium'),
 ('NORM-05','Individual','Trainee score = 0 or did not submit assessment','Score = 0 OR assessment not submitted','Mark as Incomplete; recommend re-enrollment','High'),
 ('NORM-06','Individual','Outstanding trainee highlight','Score >= 9.0 AND Attendance_Rate = 1.0','Add to Star Learner report; recommend for mentorship','Low'),
 ('NORM-07','Individual','At-risk trainee — needs support','Score < Pass_Threshold AND Attendance_Rate >= 0.70','Flag for 1:1 coaching; assign buddy','High'),
 ('NORM-08','Trainer','Trainer rating below acceptable standard','Trainer_Rating_Avg < 3.5','Escalate to L&D Manager; schedule trainer coaching','High'),
 ('NORM-09','ROI','Low completion rate despite high cost','Completion_Rate < 0.80 AND Total_Cost_Scaled > 8.0','Review course necessity; consider split delivery','Medium'),
 ('NORM-10','ROI','Negative or zero post-training performance delta','Post_Training_Perf_Delta <= 0','Audit course design and on-the-job application support','High'),
 ('NORM-11','Reporting','Course with missing data cannot be reported','Any required field NULL for Completed course','Block course from report; flag as data incomplete','High'),
 ('NORM-12','Attendance','Trainee marked Late treated as partial attendance','Attendance_Status = Late','Count as 0.5 session for attendance rate','Low'),
 ('NORM-13','Effectiveness','Course completion rate calculation basis','Completion defined as >= 70% sessions attended','Apply consistently; document in report footnote','Medium'),
 ('NORM-14','Feedback','Minimum feedback response rate for valid analysis','Feedback_Response_Rate < 0.60','Mark feedback analysis as statistically insufficient','Medium'),
 ('NORM-15','Individual','Score inconsistency detection','Pass_Status mismatches Score vs Pass_Threshold','Flag as data integrity issue; verify with trainer','High');

-- ===== report template structure (10 sections) =====
insert into lnd.report_template_section (section_code, section_name, content_description, data_source, is_required)
values
 ('SEC-01','Executive Summary','Total courses, trainees, overall pass & completion rate, total hours, total cost','DS07+DS08+DS10',true),
 ('SEC-02','Course-Level Metrics','Per-course trainee count, attendance, avg score, pass & completion rate, cost, perf delta','DS07+DS08+DS10',true),
 ('SEC-03','Trainee Highlights','Outstanding (score>=9, full attendance); at-risk; passed-with-low-attendance','DS08',true),
 ('SEC-04','Trainer Evaluation','Avg trainer & content rating per course; notable feedback themes','DS09',true),
 ('SEC-05','Attendance Analysis','Per-course attendance heatmap by session; full-absent cases; late patterns','DS07',true),
 ('SEC-06','Effectiveness Analysis','Avg score vs pass threshold; courses below NORM-01/02; ROI analysis','DS08+DS10+DS11',true),
 ('SEC-07','Trend Comparison','Quarter-over-quarter comparison (if prior quarter data available)','DS07+DS08 historical',false),
 ('SEC-08','Data Quality Flags','NORM violations: score inconsistencies, missing data, incomplete courses','DS11',true),
 ('SEC-09','Recommendations','L&D recommendations based on effectiveness analysis and NORM triggers','All',true),
 ('SEC-10','Appendix — Raw Data','Full attendance, score, feedback lists (anonymized, internal use)','All',false);

-- ===== attendance for the Golang course (6 sessions × 6 trainees, scaled) =====
-- EMP-007 has a 'Late' session (NORM-12 edge); EMP-008 has an 'Absent'.
insert into lnd.attendance_log (course_id, session_no, employee_id, attendance_status, training_hours)
select c.course_id, g.session_no,
       (select employee_id from core.employee where emp_code = v.emp),
       case when v.emp = 'EMP-0007' and g.session_no = 3 then 'Late'
            when v.emp = 'EMP-0008' and g.session_no = 5 then 'Absent'
            else 'Present' end,
       2.0
from lnd.course_catalog c
join (values ('EMP-0003'),('EMP-0004'),('EMP-0005'),('EMP-0007'),('EMP-0008'),('EMP-0024')) as v(emp) on true
join generate_series(1,6) as g(session_no) on true
where c.course_code = 'Golang_04_2026'
on conflict (course_id, session_no, employee_id) do nothing;

-- ===== Golang assessment: a 0.0 did-not-submit, a NULL feedback, fails + passes =====
insert into lnd.assessment_score (course_id, employee_id, score_0_to_10, pass_status, generalized_feedback)
select c.course_id, (select employee_id from core.employee where emp_code = v.emp),
       v.score, v.pass, v.fb
from lnd.course_catalog c
join (values
 ('EMP-0003',7.0,true ,'Thể hiện hiểu biết nền tảng vững chắc.'),
 ('EMP-0004',7.9,true , NULL),                         -- NULL generalized_feedback edge
 ('EMP-0005',8.5,true ,'Tổ chức code tốt.'),
 ('EMP-0007',5.0,false,'Đang làm quen với Golang; cần thực hành thêm.'),
 ('EMP-0008',0.0,false,'Không hoàn thành bài tập và bài kiểm tra cuối kỳ.')  -- score 0.0 edge
) as v(emp, score, pass, fb) on true
where c.course_code = 'Golang_04_2026'
on conflict (course_id, employee_id) do nothing;

-- ===== Golang feedback: includes a trainer_rating = 3.0 (low, near NORM-08) =====
insert into lnd.feedback_survey (course_id, employee_id, trainer_rating, content_rating, comment)
select c.course_id, (select employee_id from core.employee where emp_code = v.emp),
       v.tr, v.cr, v.comment
from lnd.course_catalog c
join (values
 ('EMP-0003',5.0,4.0,'Buổi học tương tác tốt; truyền đạt kiến thức hiệu quả.'),
 ('EMP-0004',5.0,5.0,'Khóa học rất thực tế; phù hợp với nhu cầu dự án thực tế.'),
 ('EMP-0005',4.0,5.0,'Đào tạo chất lượng cao; mong công ty tiếp tục chuỗi này.'),
 ('EMP-0007',3.0,3.0,'Nội dung tốt nhưng tốc độ quá nhanh cho nhóm nhiều trình độ.'),  -- rating 3.0 edge
 ('EMP-0008',4.0,4.0,'Nội dung hữu ích; đề xuất các khóa học nâng cao hơn.')
) as v(emp, tr, cr, comment) on true
where c.course_code = 'Golang_04_2026'
on conflict (course_id, employee_id) do nothing;

-- ===== AI Agent course (Completed) — small cohort, all present, all pass =====
insert into lnd.attendance_log (course_id, session_no, employee_id, attendance_status, training_hours)
select c.course_id, g.session_no,
       (select employee_id from core.employee where emp_code = v.emp), 'Present', 2.0
from lnd.course_catalog c
join (values ('EMP-0005'),('EMP-0008'),('EMP-0016')) as v(emp) on true
join generate_series(1,8) as g(session_no) on true
where c.course_code = 'AIAgent_05_2026'
on conflict (course_id, session_no, employee_id) do nothing;

insert into lnd.assessment_score (course_id, employee_id, score_0_to_10, pass_status, generalized_feedback)
select c.course_id, (select employee_id from core.employee where emp_code = v.emp), v.score, true, v.fb
from lnd.course_catalog c
join (values
 ('EMP-0005',9.4,'Hoàn thành tất cả bài tập; cần thêm thực hành thực tế.'),
 ('EMP-0008',7.5,'Tiến bộ tốt; chất lượng code cần cải thiện thêm.'),
 ('EMP-0016',8.1,'Kiến thức lý thuyết tốt; kỹ năng thực hành cần củng cố.')
) as v(emp, score, fb) on true
where c.course_code = 'AIAgent_05_2026'
on conflict (course_id, employee_id) do nothing;

insert into lnd.feedback_survey (course_id, employee_id, trainer_rating, content_rating, comment)
select c.course_id, (select employee_id from core.employee where emp_code = v.emp), v.tr, v.cr, v.comment
from lnd.course_catalog c
join (values
 ('EMP-0005',5.0,5.0,'Đánh giá cao tính thực tiễn; cân bằng lý thuyết-thực hành tốt.'),
 ('EMP-0008',5.0,4.0,'Mong có thêm mini-project thực hành trong các buổi tới.'),
 ('EMP-0016',5.0,5.0,'Nội dung có cấu trúc tốt; đánh giá cao các chủ đề nâng cao tiếp theo.')
) as v(emp, tr, cr, comment) on true
where c.course_code = 'AIAgent_05_2026'
on conflict (course_id, employee_id) do nothing;

-- ===== In-Progress Leadership course — partial attendance only, no scores =====
-- 3 of 6 sessions delivered -> derived metrics stay NULL via the view.
insert into lnd.attendance_log (course_id, session_no, employee_id, attendance_status, training_hours)
select c.course_id, g.session_no,
       (select employee_id from core.employee where emp_code = v.emp), 'Present', 1.5
from lnd.course_catalog c
join (values ('EMP-0002'),('EMP-0018')) as v(emp) on true
join generate_series(1,3) as g(session_no) on true
where c.course_code = 'Leadership_06_2026'
on conflict (course_id, session_no, employee_id) do nothing;

-- minimal Golang stub so happy-path resolution + pass_rate assertions are green
insert into lnd.attendance_log (course_id, session_no, employee_id, attendance_status, training_hours)
select c.course_id, 1, (select employee_id from core.employee where emp_code='EMP-0024'), 'Present', 2.0
from lnd.course_catalog c where c.course_code='Golang_04_2026'
on conflict (course_id, session_no, employee_id) do nothing;

insert into lnd.assessment_score (course_id, employee_id, score_0_to_10, pass_status, generalized_feedback)
select c.course_id, (select employee_id from core.employee where emp_code='EMP-0024'), 7.0, true, 'Nền tảng vững chắc.'
from lnd.course_catalog c where c.course_code='Golang_04_2026'
on conflict (course_id, employee_id) do nothing;
