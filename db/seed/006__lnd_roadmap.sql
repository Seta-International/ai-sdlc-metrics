-- add a new skill not held by any existing employee -> used as coverage-gap edge
insert into core.skill (skill_code, name, skill_category_id)
select 'llm_serving', 'LLM Serving & Inference',
       (select skill_category_id from core.skill_category where category_code = 'technical')
where not exists (select 1 from core.skill where skill_code = 'llm_serving');

-- ===== project required skills (6 active core projects -> core.skill) =====
-- PRJ-005 deliberately requires 'llm_serving' (a new skill no active employee holds)
-- -> coverage-gap edge.
insert into lnd.project_required_skill (project_id, skill_id, min_proficiency_id, is_critical)
select p.project_id, s.skill_id,
       (select proficiency_level_id from core.proficiency_level where prof_code = v.prof),
       v.crit
from (values
 ('PRJ-001','python','Advanced',  true),
 ('PRJ-001','fastapi','Intermediate', true),
 ('PRJ-001','postgres','Intermediate', false),
 ('PRJ-001','docker','Intermediate', false),
 ('PRJ-002','java','Advanced',    true),
 ('PRJ-002','k8s','Intermediate', true),
 ('PRJ-002','aws','Intermediate', false),
 ('PRJ-003','react','Advanced',   true),
 ('PRJ-003','postgres','Intermediate', false),
 ('PRJ-003','docker','Intermediate', false),
 ('PRJ-004','python','Advanced',  true),
 ('PRJ-004','mlops','Advanced',   true),
 ('PRJ-004','spark','Intermediate', false),
 ('PRJ-005','fastapi','Advanced', true),
 ('PRJ-005','k8s','Advanced',     true),
 ('PRJ-005','cka','Advanced',     true),
 ('PRJ-005','cicd','Intermediate', false),
 ('PRJ-006','terraform','Intermediate', true),
 ('PRJ-006','aws','Advanced',     true),
 ('PRJ-006','llm_serving','Advanced', true),
 ('PRJ-006','cicd','Intermediate', false)
) as v(proj, skill, prof, crit)
join core.project p on p.project_code = v.proj
join core.skill   s on s.skill_code   = v.skill;

-- ===== BOD training goals (7 strategic goals) =====
insert into lnd.bod_training_goal (goal_code, goal_description, target_quarter)
values
 ('GOAL-2025-08','Chuẩn bị kỹ năng phỏng vấn & lãnh đạo kỹ thuật cho nhân sự được chọn, bao gồm các lĩnh vực web/backend/DB/system-design/hạ tầng/cloud.','Q3_2025'),
 ('GOAL-2025-09','Bù đắp khoảng cách kỹ năng kỹ thuật theo yêu cầu dự án hiện tại, tập trung vào kiểm thử nền tảng và framework automation phù hợp với yêu cầu khách hàng.','Q3_2025'),
 ('GOAL-2025-11','Xây dựng năng lực DevOps thế hệ mới, có khả năng hỗ trợ các dự án AI nặng và lưu lượng cao sử dụng công nghệ LLM-serving hiện đại.','Q4_2025'),
 ('GOAL-2026-01','Phát triển đội ngũ lãnh đạo kế thừa với năng lực dẫn dắt nhóm và kỹ năng giao tiếp vững mạnh để hỗ trợ tăng trưởng tổ chức.','Q1_2026'),
 ('GOAL-2026-04','Đào tạo kỹ sư đạt trình độ ứng dụng AI và đạt chứng chỉ chuyên nghiệp về công cụ và kiến trúc AI.','Q2_2026'),
 ('GOAL-2026-07','Nâng cấp kỹ năng ít nhất 60% đội phát triển về cloud-native (Kubernetes, CI/CD, IaC) để hỗ trợ triển khai dự án theo hướng cloud-first.','Q3_2026'),
 ('GOAL-2026-10','Xây dựng năng lực phát triển AI Agent nội bộ để các nhóm tự prototype và triển khai quy trình làm việc AI một cách độc lập.','Q4_2026');

-- ===== training-need survey: wave SUR_2025_Q4 (subset of employees) =====
insert into lnd.training_need_survey
 (survey_response_code, survey_wave, employee_id, training_topic, priority, delivery_mode_hint)
select 'SUR-2025Q4-'||v.emp, 'SUR_2025_Q4',
       (select employee_id from core.employee where emp_code = v.emp),
       v.topic, v.prio, v.mode
from (values
 ('EMP-0003','Thiết kế hệ thống và kiến trúc nâng cao','High',NULL),
 ('EMP-0004','Microservices và điều phối container','High','internal'),
 ('EMP-0005','Cơ bản về Machine Learning','Medium','online'),
 ('EMP-0007','Luyện thi chứng chỉ CKA','Medium','online'),
 ('EMP-0008','Thực hành MLOps và công cụ liên quan','High','internal'),
 ('EMP-0010','Phát triển Backend với NodeJS','High','internal'),
 ('EMP-0011','Triển khai Cloud trên AWS','Medium','online'),
 ('EMP-0014','Phát triển với ngôn ngữ Go','High','internal'),
 ('EMP-0015','Pipeline kỹ thuật dữ liệu','Medium','internal'),
 ('EMP-0016','Thiết kế hệ thống và kiến trúc','Medium','internal'),
 ('EMP-0018','Lãnh đạo nhóm và lập kế hoạch chiến lược','High',NULL),
 ('EMP-0020','Kubernetes và điều phối container','High','internal')
) as v(emp, topic, prio, mode);

-- ===== training-need survey: wave SUR_2026_Q1 (overlapping + new respondents) =====
insert into lnd.training_need_survey
 (survey_response_code, survey_wave, employee_id, training_topic, priority, delivery_mode_hint)
select 'SUR-2026Q1-'||v.emp, 'SUR_2026_Q1',
       (select employee_id from core.employee where emp_code = v.emp),
       v.topic, v.prio, v.mode
from (values
 ('EMP-0003','Kỹ năng lãnh đạo','High',NULL),
 ('EMP-0004','DevOps và công nghệ backend hiện đại','High','internal'),
 ('EMP-0005','Xây dựng agent cá nhân nâng cao quy trình làm việc','Medium','self-learning'),
 ('EMP-0007','Kỹ năng phỏng vấn','High',NULL),
 ('EMP-0009','Tự học qua khóa học bên ngoài','Low','self-learning'),
 ('EMP-0011','Kỹ năng lập kế hoạch','Medium',NULL),
 ('EMP-0012','Kiểm thử Tự động','Low','internal'),
 ('EMP-0016','Kỹ năng lập kế hoạch và kiến thức Agentic AI','High','internal'),
 ('EMP-0021','Dịch vụ Cloud','Medium','online'),
 ('EMP-0024','Kỹ năng giao tiếp tiếng Anh','Medium','online'),
 ('EMP-0027','Kiểm thử tự động từ cơ bản','Medium','internal'),
 ('EMP-0031','AI, tiếng Anh, Cloud','High','online')
) as v(emp, topic, prio, mode);

-- minimal gap stub so happy-path gap assertions are green; Task 5 adds the bulk
insert into lnd.employee_skill_gap (employee_id, skill_id, gap_source, priority)
select (select employee_id from core.employee where emp_code = 'EMP-0003'),
       (select skill_id from core.skill where skill_code = 'docker'),
       'Project','High';

-- ===== bulk employee skill gaps (missing-skill mirror of core.employee_skill) =====
-- 'docker' (Containerization) is planted as the HIGH-FREQUENCY gap across many
-- employees so v_skill_gap_frequency ranks it top.
insert into lnd.employee_skill_gap (employee_id, skill_id, gap_source, priority, note)
select e.employee_id,
       (select skill_id from core.skill where skill_code = 'docker'),
       'Market','Medium','Containerization gap — high org-wide frequency'
from core.employee e
where e.emp_code in (
  'EMP-0004','EMP-0005','EMP-0008','EMP-0010','EMP-0011','EMP-0014','EMP-0015',
  'EMP-0020','EMP-0021','EMP-0024','EMP-0027','EMP-0031')
on conflict (employee_id, skill_id) do nothing;

-- project-driven and role-driven gaps (varied source + priority)
insert into lnd.employee_skill_gap (employee_id, skill_id, gap_source, priority, note)
select (select employee_id from core.employee where emp_code = v.emp),
       (select skill_id from core.skill where skill_code = v.skill),
       v.src, v.prio, v.note
from (values
 ('EMP-0005','mlops','Project','High','Data Scientist needs MLOps for PRJ-004'),
 ('EMP-0008','mlops','Project','High','ML role gap'),
 ('EMP-0011','aws','Project','Medium','Cloud services gap'),
 ('EMP-0014','go','Role','Medium','Backend depth'),
 ('EMP-0015','spark','Project','Medium','ETL/data pipeline gap'),
 ('EMP-0020','cicd','Project','High','Automation/CI gap'),
 ('EMP-0021','k8s','Project','High','Container orchestration for PRJ-002'),
 ('EMP-0024','english','Market','Low','Communication upskill'),
 ('EMP-0027','selenium','Role','Medium','Automation testing gap'),
 ('EMP-0031','cka','Market','High','Certification target for cloud-native goal')
) as v(emp, skill, src, prio, note)
on conflict (employee_id, skill_id) do nothing;
