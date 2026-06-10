-- ===== ta.candidate: all 90 candidates from DS-06_Candidate_Database =====
insert into ta.candidate
 (candidate_code, full_name, email, phone, applied_position,
  role_id,
  salary_expectation_min_scaled, salary_expectation_max_scaled,
  status, source,
  location, current_title, current_company, past_companies,
  years_of_experience, seniority_level, domain_experience,
  employment_history, notable_projects, cv_skills,
  english_level, highest_education, education_major, certifications,
  github_url, pipeline_stage, received_cv_date, last_contact_date,
  result_release_date, recruiter_owner, rejection_reason,
  re_engagement_eligible, re_engagement_notes)
select v.code, v.name, v.email, v.phone, v.position,
       (select role_id from core.role where role_code = v.role),
       v.smin, v.smax, v.status, v.source,
       v.location, v.current_title, v.current_company, v.past_companies,
       v.yoe::int, v.seniority, v.domain_exp,
       v.emp_hist, v.notable_proj, v.cv_skills,
       v.english, v.education, v.edu_major, v.certs,
       v.github, v.pipeline, v.recv_date::date, v.last_contact::date,
       v.result_date::date, v.recruiter, v.rejection,
       v.re_elig, v.re_notes
from (values
  ('CAND-1001', 'Candidate A', 'cand_1001@mock.com', '09x-xxx-x001', 'Senior Backend Developer', 'BE', 1.8, 2.5, 'In-pool', 'LinkedIn', 'Ho Chi Minh City', 'Senior Backend Engineer', 'Techcombank', 'VNG, TikiNow', '6', 'Senior', 'Fintech, E-commerce', 'Techcombank (2022–present), VNG (2019–2022), TikiNow (2017–2019)', 'Core Banking API serving 2M txn/day; Microservices migration from monolith reducing latency 40%', 'Python, FastAPI, PostgreSQL, Redis, Docker, Kafka, RabbitMQ, AWS', 'C1', 'Bachelor', 'Computer Science', 'AWS Solutions Architect, CKAD', 'github.com/cand_1001', 'CV Review', '2025-01-10', '2025-01-15', NULL, 'Nguyen Thi Lan', NULL, 'Y', 'Strong Python + Fintech background. Re-engage for JD-001.')
 ,('CAND-1002', 'Candidate B', 'cand_1002@mock.com', '09x-xxx-x002', 'Senior Backend Developer', 'BE', 2.2, 3.0, 'Passed', 'LinkedIn', 'Hanoi', 'Backend Tech Lead', 'MoMo', 'Viettel Digital, SePay', '8', 'Lead', 'Fintech, Payment', 'MoMo (2021–present), Viettel Digital (2018–2021), SePay (2016–2018)', 'E-wallet payment flow handling peak 800K req/min; Led 5-person backend squad for Open Banking integration', 'Python, Django, FastAPI, PostgreSQL, MySQL, Celery, Redis, Kafka, Docker, Kubernetes', 'B2', 'Master', 'Software Engineering', 'GCP Professional Data Engineer', 'github.com/cand_1002', 'Phone Screen', '2025-02-03', '2025-02-10', '2025-02-20', 'Nguyen Thi Lan', NULL, 'N', 'Already passed – in active pipeline')
 ,('CAND-1003', 'Candidate C', 'cand_1003@mock.com', '09x-xxx-x003', 'Senior Backend Developer', 'BE', 1.6, 2.2, 'Applied', 'TopCV', 'Ho Chi Minh City', 'Backend Engineer', 'KMS Technology', 'Nashtech, Global CyberSoft', '5', 'Senior', 'Healthcare, SaaS', 'KMS Technology (2022–present), Nashtech (2019–2022), Global CyberSoft (2018–2019)', 'HIPAA-compliant REST API for telehealth platform; Reduced DB query time 60% via query optimization', 'Python, Flask, FastAPI, PostgreSQL, SQLAlchemy, Docker, Jenkins, Elasticsearch', 'B2', 'Bachelor', 'Information Technology', NULL, 'github.com/cand_1003', 'CV Review', '2025-03-01', '2025-03-05', NULL, 'Tran Van Minh', NULL, 'Y', 'Good YOE and Python, lacks Kafka/cloud experience')
 ,('CAND-1004', 'Candidate D', 'cand_1004@mock.com', '09x-xxx-x004', 'Senior Backend Developer', 'BE', 1.4, 2.0, 'Applied', 'TopCV', 'Da Nang', 'Python Developer', 'FPT Software', 'Axon Active, Orient Software', '4', 'Senior', 'Logistics, ERP', 'FPT Software (2023–present), Axon Active (2020–2023), Orient Software (2018–2020)', 'Warehouse management system backend; Real-time shipment tracking API', 'Python, FastAPI, MySQL, Docker, REST API, SQLAlchemy, Nginx', 'B1', 'Bachelor', 'Computer Science', NULL, 'github.com/cand_1004', 'CV Review', '2025-03-10', '2025-03-12', NULL, 'Le Thi Hoa', NULL, 'Y', 'Solid backend but English B1 may be gap for international project')
 ,('CAND-1005', 'Candidate E', 'cand_1005@mock.com', '09x-xxx-x005', 'Senior Backend Developer', 'BE', 2.0, 2.8, 'In-pool', 'LinkedIn', 'Ho Chi Minh City', 'Senior Software Engineer', 'Grab Vietnam', 'Shopee Vietnam, SEA Group', '7', 'Senior', 'Super-app, E-commerce, Logistics', 'Grab Vietnam (2022–present), Shopee Vietnam (2019–2022), SEA Group (2016–2019)', 'Driver-matching service handling 50K concurrent users; Real-time pricing engine with sub-100ms latency', 'Python, Go, FastAPI, PostgreSQL, Redis, Kafka, Kubernetes, GCP, gRPC', 'C1', 'Bachelor', 'Computer Engineering', 'GCP Associate Cloud Engineer', 'github.com/cand_1005', 'Phone Screen', '2024-11-05', '2024-11-20', '2024-12-01', 'Nguyen Thi Lan', 'Salary out of range at that time', 'Y', 'Excellent profile. Previous salary mismatch resolved – re-engage Q1 2025')
 ,('CAND-1006', 'Candidate F', 'cand_1006@mock.com', '09x-xxx-x006', 'Senior Backend Developer', 'BE', 1.8, 2.5, 'Applied', 'Email', 'Ho Chi Minh City', 'Java Backend Engineer', 'Viettel Solutions', 'CMC Technology, NTT Vietnam', '6', 'Senior', 'Telco, Enterprise', 'Viettel Solutions (2021–present), CMC Technology (2018–2021), NTT Vietnam (2017–2018)', 'Billing system for 10M subscribers; OSS/BSS integration layer', 'Java, Spring Boot, MySQL, Oracle DB, Kafka, Docker, Jenkins', 'B2', 'Bachelor', 'Telecommunications Engineering', 'Oracle Certified Professional', 'github.com/cand_1006', 'CV Review', '2025-03-05', '2025-03-07', NULL, 'Tran Van Minh', NULL, 'Y', 'Java-primary, no Python in CV – medium fit. Check Python adoption willingness')
 ,('CAND-1007', 'Candidate G', 'cand_1007@mock.com', '09x-xxx-x007', 'Senior Backend Developer', 'BE', 1.7, 2.3, 'Rejected', 'LinkedIn', 'Hanoi', 'Node.js Developer', 'VinBigData', 'Bizfly Cloud, VNG Cloud', '5', 'Senior', 'AI Platform, Cloud', 'VinBigData (2022–present), Bizfly Cloud (2020–2022), VNG Cloud (2019–2020)', 'MLOps data ingestion pipeline; Model serving REST API (10K req/s)', 'Node.js, TypeScript, MongoDB, Redis, Docker, Kubernetes, AWS Lambda', 'B2', 'Bachelor', 'Information Technology', 'AWS Developer Associate', 'github.com/cand_1007', 'CV Review', '2025-01-20', '2025-01-22', '2025-01-25', 'Le Thi Hoa', 'No Python experience', 'Y', 'Rejected for Python gap but strong Cloud/K8s skills. Re-engage if JD allows Node.js or upskilling')
 ,('CAND-1008', 'Candidate H', 'cand_1008@mock.com', '09x-xxx-x008', 'Senior Backend Developer', 'BE', 1.2, 1.8, 'In-pool', 'LinkedIn', 'Ho Chi Minh City', 'Backend Developer', 'Saigon Technology', 'Rikkeisoft, ODS Vietnam', '3', 'Mid', 'Outsourcing, CRM', 'Saigon Technology (2023–present), Rikkeisoft (2021–2023), ODS Vietnam (2020–2021)', 'CRM backend API for Japanese retail client; ETL pipeline for sales reporting', 'Python, Django, PostgreSQL, MySQL, Docker, REST API', 'B1', 'Bachelor', 'Computer Science', NULL, 'github.com/cand_1008', NULL, '2025-03-14', NULL, NULL, 'Tran Van Minh', NULL, 'Y', '3 years only – below Senior threshold (4+). Flag for Mid-level or defer 1yr')
 ,('CAND-1009', 'Candidate I', 'cand_1009@mock.com', '09x-xxx-x009', 'Senior Backend Developer', 'BE', 1.5, 2.0, 'In-pool', 'Email', 'Hanoi', 'DevOps/Backend Engineer', 'VNPT Technology', 'MK Smart, Hanoi Telecom', '5', 'Senior', 'Telco, Government', 'VNPT Technology (2022–present), MK Smart (2019–2022), Hanoi Telecom (2018–2019)', 'CI/CD pipeline for 30-service microservices; National ID card verification backend', 'Python, FastAPI, Docker, Kubernetes, Ansible, Terraform, PostgreSQL, Redis', 'B1', 'Bachelor', 'Network Engineering', 'RHCE, Terraform Associate', 'github.com/cand_1009', 'CV Review', '2025-02-15', '2025-02-18', NULL, 'Nguyen Thi Lan', NULL, 'Y', 'Python + FastAPI present but English B1 is gap. Strong infra skills – bonus')
 ,('CAND-1010', 'Candidate J', 'cand_1010@mock.com', '09x-xxx-x010', 'Senior Backend Developer', 'BE', 1.6, 2.2, 'In-pool', 'LinkedIn', 'Ho Chi Minh City', 'Backend Engineer', 'Base.vn', 'Haravan, Nhanh.vn', '5', 'Senior', 'SaaS, E-commerce', 'Base.vn (2022–present), Haravan (2019–2022), Nhanh.vn (2018–2019)', 'Multi-tenant SaaS backend for 50K business accounts; Order management API for Haravan marketplace', 'Python, Ruby on Rails, PostgreSQL, Redis, Sidekiq, Docker, ElasticSearch', 'B2', 'Bachelor', 'Information Systems', NULL, 'github.com/cand_1010', NULL, '2025-01-15', '2025-01-28', NULL, 'Le Thi Hoa', 'Put on hold – headcount freeze', 'Y', 'Strong SaaS domain. Headcount freeze lifted – good time to re-engage')
 ,('CAND-1011', 'Candidate K', 'cand_1011@mock.com', '09x-xxx-x011', 'Senior Backend Developer', 'BE', 1.7, 2.4, 'Applied', 'Referral', 'Ho Chi Minh City', 'Full Stack Developer', 'Timo Digital Bank', 'Zalo Pay, VPBank Digital', '4', 'Senior', 'Fintech, Banking', 'Timo Digital Bank (2023–present), Zalo Pay (2021–2023), VPBank Digital (2019–2021)', 'Open Banking API gateway; Real-time fraud detection webhook integration', 'Python, FastAPI, Node.js, React, PostgreSQL, Kafka, Docker', 'C1', 'Bachelor', 'Finance + IT (dual)', NULL, 'github.com/cand_1011', 'CV Review', '2025-03-15', '2025-03-16', NULL, 'Nguyen Thi Lan', NULL, 'Y', 'Excellent fintech fit. Full-stack but backend-primary.')
 ,('CAND-1012', 'Candidate L', 'cand_1012@mock.com', '09x-xxx-x012', 'Senior Backend Developer', 'BE', 1.3, 1.8, 'In-pool', 'Email', 'Da Nang', 'Software Engineer', 'Axon Active', 'Cyberlogitec, Kyanon Digital', '4', 'Mid', 'Logistics, SaaS', 'Axon Active (2022–present), Cyberlogitec (2020–2022), Kyanon Digital (2019–2020)', 'Container shipping booking API; Multi-carrier logistics integration middleware', 'Python, Django REST, PostgreSQL, Celery, RabbitMQ, Docker', 'B2', 'Bachelor', 'Computer Science', NULL, 'github.com/cand_1012', NULL, '2025-03-19', NULL, NULL, 'Le Thi Hoa', NULL, 'Y', '4yr Python backend. Da Nang location – confirm remote/relocation preference')
 ,('CAND-1013', 'Candidate M', 'cand_1013@mock.com', '09x-xxx-x013', 'Senior Backend Developer', 'BE', 1.2, 1.7, 'Rejected', 'Email', 'Ho Chi Minh City', 'QA Automation Engineer', 'KMS Technology', 'NAL Vietnam, Silicon Stack', '4', 'Senior', 'Healthcare, Outsourcing', 'KMS Technology (2022–present), NAL Vietnam (2019–2022), Silicon Stack (2018–2019)', 'Test automation framework for 300-service microservices; Performance testing reducing release cycle 30%', 'Python, Selenium, Playwright, pytest, Jenkins, Docker, Postman', 'B2', 'Bachelor', 'Information Technology', 'ISTQB Advanced', 'github.com/cand_1013', 'CV Review', '2025-02-20', '2025-02-22', '2025-02-25', 'Tran Van Minh', 'Applied to wrong role (QA background, not backend dev)', 'N', 'Not suitable for backend dev. Flag for QA Automation opening instead')
 ,('CAND-1014', 'Candidate N', 'cand_1014@mock.com', '09x-xxx-x014', 'Senior Backend Developer', 'BE', 0.7, 1.0, 'Rejected', 'FB', 'Hanoi', 'Junior Backend Developer', 'startup (undisclosed)', 'Freelance', '1', 'Junior', 'Startup', 'startup (undisclosed) (2024–present), Freelance (2022–2024)', 'Personal expense tracker app backend; E-commerce REST API (freelance project)', 'Python, Flask, MySQL, REST API', 'A2', 'Bachelor', 'Computer Science (ongoing, final year)', NULL, 'github.com/cand_1014', 'CV Review', '2025-03-08', '2025-03-09', '2025-03-10', 'Le Thi Hoa', 'Insufficient experience (1yr) and English level (A2) for Senior role', 'N', 'Too junior for this JD. Flag for Graduate Trainee program in 2026')
 ,('CAND-1015', 'Candidate O', 'cand_1015@mock.com', '09x-xxx-x015', 'Senior Backend Developer', 'BE', 2.0, 2.8, 'Rejected', 'LinkedIn', 'Ho Chi Minh City', 'Data Scientist', 'Masan Consumer', 'Unilever Vietnam, Nielsen Vietnam', '5', 'Senior', 'FMCG, Analytics', 'Masan Consumer (2022–present), Unilever Vietnam (2019–2022), Nielsen Vietnam (2017–2019)', 'Demand forecasting model reducing stock-out 25%; Sales analytics dashboard for 500 SKUs', 'Python, pandas, scikit-learn, SQL, Tableau, Power BI, Excel', 'B2', 'Master', 'Data Science', 'Tableau Desktop Specialist', 'github.com/cand_1015', 'CV Review', '2025-03-02', '2025-03-04', '2025-03-05', 'Nguyen Thi Lan', 'Applied to wrong role (Data Scientist, not Backend Developer). No API/server experience', 'N', 'Redirect to Data Engineer or AI/ML opening')
 ,('CAND-1016', 'Candidate P', 'cand_1016@mock.com', '09x-xxx-x016', 'AI/ML Engineer', 'ML', 2.2, 3.2, 'In-pool', 'LinkedIn', 'Hanoi', 'Machine Learning Engineer', 'VinAI Research', 'Zalo AI, Cinnamon AI', '5', 'Senior', 'Computer Vision, NLP', 'VinAI Research (2022–present), Zalo AI (2019–2022), Cinnamon AI (2017–2019)', 'OCR engine for Vietnamese documents (95% accuracy); Named entity recognition for 10M daily news articles', 'Python, PyTorch, TensorFlow, HuggingFace, MLflow, Docker, FastAPI, CUDA', 'C1', 'Master', 'Artificial Intelligence', NULL, 'github.com/cand_1016', 'Phone Screen', '2025-02-01', '2025-02-10', NULL, 'Nguyen Thi Lan', NULL, 'Y', 'Top-tier AI profile. Keep warm for JD-002.')
 ,('CAND-1017', 'Candidate Q', 'cand_1017@mock.com', '09x-xxx-x017', 'AI/ML Engineer', 'ML', NULL, NULL, 'Applied', 'LinkedIn', 'Ho Chi Minh City', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'CV Review', NULL, NULL, NULL, 'Nguyen Thi Lan', NULL, NULL, NULL)
 ,('CAND-1018', 'Candidate R', 'cand_1018@mock.com', '09x-xxx-x018', 'Data Engineer', 'DevOps', NULL, NULL, 'Applied', 'LinkedIn', 'Ho Chi Minh City', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'CV Review', NULL, NULL, NULL, 'Nguyen Thi Lan', NULL, NULL, NULL)
 ,('CAND-1019', 'Candidate S', 'cand_1019@mock.com', '09x-xxx-x019', 'Data Engineer', 'DevOps', NULL, NULL, 'Applied', 'LinkedIn', 'Ho Chi Minh City', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'CV Review', NULL, NULL, NULL, 'Nguyen Thi Lan', NULL, NULL, NULL)
 ,('CAND-1020', 'Candidate T', 'cand_1020@mock.com', '09x-xxx-x020', 'PM', 'PM', NULL, NULL, 'Applied', 'LinkedIn', 'Hanoi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'CV Review', NULL, NULL, NULL, 'Nguyen Thi Lan', NULL, NULL, NULL)
 ,('CAND-1023', 'Candidate W', 'cand_1023@mock.com', '09x-xxx-1023', 'Data Scientist/AI', 'ML', 2.2, 3.0, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'AI Engineer', 'TechNova', 'FPT Software, NashTech', '4', 'Middle', 'AI/ML, Data', '2y at FPT, 2y at TechNova', 'Built recommendation engine', 'Python, Machine Learning, SQL, Pandas', 'Fluent', 'Bachelor', 'Computer Science', 'TensorFlow Cert', 'github.com/cand1023', 'Technical Interview', '2026-05-01', '2026-05-06', '2026-05-08', 'Chi Nguyễn', 'N/A', 'Yes', 'Good AI background')
 ,('CAND-1024', 'Candidate X', 'cand_1024@mock.com', '09x-xxx-1024', 'DevOps Engineer', 'DevOps', 2.5, 3.2, 'In-pool', 'TopCV', 'Hanoi, Vietnam', 'DevOps Engineer', 'VietIS', 'CMC Global', '5', 'Senior', 'Cloud, Infra', '3y at CMC, 2y at VietIS', 'Migrated CI/CD pipeline', 'Docker, Kubernetes, CI/CD, AWS', 'Intermediate', 'Bachelor', 'Information Technology', 'AWS Practitioner', 'github.com/cand1024', 'CV Screening', '2026-05-02', '2026-05-07', NULL, 'Hiền Nguyễn', NULL, 'Yes', 'Potential fit for infra team')
 ,('CAND-1025', 'Candidate Y', 'cand_1025@mock.com', '09x-xxx-1025', 'Fullstack (ReactJS+Python)', 'FE', 1.8, 2.6, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Software Engineer', 'KMS Technology', 'TMA Solutions', '4', 'Middle', 'Web Development', '2y at TMA, 2y at KMS', 'Built HR platform', 'ReactJS, TypeScript, Python, FastAPI', 'Fluent', 'Bachelor', 'Software Engineering', 'React Certification', 'github.com/cand1025', 'HM Interview', '2026-05-03', '2026-05-09', NULL, 'Bích Ngọc', NULL, 'Yes', 'Strong frontend')
 ,('CAND-1026', 'Candidate Z', 'cand_1026@mock.com', '09x-xxx-1026', 'Scrum Master', 'PM', 1.8, 2.4, 'Failed', 'Email', 'Hanoi, Vietnam', 'Project Coordinator', 'Rikkeisoft', 'FPT Software', '6', 'Senior', 'Agile Delivery', '4y at FPT, 2y at Rikkeisoft', 'Managed 3 scrum teams', 'Agile, Scrum, Jira, Stakeholder Management', 'Fluent', 'Bachelor', 'Business Administration', 'PSM I', NULL, 'Final Interview', '2026-05-04', '2026-05-10', '2026-05-13', 'Chi Nguyễn', 'Communication mismatch', 'No', 'Not suitable for stakeholder management')
 ,('CAND-1027', 'Candidate AA', 'cand_1027@mock.com', '09x-xxx-1027', 'Auto QA', 'QA', 1.3, 1.8, 'Rejected', 'FB', 'Hanoi, Vietnam', 'QA Automation Engineer', 'NashTech', 'Gameloft', '3', 'Middle', 'QA Automation', '2y at Gameloft, 1y at NashTech', 'Built automation test suite', 'Selenium, API Testing, SQL, Jira', 'Intermediate', 'Bachelor', 'Software Testing', 'ISTQB', 'github.com/cand1027', 'CV Screening', '2026-05-05', '2026-05-08', '2026-05-09', 'Hiền Nguyễn', 'Missing automation depth', 'Yes', 'Can re-engage for QA Analyst')
 ,('CAND-1028', 'Candidate AB', 'cand_1028@mock.com', '09x-xxx-1028', 'Python Developer', 'BE', 1.5, 2.2, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Backend Developer', 'FPT Software', 'NashTech', '3', 'Middle', 'Backend Development', '2y at NashTech, 1y at FPT', 'Payment API system', 'Python, FastAPI, PostgreSQL, Docker', 'Fluent', 'Bachelor', 'IT', 'AWS Cloud Practitioner', 'github.com/cand1028', 'Technical Interview', '2026-05-06', '2026-05-09', '2026-05-12', 'Chi Nguyễn', 'N/A', 'Yes', 'Strong Python skill')
 ,('CAND-1029', 'Candidate AC', 'cand_1029@mock.com', '09x-xxx-1029', '.NET Developer', 'BE', 2.2, 2.8, 'In-pool', 'TopCV', 'Hanoi, Vietnam', 'Software Engineer', 'TMA Solutions', 'Fsoft', '5', 'Senior', 'Enterprise App', '3y at Fsoft, 2y at TMA', 'ERP modernization', 'C#, .NET Core, SQL Server, REST API', 'Intermediate', 'Bachelor', 'Software Engineering', 'Azure Fundamentals', 'github.com/cand1029', 'CV Screening', '2026-05-06', '2026-05-08', NULL, 'Hiền Nguyễn', NULL, 'Yes', 'Waiting for HM review')
 ,('CAND-1030', 'Candidate AD', 'cand_1030@mock.com', '09x-xxx-1030', 'QA Analyst', 'QA', 1.2, 1.7, 'Passed', 'Email', 'Hanoi, Vietnam', 'QA Engineer', 'CMC Global', 'Gameloft', '4', 'Middle', 'QA', '2y at Gameloft, 2y at CMC', 'Mobile testing project', 'Manual Testing, Jira, API Testing', 'Intermediate', 'Bachelor', 'Computer Science', 'ISTQB', NULL, 'HM Interview', '2026-05-07', '2026-05-10', NULL, 'Bích Ngọc', NULL, 'Yes', 'Detail-oriented candidate')
 ,('CAND-1031', 'Candidate AE', 'cand_1031@mock.com', '09x-xxx-1031', 'AI Agent Engineer', 'ML', 2.5, 3.3, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'AI Engineer', 'Techcombank', 'Viettel', '4', 'Middle', 'GenAI', '2y at Viettel, 2y at Techcombank', 'Internal chatbot system', 'Python, LangChain, Prompt Engineering, API', 'Fluent', 'Master', 'AI', 'GenAI Cert', 'github.com/cand1031', 'Offer', '2026-05-08', '2026-05-11', '2026-05-13', 'Chi Nguyễn', 'N/A', 'Yes', 'Strong communication')
 ,('CAND-1032', 'Candidate AF', 'cand_1032@mock.com', '09x-xxx-1032', 'Flutter Developer', 'Mobile', 1.4, 2.0, 'Failed', 'FB', 'Hanoi, Vietnam', 'Mobile Developer', 'VNG', 'Tiki', '3', 'Middle', 'Mobile Development', '2y at Tiki, 1y at VNG', 'E-wallet app', 'Flutter, Dart, Firebase', 'Intermediate', 'Bachelor', 'Mobile Development', 'Flutter Cert', 'github.com/cand1032', 'Technical Interview', '2026-05-08', '2026-05-10', '2026-05-12', 'Hiền Nguyễn', 'Weak coding test', 'Yes', 'Consider junior role')
 ,('CAND-1033', 'Candidate AG', 'cand_1033@mock.com', '09x-xxx-1033', 'Data Engineer', 'DevOps', 2.4, 3.2, 'Passed', 'TopCV', 'Hanoi, Vietnam', 'Data Engineer', 'Shopee', 'FPT Software', '5', 'Senior', 'Data Pipeline', '3y at FPT, 2y at Shopee', 'ETL migration', 'Python, SQL, Airflow, ETL', 'Fluent', 'Bachelor', 'Data Science', 'GCP Data Engineer', 'github.com/cand1033', 'Final Interview', '2026-05-09', '2026-05-12', NULL, 'Bích Ngọc', 'N/A', 'Yes', 'Strong DE background')
 ,('CAND-1034', 'Candidate AH', 'cand_1034@mock.com', '09x-xxx-1034', 'Infra Engineer', 'DevOps', 2.2, 3.0, 'Rejected', 'Email', 'Hanoi, Vietnam', 'System Engineer', 'VNPT', 'Viettel', '6', 'Senior', 'Infrastructure', '4y at Viettel, 2y at VNPT', 'Infra optimization', 'Linux, Docker, AWS, Monitoring', 'Intermediate', 'Bachelor', 'Network Engineering', 'AWS Practitioner', NULL, 'Final Interview', '2026-05-10', '2026-05-13', '2026-05-15', 'Chi Nguyễn', 'English not fit', 'No', 'Not suitable for client-facing role')
 ,('CAND-1035', 'Candidate AI', 'cand_1035@mock.com', '09x-xxx-1035', 'IT Helpdesk', 'BE', 0.8, 1.2, 'In-pool', 'FB', 'Hanoi, Vietnam', 'IT Support Specialist', 'F88', 'CMC Telecom', '2', 'Junior', 'Internal IT', '1y at CMC, 1y at F88', 'Office support', 'Troubleshooting, Windows, Networking', 'Basic', 'College', 'Information Systems', 'Google IT Support', NULL, 'CV Screening', '2026-05-10', '2026-05-11', NULL, 'Hiền Nguyễn', NULL, 'Yes', 'Suitable for junior opening')
 ,('CAND-1036', 'Candidate AJ', 'cand_1036@mock.com', '09x-xxx-1036', 'Fullstack Developer', 'FE', 1.8, 2.6, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Software Engineer', 'NashTech', 'FPT Software', '4', 'Middle', 'Web Development', '2y at FPT, 2y at NashTech', 'Internal HRM system', 'ReactJS, NodeJS, MySQL, REST API', 'Fluent', 'Bachelor', 'Computer Science', 'React Certification', 'github.com/cand1036', 'Technical Interview', '2026-05-11', '2026-05-14', NULL, 'Bích Ngọc', 'N/A', 'Yes', 'Good communication')
 ,('CAND-1037', 'Candidate AK', 'cand_1037@mock.com', '09x-xxx-1037', 'Data Scientist/AI', 'ML', 2.8, 3.6, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'AI Researcher', 'VinAI', 'Viettel', '5', 'Senior', 'AI/ML', '3y at Viettel, 2y at VinAI', 'NLP chatbot', 'Python, TensorFlow, NLP, SQL', 'Fluent', 'Master', 'Artificial Intelligence', 'TensorFlow Cert', 'github.com/cand1037', 'Offer', '2026-05-11', '2026-05-15', '2026-05-18', 'Chi Nguyễn', 'N/A', 'Yes', 'Strong AI research background')
 ,('CAND-1038', 'Candidate AL', 'cand_1038@mock.com', '09x-xxx-1038', 'DevOps Engineer', 'DevOps', 2.3, 3.0, 'In-pool', 'TopCV', 'Hanoi, Vietnam', 'Cloud Engineer', 'CMC Telecom', 'VNPT', '4', 'Middle', 'Cloud Infra', '2y at VNPT, 2y at CMC', 'CI/CD migration', 'AWS, Docker, Kubernetes, Linux', 'Intermediate', 'Bachelor', 'Network Engineering', 'AWS Associate', 'github.com/cand1038', 'HM Interview', '2026-05-12', '2026-05-14', NULL, 'Hiền Nguyễn', NULL, 'Yes', 'Strong infra skill')
 ,('CAND-1039', 'Candidate AM', 'cand_1039@mock.com', '09x-xxx-1039', 'QA Analyst', 'QA', 1.3, 1.7, 'Rejected', 'Email', 'Hanoi, Vietnam', 'QA Engineer', 'VMO', 'NashTech', '3', 'Middle', 'Software QA', '2y at NashTech, 1y at VMO', 'Banking QA project', 'Manual Testing, Jira, SQL', 'Intermediate', 'Bachelor', 'Information Systems', 'ISTQB', NULL, 'Final Interview', '2026-05-12', '2026-05-16', '2026-05-18', 'Chi Nguyễn', 'Communication issue', 'Yes', 'Suitable for internal role')
 ,('CAND-1040', 'Candidate AN', 'cand_1040@mock.com', '09x-xxx-1040', 'Python Developer', 'BE', 1.8, 2.4, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Backend Engineer', 'KMS Technology', 'TMA Solutions', '4', 'Middle', 'Backend', '2y at TMA, 2y at KMS', 'CRM platform', 'Python, Django, PostgreSQL, Docker', 'Fluent', 'Bachelor', 'Software Engineering', 'Python Cert', 'github.com/cand1040', 'Final Interview', '2026-05-13', '2026-05-16', NULL, 'Bích Ngọc', 'N/A', 'Yes', 'Strong backend knowledge')
 ,('CAND-1041', 'Candidate AO', 'cand_1041@mock.com', '09x-xxx-1041', 'Scrum Master', 'PM', 2.2, 3.0, 'Passed', 'TopCV', 'Hanoi, Vietnam', 'Agile Coach', 'Fsoft', 'TMA Solutions', '7', 'Senior', 'Agile Delivery', '4y at TMA, 3y at Fsoft', 'Managed fintech squads', 'Agile, Scrum, Jira, Coaching', 'Fluent', 'Bachelor', 'Business Administration', 'PSM II', NULL, 'Offer', '2026-05-13', '2026-05-17', '2026-05-20', 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong stakeholder management')
 ,('CAND-1042', 'Candidate AP', 'cand_1042@mock.com', '09x-xxx-1042', 'IT Helpdesk', 'BE', 0.9, 1.3, 'Failed', 'FB', 'Hanoi, Vietnam', 'IT Support Engineer', 'Viettel', 'F88', '2', 'Junior', 'IT Support', '1y at F88, 1y at Viettel', 'Internal device support', 'Windows, Troubleshooting, Networking', 'Basic', 'College', 'IT Support', 'Google IT Support', NULL, 'Technical Test', '2026-05-14', '2026-05-15', '2026-05-17', 'Chi Nguyễn', 'Technical skill gap', 'Yes', 'Consider intern role')
 ,('CAND-1043', 'Candidate AQ', 'cand_1043@mock.com', '09x-xxx-1043', 'Auto QA', 'QA', 1.5, 2.1, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'QA Automation Engineer', 'Gameloft', 'VNG', '4', 'Middle', 'Test Automation', '2y at VNG, 2y at Gameloft', 'Automation framework', 'Selenium, API Testing, SQL, Playwright', 'Intermediate', 'Bachelor', 'Software Testing', 'ISTQB', 'github.com/cand1043', 'HM Interview', '2026-05-14', '2026-05-18', NULL, 'Bích Ngọc', 'N/A', 'Yes', 'Strong automation background')
 ,('CAND-1044', 'Candidate AR', 'cand_1044@mock.com', '09x-xxx-1044', 'AI (Python Backend)', 'ML', 2.5, 3.3, 'In-pool', 'Email', 'Hanoi, Vietnam', 'Backend Engineer', 'Techcombank', 'Viettel', '5', 'Senior', 'AI Backend', '3y at Viettel, 2y at Techcombank', 'LLM internal API', 'Python, FastAPI, PostgreSQL, LLM API', 'Fluent', 'Bachelor', 'Computer Science', 'AWS Practitioner', 'github.com/cand1044', 'Technical Interview', '2026-05-15', '2026-05-18', NULL, 'Hiền Nguyễn', NULL, 'Yes', 'Strong Python API knowledge')
 ,('CAND-1045', 'Candidate AS', 'cand_1045@mock.com', '09x-xxx-1045', 'Fullstack Developer', 'FE', 2.2, 3.0, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Software Engineer', 'VMO', 'FPT Software', '5', 'Senior', 'Web Development', '3y at FPT, 2y at VMO', 'E-commerce platform', 'ReactJS, NodeJS, MongoDB, REST API', 'Fluent', 'Bachelor', 'Software Engineering', 'React Certification', 'github.com/cand1045', 'Final Interview', '2026-05-15', '2026-05-19', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong fullstack background')
 ,('CAND-1046', 'Candidate AT', 'cand_1046@mock.com', '09x-xxx-1046', 'Data Engineer', 'DevOps', 2.3, 3.0, 'Passed', 'TopCV', 'Hanoi, Vietnam', 'Data Engineer', 'Shopee', 'Fsoft', '4', 'Middle', 'Data Pipeline', '2y at Fsoft, 2y at Shopee', 'Data warehouse migration', 'Python, SQL, ETL, Airflow', 'Fluent', 'Bachelor', 'Data Science', 'GCP Cert', 'github.com/cand1046', 'HM Interview', '2026-05-16', '2026-05-19', NULL, 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong ETL skill')
 ,('CAND-1047', 'Candidate AU', 'cand_1047@mock.com', '09x-xxx-1047', '.NET Developer', 'BE', 2.4, 3.2, 'In-pool', 'Email', 'Hanoi, Vietnam', 'Backend Developer', 'TMA Solutions', 'NashTech', '6', 'Senior', 'Enterprise Systems', '3y at NashTech, 3y at TMA', 'ERP integration', 'C#, .NET Core, SQL Server, Azure', 'Intermediate', 'Bachelor', 'Computer Science', 'Azure Fundamentals', 'github.com/cand1047', 'Technical Interview', '2026-05-16', '2026-05-20', NULL, 'Bích Ngọc', NULL, 'Yes', 'Good technical depth')
 ,('CAND-1048', 'Candidate AV', 'cand_1048@mock.com', '09x-xxx-1048', 'Flutter Developer', 'Mobile', 1.5, 2.1, 'Rejected', 'FB', 'Hanoi, Vietnam', 'Mobile Engineer', 'VNG', 'Tiki', '3', 'Middle', 'Mobile Development', '2y at Tiki, 1y at VNG', 'Delivery app', 'Flutter, Dart, Firebase', 'Intermediate', 'Bachelor', 'Mobile Computing', 'Flutter Cert', 'github.com/cand1048', 'Technical Test', '2026-05-17', '2026-05-18', '2026-05-20', 'Chi Nguyễn', 'Weak coding test', 'Yes', 'Can consider junior opening')
 ,('CAND-1049', 'Candidate AW', 'cand_1049@mock.com', '09x-xxx-1049', 'AI Agent Engineer', 'ML', 2.8, 3.6, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'AI Engineer', 'Viettel AI', 'VinAI', '5', 'Senior', 'GenAI', '3y at VinAI, 2y at Viettel AI', 'AI Copilot', 'Python, LangChain, Prompt Engineering, Vector DB', 'Fluent', 'Master', 'AI', 'GenAI Cert', 'github.com/cand1049', 'Offer', '2026-05-17', '2026-05-21', '2026-05-23', 'Hiền Nguyễn', 'N/A', 'Yes', 'Excellent communication')
 ,('CAND-1050', 'Candidate AX', 'cand_1050@mock.com', '09x-xxx-1050', 'QA Analyst', 'QA', 1.3, 1.8, 'Failed', 'TopCV', 'Hanoi, Vietnam', 'QA Engineer', 'CMC Global', 'Gameloft', '4', 'Middle', 'QA Testing', '2y at Gameloft, 2y at CMC', 'Fintech QA project', 'Manual Testing, API Testing, Jira', 'Intermediate', 'Bachelor', 'Information Systems', 'ISTQB', NULL, 'HM Interview', '2026-05-18', '2026-05-21', '2026-05-22', 'Bích Ngọc', 'English not sufficient', 'Yes', 'Suitable for local projects')
 ,('CAND-1051', 'Candidate AY', 'cand_1051@mock.com', '09x-xxx-1051', 'DevOps Engineer', 'DevOps', 2.6, 3.4, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Cloud Engineer', 'VNPT', 'Viettel', '5', 'Senior', 'Infrastructure', '3y at Viettel, 2y at VNPT', 'AWS migration', 'AWS, Docker, Kubernetes, Linux', 'Fluent', 'Bachelor', 'Network Engineering', 'AWS Associate', 'github.com/cand1051', 'Final Interview', '2026-05-18', '2026-05-22', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong cloud knowledge')
 ,('CAND-1052', 'Candidate AZ', 'cand_1052@mock.com', '09x-xxx-1052', 'PQA', 'QA', 1.8, 2.5, 'In-pool', 'Email', 'Hanoi, Vietnam', 'QA Process Specialist', 'Fsoft', 'CMC Global', '6', 'Senior', 'Process QA', '4y at CMC, 2y at Fsoft', 'ISO process improvement', 'Process Audit, Documentation, Risk Management', 'Intermediate', 'Bachelor', 'Quality Management', 'ISO 9001', NULL, 'CV Screening', '2026-05-19', '2026-05-20', NULL, 'Hiền Nguyễn', NULL, 'Yes', 'Good process mindset')
 ,('CAND-1053', 'Candidate BA', 'cand_1053@mock.com', '09x-xxx-1053', 'Python Developer', 'BE', 1.8, 2.5, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Backend Engineer', 'KMS Technology', 'TMA Solutions', '4', 'Middle', 'Backend', '2y at TMA, 2y at KMS', 'Internal CRM', 'Python, FastAPI, PostgreSQL, Docker', 'Fluent', 'Bachelor', 'Software Engineering', 'Python Cert', 'github.com/cand1053', 'Offer', '2026-05-19', '2026-05-23', '2026-05-25', 'Bích Ngọc', 'N/A', 'Yes', 'Strong API skill')
 ,('CAND-1054', 'Candidate BB', 'cand_1054@mock.com', '09x-xxx-1054', 'Data Scientist/AI', 'ML', 2.4, 3.2, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Data Scientist', 'VinAI', 'Viettel AI', '4', 'Middle', 'AI/ML, Data Science', '2y at Viettel AI, 2y at VinAI', 'Fraud detection model', 'Python, Machine Learning, SQL, Pandas, Scikit-learn', 'Fluent', 'Master', 'Data Science', 'TensorFlow Certification', 'github.com/cand1054', 'Technical Interview', '2026-05-20', '2026-05-23', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong ML foundation')
 ,('CAND-1055', 'Candidate BC', 'cand_1055@mock.com', '09x-xxx-1055', 'Data Scientist/AI', 'ML', 2.8, 3.5, 'Passed', 'TopCV', 'Hanoi, Vietnam', 'AI Engineer', 'Techcombank', 'FPT Software', '5', 'Senior', 'AI/Analytics', '3y at FPT, 2y at Techcombank', 'Customer recommendation system', 'Python, NLP, Machine Learning, SQL, TensorFlow', 'Fluent', 'Master', 'Artificial Intelligence', 'Deep Learning Specialization', 'github.com/cand1055', 'Final Interview', '2026-05-20', '2026-05-24', NULL, 'Hiền Nguyễn', 'N/A', 'Yes', 'Good communication skill')
 ,('CAND-1056', 'Candidate BD', 'cand_1056@mock.com', '09x-xxx-1056', 'Data Scientist/AI', 'ML', 2.2, 2.9, 'In-pool', 'Email', 'Hanoi, Vietnam', 'Machine Learning Engineer', 'Shopee', 'Tiki', '3', 'Middle', 'Recommendation Systems', '2y at Tiki, 1y at Shopee', 'Product recommendation engine', 'Python, Machine Learning, Pandas, SQL', 'Intermediate', 'Bachelor', 'Computer Science', 'IBM Data Science Cert', 'github.com/cand1056', 'HM Interview', '2026-05-21', '2026-05-23', NULL, 'Bích Ngọc', NULL, 'Yes', 'Potential for AI team')
 ,('CAND-1057', 'Candidate BE', 'cand_1057@mock.com', '09x-xxx-1057', 'Data Scientist/AI', 'ML', 1.8, 2.3, 'Failed', 'FB', 'Hanoi, Vietnam', 'Data Analyst', 'MoMo', 'VNPay', '2', 'Junior', 'Data Analytics', '1y at VNPay, 1y at MoMo', 'User behavior analysis', 'Python, SQL, Tableau, Pandas', 'Intermediate', 'Bachelor', 'Statistics', 'Google Data Analytics', 'github.com/cand1057', 'Technical Test', '2026-05-21', '2026-05-22', '2026-05-24', 'Chi Nguyễn', 'Weak ML knowledge', 'Yes', 'Suitable for Data Analyst role')
 ,('CAND-1058', 'Candidate BF', 'cand_1058@mock.com', '09x-xxx-1058', 'Data Scientist/AI', 'ML', 3.2, 4.0, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Senior Data Scientist', 'VinBigData', 'Viettel AI', '7', 'Senior', 'AI/ML', '4y at Viettel AI, 3y at VinBigData', 'Predictive analytics platform', 'Python, Deep Learning, NLP, SQL, TensorFlow', 'Fluent', 'Master', 'Artificial Intelligence', 'TensorFlow Professional', 'github.com/cand1058', 'Offer', '2026-05-22', '2026-05-25', '2026-05-27', 'Hiền Nguyễn', 'N/A', 'Yes', 'Excellent AI expertise')
 ,('CAND-1067', 'Candidate BO', 'cand_1067@mock.com', '09x-xxx-1067', 'Fullstack (ReactJS+Python)', 'FE', 2.0, 2.7, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Fullstack Engineer', 'KMS Technology', 'TMA Solutions', '4', 'Middle', 'Web Development', '2y at TMA, 2y at KMS', 'Internal ERP system', 'ReactJS, Python, FastAPI, PostgreSQL', 'Fluent', 'Bachelor', 'Software Engineering', 'React Certification', 'github.com/cand1067', 'Technical Interview', '2026-05-26', '2026-05-29', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong frontend & backend balance')
 ,('CAND-1068', 'Candidate BP', 'cand_1068@mock.com', '09x-xxx-1068', 'AI Lead', 'ML', 4.0, 5.0, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'AI Technical Lead', 'VinAI', 'Viettel AI', '8', 'Senior', 'AI/ML Leadership', '5y at Viettel AI, 3y at VinAI', 'Enterprise AI platform', 'Python, LLM, System Design, Leadership', 'Fluent', 'Master', 'Artificial Intelligence', 'AWS ML Specialty', 'github.com/cand1068', 'Offer', '2026-05-27', '2026-05-30', '2026-06-02', 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong leadership & architecture')
 ,('CAND-1069', 'Candidate BQ', 'cand_1069@mock.com', '09x-xxx-1069', 'Infra Engineer', 'DevOps', 2.4, 3.2, 'In-pool', 'TopCV', 'Hanoi, Vietnam', 'Infrastructure Engineer', 'VNPT', 'CMC Telecom', '5', 'Senior', 'Infrastructure', '3y at CMC, 2y at VNPT', 'Cloud infra optimization', 'Linux, AWS, Docker, Monitoring', 'Intermediate', 'Bachelor', 'Network Engineering', 'AWS Associate', NULL, 'HM Interview', '2026-05-27', '2026-05-30', NULL, 'Bích Ngọc', NULL, 'Yes', 'Strong infra background')
 ,('CAND-1070', 'Candidate BR', 'cand_1070@mock.com', '09x-xxx-1070', 'IT Helpdesk', 'BE', 0.9, 1.2, 'Passed', 'FB', 'Hanoi, Vietnam', 'IT Support Specialist', 'F88', 'Viettel', '2', 'Junior', 'Internal IT Support', '1y at Viettel, 1y at F88', 'Office IT maintenance', 'Troubleshooting, Windows, Networking', 'Basic', 'College', 'Information Technology', 'Google IT Support', NULL, 'CV Screening', '2026-05-28', '2026-05-29', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Good attitude and support mindset')
 ,('CAND-1071', 'Candidate BS', 'cand_1071@mock.com', '09x-xxx-1071', 'Scrum Master', 'PM', 2.2, 2.9, 'Rejected', 'Email', 'Hanoi, Vietnam', 'Scrum Master', 'FPT Software', 'NashTech', '6', 'Senior', 'Agile Delivery', '4y at NashTech, 2y at FPT', 'Managed fintech delivery', 'Agile, Scrum, Jira, Stakeholder Management', 'Fluent', 'Bachelor', 'Business Administration', 'PSM II', NULL, 'Final Interview', '2026-05-28', '2026-06-01', '2026-06-03', 'Hiền Nguyễn', 'Stakeholder communication mismatch', 'Yes', 'Consider internal project')
 ,('CAND-1072', 'Candidate BT', 'cand_1072@mock.com', '09x-xxx-1072', 'PQA', 'QA', 1.8, 2.4, 'In-pool', 'TopCV', 'Hanoi, Vietnam', 'Process QA Specialist', 'CMC Global', 'FPT Software', '5', 'Senior', 'Process Quality', '3y at FPT, 2y at CMC', 'ISO process optimization', 'Process Audit, Documentation, Risk Management', 'Intermediate', 'Bachelor', 'Quality Management', 'ISO 9001 Internal Auditor', NULL, 'CV Screening', '2026-05-29', '2026-05-30', NULL, 'Bích Ngọc', NULL, 'Yes', 'Good process mindset')
 ,('CAND-1073', 'Candidate BU', 'cand_1073@mock.com', '09x-xxx-1073', 'Auto QA', 'QA', 1.8, 2.5, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Senior QA Automation Engineer', 'NashTech', 'FPT Software', '5', 'Senior', 'Test Automation', '3y at FPT, 2y at NashTech', 'Built automation regression framework', 'Selenium, Playwright, API Testing, SQL', 'Intermediate', 'Bachelor', 'Software Testing', 'ISTQB Advanced', 'github.com/cand1073', 'Final Interview', '2026-05-29', '2026-06-01', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong automation testing background')
 ,('CAND-1074', 'Candidate BV', 'cand_1074@mock.com', '09x-xxx-1074', '.NET Developer', 'BE', 2.7, 3.5, 'Passed', 'TopCV', 'Hanoi, Vietnam', 'Senior Backend Developer', 'TMA Solutions', 'FPT Software', '7', 'Senior', 'Enterprise Systems', '4y at FPT, 3y at TMA', 'Banking backend modernization', 'C#, .NET Core, SQL Server, Azure, REST API', 'Fluent', 'Bachelor', 'Software Engineering', 'Azure Developer Associate', 'github.com/cand1074', 'Offer', '2026-05-30', '2026-06-02', '2026-06-05', 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong enterprise system experience')
 ,('CAND-1075', 'Candidate BW', 'cand_1075@mock.com', '09x-xxx-1075', 'Fullstack Developer', 'FE', 1.9, 2.6, 'In-pool', 'Email', 'Hanoi, Vietnam', 'Software Engineer', 'KMS Technology', 'NashTech', '4', 'Middle', 'Web Development', '2y at NashTech, 2y at KMS', 'HRM SaaS platform', 'ReactJS, NodeJS, MongoDB, REST API', 'Fluent', 'Bachelor', 'Computer Science', 'React Certification', 'github.com/cand1075', 'HM Interview', '2026-05-30', '2026-06-01', NULL, 'Bích Ngọc', NULL, 'Yes', 'Good frontend knowledge')
 ,('CAND-1076', 'Candidate BX', 'cand_1076@mock.com', '09x-xxx-1076', 'AI (Python Backend)', 'ML', 2.6, 3.4, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Backend Engineer', 'Techcombank', 'Viettel', '5', 'Senior', 'AI Backend', '3y at Viettel, 2y at Techcombank', 'AI API gateway system', 'Python, FastAPI, PostgreSQL, LLM API', 'Fluent', 'Bachelor', 'Information Technology', 'AWS Practitioner', 'github.com/cand1076', 'Technical Interview', '2026-05-31', '2026-06-02', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong backend architecture')
 ,('CAND-1077', 'Candidate BY', 'cand_1077@mock.com', '09x-xxx-1077', 'Data Engineer', 'DevOps', 2.5, 3.2, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Data Engineer', 'Shopee', 'Tiki', '5', 'Senior', 'Data Platform', '3y at Tiki, 2y at Shopee', 'ETL automation', 'Python, SQL, Airflow, Spark', 'Fluent', 'Bachelor', 'Data Engineering', 'GCP Professional Data Engineer', 'github.com/cand1077', 'Final Interview', '2026-05-31', '2026-06-03', NULL, 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong pipeline experience')
 ,('CAND-1078', 'Candidate BZ', 'cand_1078@mock.com', '09x-xxx-1078', 'Flutter Developer', 'Mobile', 1.5, 2.2, 'Failed', 'FB', 'Hanoi, Vietnam', 'Mobile Developer', 'VNG', 'MoMo', '3', 'Middle', 'Mobile Development', '2y at MoMo, 1y at VNG', 'Fintech mobile app', 'Flutter, Dart, Firebase, REST API', 'Intermediate', 'Bachelor', 'Mobile Computing', 'Flutter Development Cert', 'github.com/cand1078', 'Technical Test', '2026-06-01', '2026-06-02', '2026-06-04', 'Bích Ngọc', 'Weak problem solving', 'Yes', 'Suitable for junior mobile role')
 ,('CAND-1079', 'Candidate CA', 'cand_1079@mock.com', '09x-xxx-1079', 'QA Analyst', 'QA', 1.3, 1.8, 'Passed', 'TopCV', 'Hanoi, Vietnam', 'QA Engineer', 'CMC Global', 'Gameloft', '4', 'Middle', 'Software Testing', '2y at Gameloft, 2y at CMC', 'Banking QA project', 'Manual Testing, SQL, API Testing, Jira', 'Intermediate', 'Bachelor', 'Software Testing', 'ISTQB', NULL, 'HM Interview', '2026-06-01', '2026-06-03', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Detail-oriented candidate')
 ,('CAND-1080', 'Candidate CB', 'cand_1080@mock.com', '09x-xxx-1080', 'DevOps Engineer', 'DevOps', 2.8, 3.6, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Cloud Engineer', 'VNPT', 'Viettel', '6', 'Senior', 'Cloud Infrastructure', '4y at Viettel, 2y at VNPT', 'Kubernetes cluster optimization', 'AWS, Docker, Kubernetes, Terraform', 'Fluent', 'Bachelor', 'Network Engineering', 'AWS Solutions Architect', 'github.com/cand1080', 'Offer', '2026-06-02', '2026-06-04', '2026-06-06', 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong cloud & infra expertise')
 ,('CAND-1081', 'Candidate CC', 'cand_1081@mock.com', '09x-xxx-1081', 'Python Developer', 'BE', 1.8, 2.5, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Backend Engineer', 'KMS Technology', 'TMA Solutions', '4', 'Middle', 'Backend Development', '2y at TMA, 2y at KMS', 'E-commerce API platform', 'Python, FastAPI, PostgreSQL, Docker', 'Fluent', 'Bachelor', 'Software Engineering', 'Python Certification', 'github.com/cand1081', 'Technical Interview', '2026-06-02', '2026-06-05', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong backend API knowledge')
 ,('CAND-1082', 'Candidate CD', 'cand_1082@mock.com', '09x-xxx-1082', 'Data Scientist/AI', 'ML', 2.5, 3.2, 'Passed', 'TopCV', 'Hanoi, Vietnam', 'Machine Learning Engineer', 'Shopee', 'Tiki', '4', 'Middle', 'Recommendation Systems', '2y at Tiki, 2y at Shopee', 'Personalized recommendation engine', 'Python, Machine Learning, SQL, TensorFlow', 'Fluent', 'Master', 'Artificial Intelligence', 'TensorFlow Professional', 'github.com/cand1082', 'Final Interview', '2026-06-03', '2026-06-06', NULL, 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong recommendation system experience')
 ,('CAND-1083', 'Candidate CE', 'cand_1083@mock.com', '09x-xxx-1083', 'Fullstack (ReactJS+Python)', 'FE', 2.2, 3.0, 'In-pool', 'Email', 'Hanoi, Vietnam', 'Fullstack Engineer', 'NashTech', 'FPT Software', '5', 'Senior', 'Web Development', '3y at FPT, 2y at NashTech', 'Internal CRM platform', 'ReactJS, Python, FastAPI, PostgreSQL', 'Fluent', 'Bachelor', 'Computer Science', 'React Certification', 'github.com/cand1083', 'HM Interview', '2026-06-03', '2026-06-05', NULL, 'Bích Ngọc', NULL, 'Yes', 'Good fullstack balance')
 ,('CAND-1084', 'Candidate CF', 'cand_1084@mock.com', '09x-xxx-1084', 'IT Helpdesk', 'BE', 0.9, 1.2, 'Passed', 'FB', 'Hanoi, Vietnam', 'IT Support Specialist', 'F88', 'Viettel', '2', 'Junior', 'Internal IT Support', '1y at Viettel, 1y at F88', 'Device troubleshooting support', 'Troubleshooting, Windows, Networking', 'Basic', 'College', 'Information Technology', 'Google IT Support', NULL, 'CV Screening', '2026-06-04', '2026-06-05', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Good support attitude')
 ,('CAND-1085', 'Candidate CG', 'cand_1085@mock.com', '09x-xxx-1085', 'AI Lead', 'ML', 4.2, 5.2, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'AI Technical Manager', 'VinAI', 'Viettel AI', '9', 'Senior', 'AI Leadership', '5y at Viettel AI, 4y at VinAI', 'Enterprise AI assistant', 'Python, LLM, AI Architecture, Leadership', 'Fluent', 'Master', 'Artificial Intelligence', 'AWS ML Specialty', 'github.com/cand1085', 'Offer', '2026-06-04', '2026-06-07', '2026-06-10', 'Hiền Nguyễn', 'N/A', 'Yes', 'Excellent leadership & AI strategy')
 ,('CAND-1086', 'Candidate CH', 'cand_1086@mock.com', '09x-xxx-1086', 'Auto QA', 'QA', 1.5, 2.1, 'Failed', 'TopCV', 'Hanoi, Vietnam', 'QA Automation Engineer', 'Gameloft', 'VNG', '3', 'Middle', 'Test Automation', '2y at VNG, 1y at Gameloft', 'Web automation framework', 'Selenium, Playwright, API Testing', 'Intermediate', 'Bachelor', 'Software Testing', 'ISTQB', 'github.com/cand1086', 'Technical Test', '2026-06-05', '2026-06-06', '2026-06-08', 'Bích Ngọc', 'Weak automation depth', 'Yes', 'Can fit junior QA role')
 ,('CAND-1087', 'Candidate CI', 'cand_1087@mock.com', '09x-xxx-1087', 'Scrum Master', 'PM', 2.3, 3.0, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Agile Project Manager', 'FPT Software', 'NashTech', '7', 'Senior', 'Agile Delivery', '4y at NashTech, 3y at FPT', 'Managed fintech squad', 'Scrum, Agile, Jira, Stakeholder Management', 'Fluent', 'Bachelor', 'Business Administration', 'PSM II', NULL, 'Final Interview', '2026-06-05', '2026-06-08', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Strong stakeholder management')
 ,('CAND-1088', 'Candidate CJ', 'cand_1088@mock.com', '09x-xxx-1088', 'Infra Engineer', 'DevOps', 2.4, 3.1, 'In-pool', 'Email', 'Hanoi, Vietnam', 'Infrastructure Engineer', 'VNPT', 'CMC Telecom', '5', 'Senior', 'Infrastructure', '3y at CMC, 2y at VNPT', 'Monitoring system optimization', 'Linux, AWS, Docker, Monitoring', 'Intermediate', 'Bachelor', 'Network Engineering', 'AWS Associate', NULL, 'CV Screening', '2026-06-06', '2026-06-07', NULL, 'Hiền Nguyễn', NULL, 'Yes', 'Good infra foundation')
 ,('CAND-1089', 'Candidate CK', 'cand_1089@mock.com', '09x-xxx-1089', 'QA Analyst', 'QA', 1.3, 1.8, 'Rejected', 'FB', 'Hanoi, Vietnam', 'QA Engineer', 'CMC Global', 'Gameloft', '4', 'Middle', 'Software Testing', '2y at Gameloft, 2y at CMC', 'Fintech testing project', 'Manual Testing, SQL, Jira, API Testing', 'Intermediate', 'Bachelor', 'Information Systems', 'ISTQB', NULL, 'HM Interview', '2026-06-06', '2026-06-09', '2026-06-10', 'Bích Ngọc', 'English communication mismatch', 'Yes', 'Better for local client projects')
 ,('CAND-1090', 'Candidate CL', 'cand_1090@mock.com', '09x-xxx-1090', 'Data Engineer', 'DevOps', 2.8, 3.5, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Senior Data Engineer', 'Shopee', 'FPT Software', '6', 'Senior', 'Data Platform', '4y at FPT, 2y at Shopee', 'Large-scale ETL migration', 'Python, SQL, Spark, Airflow', 'Fluent', 'Bachelor', 'Data Engineering', 'GCP Data Engineer', 'github.com/cand1090', 'Offer', '2026-06-07', '2026-06-10', '2026-06-12', 'Chi Nguyễn', 'N/A', 'Yes', 'Strong large-scale data experience')
 ,('CAND-1091', 'Candidate CM', 'cand_1091@mock.com', '09x-xxx-1091', '.NET Developer', 'BE', 2.6, 3.4, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Senior Software Engineer', 'NashTech', 'FPT Software', '6', 'Senior', 'Enterprise Systems', '3y at FPT, 3y at NashTech', 'Banking backend system', 'C#, .NET Core, SQL Server, Azure', 'Fluent', 'Bachelor', 'Software Engineering', 'Azure Developer Associate', 'github.com/cand1091', 'Final Interview', '2026-06-07', '2026-06-10', NULL, 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong enterprise backend experience')
 ,('CAND-1092', 'Candidate CN', 'cand_1092@mock.com', '09x-xxx-1092', 'Python Developer', 'BE', 1.7, 2.3, 'In-pool', 'TopCV', 'Hanoi, Vietnam', 'Backend Engineer', 'KMS Technology', 'TMA Solutions', '3', 'Middle', 'Backend Development', '2y at TMA, 1y at KMS', 'Logistics API system', 'Python, Django, PostgreSQL, Docker', 'Fluent', 'Bachelor', 'Computer Science', 'Python Certification', 'github.com/cand1092', 'Technical Interview', '2026-06-08', '2026-06-09', NULL, 'Chi Nguyễn', NULL, 'Yes', 'Strong backend fundamentals')
 ,('CAND-1093', 'Candidate CO', 'cand_1093@mock.com', '09x-xxx-1093', 'AI Agent Engineer', 'ML', 3.0, 3.8, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'AI Engineer', 'Viettel AI', 'VinAI', '5', 'Senior', 'GenAI', '3y at VinAI, 2y at Viettel AI', 'AI assistant for internal ops', 'Python, LangChain, LLM, Prompt Engineering', 'Fluent', 'Master', 'Artificial Intelligence', 'GenAI Certification', 'github.com/cand1093', 'Offer', '2026-06-08', '2026-06-11', '2026-06-13', 'Bích Ngọc', 'N/A', 'Yes', 'Strong LLM experience')
 ,('CAND-1094', 'Candidate CP', 'cand_1094@mock.com', '09x-xxx-1094', 'Fullstack Developer', 'FE', 2.2, 2.9, 'Passed', 'Email', 'Hanoi, Vietnam', 'Fullstack Engineer', 'NashTech', 'CMC Global', '5', 'Senior', 'Web Development', '3y at CMC, 2y at NashTech', 'Internal CRM platform', 'ReactJS, NodeJS, MongoDB, REST API', 'Fluent', 'Bachelor', 'Information Technology', 'React Certification', 'github.com/cand1094', 'HM Interview', '2026-06-09', '2026-06-11', NULL, 'Hiền Nguyễn', 'N/A', 'Yes', 'Good technical balance')
 ,('CAND-1095', 'Candidate CQ', 'cand_1095@mock.com', '09x-xxx-1095', 'IT Helpdesk', 'BE', 0.85, 1.2, 'Passed', 'FB', 'Hanoi, Vietnam', 'IT Support Specialist', 'F88', 'Viettel', '2', 'Junior', 'Internal IT Support', '1y at Viettel, 1y at F88', 'Office IT troubleshooting', 'Windows, Troubleshooting, Networking', 'Basic', 'College', 'Information Technology', 'Google IT Support', NULL, 'CV Screening', '2026-06-09', '2026-06-10', NULL, 'Chi Nguyễn', 'N/A', 'Yes', 'Good support mindset')
 ,('CAND-1096', 'Candidate CR', 'cand_1096@mock.com', '09x-xxx-1096', 'DevOps Engineer', 'DevOps', 2.7, 3.5, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Cloud Engineer', 'VNPT', 'Viettel', '5', 'Senior', 'Cloud Infrastructure', '3y at Viettel, 2y at VNPT', 'Kubernetes migration', 'AWS, Docker, Kubernetes, Terraform', 'Fluent', 'Bachelor', 'Network Engineering', 'AWS Solutions Architect', 'github.com/cand1096', 'Offer', '2026-06-10', '2026-06-13', '2026-06-15', 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong cloud architecture')
 ,('CAND-1097', 'Candidate CS', 'cand_1097@mock.com', '09x-xxx-1097', 'Flutter Developer', 'Mobile', 1.6, 2.2, 'Failed', 'TopCV', 'Hanoi, Vietnam', 'Mobile Developer', 'VNG', 'MoMo', '4', 'Middle', 'Mobile Development', '2y at MoMo, 2y at VNG', 'Fintech mobile app', 'Flutter, Dart, Firebase, REST API', 'Intermediate', 'Bachelor', 'Mobile Computing', 'Flutter Certification', 'github.com/cand1097', 'Technical Test', '2026-06-10', '2026-06-11', '2026-06-13', 'Bích Ngọc', 'Weak coding problem-solving', 'Yes', 'Better for junior mobile role')
 ,('CAND-1098', 'Candidate CT', 'cand_1098@mock.com', '09x-xxx-1098', 'PQA', 'QA', 1.9, 2.5, 'In-pool', 'Email', 'Hanoi, Vietnam', 'Process QA Specialist', 'FPT Software', 'CMC Global', '6', 'Senior', 'Process Quality', '4y at CMC, 2y at FPT', 'SDLC process improvement', 'Process Audit, Documentation, Risk Management', 'Intermediate', 'Bachelor', 'Quality Management', 'ISO 9001 Internal Auditor', NULL, 'CV Screening', '2026-06-11', '2026-06-12', NULL, 'Chi Nguyễn', NULL, 'Yes', 'Good quality mindset')
 ,('CAND-1099', 'Candidate CU', 'cand_1099@mock.com', '09x-xxx-1099', 'Data Engineer', 'DevOps', 2.6, 3.3, 'Passed', 'LinkedIn', 'Hanoi, Vietnam', 'Data Engineer', 'Shopee', 'Tiki', '5', 'Senior', 'Data Platform', '3y at Tiki, 2y at Shopee', 'ETL pipeline automation', 'Python, SQL, Spark, Airflow', 'Fluent', 'Bachelor', 'Data Engineering', 'GCP Data Engineer', 'github.com/cand1099', 'Final Interview', '2026-06-11', '2026-06-14', NULL, 'Hiền Nguyễn', 'N/A', 'Yes', 'Strong big data experience')
 ,('CAND-1100', 'Candidate CV', 'cand_1100@mock.com', '09x-xxx-1100', 'QA Analyst', 'QA', 1.3, 1.8, 'Rejected', 'FB', 'Hanoi, Vietnam', 'QA Engineer', 'Gameloft', 'NashTech', '3', 'Middle', 'Software Testing', '2y at NashTech, 1y at Gameloft', 'Payment system QA', 'Manual Testing, API Testing, SQL, Jira', 'Intermediate', 'Bachelor', 'Software Testing', 'ISTQB', NULL, 'HM Interview', '2026-06-12', '2026-06-14', '2026-06-15', 'Bích Ngọc', 'English communication mismatch', 'Yes', 'Suitable for local projects')
) as v(code, name, email, phone, position, role, smin, smax, status, source,
       location, current_title, current_company, past_companies,
       yoe, seniority, domain_exp, emp_hist, notable_proj, cv_skills,
       english, education, edu_major, certs, github, pipeline,
       recv_date, last_contact, result_date, recruiter, rejection,
       re_elig, re_notes);

-- ===== additional core.skill codes needed for candidate_skill links =====
INSERT INTO core.skill (skill_code, name, skill_category_id)
SELECT v.code, v.name, c.skill_category_id
FROM (VALUES
  ('ai_architecture', 'AI Architecture', 'technical'),
  ('airflow', 'Airflow', 'technical'),
  ('ansible', 'Ansible', 'technical'),
  ('api', 'API', 'technical'),
  ('api_testing', 'API Testing', 'technical'),
  ('aws_lambda', 'AWS Lambda', 'technical'),
  ('azure', 'Azure', 'technical'),
  ('c', 'C#', 'technical'),
  ('celery', 'Celery', 'technical'),
  ('ci_cd', 'CI/CD', 'technical'),
  ('coaching', 'Coaching', 'technical'),
  ('cuda', 'CUDA', 'technical'),
  ('dart', 'Dart', 'technical'),
  ('deep_learning', 'Deep Learning', 'technical'),
  ('django_rest', 'Django REST', 'technical'),
  ('documentation', 'Documentation', 'technical'),
  ('etl', 'ETL', 'technical'),
  ('excel', 'Excel', 'technical'),
  ('firebase', 'Firebase', 'technical'),
  ('flutter', 'Flutter', 'technical'),
  ('gcp', 'GCP', 'technical'),
  ('grpc', 'gRPC', 'technical'),
  ('huggingface', 'HuggingFace', 'technical'),
  ('jira', 'Jira', 'technical'),
  ('kubernetes', 'Kubernetes', 'technical'),
  ('langchain', 'LangChain', 'technical'),
  ('leadership', 'Leadership', 'technical'),
  ('linux', 'Linux', 'technical'),
  ('llm', 'LLM', 'technical'),
  ('llm_api', 'LLM API', 'technical'),
  ('machine_learning', 'Machine Learning', 'technical'),
  ('manual_testing', 'Manual Testing', 'technical'),
  ('mlflow', 'MLflow', 'technical'),
  ('mongodb', 'MongoDB', 'technical'),
  ('monitoring', 'Monitoring', 'technical'),
  ('mysql', 'MySQL', 'technical'),
  ('net_core', '.NET Core', 'technical'),
  ('networking', 'Networking', 'technical'),
  ('nginx', 'Nginx', 'technical'),
  ('nlp', 'NLP', 'technical'),
  ('node_js', 'Node.js', 'technical'),
  ('nodejs', 'NodeJS', 'technical'),
  ('oracle_db', 'Oracle DB', 'technical'),
  ('pandas', 'Pandas', 'technical'),
  ('playwright', 'Playwright', 'technical'),
  ('postgresql', 'PostgreSQL', 'technical'),
  ('postman', 'Postman', 'technical'),
  ('power_bi', 'Power BI', 'technical'),
  ('process_audit', 'Process Audit', 'technical'),
  ('prompt_engineering', 'Prompt Engineering', 'technical'),
  ('rabbitmq', 'RabbitMQ', 'technical'),
  ('reactjs', 'ReactJS', 'technical'),
  ('redis', 'Redis', 'technical'),
  ('rest_api', 'REST API', 'technical'),
  ('risk_management', 'Risk Management', 'technical'),
  ('ruby_on_rails', 'Ruby on Rails', 'technical'),
  ('scikit_learn', 'Scikit-learn', 'technical'),
  ('scrum', 'Scrum', 'technical'),
  ('sidekiq', 'Sidekiq', 'technical'),
  ('spring_boot', 'Spring Boot', 'technical'),
  ('sql', 'SQL', 'technical'),
  ('sql_server', 'SQL Server', 'technical'),
  ('sqlalchemy', 'SQLAlchemy', 'technical'),
  ('stakeholder_management', 'Stakeholder Management', 'technical'),
  ('system_design', 'System Design', 'technical'),
  ('tableau', 'Tableau', 'technical'),
  ('troubleshooting', 'Troubleshooting', 'technical'),
  ('typescript', 'TypeScript', 'technical'),
  ('vector_db', 'Vector DB', 'technical'),
  ('windows', 'Windows', 'technical')
) AS v(code, name, cat)
JOIN core.skill_category c ON c.category_code = v.cat
ON CONFLICT (skill_code) DO NOTHING;

-- ===== ta.candidate_skill: skill links for all 90 candidates =====
INSERT INTO ta.candidate_skill (candidate_id, skill_id)
SELECT
  (SELECT candidate_id FROM ta.candidate WHERE candidate_code = v.cand),
  (SELECT skill_id     FROM core.skill    WHERE skill_code    = v.skill)
FROM (VALUES
  ('CAND-1001', 'python'),
  ('CAND-1001', 'fastapi'),
  ('CAND-1001', 'postgresql'),
  ('CAND-1001', 'redis'),
  ('CAND-1001', 'docker'),
  ('CAND-1001', 'kafka'),
  ('CAND-1001', 'rabbitmq'),
  ('CAND-1001', 'aws'),
  ('CAND-1002', 'python'),
  ('CAND-1002', 'django'),
  ('CAND-1002', 'fastapi'),
  ('CAND-1002', 'postgresql'),
  ('CAND-1002', 'mysql'),
  ('CAND-1002', 'celery'),
  ('CAND-1002', 'redis'),
  ('CAND-1002', 'kafka'),
  ('CAND-1002', 'docker'),
  ('CAND-1002', 'kubernetes'),
  ('CAND-1003', 'python'),
  ('CAND-1003', 'flask'),
  ('CAND-1003', 'fastapi'),
  ('CAND-1003', 'postgresql'),
  ('CAND-1003', 'sqlalchemy'),
  ('CAND-1003', 'docker'),
  ('CAND-1003', 'jenkins'),
  ('CAND-1003', 'elasticsearch'),
  ('CAND-1004', 'python'),
  ('CAND-1004', 'fastapi'),
  ('CAND-1004', 'mysql'),
  ('CAND-1004', 'docker'),
  ('CAND-1004', 'rest_api'),
  ('CAND-1004', 'sqlalchemy'),
  ('CAND-1004', 'nginx'),
  ('CAND-1005', 'python'),
  ('CAND-1005', 'go'),
  ('CAND-1005', 'fastapi'),
  ('CAND-1005', 'postgresql'),
  ('CAND-1005', 'redis'),
  ('CAND-1005', 'kafka'),
  ('CAND-1005', 'kubernetes'),
  ('CAND-1005', 'gcp'),
  ('CAND-1005', 'grpc'),
  ('CAND-1006', 'java'),
  ('CAND-1006', 'spring_boot'),
  ('CAND-1006', 'mysql'),
  ('CAND-1006', 'oracle_db'),
  ('CAND-1006', 'kafka'),
  ('CAND-1006', 'docker'),
  ('CAND-1006', 'jenkins'),
  ('CAND-1007', 'node_js'),
  ('CAND-1007', 'typescript'),
  ('CAND-1007', 'mongodb'),
  ('CAND-1007', 'redis'),
  ('CAND-1007', 'docker'),
  ('CAND-1007', 'kubernetes'),
  ('CAND-1007', 'aws_lambda'),
  ('CAND-1008', 'python'),
  ('CAND-1008', 'django'),
  ('CAND-1008', 'postgresql'),
  ('CAND-1008', 'mysql'),
  ('CAND-1008', 'docker'),
  ('CAND-1008', 'rest_api'),
  ('CAND-1009', 'python'),
  ('CAND-1009', 'fastapi'),
  ('CAND-1009', 'docker'),
  ('CAND-1009', 'kubernetes'),
  ('CAND-1009', 'ansible'),
  ('CAND-1009', 'terraform'),
  ('CAND-1009', 'postgresql'),
  ('CAND-1009', 'redis'),
  ('CAND-1010', 'python'),
  ('CAND-1010', 'ruby_on_rails'),
  ('CAND-1010', 'postgresql'),
  ('CAND-1010', 'redis'),
  ('CAND-1010', 'sidekiq'),
  ('CAND-1010', 'docker'),
  ('CAND-1010', 'elasticsearch'),
  ('CAND-1011', 'python'),
  ('CAND-1011', 'fastapi'),
  ('CAND-1011', 'node_js'),
  ('CAND-1011', 'react'),
  ('CAND-1011', 'postgresql'),
  ('CAND-1011', 'kafka'),
  ('CAND-1011', 'docker'),
  ('CAND-1012', 'python'),
  ('CAND-1012', 'django_rest'),
  ('CAND-1012', 'postgresql'),
  ('CAND-1012', 'celery'),
  ('CAND-1012', 'rabbitmq'),
  ('CAND-1012', 'docker'),
  ('CAND-1013', 'python'),
  ('CAND-1013', 'selenium'),
  ('CAND-1013', 'playwright'),
  ('CAND-1013', 'pytest'),
  ('CAND-1013', 'jenkins'),
  ('CAND-1013', 'docker'),
  ('CAND-1013', 'postman'),
  ('CAND-1014', 'python'),
  ('CAND-1014', 'flask'),
  ('CAND-1014', 'mysql'),
  ('CAND-1014', 'rest_api'),
  ('CAND-1015', 'python'),
  ('CAND-1015', 'pandas'),
  ('CAND-1015', 'scikit_learn'),
  ('CAND-1015', 'sql'),
  ('CAND-1015', 'tableau'),
  ('CAND-1015', 'power_bi'),
  ('CAND-1015', 'excel'),
  ('CAND-1016', 'python'),
  ('CAND-1016', 'pytorch'),
  ('CAND-1016', 'tensorflow'),
  ('CAND-1016', 'huggingface'),
  ('CAND-1016', 'mlflow'),
  ('CAND-1016', 'docker'),
  ('CAND-1016', 'fastapi'),
  ('CAND-1016', 'cuda'),
  ('CAND-1023', 'python'),
  ('CAND-1023', 'machine_learning'),
  ('CAND-1023', 'sql'),
  ('CAND-1023', 'pandas'),
  ('CAND-1024', 'docker'),
  ('CAND-1024', 'kubernetes'),
  ('CAND-1024', 'ci_cd'),
  ('CAND-1024', 'aws'),
  ('CAND-1025', 'reactjs'),
  ('CAND-1025', 'typescript'),
  ('CAND-1025', 'python'),
  ('CAND-1025', 'fastapi'),
  ('CAND-1026', 'agile'),
  ('CAND-1026', 'scrum'),
  ('CAND-1026', 'jira'),
  ('CAND-1026', 'stakeholder_management'),
  ('CAND-1027', 'selenium'),
  ('CAND-1027', 'api_testing'),
  ('CAND-1027', 'sql'),
  ('CAND-1027', 'jira'),
  ('CAND-1028', 'python'),
  ('CAND-1028', 'fastapi'),
  ('CAND-1028', 'postgresql'),
  ('CAND-1028', 'docker'),
  ('CAND-1029', 'c'),
  ('CAND-1029', 'net_core'),
  ('CAND-1029', 'sql_server'),
  ('CAND-1029', 'rest_api'),
  ('CAND-1030', 'manual_testing'),
  ('CAND-1030', 'jira'),
  ('CAND-1030', 'api_testing'),
  ('CAND-1031', 'python'),
  ('CAND-1031', 'langchain'),
  ('CAND-1031', 'prompt_engineering'),
  ('CAND-1031', 'api'),
  ('CAND-1032', 'flutter'),
  ('CAND-1032', 'dart'),
  ('CAND-1032', 'firebase'),
  ('CAND-1033', 'python'),
  ('CAND-1033', 'sql'),
  ('CAND-1033', 'airflow'),
  ('CAND-1033', 'etl'),
  ('CAND-1034', 'linux'),
  ('CAND-1034', 'docker'),
  ('CAND-1034', 'aws'),
  ('CAND-1034', 'monitoring'),
  ('CAND-1035', 'troubleshooting'),
  ('CAND-1035', 'windows'),
  ('CAND-1035', 'networking'),
  ('CAND-1036', 'reactjs'),
  ('CAND-1036', 'nodejs'),
  ('CAND-1036', 'mysql'),
  ('CAND-1036', 'rest_api'),
  ('CAND-1037', 'python'),
  ('CAND-1037', 'tensorflow'),
  ('CAND-1037', 'nlp'),
  ('CAND-1037', 'sql'),
  ('CAND-1038', 'aws'),
  ('CAND-1038', 'docker'),
  ('CAND-1038', 'kubernetes'),
  ('CAND-1038', 'linux'),
  ('CAND-1039', 'manual_testing'),
  ('CAND-1039', 'jira'),
  ('CAND-1039', 'sql'),
  ('CAND-1040', 'python'),
  ('CAND-1040', 'django'),
  ('CAND-1040', 'postgresql'),
  ('CAND-1040', 'docker'),
  ('CAND-1041', 'agile'),
  ('CAND-1041', 'scrum'),
  ('CAND-1041', 'jira'),
  ('CAND-1041', 'coaching'),
  ('CAND-1042', 'windows'),
  ('CAND-1042', 'troubleshooting'),
  ('CAND-1042', 'networking'),
  ('CAND-1043', 'selenium'),
  ('CAND-1043', 'api_testing'),
  ('CAND-1043', 'sql'),
  ('CAND-1043', 'playwright'),
  ('CAND-1044', 'python'),
  ('CAND-1044', 'fastapi'),
  ('CAND-1044', 'postgresql'),
  ('CAND-1044', 'llm_api'),
  ('CAND-1045', 'reactjs'),
  ('CAND-1045', 'nodejs'),
  ('CAND-1045', 'mongodb'),
  ('CAND-1045', 'rest_api'),
  ('CAND-1046', 'python'),
  ('CAND-1046', 'sql'),
  ('CAND-1046', 'etl'),
  ('CAND-1046', 'airflow'),
  ('CAND-1047', 'c'),
  ('CAND-1047', 'net_core'),
  ('CAND-1047', 'sql_server'),
  ('CAND-1047', 'azure'),
  ('CAND-1048', 'flutter'),
  ('CAND-1048', 'dart'),
  ('CAND-1048', 'firebase'),
  ('CAND-1049', 'python'),
  ('CAND-1049', 'langchain'),
  ('CAND-1049', 'prompt_engineering'),
  ('CAND-1049', 'vector_db'),
  ('CAND-1050', 'manual_testing'),
  ('CAND-1050', 'api_testing'),
  ('CAND-1050', 'jira'),
  ('CAND-1051', 'aws'),
  ('CAND-1051', 'docker'),
  ('CAND-1051', 'kubernetes'),
  ('CAND-1051', 'linux'),
  ('CAND-1052', 'process_audit'),
  ('CAND-1052', 'documentation'),
  ('CAND-1052', 'risk_management'),
  ('CAND-1053', 'python'),
  ('CAND-1053', 'fastapi'),
  ('CAND-1053', 'postgresql'),
  ('CAND-1053', 'docker'),
  ('CAND-1054', 'python'),
  ('CAND-1054', 'machine_learning'),
  ('CAND-1054', 'sql'),
  ('CAND-1054', 'pandas'),
  ('CAND-1054', 'scikit_learn'),
  ('CAND-1055', 'python'),
  ('CAND-1055', 'nlp'),
  ('CAND-1055', 'machine_learning'),
  ('CAND-1055', 'sql'),
  ('CAND-1055', 'tensorflow'),
  ('CAND-1056', 'python'),
  ('CAND-1056', 'machine_learning'),
  ('CAND-1056', 'pandas'),
  ('CAND-1056', 'sql'),
  ('CAND-1057', 'python'),
  ('CAND-1057', 'sql'),
  ('CAND-1057', 'tableau'),
  ('CAND-1057', 'pandas'),
  ('CAND-1058', 'python'),
  ('CAND-1058', 'deep_learning'),
  ('CAND-1058', 'nlp'),
  ('CAND-1058', 'sql'),
  ('CAND-1058', 'tensorflow'),
  ('CAND-1067', 'reactjs'),
  ('CAND-1067', 'python'),
  ('CAND-1067', 'fastapi'),
  ('CAND-1067', 'postgresql'),
  ('CAND-1068', 'python'),
  ('CAND-1068', 'llm'),
  ('CAND-1068', 'system_design'),
  ('CAND-1068', 'leadership'),
  ('CAND-1069', 'linux'),
  ('CAND-1069', 'aws'),
  ('CAND-1069', 'docker'),
  ('CAND-1069', 'monitoring'),
  ('CAND-1070', 'troubleshooting'),
  ('CAND-1070', 'windows'),
  ('CAND-1070', 'networking'),
  ('CAND-1071', 'agile'),
  ('CAND-1071', 'scrum'),
  ('CAND-1071', 'jira'),
  ('CAND-1071', 'stakeholder_management'),
  ('CAND-1072', 'process_audit'),
  ('CAND-1072', 'documentation'),
  ('CAND-1072', 'risk_management'),
  ('CAND-1073', 'selenium'),
  ('CAND-1073', 'playwright'),
  ('CAND-1073', 'api_testing'),
  ('CAND-1073', 'sql'),
  ('CAND-1074', 'c'),
  ('CAND-1074', 'net_core'),
  ('CAND-1074', 'sql_server'),
  ('CAND-1074', 'azure'),
  ('CAND-1074', 'rest_api'),
  ('CAND-1075', 'reactjs'),
  ('CAND-1075', 'nodejs'),
  ('CAND-1075', 'mongodb'),
  ('CAND-1075', 'rest_api'),
  ('CAND-1076', 'python'),
  ('CAND-1076', 'fastapi'),
  ('CAND-1076', 'postgresql'),
  ('CAND-1076', 'llm_api'),
  ('CAND-1077', 'python'),
  ('CAND-1077', 'sql'),
  ('CAND-1077', 'airflow'),
  ('CAND-1077', 'spark'),
  ('CAND-1078', 'flutter'),
  ('CAND-1078', 'dart'),
  ('CAND-1078', 'firebase'),
  ('CAND-1078', 'rest_api'),
  ('CAND-1079', 'manual_testing'),
  ('CAND-1079', 'sql'),
  ('CAND-1079', 'api_testing'),
  ('CAND-1079', 'jira'),
  ('CAND-1080', 'aws'),
  ('CAND-1080', 'docker'),
  ('CAND-1080', 'kubernetes'),
  ('CAND-1080', 'terraform'),
  ('CAND-1081', 'python'),
  ('CAND-1081', 'fastapi'),
  ('CAND-1081', 'postgresql'),
  ('CAND-1081', 'docker'),
  ('CAND-1082', 'python'),
  ('CAND-1082', 'machine_learning'),
  ('CAND-1082', 'sql'),
  ('CAND-1082', 'tensorflow'),
  ('CAND-1083', 'reactjs'),
  ('CAND-1083', 'python'),
  ('CAND-1083', 'fastapi'),
  ('CAND-1083', 'postgresql'),
  ('CAND-1084', 'troubleshooting'),
  ('CAND-1084', 'windows'),
  ('CAND-1084', 'networking'),
  ('CAND-1085', 'python'),
  ('CAND-1085', 'llm'),
  ('CAND-1085', 'ai_architecture'),
  ('CAND-1085', 'leadership'),
  ('CAND-1086', 'selenium'),
  ('CAND-1086', 'playwright'),
  ('CAND-1086', 'api_testing'),
  ('CAND-1087', 'scrum'),
  ('CAND-1087', 'agile'),
  ('CAND-1087', 'jira'),
  ('CAND-1087', 'stakeholder_management'),
  ('CAND-1088', 'linux'),
  ('CAND-1088', 'aws'),
  ('CAND-1088', 'docker'),
  ('CAND-1088', 'monitoring'),
  ('CAND-1089', 'manual_testing'),
  ('CAND-1089', 'sql'),
  ('CAND-1089', 'jira'),
  ('CAND-1089', 'api_testing'),
  ('CAND-1090', 'python'),
  ('CAND-1090', 'sql'),
  ('CAND-1090', 'spark'),
  ('CAND-1090', 'airflow'),
  ('CAND-1091', 'c'),
  ('CAND-1091', 'net_core'),
  ('CAND-1091', 'sql_server'),
  ('CAND-1091', 'azure'),
  ('CAND-1092', 'python'),
  ('CAND-1092', 'django'),
  ('CAND-1092', 'postgresql'),
  ('CAND-1092', 'docker'),
  ('CAND-1093', 'python'),
  ('CAND-1093', 'langchain'),
  ('CAND-1093', 'llm'),
  ('CAND-1093', 'prompt_engineering'),
  ('CAND-1094', 'reactjs'),
  ('CAND-1094', 'nodejs'),
  ('CAND-1094', 'mongodb'),
  ('CAND-1094', 'rest_api'),
  ('CAND-1095', 'windows'),
  ('CAND-1095', 'troubleshooting'),
  ('CAND-1095', 'networking'),
  ('CAND-1096', 'aws'),
  ('CAND-1096', 'docker'),
  ('CAND-1096', 'kubernetes'),
  ('CAND-1096', 'terraform'),
  ('CAND-1097', 'flutter'),
  ('CAND-1097', 'dart'),
  ('CAND-1097', 'firebase'),
  ('CAND-1097', 'rest_api'),
  ('CAND-1098', 'process_audit'),
  ('CAND-1098', 'documentation'),
  ('CAND-1098', 'risk_management'),
  ('CAND-1099', 'python'),
  ('CAND-1099', 'sql'),
  ('CAND-1099', 'spark'),
  ('CAND-1099', 'airflow'),
  ('CAND-1100', 'manual_testing'),
  ('CAND-1100', 'api_testing'),
  ('CAND-1100', 'sql'),
  ('CAND-1100', 'jira')
) AS v(cand, skill)
WHERE (SELECT candidate_id FROM ta.candidate WHERE candidate_code = v.cand) IS NOT NULL
  AND (SELECT skill_id     FROM core.skill    WHERE skill_code    = v.skill) IS NOT NULL
ON CONFLICT (candidate_id, skill_id) DO NOTHING;
-- ===== ta.screening_criteria: all 27 criteria from DS-07_Screening_Criteria =====
insert into ta.screening_criteria
 (criteria_code, position, role_id, jd_code,
  must_have_skills, nice_to_have_skills, tech_stack_preferred,
  seniority_required, min_yoe, max_yoe, english_level_required,
  domain_preferred, work_mode, salary_budget_max, employment_type,
  weight_must_have_skills, weight_yoe, weight_english, weight_nice_to_have,
  scoring_note, auto_flag_if_missing, guardrail_notes)
select v.code, v.position,
       (select role_id from core.role where role_code = v.role),
       v.jd_code, v.must_have, v.nice_have, v.tech_stack,
       v.seniority, v.min_yoe::int, v.max_yoe, v.english,
       v.domain, v.work_mode, v.salary_max, v.emp_type,
       v.w_must::int, v.w_yoe::int, v.w_eng::int, v.w_nice::int,
       v.scoring, v.auto_flag, v.guardrail
from (values
  ('SCR-BE-001', 'Senior Backend Developer', 'BE', 'JD-001', 'Python (3+ yrs), SQL/PostgreSQL, REST API design, Microservices experience', 'Docker, Redis, Kafka/RabbitMQ, Cloud (AWS/GCP), System Design', 'Python + FastAPI/Django + PostgreSQL', 'Senior', '4', '—', 'B2', 'Fintech, E-commerce, SaaS (any high-traffic)', 'Hybrid or Remote', '$3000', 'Full-time', '50', '20', '15', '15', 'Must-have: 50pt. YOE 4yr=15pt, 6yr+=20pt. English B2=10pt, C1+=15pt. Nice-to-have: 2pt each, max 15pt.', 'Python, SQL, REST API', 'No auto-reject. Score <30 → flag Low + human review. TA must approve outreach.')
 ,('SCR-MOB-001', 'Mobile Developer (React Native)', 'Mobile', NULL, 'React Native, JavaScript or TypeScript, REST API integration', 'Firebase, Redux/Zustand, CI/CD, Published app on App Store/Play Store', 'React Native + TypeScript + Firebase', 'Mid or Senior', '3', '—', 'B1', 'Consumer apps, E-commerce, Super-app', 'Any', '$2500', 'Full-time', '55', '15', '10', '20', 'Must-have: 55pt. YOE 3yr=10pt, 5yr+=15pt. English B1=7pt, B2+=10pt. Nice-to-have: 5pt each.', 'React Native, JavaScript or TypeScript', 'No auto-reject. Candidates missing Redux but with published apps should still rank Medium.')
 ,('SCR-QA-001', 'QA Automation Engineer', 'QA', NULL, 'Selenium or Playwright, Python or Java, API Testing (Postman/RestAssured)', 'CI/CD integration (Jenkins/GitHub Actions), Performance testing (JMeter/k6), Docker', 'Python + Playwright + Jenkins', 'Mid', '2', '—', 'B1', 'Any (outsourcing, SaaS, product)', 'Hybrid', '$2000', 'Full-time', '50', '20', '10', '20', 'Must-have: 50pt. YOE 2yr=15pt, 4yr+=20pt. Nice-to-have: CI/CD=10pt, performance=8pt, Docker=7pt.', 'Selenium or Playwright, API Testing', 'Test automation framework experience required. Manual-only QA → flag Low.')
 ,('SCR-DE-001', 'Data Engineer', 'DevOps', 'JD-003', 'Python, SQL, ETL pipeline design, At least one cloud DWH (BigQuery/Redshift/Snowflake)', 'Apache Spark, Airflow, dbt, Kafka, Cloud platform (AWS/GCP)', 'Python + Airflow + BigQuery/GCP', 'Mid or Senior', '3', '—', 'B1', 'E-commerce, Fintech, Analytics platform', 'Remote or Hybrid', '$3000', 'Full-time', '50', '20', '10', '20', 'Must-have: 50pt. YOE 3yr=15pt, 5yr+=20pt. Spark=8pt, Airflow=7pt, dbt=5pt.', 'Python, SQL, ETL pipeline', 'Must demonstrate hands-on pipeline ownership (not just query writing).')
 ,('SCR-DO-001', 'DevOps Engineer', 'DevOps', NULL, 'Linux, Docker, CI/CD (GitHub Actions or Jenkins), Cloud (AWS or GCP)', 'Kubernetes, Terraform, Monitoring (Prometheus/Grafana), IaC', 'Docker + Kubernetes + Terraform + AWS', 'Senior', '4', '—', 'B2', 'Any (product company preferred)', 'Any', '$3000', 'Full-time', '50', '20', '15', '15', 'Must-have: 50pt. Kubernetes=10pt, Terraform=8pt, Monitoring=5pt, IaC other=2pt.', 'Docker, CI/CD, Cloud (AWS or GCP)', 'Candidates with only on-prem experience and no cloud → flag Low.')
 ,('SCR-AI-001', 'AI/ML Engineer', 'ML', 'JD-002', 'Python, ML framework (PyTorch or TensorFlow), Model training & evaluation, Statistics/Math', 'MLOps (MLflow/Kubeflow), LLM fine-tuning, Cloud ML services (Vertex AI/SageMaker), Research publication', 'Python + PyTorch + HuggingFace + FastAPI (for serving)', 'Senior', '3', '—', 'B2', 'NLP, Computer Vision, Conversational AI, HealthTech', 'Hybrid or Remote', '$3500', 'Full-time', '50', '15', '15', '20', 'Must-have: 50pt. YOE 3yr=10pt, 5yr+=15pt. MLOps=10pt, LLM fine-tuning=8pt, Research pub=5pt.', 'Python, PyTorch or TensorFlow', 'Purely research profile with no deployment experience → flag Medium, not High.')
 ,('SCR-FE-001', 'Senior Frontend Developer', 'FE', NULL, 'React, TypeScript, HTML/CSS (advanced), State management (Redux/Zustand/React Query)', 'Next.js, GraphQL, Design system contribution, Web performance optimization', 'React + TypeScript + Next.js', 'Senior', '4', '—', 'B2', 'Product company (SaaS, Fintech, Super-app)', 'Remote or Hybrid', '$2800', 'Full-time', '50', '20', '15', '15', 'Must-have: 50pt. YOE 4yr=15pt, 6yr+=20pt. Next.js=8pt, GraphQL=5pt, Design system=5pt.', 'React, TypeScript, State management', 'CSS-only candidates without React experience → auto-flag Low.')
 ,('SCR-BE-002', 'Backend Developer', 'BE', 'JD-010', 'Python, SQL, REST API', 'Docker, Redis, AWS', 'Python + FastAPI + PostgreSQL', 'Junior/Middle', '2', '5', 'B1', 'SaaS, Product company', 'Hybrid', '1800', 'Full-time', '50', '20', '15', '15', 'Must-have: Python/API/SQL. Nice-to-have: Docker/AWS', 'Python, SQL, REST API', 'Missing must-have → manual review')
 ,('SCR-DS-001', 'Data Scientist', 'ML', 'JD-011', 'Python, SQL, Machine Learning', 'NLP, Deep Learning, Docker', 'Python + TensorFlow + Scikit-learn', 'Senior', '4', '8', 'B2', 'Fintech, AI Product', 'Hybrid', '3200', 'Full-time', '50', '20', '15', '15', 'Must-have: ML/Python/SQL', 'Python, Machine Learning, SQL', 'Research-only profile without deployment exp → flag low')
 ,('SCR-DS-002', 'Data Scientist', 'ML', 'JD-012', 'Python, Statistics, SQL', 'Tableau, Pandas', 'Python + Pandas + Scikit-learn', 'Junior/Middle', '2', '4', 'B1', 'Analytics, SaaS', 'Hybrid', '2200', 'Full-time', '55', '15', '10', '20', 'Must-have: Python/Stats/SQL', 'Python, Statistics', 'No hands-on project → medium risk')
 ,('SCR-PM-001', 'Project Manager', 'PM', 'JD-013', 'Agile, Jira, Stakeholder Management', 'PMP, Scrum', 'Jira + Confluence', 'Senior', '5', '-', 'B2', 'Outsourcing, SaaS', 'Hybrid', '2800', 'Full-time', '55', '20', '15', '10', 'Must-have: Agile/Jira/Stakeholder Mgmt', 'Agile, Jira', 'No client-facing experience → flag')
 ,('SCR-SM-001', 'Scrum Master', 'PM', 'JD-014', 'Scrum, Agile, Jira', 'PSM, Coaching', 'Jira + Confluence', 'Senior', '4', '8', 'B2', 'Product, Outsourcing', 'Hybrid', '2500', 'Full-time', '55', '20', '15', '10', 'Must-have: Scrum/Jira/Agile', 'Scrum, Jira', 'No Agile delivery experience → flag')
 ,('SCR-FS-001', 'Fullstack (ReactJS+Python)', 'FE', 'JD-015', 'ReactJS, Python, REST API', 'Docker, AWS', 'ReactJS + Python + FastAPI', 'Middle', '3', '6', 'B2', 'SaaS, Fintech', 'Hybrid', '2600', 'Full-time', '50', '20', '15', '15', 'Must-have: React/Python/API', 'ReactJS, Python', 'Missing React or Python → auto low')
 ,('SCR-PY-001', 'Python Developer', 'BE', 'JD-016', 'Python, Django/FastAPI, SQL', 'Docker, Redis', 'Python + FastAPI + PostgreSQL', 'Middle', '3', '5', 'B1', 'Product, E-commerce', 'Hybrid', '2200', 'Full-time', '50', '20', '15', '15', 'Must-have: Python/Framework/SQL', 'Python, SQL', 'No backend/API project → flag')
 ,('SCR-DN-001', '.NET Developer', 'BE', 'JD-017', 'C#, .NET Core, SQL Server', 'Azure, Docker', '.NET Core + SQL Server', 'Middle', '3', '6', 'B1', 'Enterprise, Banking', 'Hybrid', '2400', 'Full-time', '50', '20', '15', '15', 'Must-have: .NET/C#/SQL', 'C#, .NET Core', 'No enterprise system exp → medium risk')
 ,('SCR-FL-001', 'Flutter Developer', 'Mobile', 'JD-018', 'Flutter, Dart, REST API', 'Firebase, CI/CD', 'Flutter + Firebase', 'Junior/Middle', '2', '4', 'B1', 'Mobile App, Fintech', 'Hybrid', '1800', 'Full-time', '50', '20', '10', '20', 'Must-have: Flutter/Dart/API', 'Flutter, Dart', 'No published mobile app → flag')
 ,('SCR-QA-002', 'QA Analyst', 'QA', 'JD-019', 'Manual Testing, Jira, API Testing', 'SQL, Automation', 'Jira + Postman', 'Junior/Middle', '2', '5', 'B1', 'Fintech, SaaS', 'Hybrid', '1500', 'Full-time', '55', '15', '10', '20', 'Must-have: Manual test/Jira/API', 'Manual Testing, Jira', 'No defect tracking exp → medium risk')
 ,('SCR-AQ-002', 'Auto QA', 'QA', 'JD-020', 'Selenium, API Testing, SQL', 'Playwright, Jenkins', 'Selenium + Playwright + Jenkins', 'Middle', '3', '6', 'B1', 'SaaS, Product', 'Hybrid', '2000', 'Full-time', '50', '20', '10', '20', 'Must-have: Selenium/API/SQL', 'Selenium, API Testing', 'No automation framework exp → auto low')
 ,('SCR-AI-002', 'AI Agent Engineer', 'ML', 'JD-021', 'Python, LLM, Prompt Engineering', 'LangChain, Vector DB', 'Python + LangChain + OpenAI API', 'Senior', '4', '8', 'B2', 'AI Product, SaaS', 'Hybrid', '3500', 'Full-time', '50', '20', '15', '15', 'Must-have: LLM/Python/Prompting', 'Python, LLM', 'No deployed AI use case → flag')
 ,('SCR-AIL-001', 'AI Lead', 'ML', 'JD-022', 'Python, System Design, Leadership', 'MLOps, AWS', 'Python + MLflow + AWS', 'Senior', '7', '-', 'B2', 'AI Product', 'Hybrid', '4500', 'Full-time', '50', '20', '15', '15', 'Must-have: Leadership/AI Architecture', 'Python, Leadership', 'Individual contributor only → high risk')
 ,('SCR-INF-001', 'Infra Engineer', 'DevOps', 'JD-023', 'Linux, Docker, Monitoring', 'Kubernetes, Terraform', 'Linux + Docker + AWS', 'Senior', '4', '-', 'B1', 'Cloud, Infrastructure', 'Hybrid', '2800', 'Full-time', '50', '20', '15', '15', 'Must-have: Linux/Docker/Infra', 'Linux, Docker', 'No production infra exp → flag')
 ,('SCR-HD-001', 'IT Helpdesk', 'BE', 'JD-024', 'Troubleshooting, Windows, Networking', 'Hardware Setup, Ticketing', 'Windows + Network Admin', 'Junior', '1', '3', 'A2', 'Internal IT', 'Onsite', '1000', 'Full-time', '60', '15', '10', '15', 'Must-have: Troubleshooting/Network', 'Windows, Networking', 'No support experience → medium risk')
 ,('SCR-PQA-001', 'PQA', 'QA', 'JD-025', 'Process Audit, Documentation, Risk Management', 'ISO 9001, Agile', 'Jira + Documentation Tools', 'Senior', '4', '8', 'B1', 'Outsourcing, Enterprise', 'Hybrid', '2200', 'Full-time', '55', '20', '10', '15', 'Must-have: Process/Risk Mgmt', 'Process Audit', 'No SDLC/process improvement exp → flag')
 ,('SCR-DEVOPS-002', 'DevOps Engineer', 'DevOps', 'JD-027', 'Docker, Kubernetes, CI/CD', 'Terraform, AWS', 'Docker + Kubernetes + Terraform', 'Senior', '4', '8', 'B2', 'SaaS, Product', 'Hybrid', '3200', 'Full-time', '50', '20', '15', '15', 'Must-have: Docker/K8s/CI-CD', 'Docker, Kubernetes', 'Only on-prem exp, no cloud → medium risk')
 ,('SCR-FE-002', 'Frontend Developer', 'FE', 'JD-028', 'ReactJS, TypeScript, REST API', 'NextJS, GraphQL', 'ReactJS + TypeScript + NextJS', 'Middle', '3', '5', 'B1', 'Product, E-commerce', 'Hybrid', '2200', 'Full-time', '50', '20', '10', '20', 'Must-have: React/TS/API', 'ReactJS, TypeScript', 'No responsive UI/project portfolio → flag')
 ,('SCR-BA-001', 'Business Analyst', 'PM', 'JD-029', 'Requirement Gathering, UML, Stakeholder Management', 'SQL, Agile', 'Jira + Confluence + Draw.io', 'Middle', '3', '6', 'B2', 'Banking, Outsourcing', 'Hybrid', '2300', 'Full-time', '55', '20', '15', '10', 'Must-have: Requirement/UML/Stakeholder', 'Requirement Gathering, UML', 'No BRD/SRS documentation exp → flag')
 ,('SCR-MOB-002', 'Mobile Developer (React Native)', 'Mobile', 'JD-030', 'React Native, JavaScript, REST API', 'Firebase, Redux', 'React Native + Firebase', 'Junior/Middle', '2', '5', 'B1', 'Mobile App, E-commerce', 'Hybrid', '2000', 'Full-time', '50', '20', '10', '20', 'Must-have: React Native/API', 'React Native, JavaScript', 'No published app on App Store/Google Play → medium risk')
) as v(code, position, role, jd_code, must_have, nice_have, tech_stack,
       seniority, min_yoe, max_yoe, english, domain, work_mode, salary_max, emp_type,
       w_must, w_yoe, w_eng, w_nice, scoring, auto_flag, guardrail);

-- ===== ta.screening_criteria_skill: must_have + nice_to_have for original 7 criteria =====
insert into ta.screening_criteria_skill (criteria_id, skill_id, skill_type)
select sc.screening_criteria_id, s.skill_id, v.skill_type
from (values
 ('SCR-BE-001','python','must_have'),('SCR-BE-001','postgresql','must_have'),
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
-- ===== ta.outreach_template: 10 templates from DS-08_Outreach_Template =====
insert into ta.outreach_template
 (template_code, channel, use_case, target_status, language, template_content) values
  ('OUT-001', 'LinkedIn', 'Initial Outreach', 'Applied / In-pool', 'EN', 'Hi {name}, I came across your profile and was genuinely impressed by the work you did on {project} at {past_company}. We''re building a {position} team at {company} and I think you''d be a strong fit. Would you be open to a 15-min chat this week?')
 ,('OUT-002', 'Email', 'Initial Outreach', 'Applied / In-pool', 'EN', 'Subject: {jd_title} Opportunity at {company} – Your {skill} Background Caught Our Attention

Hi {name},

Your experience at {past_company}—specifically your work on {project}—is exactly the kind of hands-on expertise we''re looking for in our {position} opening.

Are you available for a quick 15-min call this week or next?

Best,
{recruiter_name}
{company}')
 ,('OUT-003', 'LinkedIn', 'Re-engagement (In-pool)', 'In-pool', 'EN', 'Hey {name}! We spoke earlier about a {position} role and I wanted to reconnect. We now have a new opening that''s an even stronger match for your background in {skill} and your projects like {project}. Would love to reconnect if you''re open to exploring!')
 ,('OUT-004', 'Email', 'Re-engagement (Rejected/Failed)', 'Rejected / Failed', 'EN', 'Subject: Re-connect – {position} Role at {company}

Hi {name},

I hope you''re doing well. We''ve opened a new {position} position that''s a stronger fit than when we last spoke. Given your background in {skill} at {past_company}, I think this timing could work well for both sides.

Would you be open to a quick chat?

Warm regards,
{recruiter_name}')
 ,('OUT-005', 'TopCV', 'Initial Outreach', 'Applied', 'VI', 'Chào {name},

Mình là {recruiter_name} từ {company}. Mình đọc profile của bạn và rất ấn tượng với dự án {project} mà bạn đã làm tại {past_company}. Hiện tại chúng mình đang tìm {position} với stack {skill}—khá trùng với background của bạn.

Bạn có rảnh 15 phút để trao đổi sơ không?')
 ,('OUT-006', 'LinkedIn', 'Re-engagement (In-pool)', 'In-pool', 'VI', 'Chào {name}! Chúng ta đã từng trao đổi về vị trí {position}. Hiện mình có một cơ hội mới phù hợp hơn với kinh nghiệm {skill} và công việc bạn đã làm tại {past_company}. Bạn có muốn kết nối lại không?')
 ,('OUT-007', 'Email', 'Personalized – Project Mention', 'Applied / In-pool', 'EN', 'Subject: Your work on {project} – {position} opportunity

Hi {name},

I noticed your work on {project} at {past_company}—that''s exactly the scale and technical challenge our team is working on. We''re hiring a {position} and your profile stood out because of your hands-on experience with {skill}.

Happy to share the JD. Does a quick call work for you?')
 ,('OUT-008', 'Email', 'Shortlist Notification to HM', 'Internal', 'EN', 'Subject: Shortlist Summary – {jd_title}

Hi {hiring_manager},

Please find attached the agent-generated shortlist for {jd_title}.

Top candidates:
1. {candidate_1} – Fit Score: {score_1} – {summary_1}
2. {candidate_2} – Fit Score: {score_2} – {summary_2}
3. {candidate_3} – Fit Score: {score_3} – {summary_3}

Outreach messages have been drafted and are awaiting your approval before sending.

[Agent-generated. TA Review Required]')
 ,('OUT-009', 'LinkedIn', 'Passive Candidate Cold Outreach', 'Not in DB', 'EN', 'Hi {name}, your profile—especially your experience with {skill} at {past_company}—caught my attention. We''re scaling our engineering team at {company} and have a {position} role that could be a great fit. No pressure at all, just wanted to plant a seed. Happy to share more if you''re curious!')
 ,('OUT-010', 'TopCV', 'Initial – Salary Hook', 'Applied', 'VI', 'Xin chào {name},

{company} đang tuyển {position} với mức lương cạnh tranh, làm việc {work_mode}. Background của bạn tại {past_company} với kinh nghiệm về {skill} rất phù hợp.

Bạn có thể chia sẻ kỳ vọng lương hiện tại để mình xem thử không?')
;


-- CR-DE-002 (missing from original seed)
INSERT INTO ta.screening_criteria (
  criteria_code, jd_code, position, must_have_skills, nice_to_have_skills,
  tech_stack_preferred, seniority_required, min_yoe, max_yoe,
  english_level_required, domain_preferred, work_mode,
  salary_budget_max, employment_type,
  weight_must_have_skills, weight_yoe, weight_english, weight_nice_to_have,
  scoring_note, auto_flag_if_missing, guardrail_notes)
VALUES (
  'CR-DE-002',
  'JD-026',
  'Data Engineer', 'Python, SQL, ETL, Airflow', 'Spark, Kafka, GCP',
  'Python + Airflow + BigQuery', 'Middle', 3, 6,
  'B1', 'Fintech, Analytics Platform', 'Hybrid',
  2800, 'Full-time',
  50, 20, 10, 20,
  'Must-have: Python/ETL/SQL', 'Python, SQL, ETL',
  'No pipeline ownership experience → flag')
ON CONFLICT (criteria_code) DO NOTHING;

-- ===== BEGIN ENHANCED DATA =====
-- ── 5c. ta.candidate ───────────────────────────────────────────
INSERT INTO ta.candidate
  (candidate_code, full_name, email, phone,
   applied_position, salary_expectation_min_scaled, salary_expectation_max_scaled,
   status, source)
VALUES
  ('CAND-1001', 'Candidate A', 'cand_1001@mock.com', '09x-xxx-x001', 'Senior Backend Developer', 1.8, 2.5, 'In-pool', 'LinkedIn'),
  ('CAND-1002', 'Candidate B', 'cand_1002@mock.com', '09x-xxx-x002', 'Senior Backend Developer', 2.2, 3.0, 'Passed', 'LinkedIn'),
  ('CAND-1003', 'Candidate C', 'cand_1003@mock.com', '09x-xxx-x003', 'Senior Backend Developer', 1.6, 2.2, 'In-pool', 'TopCV'),
  ('CAND-1004', 'Candidate D', 'cand_1004@mock.com', '09x-xxx-x004', 'Senior Backend Developer', 1.4, 2.0, 'In-pool', 'TopCV'),
  ('CAND-1005', 'Candidate E', 'cand_1005@mock.com', '09x-xxx-x005', 'Senior Backend Developer', 2.0, 2.8, 'In-pool', 'LinkedIn'),
  ('CAND-1006', 'Candidate F', 'cand_1006@mock.com', '09x-xxx-x006', 'Senior Backend Developer', 1.8, 2.5, 'In-pool', 'Email'),
  ('CAND-1007', 'Candidate G', 'cand_1007@mock.com', '09x-xxx-x007', 'Senior Backend Developer', 1.7, 2.3, 'Rejected', 'LinkedIn'),
  ('CAND-1008', 'Candidate H', 'cand_1008@mock.com', '09x-xxx-x008', 'Senior Backend Developer', 1.2, 1.8, 'In-pool', 'LinkedIn'),
  ('CAND-1009', 'Candidate I', 'cand_1009@mock.com', '09x-xxx-x009', 'Senior Backend Developer', 1.5, 2.0, 'In-pool', 'Email'),
  ('CAND-1010', 'Candidate J', 'cand_1010@mock.com', '09x-xxx-x010', 'Senior Backend Developer', 1.6, 2.2, 'In-pool', 'LinkedIn'),
  ('CAND-1011', 'Candidate K', 'cand_1011@mock.com', '09x-xxx-x011', 'Senior Backend Developer', 1.7, 2.4, 'In-pool', 'LinkedIn'),
  ('CAND-1012', 'Candidate L', 'cand_1012@mock.com', '09x-xxx-x012', 'Senior Backend Developer', 1.3, 1.8, 'In-pool', 'LinkedIn'),
  ('CAND-1013', 'Candidate M', 'cand_1013@mock.com', '09x-xxx-x013', 'Senior Backend Developer', 1.2, 1.7, 'Rejected', 'Email'),
  ('CAND-1014', 'Candidate N', 'cand_1014@mock.com', '09x-xxx-x014', 'Senior Backend Developer', 0.7, 1.0, 'Rejected', 'FB'),
  ('CAND-1015', 'Candidate O', 'cand_1015@mock.com', '09x-xxx-x015', 'Senior Backend Developer', 2.0, 2.8, 'Rejected', 'LinkedIn'),
  ('CAND-1016', 'Candidate P', 'cand_1016@mock.com', '09x-xxx-x016', 'AI/ML Engineer', 2.2, 3.2, 'In-pool', 'LinkedIn'),
  ('CAND-1017', 'Candidate Q', 'cand_1017@mock.com', '09x-xxx-x017', 'AI/ML Engineer', NULL, NULL, 'In-pool', 'LinkedIn'),
  ('CAND-1018', 'Candidate R', 'cand_1018@mock.com', '09x-xxx-x018', 'Data Engineer', NULL, NULL, 'In-pool', 'LinkedIn'),
  ('CAND-1019', 'Candidate S', 'cand_1019@mock.com', '09x-xxx-x019', 'Data Engineer', NULL, NULL, 'In-pool', 'LinkedIn'),
  ('CAND-1020', 'Candidate T', 'cand_1020@mock.com', '09x-xxx-x020', 'PM', NULL, NULL, 'In-pool', 'LinkedIn'),
  ('CAND-1023', 'Candidate W', 'cand_1023@mock.com', '09x-xxx-1023', 'Data Scientist/AI', 2.2, 3.0, 'Passed', 'LinkedIn'),
  ('CAND-1024', 'Candidate X', 'cand_1024@mock.com', '09x-xxx-1024', 'DevOps Engineer', 2.5, 3.2, 'In-pool', 'TopCV'),
  ('CAND-1025', 'Candidate Y', 'cand_1025@mock.com', '09x-xxx-1025', 'Fullstack (ReactJS+Python)', 1.8, 2.6, 'Passed', 'LinkedIn'),
  ('CAND-1026', 'Candidate Z', 'cand_1026@mock.com', '09x-xxx-1026', 'Scrum Master', 1.8, 2.4, 'Failed', 'Email'),
  ('CAND-1027', 'Candidate AA', 'cand_1027@mock.com', '09x-xxx-1027', 'Auto QA', 1.3, 1.8, 'Rejected', 'FB'),
  ('CAND-1028', 'Candidate AB', 'cand_1028@mock.com', '09x-xxx-1028', 'Python Developer', 1.5, 2.2, 'Passed', 'LinkedIn'),
  ('CAND-1029', 'Candidate AC', 'cand_1029@mock.com', '09x-xxx-1029', '.NET Developer', 2.2, 2.8, 'In-pool', 'TopCV'),
  ('CAND-1030', 'Candidate AD', 'cand_1030@mock.com', '09x-xxx-1030', 'QA Analyst', 1.2, 1.7, 'Passed', 'Email'),
  ('CAND-1031', 'Candidate AE', 'cand_1031@mock.com', '09x-xxx-1031', 'AI Agent Engineer', 2.5, 3.3, 'Passed', 'LinkedIn'),
  ('CAND-1032', 'Candidate AF', 'cand_1032@mock.com', '09x-xxx-1032', 'Flutter Developer', 1.4, 2.0, 'Failed', 'FB'),
  ('CAND-1033', 'Candidate AG', 'cand_1033@mock.com', '09x-xxx-1033', 'Data Engineer', 2.4, 3.2, 'Passed', 'TopCV'),
  ('CAND-1034', 'Candidate AH', 'cand_1034@mock.com', '09x-xxx-1034', 'Infra Engineer', 2.2, 3.0, 'Rejected', 'Email'),
  ('CAND-1035', 'Candidate AI', 'cand_1035@mock.com', '09x-xxx-1035', 'IT Helpdesk', 0.8, 1.2, 'In-pool', 'FB'),
  ('CAND-1036', 'Candidate AJ', 'cand_1036@mock.com', '09x-xxx-1036', 'Fullstack Developer', 1.8, 2.6, 'Passed', 'LinkedIn'),
  ('CAND-1037', 'Candidate AK', 'cand_1037@mock.com', '09x-xxx-1037', 'Data Scientist/AI', 2.8, 3.6, 'Passed', 'LinkedIn'),
  ('CAND-1038', 'Candidate AL', 'cand_1038@mock.com', '09x-xxx-1038', 'DevOps Engineer', 2.3, 3.0, 'In-pool', 'TopCV'),
  ('CAND-1039', 'Candidate AM', 'cand_1039@mock.com', '09x-xxx-1039', 'QA Analyst', 1.3, 1.7, 'Rejected', 'Email'),
  ('CAND-1040', 'Candidate AN', 'cand_1040@mock.com', '09x-xxx-1040', 'Python Developer', 1.8, 2.4, 'Passed', 'LinkedIn'),
  ('CAND-1041', 'Candidate AO', 'cand_1041@mock.com', '09x-xxx-1041', 'Scrum Master', 2.2, 3.0, 'Passed', 'TopCV'),
  ('CAND-1042', 'Candidate AP', 'cand_1042@mock.com', '09x-xxx-1042', 'IT Helpdesk', 0.9, 1.3, 'Failed', 'FB'),
  ('CAND-1043', 'Candidate AQ', 'cand_1043@mock.com', '09x-xxx-1043', 'Auto QA', 1.5, 2.1, 'Passed', 'LinkedIn'),
  ('CAND-1044', 'Candidate AR', 'cand_1044@mock.com', '09x-xxx-1044', 'AI (Python Backend)', 2.5, 3.3, 'In-pool', 'Email'),
  ('CAND-1045', 'Candidate AS', 'cand_1045@mock.com', '09x-xxx-1045', 'Fullstack Developer', 2.2, 3.0, 'Passed', 'LinkedIn'),
  ('CAND-1046', 'Candidate AT', 'cand_1046@mock.com', '09x-xxx-1046', 'Data Engineer', 2.3, 3.0, 'Passed', 'TopCV'),
  ('CAND-1047', 'Candidate AU', 'cand_1047@mock.com', '09x-xxx-1047', '.NET Developer', 2.4, 3.2, 'In-pool', 'Email'),
  ('CAND-1048', 'Candidate AV', 'cand_1048@mock.com', '09x-xxx-1048', 'Flutter Developer', 1.5, 2.1, 'Rejected', 'FB'),
  ('CAND-1049', 'Candidate AW', 'cand_1049@mock.com', '09x-xxx-1049', 'AI Agent Engineer', 2.8, 3.6, 'Passed', 'LinkedIn'),
  ('CAND-1050', 'Candidate AX', 'cand_1050@mock.com', '09x-xxx-1050', 'QA Analyst', 1.3, 1.8, 'Failed', 'TopCV'),
  ('CAND-1051', 'Candidate AY', 'cand_1051@mock.com', '09x-xxx-1051', 'DevOps Engineer', 2.6, 3.4, 'Passed', 'LinkedIn'),
  ('CAND-1052', 'Candidate AZ', 'cand_1052@mock.com', '09x-xxx-1052', 'PQA', 1.8, 2.5, 'In-pool', 'Email'),
  ('CAND-1053', 'Candidate BA', 'cand_1053@mock.com', '09x-xxx-1053', 'Python Developer', 1.8, 2.5, 'Passed', 'LinkedIn'),
  ('CAND-1054', 'Candidate BB', 'cand_1054@mock.com', '09x-xxx-1054', 'Data Scientist/AI', 2.4, 3.2, 'Passed', 'LinkedIn'),
  ('CAND-1055', 'Candidate BC', 'cand_1055@mock.com', '09x-xxx-1055', 'Data Scientist/AI', 2.8, 3.5, 'Passed', 'TopCV'),
  ('CAND-1056', 'Candidate BD', 'cand_1056@mock.com', '09x-xxx-1056', 'Data Scientist/AI', 2.2, 2.9, 'In-pool', 'Email'),
  ('CAND-1057', 'Candidate BE', 'cand_1057@mock.com', '09x-xxx-1057', 'Data Scientist/AI', 1.8, 2.3, 'Failed', 'FB'),
  ('CAND-1058', 'Candidate BF', 'cand_1058@mock.com', '09x-xxx-1058', 'Data Scientist/AI', 3.2, 4.0, 'Passed', 'LinkedIn'),
  ('CAND-1067', 'Candidate BO', 'cand_1067@mock.com', '09x-xxx-1067', 'Fullstack (ReactJS+Python)', 2.0, 2.7, 'Passed', 'LinkedIn'),
  ('CAND-1068', 'Candidate BP', 'cand_1068@mock.com', '09x-xxx-1068', 'AI Lead', 4.0, 5.0, 'Passed', 'LinkedIn'),
  ('CAND-1069', 'Candidate BQ', 'cand_1069@mock.com', '09x-xxx-1069', 'Infra Engineer', 2.4, 3.2, 'In-pool', 'TopCV'),
  ('CAND-1070', 'Candidate BR', 'cand_1070@mock.com', '09x-xxx-1070', 'IT Helpdesk', 0.9, 1.2, 'Passed', 'FB'),
  ('CAND-1071', 'Candidate BS', 'cand_1071@mock.com', '09x-xxx-1071', 'Scrum Master', 2.2, 2.9, 'Rejected', 'Email'),
  ('CAND-1072', 'Candidate BT', 'cand_1072@mock.com', '09x-xxx-1072', 'PQA', 1.8, 2.4, 'In-pool', 'TopCV'),
  ('CAND-1073', 'Candidate BU', 'cand_1073@mock.com', '09x-xxx-1073', 'Auto QA', 1.8, 2.5, 'Passed', 'LinkedIn'),
  ('CAND-1074', 'Candidate BV', 'cand_1074@mock.com', '09x-xxx-1074', '.NET Developer', 2.7, 3.5, 'Passed', 'TopCV'),
  ('CAND-1075', 'Candidate BW', 'cand_1075@mock.com', '09x-xxx-1075', 'Fullstack Developer', 1.9, 2.6, 'In-pool', 'Email'),
  ('CAND-1076', 'Candidate BX', 'cand_1076@mock.com', '09x-xxx-1076', 'AI (Python Backend)', 2.6, 3.4, 'Passed', 'LinkedIn'),
  ('CAND-1077', 'Candidate BY', 'cand_1077@mock.com', '09x-xxx-1077', 'Data Engineer', 2.5, 3.2, 'Passed', 'LinkedIn'),
  ('CAND-1078', 'Candidate BZ', 'cand_1078@mock.com', '09x-xxx-1078', 'Flutter Developer', 1.5, 2.2, 'Failed', 'FB'),
  ('CAND-1079', 'Candidate CA', 'cand_1079@mock.com', '09x-xxx-1079', 'QA Analyst', 1.3, 1.8, 'Passed', 'TopCV'),
  ('CAND-1080', 'Candidate CB', 'cand_1080@mock.com', '09x-xxx-1080', 'DevOps Engineer', 2.8, 3.6, 'Passed', 'LinkedIn'),
  ('CAND-1081', 'Candidate CC', 'cand_1081@mock.com', '09x-xxx-1081', 'Python Developer', 1.8, 2.5, 'Passed', 'LinkedIn'),
  ('CAND-1082', 'Candidate CD', 'cand_1082@mock.com', '09x-xxx-1082', 'Data Scientist/AI', 2.5, 3.2, 'Passed', 'TopCV'),
  ('CAND-1083', 'Candidate CE', 'cand_1083@mock.com', '09x-xxx-1083', 'Fullstack (ReactJS+Python)', 2.2, 3.0, 'In-pool', 'Email'),
  ('CAND-1084', 'Candidate CF', 'cand_1084@mock.com', '09x-xxx-1084', 'IT Helpdesk', 0.9, 1.2, 'Passed', 'FB'),
  ('CAND-1085', 'Candidate CG', 'cand_1085@mock.com', '09x-xxx-1085', 'AI Lead', 4.2, 5.2, 'Passed', 'LinkedIn'),
  ('CAND-1086', 'Candidate CH', 'cand_1086@mock.com', '09x-xxx-1086', 'Auto QA', 1.5, 2.1, 'Failed', 'TopCV'),
  ('CAND-1087', 'Candidate CI', 'cand_1087@mock.com', '09x-xxx-1087', 'Scrum Master', 2.3, 3.0, 'Passed', 'LinkedIn'),
  ('CAND-1088', 'Candidate CJ', 'cand_1088@mock.com', '09x-xxx-1088', 'Infra Engineer', 2.4, 3.1, 'In-pool', 'Email'),
  ('CAND-1089', 'Candidate CK', 'cand_1089@mock.com', '09x-xxx-1089', 'QA Analyst', 1.3, 1.8, 'Rejected', 'FB'),
  ('CAND-1090', 'Candidate CL', 'cand_1090@mock.com', '09x-xxx-1090', 'Data Engineer', 2.8, 3.5, 'Passed', 'LinkedIn'),
  ('CAND-1091', 'Candidate CM', 'cand_1091@mock.com', '09x-xxx-1091', '.NET Developer', 2.6, 3.4, 'Passed', 'LinkedIn'),
  ('CAND-1092', 'Candidate CN', 'cand_1092@mock.com', '09x-xxx-1092', 'Python Developer', 1.7, 2.3, 'In-pool', 'TopCV'),
  ('CAND-1093', 'Candidate CO', 'cand_1093@mock.com', '09x-xxx-1093', 'AI Agent Engineer', 3.0, 3.8, 'Passed', 'LinkedIn'),
  ('CAND-1094', 'Candidate CP', 'cand_1094@mock.com', '09x-xxx-1094', 'Fullstack Developer', 2.2, 2.9, 'Passed', 'Email'),
  ('CAND-1095', 'Candidate CQ', 'cand_1095@mock.com', '09x-xxx-1095', 'IT Helpdesk', 0.85, 1.2, 'Passed', 'FB'),
  ('CAND-1096', 'Candidate CR', 'cand_1096@mock.com', '09x-xxx-1096', 'DevOps Engineer', 2.7, 3.5, 'Passed', 'LinkedIn'),
  ('CAND-1097', 'Candidate CS', 'cand_1097@mock.com', '09x-xxx-1097', 'Flutter Developer', 1.6, 2.2, 'Failed', 'TopCV'),
  ('CAND-1098', 'Candidate CT', 'cand_1098@mock.com', '09x-xxx-1098', 'PQA', 1.9, 2.5, 'In-pool', 'Email'),
  ('CAND-1099', 'Candidate CU', 'cand_1099@mock.com', '09x-xxx-1099', 'Data Engineer', 2.6, 3.3, 'Passed', 'LinkedIn'),
  ('CAND-1100', 'Candidate CV', 'cand_1100@mock.com', '09x-xxx-1100', 'QA Analyst', 1.3, 1.8, 'Rejected', 'FB')
ON CONFLICT (candidate_code) DO NOTHING;

-- ── 5d. ta.candidate_skill ─────────────────────────────────────
INSERT INTO core.skill (skill_code, name, skill_category_id)
SELECT v.code, v.name, c.skill_category_id
FROM (VALUES
  ('agile', 'Agile', 'technical'),
  ('ai_architecture', 'AI Architecture', 'technical'),
  ('airflow', 'Airflow', 'technical'),
  ('ansible', 'Ansible', 'technical'),
  ('api', 'API', 'technical'),
  ('api_testing', 'API Testing', 'technical'),
  ('aws', 'AWS', 'technical'),
  ('aws_lambda', 'AWS Lambda', 'technical'),
  ('azure', 'Azure', 'technical'),
  ('c', 'C#', 'technical'),
  ('celery', 'Celery', 'technical'),
  ('ci_cd', 'CI/CD', 'technical'),
  ('coaching', 'Coaching', 'technical'),
  ('cuda', 'CUDA', 'technical'),
  ('dart', 'Dart', 'technical'),
  ('deep_learning', 'Deep Learning', 'technical'),
  ('django', 'Django', 'technical'),
  ('django_rest', 'Django REST', 'technical'),
  ('docker', 'Docker', 'technical'),
  ('documentation', 'Documentation', 'technical'),
  ('elasticsearch', 'ElasticSearch', 'technical'),
  ('elasticsearch', 'Elasticsearch', 'technical'),
  ('etl', 'ETL', 'technical'),
  ('excel', 'Excel', 'technical'),
  ('fastapi', 'FastAPI', 'technical'),
  ('firebase', 'Firebase', 'technical'),
  ('flask', 'Flask', 'technical'),
  ('flutter', 'Flutter', 'technical'),
  ('gcp', 'GCP', 'technical'),
  ('go', 'Go', 'technical'),
  ('grpc', 'gRPC', 'technical'),
  ('huggingface', 'HuggingFace', 'technical'),
  ('java', 'Java', 'technical'),
  ('jenkins', 'Jenkins', 'technical'),
  ('jira', 'Jira', 'technical'),
  ('kafka', 'Kafka', 'technical'),
  ('kubernetes', 'Kubernetes', 'technical'),
  ('langchain', 'LangChain', 'technical'),
  ('leadership', 'Leadership', 'technical'),
  ('linux', 'Linux', 'technical'),
  ('llm', 'LLM', 'technical'),
  ('llm_api', 'LLM API', 'technical'),
  ('machine_learning', 'Machine Learning', 'technical'),
  ('manual_testing', 'Manual Testing', 'technical'),
  ('mlflow', 'MLflow', 'technical'),
  ('mongodb', 'MongoDB', 'technical'),
  ('monitoring', 'Monitoring', 'technical'),
  ('mysql', 'MySQL', 'technical'),
  ('net_core', '.NET Core', 'technical'),
  ('networking', 'Networking', 'technical'),
  ('nginx', 'Nginx', 'technical'),
  ('nlp', 'NLP', 'technical'),
  ('node_js', 'Node.js', 'technical'),
  ('nodejs', 'NodeJS', 'technical'),
  ('oracle_db', 'Oracle DB', 'technical'),
  ('pandas', 'Pandas', 'technical'),
  ('pandas', 'pandas', 'technical'),
  ('playwright', 'Playwright', 'technical'),
  ('postgresql', 'PostgreSQL', 'technical'),
  ('postman', 'Postman', 'technical'),
  ('power_bi', 'Power BI', 'technical'),
  ('process_audit', 'Process Audit', 'technical'),
  ('prompt_engineering', 'Prompt Engineering', 'technical'),
  ('pytest', 'pytest', 'technical'),
  ('python', 'Python', 'technical'),
  ('pytorch', 'PyTorch', 'technical'),
  ('rabbitmq', 'RabbitMQ', 'technical'),
  ('react', 'React', 'technical'),
  ('reactjs', 'ReactJS', 'technical'),
  ('redis', 'Redis', 'technical'),
  ('rest_api', 'REST API', 'technical'),
  ('risk_management', 'Risk Management', 'technical'),
  ('ruby_on_rails', 'Ruby on Rails', 'technical'),
  ('scikit_learn', 'Scikit-learn', 'technical'),
  ('scikit_learn', 'scikit-learn', 'technical'),
  ('scrum', 'Scrum', 'technical'),
  ('selenium', 'Selenium', 'technical'),
  ('sidekiq', 'Sidekiq', 'technical'),
  ('spark', 'Spark', 'technical'),
  ('spring_boot', 'Spring Boot', 'technical'),
  ('sql', 'SQL', 'technical'),
  ('sql_server', 'SQL Server', 'technical'),
  ('sqlalchemy', 'SQLAlchemy', 'technical'),
  ('stakeholder_management', 'Stakeholder Management', 'technical'),
  ('system_design', 'System Design', 'technical'),
  ('tableau', 'Tableau', 'technical'),
  ('tensorflow', 'TensorFlow', 'technical'),
  ('terraform', 'Terraform', 'technical'),
  ('troubleshooting', 'Troubleshooting', 'technical'),
  ('typescript', 'TypeScript', 'technical'),
  ('vector_db', 'Vector DB', 'technical'),
  ('windows', 'Windows', 'technical')
) AS v(code, name, cat)
JOIN core.skill_category c ON c.category_code = v.cat
ON CONFLICT (skill_code) DO NOTHING;

INSERT INTO ta.candidate_skill (candidate_id, skill_id)
SELECT
  (SELECT candidate_id FROM ta.candidate WHERE candidate_code = v.cand),
  (SELECT skill_id     FROM core.skill    WHERE skill_code    = v.skill)
FROM (VALUES
  ('CAND-1001', 'python'),
  ('CAND-1001', 'fastapi'),
  ('CAND-1001', 'postgresql'),
  ('CAND-1001', 'redis'),
  ('CAND-1001', 'docker'),
  ('CAND-1001', 'kafka'),
  ('CAND-1001', 'rabbitmq'),
  ('CAND-1001', 'aws'),
  ('CAND-1002', 'python'),
  ('CAND-1002', 'django'),
  ('CAND-1002', 'fastapi'),
  ('CAND-1002', 'postgresql'),
  ('CAND-1002', 'mysql'),
  ('CAND-1002', 'celery'),
  ('CAND-1002', 'redis'),
  ('CAND-1002', 'kafka'),
  ('CAND-1002', 'docker'),
  ('CAND-1002', 'kubernetes'),
  ('CAND-1003', 'python'),
  ('CAND-1003', 'flask'),
  ('CAND-1003', 'fastapi'),
  ('CAND-1003', 'postgresql'),
  ('CAND-1003', 'sqlalchemy'),
  ('CAND-1003', 'docker'),
  ('CAND-1003', 'jenkins'),
  ('CAND-1003', 'elasticsearch'),
  ('CAND-1004', 'python'),
  ('CAND-1004', 'fastapi'),
  ('CAND-1004', 'mysql'),
  ('CAND-1004', 'docker'),
  ('CAND-1004', 'rest_api'),
  ('CAND-1004', 'sqlalchemy'),
  ('CAND-1004', 'nginx'),
  ('CAND-1005', 'python'),
  ('CAND-1005', 'go'),
  ('CAND-1005', 'fastapi'),
  ('CAND-1005', 'postgresql'),
  ('CAND-1005', 'redis'),
  ('CAND-1005', 'kafka'),
  ('CAND-1005', 'kubernetes'),
  ('CAND-1005', 'gcp'),
  ('CAND-1005', 'grpc'),
  ('CAND-1006', 'java'),
  ('CAND-1006', 'spring_boot'),
  ('CAND-1006', 'mysql'),
  ('CAND-1006', 'oracle_db'),
  ('CAND-1006', 'kafka'),
  ('CAND-1006', 'docker'),
  ('CAND-1006', 'jenkins'),
  ('CAND-1007', 'node_js'),
  ('CAND-1007', 'typescript'),
  ('CAND-1007', 'mongodb'),
  ('CAND-1007', 'redis'),
  ('CAND-1007', 'docker'),
  ('CAND-1007', 'kubernetes'),
  ('CAND-1007', 'aws_lambda'),
  ('CAND-1008', 'python'),
  ('CAND-1008', 'django'),
  ('CAND-1008', 'postgresql'),
  ('CAND-1008', 'mysql'),
  ('CAND-1008', 'docker'),
  ('CAND-1008', 'rest_api'),
  ('CAND-1009', 'python'),
  ('CAND-1009', 'fastapi'),
  ('CAND-1009', 'docker'),
  ('CAND-1009', 'kubernetes'),
  ('CAND-1009', 'ansible'),
  ('CAND-1009', 'terraform'),
  ('CAND-1009', 'postgresql'),
  ('CAND-1009', 'redis'),
  ('CAND-1010', 'python'),
  ('CAND-1010', 'ruby_on_rails'),
  ('CAND-1010', 'postgresql'),
  ('CAND-1010', 'redis'),
  ('CAND-1010', 'sidekiq'),
  ('CAND-1010', 'docker'),
  ('CAND-1010', 'elasticsearch'),
  ('CAND-1011', 'python'),
  ('CAND-1011', 'fastapi'),
  ('CAND-1011', 'node_js'),
  ('CAND-1011', 'react'),
  ('CAND-1011', 'postgresql'),
  ('CAND-1011', 'kafka'),
  ('CAND-1011', 'docker'),
  ('CAND-1012', 'python'),
  ('CAND-1012', 'django_rest'),
  ('CAND-1012', 'postgresql'),
  ('CAND-1012', 'celery'),
  ('CAND-1012', 'rabbitmq'),
  ('CAND-1012', 'docker'),
  ('CAND-1013', 'python'),
  ('CAND-1013', 'selenium'),
  ('CAND-1013', 'playwright'),
  ('CAND-1013', 'pytest'),
  ('CAND-1013', 'jenkins'),
  ('CAND-1013', 'docker'),
  ('CAND-1013', 'postman'),
  ('CAND-1014', 'python'),
  ('CAND-1014', 'flask'),
  ('CAND-1014', 'mysql'),
  ('CAND-1014', 'rest_api'),
  ('CAND-1015', 'python'),
  ('CAND-1015', 'pandas'),
  ('CAND-1015', 'scikit_learn'),
  ('CAND-1015', 'sql'),
  ('CAND-1015', 'tableau'),
  ('CAND-1015', 'power_bi'),
  ('CAND-1015', 'excel'),
  ('CAND-1016', 'python'),
  ('CAND-1016', 'pytorch'),
  ('CAND-1016', 'tensorflow'),
  ('CAND-1016', 'huggingface'),
  ('CAND-1016', 'mlflow'),
  ('CAND-1016', 'docker'),
  ('CAND-1016', 'fastapi'),
  ('CAND-1016', 'cuda'),
  ('CAND-1023', 'python'),
  ('CAND-1023', 'machine_learning'),
  ('CAND-1023', 'sql'),
  ('CAND-1023', 'pandas'),
  ('CAND-1024', 'docker'),
  ('CAND-1024', 'kubernetes'),
  ('CAND-1024', 'ci_cd'),
  ('CAND-1024', 'aws'),
  ('CAND-1025', 'reactjs'),
  ('CAND-1025', 'typescript'),
  ('CAND-1025', 'python'),
  ('CAND-1025', 'fastapi'),
  ('CAND-1026', 'agile'),
  ('CAND-1026', 'scrum'),
  ('CAND-1026', 'jira'),
  ('CAND-1026', 'stakeholder_management'),
  ('CAND-1027', 'selenium'),
  ('CAND-1027', 'api_testing'),
  ('CAND-1027', 'sql'),
  ('CAND-1027', 'jira'),
  ('CAND-1028', 'python'),
  ('CAND-1028', 'fastapi'),
  ('CAND-1028', 'postgresql'),
  ('CAND-1028', 'docker'),
  ('CAND-1029', 'c'),
  ('CAND-1029', 'net_core'),
  ('CAND-1029', 'sql_server'),
  ('CAND-1029', 'rest_api'),
  ('CAND-1030', 'manual_testing'),
  ('CAND-1030', 'jira'),
  ('CAND-1030', 'api_testing'),
  ('CAND-1031', 'python'),
  ('CAND-1031', 'langchain'),
  ('CAND-1031', 'prompt_engineering'),
  ('CAND-1031', 'api'),
  ('CAND-1032', 'flutter'),
  ('CAND-1032', 'dart'),
  ('CAND-1032', 'firebase'),
  ('CAND-1033', 'python'),
  ('CAND-1033', 'sql'),
  ('CAND-1033', 'airflow'),
  ('CAND-1033', 'etl'),
  ('CAND-1034', 'linux'),
  ('CAND-1034', 'docker'),
  ('CAND-1034', 'aws'),
  ('CAND-1034', 'monitoring'),
  ('CAND-1035', 'troubleshooting'),
  ('CAND-1035', 'windows'),
  ('CAND-1035', 'networking'),
  ('CAND-1036', 'reactjs'),
  ('CAND-1036', 'nodejs'),
  ('CAND-1036', 'mysql'),
  ('CAND-1036', 'rest_api'),
  ('CAND-1037', 'python'),
  ('CAND-1037', 'tensorflow'),
  ('CAND-1037', 'nlp'),
  ('CAND-1037', 'sql'),
  ('CAND-1038', 'aws'),
  ('CAND-1038', 'docker'),
  ('CAND-1038', 'kubernetes'),
  ('CAND-1038', 'linux'),
  ('CAND-1039', 'manual_testing'),
  ('CAND-1039', 'jira'),
  ('CAND-1039', 'sql'),
  ('CAND-1040', 'python'),
  ('CAND-1040', 'django'),
  ('CAND-1040', 'postgresql'),
  ('CAND-1040', 'docker'),
  ('CAND-1041', 'agile'),
  ('CAND-1041', 'scrum'),
  ('CAND-1041', 'jira'),
  ('CAND-1041', 'coaching'),
  ('CAND-1042', 'windows'),
  ('CAND-1042', 'troubleshooting'),
  ('CAND-1042', 'networking'),
  ('CAND-1043', 'selenium'),
  ('CAND-1043', 'api_testing'),
  ('CAND-1043', 'sql'),
  ('CAND-1043', 'playwright'),
  ('CAND-1044', 'python'),
  ('CAND-1044', 'fastapi'),
  ('CAND-1044', 'postgresql'),
  ('CAND-1044', 'llm_api'),
  ('CAND-1045', 'reactjs'),
  ('CAND-1045', 'nodejs'),
  ('CAND-1045', 'mongodb'),
  ('CAND-1045', 'rest_api'),
  ('CAND-1046', 'python'),
  ('CAND-1046', 'sql'),
  ('CAND-1046', 'etl'),
  ('CAND-1046', 'airflow'),
  ('CAND-1047', 'c'),
  ('CAND-1047', 'net_core'),
  ('CAND-1047', 'sql_server'),
  ('CAND-1047', 'azure'),
  ('CAND-1048', 'flutter'),
  ('CAND-1048', 'dart'),
  ('CAND-1048', 'firebase'),
  ('CAND-1049', 'python'),
  ('CAND-1049', 'langchain'),
  ('CAND-1049', 'prompt_engineering'),
  ('CAND-1049', 'vector_db'),
  ('CAND-1050', 'manual_testing'),
  ('CAND-1050', 'api_testing'),
  ('CAND-1050', 'jira'),
  ('CAND-1051', 'aws'),
  ('CAND-1051', 'docker'),
  ('CAND-1051', 'kubernetes'),
  ('CAND-1051', 'linux'),
  ('CAND-1052', 'process_audit'),
  ('CAND-1052', 'documentation'),
  ('CAND-1052', 'risk_management'),
  ('CAND-1053', 'python'),
  ('CAND-1053', 'fastapi'),
  ('CAND-1053', 'postgresql'),
  ('CAND-1053', 'docker'),
  ('CAND-1054', 'python'),
  ('CAND-1054', 'machine_learning'),
  ('CAND-1054', 'sql'),
  ('CAND-1054', 'pandas'),
  ('CAND-1054', 'scikit_learn'),
  ('CAND-1055', 'python'),
  ('CAND-1055', 'nlp'),
  ('CAND-1055', 'machine_learning'),
  ('CAND-1055', 'sql'),
  ('CAND-1055', 'tensorflow'),
  ('CAND-1056', 'python'),
  ('CAND-1056', 'machine_learning'),
  ('CAND-1056', 'pandas'),
  ('CAND-1056', 'sql'),
  ('CAND-1057', 'python'),
  ('CAND-1057', 'sql'),
  ('CAND-1057', 'tableau'),
  ('CAND-1057', 'pandas'),
  ('CAND-1058', 'python'),
  ('CAND-1058', 'deep_learning'),
  ('CAND-1058', 'nlp'),
  ('CAND-1058', 'sql'),
  ('CAND-1058', 'tensorflow'),
  ('CAND-1067', 'reactjs'),
  ('CAND-1067', 'python'),
  ('CAND-1067', 'fastapi'),
  ('CAND-1067', 'postgresql'),
  ('CAND-1068', 'python'),
  ('CAND-1068', 'llm'),
  ('CAND-1068', 'system_design'),
  ('CAND-1068', 'leadership'),
  ('CAND-1069', 'linux'),
  ('CAND-1069', 'aws'),
  ('CAND-1069', 'docker'),
  ('CAND-1069', 'monitoring'),
  ('CAND-1070', 'troubleshooting'),
  ('CAND-1070', 'windows'),
  ('CAND-1070', 'networking'),
  ('CAND-1071', 'agile'),
  ('CAND-1071', 'scrum'),
  ('CAND-1071', 'jira'),
  ('CAND-1071', 'stakeholder_management'),
  ('CAND-1072', 'process_audit'),
  ('CAND-1072', 'documentation'),
  ('CAND-1072', 'risk_management'),
  ('CAND-1073', 'selenium'),
  ('CAND-1073', 'playwright'),
  ('CAND-1073', 'api_testing'),
  ('CAND-1073', 'sql'),
  ('CAND-1074', 'c'),
  ('CAND-1074', 'net_core'),
  ('CAND-1074', 'sql_server'),
  ('CAND-1074', 'azure'),
  ('CAND-1074', 'rest_api'),
  ('CAND-1075', 'reactjs'),
  ('CAND-1075', 'nodejs'),
  ('CAND-1075', 'mongodb'),
  ('CAND-1075', 'rest_api'),
  ('CAND-1076', 'python'),
  ('CAND-1076', 'fastapi'),
  ('CAND-1076', 'postgresql'),
  ('CAND-1076', 'llm_api'),
  ('CAND-1077', 'python'),
  ('CAND-1077', 'sql'),
  ('CAND-1077', 'airflow'),
  ('CAND-1077', 'spark'),
  ('CAND-1078', 'flutter'),
  ('CAND-1078', 'dart'),
  ('CAND-1078', 'firebase'),
  ('CAND-1078', 'rest_api'),
  ('CAND-1079', 'manual_testing'),
  ('CAND-1079', 'sql'),
  ('CAND-1079', 'api_testing'),
  ('CAND-1079', 'jira'),
  ('CAND-1080', 'aws'),
  ('CAND-1080', 'docker'),
  ('CAND-1080', 'kubernetes'),
  ('CAND-1080', 'terraform'),
  ('CAND-1081', 'python'),
  ('CAND-1081', 'fastapi'),
  ('CAND-1081', 'postgresql'),
  ('CAND-1081', 'docker'),
  ('CAND-1082', 'python'),
  ('CAND-1082', 'machine_learning'),
  ('CAND-1082', 'sql'),
  ('CAND-1082', 'tensorflow'),
  ('CAND-1083', 'reactjs'),
  ('CAND-1083', 'python'),
  ('CAND-1083', 'fastapi'),
  ('CAND-1083', 'postgresql'),
  ('CAND-1084', 'troubleshooting'),
  ('CAND-1084', 'windows'),
  ('CAND-1084', 'networking'),
  ('CAND-1085', 'python'),
  ('CAND-1085', 'llm'),
  ('CAND-1085', 'ai_architecture'),
  ('CAND-1085', 'leadership'),
  ('CAND-1086', 'selenium'),
  ('CAND-1086', 'playwright'),
  ('CAND-1086', 'api_testing'),
  ('CAND-1087', 'scrum'),
  ('CAND-1087', 'agile'),
  ('CAND-1087', 'jira'),
  ('CAND-1087', 'stakeholder_management'),
  ('CAND-1088', 'linux'),
  ('CAND-1088', 'aws'),
  ('CAND-1088', 'docker'),
  ('CAND-1088', 'monitoring'),
  ('CAND-1089', 'manual_testing'),
  ('CAND-1089', 'sql'),
  ('CAND-1089', 'jira'),
  ('CAND-1089', 'api_testing'),
  ('CAND-1090', 'python'),
  ('CAND-1090', 'sql'),
  ('CAND-1090', 'spark'),
  ('CAND-1090', 'airflow'),
  ('CAND-1091', 'c'),
  ('CAND-1091', 'net_core'),
  ('CAND-1091', 'sql_server'),
  ('CAND-1091', 'azure'),
  ('CAND-1092', 'python'),
  ('CAND-1092', 'django'),
  ('CAND-1092', 'postgresql'),
  ('CAND-1092', 'docker'),
  ('CAND-1093', 'python'),
  ('CAND-1093', 'langchain'),
  ('CAND-1093', 'llm'),
  ('CAND-1093', 'prompt_engineering'),
  ('CAND-1094', 'reactjs'),
  ('CAND-1094', 'nodejs'),
  ('CAND-1094', 'mongodb'),
  ('CAND-1094', 'rest_api'),
  ('CAND-1095', 'windows'),
  ('CAND-1095', 'troubleshooting'),
  ('CAND-1095', 'networking'),
  ('CAND-1096', 'aws'),
  ('CAND-1096', 'docker'),
  ('CAND-1096', 'kubernetes'),
  ('CAND-1096', 'terraform'),
  ('CAND-1097', 'flutter'),
  ('CAND-1097', 'dart'),
  ('CAND-1097', 'firebase'),
  ('CAND-1097', 'rest_api'),
  ('CAND-1098', 'process_audit'),
  ('CAND-1098', 'documentation'),
  ('CAND-1098', 'risk_management'),
  ('CAND-1099', 'python'),
  ('CAND-1099', 'sql'),
  ('CAND-1099', 'spark'),
  ('CAND-1099', 'airflow'),
  ('CAND-1100', 'manual_testing'),
  ('CAND-1100', 'api_testing'),
  ('CAND-1100', 'sql'),
  ('CAND-1100', 'jira')
) AS v(cand, skill)
WHERE (SELECT candidate_id FROM ta.candidate WHERE candidate_code = v.cand) IS NOT NULL
  AND (SELECT skill_id     FROM core.skill    WHERE skill_code    = v.skill) IS NOT NULL
ON CONFLICT (candidate_id, skill_id) DO NOTHING;

-- ── 5e. ta.screening_criteria & screening_criteria_skill ────────
INSERT INTO ta.screening_criteria (criteria_code, position)
VALUES
  ('SCR-BE-002', 'Backend Developer'),
  ('SCR-DS-001', 'Data Scientist'),
  ('SCR-DS-002', 'Data Scientist'),
  ('SCR-PM-001', 'Project Manager'),
  ('SCR-SM-001', 'Scrum Master'),
  ('SCR-FS-001', 'Fullstack (ReactJS+Python)'),
  ('SCR-PY-001', 'Python Developer'),
  ('SCR-DN-001', '.NET Developer'),
  ('SCR-FL-001', 'Flutter Developer'),
  ('SCR-QA-002', 'QA Analyst'),
  ('SCR-AQ-002', 'Auto QA'),
  ('SCR-AI-002', 'AI Agent Engineer'),
  ('SCR-AIL-001', 'AI Lead'),
  ('SCR-INF-001', 'Infra Engineer'),
  ('SCR-HD-001', 'IT Helpdesk'),
  ('SCR-PQA-001', 'PQA'),
  ('CR-DE-002', 'Data Engineer'),
  ('SCR-DEVOPS-002', 'DevOps Engineer'),
  ('SCR-FE-002', 'Frontend Developer'),
  ('SCR-BA-001', 'Business Analyst'),
  ('SCR-MOB-002', 'Mobile Developer (React Native)')
ON CONFLICT (criteria_code) DO NOTHING;

-- ── 5f. ta.outreach_template ───────────────────────────────────
INSERT INTO ta.outreach_template (template_code, channel, template_content)
VALUES
  ('OUT-001', 'LinkedIn', 'Hi {name}, I came across your profile and was genuinely impressed by the work you did on {project} at {past_company}. We''re building a {position} team at {company} and I think you''d be a strong fit. Would you be open to a 15-min chat this week?'),
  ('OUT-002', 'Email', 'Subject: {jd_title} Opportunity at {company} – Your {skill} Background Caught Our Attention

Hi {name},

Your experience at {past_company}—specifically your work on {project}—is exactly the kind of hands-on expertise we''re looking for in our {position} opening.

Are you available for a quick 15-min call this week or next?

Best,
{recruiter_name}
{company}'),
  ('OUT-003', 'LinkedIn', 'Hey {name}! We spoke earlier about a {position} role and I wanted to reconnect. We now have a new opening that''s an even stronger match for your background in {skill} and your projects like {project}. Would love to reconnect if you''re open to exploring!'),
  ('OUT-004', 'Email', 'Subject: Re-connect – {position} Role at {company}

Hi {name},

I hope you''re doing well. We''ve opened a new {position} position that''s a stronger fit than when we last spoke. Given your background in {skill} at {past_company}, I think this timing could work well for both sides.

Would you be open to a quick chat?

Warm regards,
{recruiter_name}'),
  ('OUT-005', 'TopCV', 'Chào {name},

Mình là {recruiter_name} từ {company}. Mình đọc profile của bạn và rất ấn tượng với dự án {project} mà bạn đã làm tại {past_company}. Hiện tại chúng mình đang tìm {position} với stack {skill}—khá trùng với background của bạn.

Bạn có rảnh 15 phút để trao đổi sơ không?'),
  ('OUT-006', 'LinkedIn', 'Chào {name}! Chúng ta đã từng trao đổi về vị trí {position}. Hiện mình có một cơ hội mới phù hợp hơn với kinh nghiệm {skill} và công việc bạn đã làm tại {past_company}. Bạn có muốn kết nối lại không?'),
  ('OUT-007', 'Email', 'Subject: Your work on {project} – {position} opportunity

Hi {name},

I noticed your work on {project} at {past_company}—that''s exactly the scale and technical challenge our team is working on. We''re hiring a {position} and your profile stood out because of your hands-on experience with {skill}.

Happy to share the JD. Does a quick call work for you?'),
  ('OUT-008', 'Email', 'Subject: Shortlist Summary – {jd_title}

Hi {hiring_manager},

Please find attached the agent-generated shortlist for {jd_title}.

Top candidates:
1. {candidate_1} – Fit Score: {score_1} – {summary_1}
2. {candidate_2} – Fit Score: {score_2} – {summary_2}
3. {candidate_3} – Fit Score: {score_3} – {summary_3}

Outreach messages have been drafted and are awaiting your approval before sending.

[Agent-generated. TA Review Required]'),
  ('OUT-009', 'LinkedIn', 'Hi {name}, your profile—especially your experience with {skill} at {past_company}—caught my attention. We''re scaling our engineering team at {company} and have a {position} role that could be a great fit. No pressure at all, just wanted to plant a seed. Happy to share more if you''re curious!'),
  ('OUT-010', 'TopCV', 'Xin chào {name},

{company} đang tuyển {position} với mức lương cạnh tranh, làm việc {work_mode}. Background của bạn tại {past_company} với kinh nghiệm về {skill} rất phù hợp.

Bạn có thể chia sẻ kỳ vọng lương hiện tại để mình xem thử không?')
ON CONFLICT (template_code) DO NOTHING;

-- ===== END ENHANCED DATA =====
