## 📋 LEGEND & SUMMARY
| 📋  Mock Data Legend & Dataset Summary - SETA AI Agent Hackathon 2026 | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 |
| --- | --- | --- | --- | --- |
| NaN | NaN | NaN | NaN | NaN |
| 📖  Field Dictionary | NaN | NaN | NaN | NaN |
| 🎯  Bài 04: Recruitment Screening & Shortlisting Agent  |  Dữ liệu đầu vào cho agent tự động sàng lọc CV, matching kỹ năng và re-engage ứng viên tiềm năng. | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN |
| Dataset / Sheet | Field Name | Data Type | Example Value | Description |
| DS-06: Candidate Database\n\nCơ sở dữ liệu ứng viên đã anonymize, bao gồm thông tin cá nhân (masked), kỹ năng, trạng thái pipeline.\n\n(1 row = 1 ứng viên) | candidate\_id | String | CAND-1042 | Mã ứng viên (unique identifier) |
| NaN | full\_name | String | Candidate A | Tên ứng viên (đã anonymize, KHÔNG dùng tên thật) |
| NaN | email | String | cand\_1042@mock.com | Email ứng viên (đã mask, dùng mock email) |
| NaN | phone | String | 09x-xxx-xxxx | Số điện thoại (đã mask toàn bộ) |
| NaN | applied\_position | String | Backend Developer | Vị trí ứng tuyển |
| NaN | cv\_skills | String | Python, Django, Docker | Kỹ năng trích từ CV (comma-separated) |
| NaN | salary\_expectation | String | $1200–$1800 | Mức lương kỳ vọng (range) |
| NaN | status | Enum | Rejected | Trạng thái ứng viên trong pipeline |
| NaN | source | Enum | LinkedIn | Nguồn ứng viên |
| NaN | NaN | NaN | NaN | NaN |
| DS-07: Screening Criteria\n\nBộ tiêu chí sàng lọc CV tự động theo từng vị trí, gồm must-have và nice-to-have skills.\n\n(1 row = 1 bộ tiêu chí) | criteria\_id | String | SCR-BE-001 | Mã bộ tiêu chí screening |
| NaN | position | String | Backend Developer | Vị trí áp dụng tiêu chí |
| NaN | must\_have\_skills | String | Python, SQL | Kỹ năng bắt buộc phải có |
| NaN | nice\_to\_have | String | Docker, AWS | Kỹ năng ưu tiên (không bắt buộc) |
| NaN | NaN | NaN | NaN | NaN |
| DS-08: Outreach Template\n\nMẫu tin nhắn outreach/re-engage ứng viên theo từng kênh liên lạc.\n\n(1 row = 1 template) | template\_id | String | OUT-001 | Mã template outreach message |
| NaN | channel | Enum | LinkedIn | Kênh outreach/liên hệ ứng viên |
| NaN | template\_content | String | Hi {name}, we noticed... | Nội dung mẫu tin nhắn outreach |

## DS-06_Candidate_Database
| candidate\_id | full\_name | email | phone | applied\_position | cv\_skills | salary\_expectation | status | source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CAND-1001 | Candidate A | cand\_1001@mock.com | 09x-xxx-x001 | Senior Backend Developer | Python, FastAPI, PostgreSQL, Docker, Redis | $1800–$2500 | Passed | LinkedIn |
| CAND-1002 | Candidate B | cand\_1002@mock.com | 09x-xxx-x002 | Senior Backend Developer | Java, Spring Boot, MySQL, Kafka | $2000–$2800 | In-pool | TopCV |
| CAND-1003 | Candidate C | cand\_1003@mock.com | 09x-xxx-x003 | Mobile Developer (React Native) | React Native, TypeScript, Redux, Firebase | $1200–$1800 | Passed | LinkedIn |
| CAND-1004 | Candidate D | cand\_1004@mock.com | 09x-xxx-x004 | QA Automation Engineer | Selenium, Python, Jenkins, API Testing | $1000–$1500 | Rejected | Email |
| CAND-1005 | Candidate E | cand\_1005@mock.com | 09x-xxx-x005 | Data Engineer | Python, Spark, Airflow, BigQuery, SQL | $2000–$3000 | In-pool | LinkedIn |
| CAND-1006 | Candidate F | cand\_1006@mock.com | 09x-xxx-x006 | DevOps Engineer | Kubernetes, Terraform, AWS, Docker, Prometheus | $1800–$2500 | Failed | TopCV |
| CAND-1007 | Candidate G | cand\_1007@mock.com | 09x-xxx-x007 | Senior Frontend Developer | React, TypeScript, Next.js, GraphQL | $1500–$2200 | Passed | FB |
| CAND-1008 | Candidate H | cand\_1008@mock.com | 09x-xxx-x008 | AI/ML Engineer | Python, PyTorch, TensorFlow, MLOps, LLM | $2200–$3500 | In-pool | LinkedIn |
| CAND-1009 | Candidate I | cand\_1009@mock.com | 09x-xxx-x009 | Senior Backend Developer | Go, gRPC, PostgreSQL, Kubernetes | $2000–$2800 | Rejected | Email |
| CAND-1010 | Candidate J | cand\_1010@mock.com | 09x-xxx-x010 | Mobile Developer (React Native) | Flutter, Dart, REST API, SQLite | $1000–$1600 | Failed | TopCV |

## DS-07_Screening_Criteria
| criteria\_id | position | must\_have\_skills | nice\_to\_have |
| --- | --- | --- | --- |
| SCR-BE-001 | Senior Backend Developer | Python, SQL, REST API | Docker, Redis, Kafka, System Design experience |
| SCR-MOB-001 | Mobile Developer (React Native) | React Native, JavaScript/TypeScript, REST API | Firebase, Redux, CI/CD, Published apps |
| SCR-QA-001 | QA Automation Engineer | Selenium/Playwright, Python or Java, API Testing | CI/CD integration, Performance testing, Docker |
| SCR-DE-001 | Data Engineer | Python, SQL, ETL pipeline experience | Spark, Airflow, Cloud platform (AWS/GCP), Kafka |
| SCR-DO-001 | DevOps Engineer | Linux, Docker, CI/CD, Cloud (AWS or GCP) | Kubernetes, Terraform, Monitoring tools, IaC |
| SCR-AI-001 | AI/ML Engineer | Python, ML frameworks (PyTorch/TensorFlow), Statistics | MLOps, LLM fine-tuning, Cloud ML services, Research papers |
| SCR-FE-001 | Senior Frontend Developer | React, TypeScript, HTML/CSS | Next.js, GraphQL, Design system experience, Performance optimization |

## DS-08_Outreach_Template
| template\_id | channel | template\_content |
| --- | --- | --- |
| OUT-001 | LinkedIn | Hi {name}, I came across your profile and was impressed by your experience in {skill}. We're looking for a {position} to join our team. Would you be open to a quick chat? |
| OUT-002 | Email | Subject: Exciting {position} opportunity at {company}\n\nHi {name},\n\nWe noticed your background in {skill} and believe you'd be a great fit for our {position} role. Are you available for a 15-min call this week? |
| OUT-003 | LinkedIn | Hey {name}! We're scaling our engineering team and your {skill} expertise caught our attention. Interested in learning more about a {position} role with us? |
| OUT-004 | Email | Subject: Re-connect: {position} role\n\nHi {name},\n\nWe previously connected regarding a role at our company. We now have a new {position} opening that aligns well with your {skill} background. Would love to reconnect! |
| OUT-005 | TopCV | Chào {name}, chúng tôi đang tìm kiếm {position} với kinh nghiệm {skill}. Profile của bạn rất phù hợp. Bạn có muốn tìm hiểu thêm về cơ hội này không? |
| OUT-006 | LinkedIn | Hi {name}, I noticed you've been doing great work in {skill}. Our team is growing and we have an exciting {position} opening. Happy to share more details if you're interested! |
| OUT-007 | Email | Subject: {position} - We think you'd be a great fit\n\nHi {name},\n\nYour experience with {skill} stood out to us. We have a {position} role that could be a great next step in your career. Let me know if you'd like to discuss further. |
| OUT-008 | TopCV | Xin chào {name}, công ty chúng tôi đang mở vị trí {position}. Với kinh nghiệm {skill} của bạn, chúng tôi tin rằng đây là cơ hội phù hợp. Hãy liên hệ nếu bạn quan tâm! |
