## 📋 LEGEND & SUMMARY
| 📋  Mock Data Legend & Dataset Summary - SETA AI Agent Hackathon 2026 | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 |
| --- | --- | --- | --- | --- |
| NaN | NaN | NaN | NaN | NaN |
| 📖  Field Dictionary | NaN | NaN | NaN | NaN |
| 🎯  Bài 03: Hire Request & JD Generation Agent  |  Dữ liệu đầu vào cho agent tự động tạo JD dựa trên business context, headcount plan, team skills matrix và scorecard. | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN |
| Dataset / Sheet | Field Name | Data Type | Example Value | Description |
| DS-01: Business Context\n\nThông tin bối cảnh kinh doanh và yêu cầu tuyển dụng từ hiring manager.\n\n(1 row = 1 context/briefing request) | context\_id | String | CTX-001 | Mã định danh cho business context/briefing request |
| NaN | project\_name | String | Project Alpha | Tên dự án cần tuyển dụng (đã anonymize) |
| NaN | business\_roadmap\_summary | String | Scale Backend team Q3 2025 | Tóm tắt roadmap/mục tiêu tuyển dụng của dự án |
| NaN | NaN | NaN | NaN | NaN |
| DS-02: Headcount Plan\n\nKế hoạch headcount theo quý, vị trí cần tuyển và timeline.\n\n(1 row = 1 vị trí cần tuyển) | hc\_plan\_id | String | HC-2025-Q2-001 | Mã headcount plan theo quý |
| NaN | position | String | Senior Backend Developer | Vị trí cần tuyển |
| NaN | headcount | Integer | 3 | Số lượng cần tuyển cho vị trí |
| NaN | salary\_range | String | $1500–$2500/month | Khoảng lương dự kiến (range, không cấp số thật) |
| NaN | target\_start\_date | Date | 2025-07-01 | Ngày cần onboard dự kiến |
| NaN | NaN | NaN | NaN | NaN |
| DS-03: JD Template\n\nTemplate JD chuẩn và JD cũ để agent tham khảo khi generate JD mới.\n\n(1 row = 1 JD) | jd\_id | String | JD-BE-SR-001 | Mã JD (Job Description) |
| NaN | position | String | Senior Backend Developer | Tên vị trí tuyển dụng |
| NaN | jd\_version | String | v2.0 | Phiên bản JD (template hoặc cũ) |
| NaN | required\_skills | String | Python, FastAPI, PostgreSQL | Danh sách kỹ năng yêu cầu (comma-separated) |
| NaN | NaN | NaN | NaN | NaN |
| DS-04: Team Skills Matrix\n\nMa trận kỹ năng của team hiện tại để đánh giá skill gap.\n\n(1 row = 1 kỹ năng của 1 thành viên) | member\_id | String | EMP-015 | Mã thành viên team hiện tại (anonymized) |
| NaN | skill | String | React | Kỹ năng của thành viên |
| NaN | proficiency\_level | Enum | Advanced | Mức độ thành thạo |
| NaN | NaN | NaN | NaN | NaN |
| DS-05: Scorecard\n\nBộ tiêu chí đánh giá ứng viên theo từng vị trí.\n\n(1 row = 1 tiêu chí đánh giá) | scorecard\_id | String | SC-BE-SR-001 | Mã scorecard đánh giá ứng viên |
| NaN | role | String | Senior Backend Developer | Vị trí áp dụng scorecard |
| NaN | criteria | String | System Design, Coding test | Tiêu chí đánh giá |
| NaN | weight | Float | 0.4 | Trọng số đánh giá (%) |

## DS-01_Business_Context
| context\_id | project\_name | business\_roadmap\_summary |
| --- | --- | --- |
| CTX-001 | Project Alpha | Scale Backend team to support new microservices migration in Q3 2025 |
| CTX-002 | Project Beta | Build mobile engineering team for cross-platform app launch Q4 2025 |
| CTX-003 | Project Gamma | Strengthen QA automation capabilities for CI/CD pipeline improvement |
| CTX-004 | Project Delta | Expand data engineering team to handle real-time analytics platform |
| CTX-005 | Project Epsilon | Hire DevOps engineers to support multi-cloud infrastructure rollout |
| CTX-006 | Project Zeta | Form new AI/ML team for intelligent recommendation engine development |
| CTX-007 | Project Eta | Recruit frontend specialists for design system rebuild and UX overhaul |

## DS-02_Headcount_Plan
| hc\_plan\_id | position | headcount | salary\_range | target\_start\_date |
| --- | --- | --- | --- | --- |
| HC-2025-Q2-001 | Senior Backend Developer | 3 | $1500–$2500/month | 2025-07-01 |
| HC-2025-Q2-002 | Mobile Developer (React Native) | 2 | $1200–$2000/month | 2025-08-01 |
| HC-2025-Q3-001 | QA Automation Engineer | 2 | $1000–$1800/month | 2025-09-15 |
| HC-2025-Q3-002 | Data Engineer | 1 | $1800–$3000/month | 2025-10-01 |
| HC-2025-Q3-003 | DevOps Engineer | 2 | $1500–$2800/month | 2025-09-01 |
| HC-2025-Q4-001 | AI/ML Engineer | 2 | $2000–$3500/month | 2025-11-01 |
| HC-2025-Q4-002 | Senior Frontend Developer | 3 | $1400–$2200/month | 2025-10-15 |

## DS-03_JD_Template
| jd\_id | position | jd\_version | required\_skills |
| --- | --- | --- | --- |
| JD-BE-SR-001 | Senior Backend Developer | v2.0 | Python, FastAPI, PostgreSQL, Redis, Docker |
| JD-MOB-MID-001 | Mobile Developer (React Native) | v1.2 | React Native, TypeScript, Redux, REST API, Firebase |
| JD-QA-MID-001 | QA Automation Engineer | v1.5 | Selenium, Python, CI/CD, TestRail, API Testing |
| JD-DE-SR-001 | Data Engineer | v3.0 | Python, Apache Spark, Airflow, BigQuery, Kafka |
| JD-DO-SR-001 | DevOps Engineer | v2.1 | Kubernetes, Terraform, AWS, GitHub Actions, Monitoring |
| JD-AI-SR-001 | AI/ML Engineer | v1.0 | Python, PyTorch, TensorFlow, MLOps, SQL, LLM fine-tuning |
| JD-FE-SR-001 | Senior Frontend Developer | v2.3 | React, TypeScript, Next.js, TailwindCSS, GraphQL |

## DS-04_Team_Skills_Matrix
| member\_id | skill | proficiency\_level |
| --- | --- | --- |
| EMP-011 | Python | Advanced |
| EMP-011 | FastAPI | Intermediate |
| EMP-011 | PostgreSQL | Advanced |
| EMP-012 | Java | Advanced |
| EMP-012 | Spring Boot | Advanced |
| EMP-012 | Docker | Intermediate |
| EMP-013 | Node.js | Advanced |
| EMP-013 | TypeScript | Advanced |
| EMP-013 | MongoDB | Intermediate |
| EMP-021 | React | Advanced |
| EMP-021 | TypeScript | Advanced |
| EMP-021 | CSS/SCSS | Intermediate |
| EMP-022 | Vue.js | Advanced |
| EMP-022 | JavaScript | Advanced |
| EMP-022 | GraphQL | Beginner |
| EMP-031 | Python | Advanced |
| EMP-031 | Apache Spark | Intermediate |
| EMP-031 | SQL | Advanced |
| EMP-032 | Airflow | Advanced |
| EMP-032 | BigQuery | Intermediate |
| EMP-032 | Kafka | Beginner |
| EMP-041 | Kubernetes | Advanced |
| EMP-041 | Terraform | Intermediate |
| EMP-041 | AWS | Advanced |
| EMP-042 | Docker | Advanced |
| EMP-042 | CI/CD | Advanced |
| EMP-042 | Monitoring | Intermediate |

## DS-05_Scorecard
| scorecard\_id | role | criteria | weight |
| --- | --- | --- | --- |
| SC-BE-SR-001 | Senior Backend Developer | System Design | 0.30 |
| SC-BE-SR-001 | Senior Backend Developer | Coding Test (Live) | 0.25 |
| SC-BE-SR-001 | Senior Backend Developer | Technical Knowledge (Python/FastAPI) | 0.20 |
| SC-BE-SR-001 | Senior Backend Developer | Problem Solving | 0.15 |
| SC-BE-SR-001 | Senior Backend Developer | Communication & Culture Fit | 0.10 |
| SC-MOB-MID-001 | Mobile Developer (React Native) | Coding Test (Take-home) | 0.30 |
| SC-MOB-MID-001 | Mobile Developer (React Native) | React Native Proficiency | 0.25 |
| SC-MOB-MID-001 | Mobile Developer (React Native) | UI/UX Sense | 0.15 |
| SC-MOB-MID-001 | Mobile Developer (React Native) | Problem Solving | 0.20 |
| SC-MOB-MID-001 | Mobile Developer (React Native) | Communication & Culture Fit | 0.10 |
| SC-QA-MID-001 | QA Automation Engineer | Automation Framework Knowledge | 0.30 |
| SC-QA-MID-001 | QA Automation Engineer | Test Strategy & Planning | 0.25 |
| SC-QA-MID-001 | QA Automation Engineer | Coding Skill (Python/Java) | 0.20 |
| SC-QA-MID-001 | QA Automation Engineer | CI/CD Integration | 0.15 |
| SC-QA-MID-001 | QA Automation Engineer | Communication & Culture Fit | 0.10 |
| SC-DE-SR-001 | Data Engineer | Data Pipeline Design | 0.30 |
| SC-DE-SR-001 | Data Engineer | SQL & Query Optimization | 0.25 |
| SC-DE-SR-001 | Data Engineer | Big Data Tools (Spark/Kafka) | 0.20 |
| SC-DE-SR-001 | Data Engineer | Problem Solving | 0.15 |
| SC-DE-SR-001 | Data Engineer | Communication & Culture Fit | 0.10 |
| SC-DO-SR-001 | DevOps Engineer | Infrastructure as Code | 0.25 |
| SC-DO-SR-001 | DevOps Engineer | Cloud Platform (AWS/GCP) | 0.25 |
| SC-DO-SR-001 | DevOps Engineer | CI/CD Pipeline Design | 0.20 |
| SC-DO-SR-001 | DevOps Engineer | Monitoring & Incident Response | 0.15 |
| SC-DO-SR-001 | DevOps Engineer | Communication & Culture Fit | 0.15 |
| SC-AI-SR-001 | AI/ML Engineer | ML System Design | 0.30 |
| SC-AI-SR-001 | AI/ML Engineer | Coding Test (Python/ML) | 0.25 |
| SC-AI-SR-001 | AI/ML Engineer | Research & Paper Discussion | 0.20 |
| SC-AI-SR-001 | AI/ML Engineer | MLOps & Deployment | 0.15 |
| SC-AI-SR-001 | AI/ML Engineer | Communication & Culture Fit | 0.10 |
| SC-FE-SR-001 | Senior Frontend Developer | Frontend Architecture | 0.25 |
| SC-FE-SR-001 | Senior Frontend Developer | Coding Test (React/TS) | 0.30 |
| SC-FE-SR-001 | Senior Frontend Developer | Performance Optimization | 0.15 |
| SC-FE-SR-001 | Senior Frontend Developer | UI/UX Collaboration | 0.15 |
| SC-FE-SR-001 | Senior Frontend Developer | Communication & Culture Fit | 0.15 |