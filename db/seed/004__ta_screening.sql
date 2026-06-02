-- ===== candidates (every status + source present; salary text -> scaled min/max) =====
insert into ta.candidate
 (candidate_code, full_name, email, phone, applied_position, role_id,
  salary_expectation_min_scaled, salary_expectation_max_scaled, status, source)
select v.code, v.name, v.email, v.phone, v.position,
       (select role_id from core.role where role_code = v.role),
       v.smin, v.smax, v.status, v.source
from (values
 ('CAND-1001','Nguyễn Quốc Hùng',  'nguyen.quoc.hung@hackathon.com',  '0912-345-001','Senior Backend Developer','BE',1.80,2.50,'Passed','LinkedIn'),
 ('CAND-1002','Trần Thị Thu Hương', 'tran.thu.huong@hackathon.com',    '0912-345-002','Senior Backend Developer','BE',2.00,2.80,'In-pool','TopCV'),
 ('CAND-1003','Lê Minh Tuấn',       'le.minh.tuan@hackathon.com',      '0912-345-003','Mobile Developer (React Native)','Mobile',1.20,1.80,'Passed','LinkedIn'),
 ('CAND-1004','Phạm Ngọc Linh',     'pham.ngoc.linh@hackathon.com',    '0912-345-004','QA Automation Engineer','QA',1.00,1.50,'Rejected','Email'),
 ('CAND-1005','Hoàng Đức Thịnh',    'hoang.duc.thinh@hackathon.com',   '0912-345-005','Data Engineer','DevOps',2.00,3.00,'In-pool','LinkedIn'),
 ('CAND-1006','Huỳnh Thị Mỹ Duyên','huynh.my.duyen@hackathon.com',    '0912-345-006','DevOps Engineer','DevOps',1.80,2.50,'Failed','TopCV'),
 ('CAND-1007','Phan Thanh Sơn',     'phan.thanh.son@hackathon.com',    '0912-345-007','Senior Frontend Developer','FE',1.50,2.20,'Passed','FB'),
 ('CAND-1008','Vũ Thị Khánh Linh',  'vu.khanh.linh@hackathon.com',    '0912-345-008','AI/ML Engineer','ML',2.20,3.50,'In-pool','LinkedIn'),
 ('CAND-1009','Võ Văn Dương',       'vo.van.duong@hackathon.com',      '0912-345-009','Senior Backend Developer','BE',2.00,2.80,'Rejected','Email'),
 ('CAND-1010','Đặng Thị Bích Trâm', 'dang.bich.tram@hackathon.com',   '0912-345-010','Mobile Developer (React Native)','Mobile',1.00,1.60,'Failed','TopCV')
) as v(code, name, email, phone, position, role, smin, smax, status, source);

-- ===== candidate skills (cv_skills CSV normalized; CAND-1010 maps to non-Mobile skills) =====
insert into ta.candidate_skill (candidate_id, skill_id)
select c.candidate_id, s.skill_id
from (values
 ('CAND-1001','python'),('CAND-1001','fastapi'),('CAND-1001','postgres'),('CAND-1001','docker'),
 ('CAND-1002','java'),('CAND-1002','postgres'),('CAND-1002','spark'),
 ('CAND-1003','reactnative'),('CAND-1003','react'),('CAND-1003','postgres'),
 ('CAND-1004','selenium'),('CAND-1004','python'),('CAND-1004','cicd'),
 ('CAND-1005','python'),('CAND-1005','spark'),('CAND-1005','postgres'),
 ('CAND-1006','k8s'),('CAND-1006','terraform'),('CAND-1006','aws'),('CAND-1006','docker'),
 ('CAND-1007','react'),('CAND-1007','communication'),
 ('CAND-1008','python'),('CAND-1008','mlops'),
 ('CAND-1009','go'),('CAND-1009','postgres'),('CAND-1009','k8s'),
 ('CAND-1010','java'),('CAND-1010','go'),('CAND-1010','docker')
) as v(cand, skill)
join ta.candidate c on c.candidate_code = v.cand
join core.skill s on s.skill_code = v.skill;

-- ===== screening criteria (one set per position) =====
insert into ta.screening_criteria (criteria_code, position, role_id)
select v.code, v.position, (select role_id from core.role where role_code = v.role)
from (values
 ('SCR-BE-001','Senior Backend Developer','BE'),
 ('SCR-MOB-001','Mobile Developer (React Native)','Mobile'),
 ('SCR-QA-001','QA Automation Engineer','QA'),
 ('SCR-DE-001','Data Engineer','DevOps'),
 ('SCR-DO-001','DevOps Engineer','DevOps'),
 ('SCR-AI-001','AI/ML Engineer','ML'),
 ('SCR-FE-001','Senior Frontend Developer','FE')
) as v(code, position, role);

-- ===== screening criteria skills (must_have + nice_to_have, mapped to core.skill) =====
insert into ta.screening_criteria_skill (criteria_id, skill_id, skill_type)
select sc.screening_criteria_id, s.skill_id, v.skill_type
from (values
 ('SCR-BE-001','python','must_have'),('SCR-BE-001','postgres','must_have'),
 ('SCR-BE-001','docker','nice_to_have'),('SCR-BE-001','spark','nice_to_have'),
 ('SCR-MOB-001','reactnative','must_have'),('SCR-MOB-001','react','must_have'),
 ('SCR-MOB-001','postgres','must_have'),('SCR-MOB-001','cicd','nice_to_have'),
 ('SCR-QA-001','selenium','must_have'),('SCR-QA-001','python','must_have'),
 ('SCR-QA-001','cicd','nice_to_have'),('SCR-QA-001','docker','nice_to_have'),
 ('SCR-DE-001','python','must_have'),('SCR-DE-001','postgres','must_have'),
 ('SCR-DE-001','spark','nice_to_have'),('SCR-DE-001','aws','nice_to_have'),
 ('SCR-DO-001','docker','must_have'),('SCR-DO-001','cicd','must_have'),('SCR-DO-001','aws','must_have'),
 ('SCR-DO-001','k8s','nice_to_have'),('SCR-DO-001','terraform','nice_to_have'),
 ('SCR-AI-001','python','must_have'),('SCR-AI-001','mlops','must_have'),
 ('SCR-AI-001','aws','nice_to_have'),
 ('SCR-FE-001','react','must_have'),('SCR-FE-001','communication','must_have'),
 ('SCR-FE-001','spark','nice_to_have')
) as v(crit, skill, skill_type)
join ta.screening_criteria sc on sc.criteria_code = v.crit
join core.skill s on s.skill_code = v.skill;

-- ===== outreach templates (LinkedIn / Email / TopCV; OUT-005 & OUT-008 are Vietnamese) =====
insert into ta.outreach_template (template_code, channel, template_content) values
 ('OUT-001','LinkedIn','Hi {name}, I came across your profile and was impressed by your experience in {skill}. We''re looking for a {position} to join our team. Would you be open to a quick chat?'),
 ('OUT-002','Email','Subject: Exciting {position} opportunity at {company}

Hi {name},

We noticed your background in {skill} and believe you''d be a great fit for our {position} role. Are you available for a 15-min call this week?'),
 ('OUT-003','LinkedIn','Hey {name}! We''re scaling our engineering team and your {skill} expertise caught our attention. Interested in learning more about a {position} role with us?'),
 ('OUT-004','Email','Subject: Re-connect: {position} role

Hi {name},

We previously connected regarding a role at our company. We now have a new {position} opening that aligns well with your {skill} background. Would love to reconnect!'),
 ('OUT-005','TopCV','Chào {name}, chúng tôi đang tìm kiếm {position} với kinh nghiệm {skill}. Profile của bạn rất phù hợp. Bạn có muốn tìm hiểu thêm về cơ hội này không?'),
 ('OUT-006','LinkedIn','Hi {name}, I noticed you''ve been doing great work in {skill}. Our team is growing and we have an exciting {position} opening. Happy to share more details if you''re interested!'),
 ('OUT-007','Email','Subject: {position} - We think you''d be a great fit

Hi {name},

Your experience with {skill} stood out to us. We have a {position} role that could be a great next step in your career. Let me know if you''d like to discuss further.'),
 ('OUT-008','TopCV','Xin chào {name}, công ty chúng tôi đang mở vị trí {position}. Với kinh nghiệm {skill} của bạn, chúng tôi tin rằng đây là cơ hội phù hợp. Hãy liên hệ nếu bạn quan tâm!');
