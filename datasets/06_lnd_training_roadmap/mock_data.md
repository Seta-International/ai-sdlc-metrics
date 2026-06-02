## 📋 LEGEND & SUMMARY
| Unnamed: 0 | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 |
| --- | --- | --- | --- | --- | --- |
| NaN | 📋  Mock Data Legend & Dataset Summary — SETA AI Agent Hackathon 2026 | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | 📁  Field Dictionary — LD\_06\_TrainingRoadmap\_SkillGap.xlsx | NaN | NaN | NaN | NaN |
| NaN | 🎯  Đề bài 06 — Training Roadmap & Skill Gap Analysis Agent  |  Dữ liệu đầu vào cho agent phân tích skill gap và đề xuất roadmap đào tạo theo quý/năm cho BOD. | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | Dataset / Sheet | Field Name | Data Type | Example Value | Description |
| NaN | DS-01 · Employee Skill Profile\n\nHồ sơ kỹ năng hiện tại và khoảng trống kỹ năng của từng nhân viên.\n\n(1 row = 1 nhân viên) | Employee\_ID | String | EMP-044 | Mã nhân viên ẩn danh. |
| NaN | NaN | Position | String | Mid Backend Dev | Vị trí/chức danh hiện tại (đã generalize). |
| NaN | NaN | Skill | String | Python; FastAPI | Danh sách kỹ năng hiện có, phân cách bằng dấu ';'. |
| NaN | NaN | Proficiency\_Level | Enum | Intermediate | Mức thành thạo: Beginner / Intermediate / Advanced. |
| NaN | NaN | Skill\_Gap | String | MLOps, Docker | Kỹ năng còn thiếu so với yêu cầu dự án/thị trường. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-02 · Project Roadmap\n\nDanh sách dự án sắp tới và kỹ năng kỹ thuật cần có, phục vụ mapping với skill gap.\n\n(1 row = 1 dự án) | Project\_ID | String | PRJ-007 | Mã dự án ẩn danh (tên thật đã mask). |
| NaN | NaN | Required\_Skills | String | FastAPI, K8s | Kỹ năng kỹ thuật cần có trong dự án. |
| NaN | NaN | Timeline | String | Q3–Q4 2025 | Khung thời gian thực hiện dự án. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-03 · Training Need Survey\n\nKết quả khảo sát nhu cầu đào tạo từ nhân viên. Có 2 quarters để hỗ trợ phân tích xu hướng.\n\n(1 row = 1 phản hồi khảo sát của 1 nhân viên) | Survey\_ID | String | SUR\_2026\_Q1 | Mã đợt khảo sát theo quý. |
| NaN | NaN | Employee\_ID | String | EMP-044 | Mã nhân viên tham gia khảo sát. |
| NaN | NaN | Training\_Topic | String | DevOps, CI/CD | Chủ đề đào tạo nhân viên mong muốn. |
| NaN | NaN | Priority | Enum | High | Mức ưu tiên: High / Medium / Low. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-04 · Internal Trainer List\n\nDanh sách trainer nội bộ, chuyên môn và khả năng đảm nhận giảng dạy.\n\n(1 row = 1 trainer) | Trainer\_ID | String | TRN-003 | Mã trainer ẩn danh (tên thật đã mask). |
| NaN | NaN | Expertise | String | DevOps, CI/CD | Danh sách chuyên môn giảng dạy. |
| NaN | NaN | Availability\_Hours\_Per\_Month | Integer | 8 | Số giờ có thể giảng dạy mỗi tháng. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-05 · BOD Training Goals\n\nMục tiêu đào tạo chiến lược từ Ban Giám đốc theo từng quý.\n\n(1 row = 1 mục tiêu) | Goal\_ID | String | GOAL-2026-04 | Mã mục tiêu đào tạo. |
| NaN | NaN | Goal\_Description | String | Upskill 60% team... | Mô tả mục tiêu (đã generalize, không có nội dung chiến lược nhạy cảm). |
| NaN | NaN | Target\_Quarter | String | Q2\_2026 | Quý mục tiêu cần đạt. |

## DS01_Employee_Skill_Profile
| Employee\_ID | Position | Skill | Proficiency\_Level | Skill\_Gap |
| --- | --- | --- | --- | --- |
| EMP-001 | Software Developer | C#; Python; ReactJS; Angular; SQL | Advanced | Cloud, Automation; Version Control (Git), Containerization |
| EMP-002 | .NET Developer | C#; Angular; React; Python | Intermediate | Data Analysis; Version Control (Git), Containerization |
| EMP-003 | QA Engineer | Selenium; Java; SQL | Intermediate | Automation Testing, API Testing, Performance Testing, System Architecture |
| EMP-004 | Project Manager | Java; Spring Boot; Kotlin; Docker; AWS | Intermediate | Agile/Scrum, Strategic Planning, AI Tools & Copilot Usage, Technical Leadership |
| EMP-005 | Data Scientist | Python; C/C++ | Intermediate | ETL/Data Pipeline, Data Visualization, ML Integration |
| EMP-006 | QA Engineer | JavaScript; SQL; HTML; CSS; Python; Java | Intermediate | Automation Testing, API Testing |
| EMP-007 | Software Developer | JavaScript; ReactJS; NodeJS; NestJS; NextJS | Advanced | Automation Testing, UI/UX; Version Control (Git), Containerization |
| EMP-008 | Software Developer | Java; Spring Boot; MySQL; Oracle; Redis; Kafka | Intermediate | Version Control (Git), Containerization |
| EMP-009 | Accountant | Office tools; Accounting software | Advanced | AI Tools & Copilot Usage |
| EMP-010 | Software Developer | Java; Spring Boot | Intermediate | Cloud Services, System Architecture |
| EMP-011 | Software Developer | JavaScript; TypeScript; ReactJS; NodeJS | Beginner | Cloud Services, Technical Depth |
| EMP-012 | QA Engineer | Postman; BigQuery; Jira | Beginner | Version Control (Git), Containerization, Cloud Services |
| EMP-013 | Java Developer | Java; Python; JavaScript; SpringBoot; MySQL | Intermediate | Deep Learning, Reinforcement Learning; Version Control (Git) |
| EMP-014 | Software Developer | Java; C#; JavaScript; NestJS; .NET; ReactJS | Beginner | Cloud Services, Technical Depth |
| EMP-015 | Data Scientist | Python | Beginner | ETL/Data Pipeline, Data Visualization, ML Integration |
| EMP-016 | Frontend Developer | JavaScript; TypeScript; Python; ReactJS; NextJS; K8s; GCloud | Intermediate | Automation Testing, UI/UX; System Design |
| EMP-017 | QA Engineer | Postman; MySQL; BigQuery; Cucumber; Java | Beginner | Automation Testing, Performance Testing, Security Testing |
| EMP-018 | Frontend Developer | ReactJS; NestJS; NextJS; MySQL; MongoDB; Firebase; AWS | Intermediate | UI/UX Design, Figma; Version Control (Git) |
| EMP-019 | Technical Lead | ReactJS; NodeJS; PostgreSQL | Intermediate | Agile/Scrum, Strategic Planning, AI Tools & Copilot Usage |
| EMP-020 | QA Engineer | PHP; Laravel; SQL; VueJS; ReactJS | Beginner | Automation Testing, API Testing |
| EMP-021 | Software Developer | Java; Spring Boot; MySQL | Beginner | Cloud Services, Technical Depth |
| EMP-022 | AI Engineer | Python; pySpark; MySQL; PyTorch | Beginner | MLOps, LLM/GenAI, Model Deployment |
| EMP-023 | Python Developer | Python; Azure | Advanced | Containerization, Testing, AI Tools & Copilot Usage |
| EMP-024 | Software Developer | Python; NodeJS; Golang; Java; ReactJS; PostgreSQL; AWS | Advanced | DevOps; Version Control (Git) |
| EMP-025 | QA Engineer | Playwright; JavaScript | Beginner | Manual QA, SQL Testing, API Testing; Performance Testing |
| EMP-026 | Software Developer | NodeJS; Python; ReactJS; FastAPI; MySQL; MongoDB; PostgreSQL; Redis | Intermediate | DevOps; Containerization |
| EMP-027 | QA Engineer | Selenium; Java; TestNG | Advanced | Automation Testing, API Testing, Performance Testing, AI Tools |
| EMP-028 | Software Developer | ReactJS; PostgreSQL; NodeJS; Docker | Advanced | DevOps, Automation Testing, UI/UX; Cloud Services |
| EMP-029 | Technical Lead | NodeJS; React; FastAPI; Data Engineering | Advanced | Agile/Scrum, Strategic Planning |
| EMP-030 | Java Developer | Java; Spring Boot; JavaEE; Selenium; MySQL; MongoDB | Advanced | Automation Testing; Containerization |
| EMP-031 | Java Developer | Java; SpringBoot; PostgreSQL; Docker; Kubernetes; GCP; AWS | Intermediate | Testing, System Design, AI Tools & Copilot Usage |
| EMP-032 | Backend Developer | NodeJS; Go; JavaScript; ReactJS; PostgreSQL | Advanced | Frontend; Containerization |
| EMP-033 | QA Engineer | JavaScript | Beginner | Automation Testing, API Testing, Performance Testing |
| EMP-034 | Software Developer | Java; Spring Boot; JUnit; Mockito; PostgreSQL; Python | Beginner | Cloud Services, Technical Depth |
| EMP-035 | Backend Developer | Python; R; SQL; Machine Learning Libraries | Intermediate | AI/ML Engineering; Containerization |
| EMP-036 | DevOps Engineer | C#; Java; PHP; NodeJS; Golang; Python; Docker; K8s | Intermediate | Container Orchestration, Monitoring/Observability |
| EMP-037 | DevOps Engineer | Java; Spring Boot; Python; FastAPI; Golang; Terraform; Ansible; AWS; GCP; Docker; Kubernetes | Beginner | DevSecOps, Technical Depth |
| EMP-038 | Frontend Developer | ReactJS | Beginner | Cloud Services, Technical Depth |
| EMP-039 | Software Engineer | ReactJS | Intermediate | Backend (.NET); Containerization |
| EMP-040 | Software Developer | PHP; Laravel; MySQL; JavaScript | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-041 | AI Engineer | Python | Intermediate | MLOps, LLM/GenAI |
| EMP-042 | Mobile Developer | Flutter | Intermediate | Cloud Services, System Architecture |
| EMP-043 | QA Engineer | MySQL; Postman; JMeter | Advanced | Automation (Cypress/JavaScript); Security Testing |
| EMP-044 | AI Engineer | Python; C/C++ | Intermediate | Data Engineering; MLOps, LLM/GenAI |
| EMP-045 | Java Developer | Java; JavaScript; Spring Boot; Angular; MySQL; PostgreSQL; Docker; Kafka; Redis | Beginner | Frontend Angular; Cloud Services |
| EMP-046 | QA Engineer | ReactJS | Beginner | Manual Testing; Automation Testing, API Testing |
| EMP-047 | Java Technical Lead | Java; Spring Boot; Kafka; SQL; Redis | Advanced | Agile/Scrum, Strategic Planning |
| EMP-048 | Fullstack Developer | ASP.NET Core; SQL Server; PostgreSQL; VueJS; ReactJS; NodeJS | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-049 | .NET Developer | .NET; C#; SQL Server; PostgreSQL | Intermediate | Cloud Services, System Architecture |
| EMP-050 | Mobile Developer | Java; Swift; Kotlin | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-051 | QA Engineer | Java; Cucumber; JavaScript; TypeScript; Jest; PostgreSQL | Intermediate | Automation Testing, API Testing |
| EMP-052 | Software Developer | Python; MS SQL; Oracle SQL | Intermediate | Data Analysis, Data Science; Containerization |
| EMP-053 | QA Engineer | Java; Spring Boot; JavaScript; Selenium; MySQL; MongoDB | Beginner | Automation Testing; API Testing, Performance Testing |
| EMP-054 | Frontend Developer | ReactJS; Angular | Intermediate | NodeJS Backend; Containerization |
| EMP-055 | Software Engineer | Python; Django; PostgreSQL; FastAPI | Beginner | Cloud Services, Technical Depth |
| EMP-056 | Software Developer | Java; Spring Boot; MySQL; PostgreSQL | Beginner | Cloud Services, Technical Depth |
| EMP-057 | Web Developer | CodeIgniter; Laravel; ReactJS; MySQL; MongoDB; Python; Ruby | Advanced | DevOps; Containerization |
| EMP-058 | Software Developer | Python | Advanced | DevOps, Data Engineering, AI; Containerization |
| EMP-059 | Software Engineer | Python; FastAPI; PostgreSQL; MSSQL Server | Intermediate | DevOps; Containerization |
| EMP-060 | Backend Technical Lead | AWS; .NET; C#; NodeJS; NestJS; Golang; SQL Server; PostgreSQL; MongoDB; DynamoDB; React | Advanced | DevOps & Infrastructure, Data Engineering; Agile/Scrum |
| EMP-061 | Data Engineer | Azure; AWS; GCP; Python; Spark | Advanced | Data Visualization, ML Integration |
| EMP-062 | AI Engineer | Python; ReactJS; PostgreSQL; MongoDB; FastAPI; LLM Tools | Intermediate | DevOps, Data Analysis; MLOps, Model Deployment |
| EMP-063 | QA Engineer | SQL; Postman | Intermediate | Automation Testing, Performance Testing, Security Testing |
| EMP-064 | Software Developer | JavaScript; ReactJS; NodeJS | Intermediate | Cloud Services, System Architecture |
| EMP-065 | Software Developer | Python; Django; PostgreSQL | Beginner | Cloud Services, Technical Depth |
| EMP-066 | .NET Developer | .NET; Angular | Intermediate | AWS, Azure DevOps; Containerization |
| EMP-067 | Software Developer | PHP; Magento; Laravel; JavaScript; ReactJS | Advanced | AI Tools & Copilot Usage; Containerization |
| EMP-068 | Fullstack Developer | ReactJS; PostgreSQL; NodeJS | Beginner | DevOps, UI/UX; Containerization |
| EMP-069 | Software Developer | C#; .NET; ReactJS; NestJS; AWS; Azure | Beginner | Automation Testing; Containerization |
| EMP-070 | Fullstack Developer | ASP.NET; ReactJS; NestJS; PostgreSQL; SQL Server | Beginner | Cloud Services, Technical Depth |
| EMP-071 | Frontend Developer | JavaScript; TypeScript; React; NodeJS; SQL; Python | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-072 | QA Engineer | JavaScript; Selenium; Java; Maven | Beginner | API Testing, Performance Testing |
| EMP-073 | Java Developer | Java; Spring Boot; ReactJS; SQL; Python; Copilot AI | Advanced | Containerization |
| EMP-074 | Mobile Developer | Swift; Java; Objective-C | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-075 | Frontend Developer | JavaScript; Angular; ReactJS; NextJS; React Testing Library | Beginner | Cloud Services, Technical Depth |
| EMP-076 | Data Engineer | Python; pySpark; AWS | Beginner | ML/AI; Data Visualization |
| EMP-077 | Data Scientist | React; Angular; NodeJS; FastAPI; MySQL; PostgreSQL; PyTorch; TensorFlow; Scikit-learn | Beginner | ETL/Data Pipeline, ML Integration |
| EMP-078 | Backend Developer | Java; Spring Boot; Hibernate; PostgreSQL; MySQL; Oracle | Advanced | System Design; Containerization |
| EMP-079 | Frontend Developer | JavaScript; ReactJS; NodeJS; Express; GitHub Actions; Figma | Intermediate | Containerization |
| EMP-080 | Java Developer | Java; Spring Boot; PostgreSQL | Beginner | Cloud Services, Technical Depth |
| EMP-081 | Data Engineer | Python; SQL; Terraform; AWS; GCP | Beginner | DevOps; ETL/Data Pipeline, Data Visualization |
| EMP-082 | Python Developer | Python; C# | Beginner | Cloud Services, Technical Depth |
| EMP-083 | Fullstack Developer | TypeScript; JavaScript; NodeJS; ReactJS | Beginner | Python, Java; Containerization |
| EMP-084 | Software Developer | ReactJS; NodeJS | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-085 | Software Developer | ReactJS | Intermediate | DevOps; Containerization |
| EMP-086 | Java Developer | Java; Spring Boot; PostgreSQL | Intermediate | Containerization |
| EMP-087 | Software Developer | Java; Golang; Spring Boot; Go Gin | Beginner | Cloud Services, Technical Depth |
| EMP-088 | Software Developer | ReactJS; NestJS; PostgreSQL | Intermediate | Cloud Services, System Architecture |
| EMP-089 | QA Engineer | Playwright; TypeScript | Advanced | Automation Testing, API Testing, Performance Testing, AI Tools |
| EMP-090 | Data Scientist | Python | Intermediate | DevOps; ETL/Data Pipeline, Data Visualization |
| EMP-091 | Software Developer | PHP; Laravel; Python; Golang; VueJS; NodeJS; MySQL; PostgreSQL; MongoDB | Advanced | Cloud Services |
| EMP-092 | Backend Developer | Java; Golang; Spring Boot; PostgreSQL | Beginner | DevOps; Containerization |
| EMP-093 | Team Lead | NodeJS; Python; Golang; PHP; PostgreSQL; MySQL; Redis; Message-Queue | Advanced | Agile/Scrum, Strategic Planning |
| EMP-094 | Backend Developer | NodeJS; NestJS; ReactJS; PostgreSQL; Python; FastAPI; Docker; AWS | Advanced | CI/CD, Performance Testing, Security Testing |
| EMP-095 | Software Developer | Java; C++; JavaScript; Express; SQL | Beginner | DevOps; Containerization |
| EMP-096 | QA Engineer | Python Selenium; MySQL | Beginner | Automation Testing; API Testing, Performance Testing |
| EMP-097 | Software Developer | Golang; PostgreSQL | Beginner | DevOps; Containerization |
| EMP-098 | Software Engineer | TypeScript; NodeJS; React; Python; FastAPI; LangChain; Airflow; Kubernetes; Kafka | Intermediate | DevOps, AI Agents, LLMs; Testing, System Architecture |
| EMP-099 | QA Engineer | Python; MySQL; Selenium | Beginner | Automation Testing; API Testing, Performance Testing |
| EMP-100 | QA Engineer | Java; Spring Boot; ReactJS; PostgreSQL; Selenium; Cucumber; TypeScript | Intermediate | DevOps (AWS, Terraform, K8s); API Testing, Performance Testing |
| EMP-101 | Software Developer | JavaScript; SQL; Python; Terraform; Ansible; AWS | Beginner | Frontend, Backend, DevOps; Containerization |
| EMP-102 | Software Developer | .NET; PHP; JavaScript; MySQL; SQL Server | Advanced | AI Tools & Copilot Usage |
| EMP-103 | Frontend Developer | ReactJS; NodeJS; PostgreSQL; GCP | Advanced | Automation Testing; Containerization |
| EMP-104 | UI/UX Designer | Figma | Advanced | Marketing, Frontend HTML/CSS; User Research, Prototyping |
| EMP-105 | Backend Developer | Java; Spring Boot; Spring Webflux; Spring Security; MySQL; MongoDB; Redis | Beginner | DevOps; Containerization |
| EMP-106 | CTO | C++; Java | Intermediate | Business Management; Agile/Scrum, Strategic Planning |
| EMP-107 | Frontend Developer | JavaScript; ReactJS; NodeJS | Beginner | Testing; Containerization |
| EMP-108 | QA Engineer | Manual Testing; API; SQL | Advanced | Documentation; Containerization |
| EMP-109 | Fullstack Developer | ReactJS; NestJS; TypeScript; PostgreSQL | Beginner | Python; Containerization |
| EMP-110 | Backend Developer | NodeJS; TypeScript; NestJS; PostgreSQL; ReactJS | Beginner | Manual Testing; Containerization |
| EMP-111 | Java Developer | Java | Intermediate | Cloud Services, System Architecture |
| EMP-112 | Backend Developer | Golang | Beginner | DevOps; Containerization |
| EMP-113 | Backend Developer | PHP; JavaScript; NodeJS; Go; Python; Django; React | Beginner | Cloud Services, Technical Depth |
| EMP-114 | Backend Developer | NodeJS; Golang | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-115 | Intern | .NET; NodeJS; GoLang; Java; PostgreSQL; ReactJS; Redis; Docker | Advanced | Cloud Services, Testing, AI Tools & Copilot Usage |
| EMP-116 | Software Developer | PHP; ReactJS; PostgreSQL; NextJS; NestJS; NodeJS | Advanced | Cloud Services, AI Tools & Copilot Usage |
| EMP-117 | DevOps Engineer | Terraform; GitHub Actions | Beginner | Security, Threat Hunting; Container Orchestration, Monitoring |
| EMP-118 | QA Engineer | Java; NodeJS; TypeScript; JavaScript; Cypress; Jest; Playwright | Beginner | Backend Development; API Testing, Performance Testing |
| EMP-119 | Data Scientist | Python; SQL; C; C++; Matlab | Intermediate | MLOps, Data Analysis; ETL/Data Pipeline, System Architecture |
| EMP-120 | UI/UX Designer | Figma | Beginner | User Research, Prototyping, Accessibility Design |
| EMP-121 | QA Engineer | C; Java; React | Beginner | Automation Testing, API Testing, Performance Testing |
| EMP-122 | Frontend Developer | JavaScript; ReactJS; Python; Java; MySQL; MongoDB | Intermediate | UI/UX, Testing; Containerization |
| EMP-123 | Software Developer | Java | Intermediate | Cloud Services, System Architecture |
| EMP-124 | Frontend Technical Lead | JavaScript; TypeScript; React; Vue; NestJS; NextJS; PostgreSQL | Advanced | UI/UX, Auto Test, DevOps; Agile/Scrum, Strategic Planning |
| EMP-125 | Software Engineer | ReactJS; Python FastAPI | Advanced | UI/UX, Backend, Data Engineering; Containerization |
| EMP-126 | Software Developer | ReactJS; NodeJS; NextJS; NestJS | Beginner | DevOps; Containerization |
| EMP-127 | AI Engineer | Python; MLOps; PyTorch | Beginner | DevOps; LLM/GenAI, Model Deployment |
| EMP-128 | Software Developer | .NET; Angular; SQL Server | Beginner | BA, Tester; Containerization |
| EMP-129 | Java Developer | Java; JavaScript; Spring Boot; Angular; Vue; MongoDB; SQL | Advanced | DevOps, Cloud; Containerization |
| EMP-130 | QA Engineer | Postman API; SQL Server | Intermediate | Robot Framework; Containerization |
| EMP-131 | Project Manager | Python | Advanced | DevOps, Manager, UI/UX Design; Agile/Scrum, Strategic Planning |
| EMP-132 | Frontend Developer | ReactJS; NodeJS; Python; FastAPI; Java; Spring Boot | Advanced | DevOps, Data Engineering; Containerization |
| EMP-133 | Backend Developer | JavaScript; ReactJS; NextJS; NestJS; AWS; PostgreSQL; MySQL | Intermediate | DevOps, BA; Containerization |
| EMP-134 | Software Developer | Java; SpringBoot; TypeScript; Angular; MySQL; Oracle; Azure | Advanced | AI for Developers; Time Management, Planning |
| EMP-135 | Technical Lead | C#; JavaScript; Golang; Python; NodeJS; ReactJS; PostgreSQL; MS SQL; DevOps Tools | Advanced | Agile/Scrum, Strategic Planning |
| EMP-136 | Product Manager | C#; .NET; Java Spring | Beginner | UI/UX, Data Analysis; Agile/Scrum, Strategic Planning |
| EMP-137 | CTO | Java; Spring Boot; ReactJS; AI; DBA; Cloud Platform | Advanced | IT Outsourcing & Embedded System; Agile/Scrum |
| EMP-138 | QA Engineer | Java; Spring Boot; TypeScript | Beginner | Backend Development; Automation Testing, API Testing |
| EMP-139 | Java Developer | Java; ZK; Oracle SQL; Spring Boot; ReactJS; C#; PostgreSQL | Intermediate | Cloud Services, System Architecture |
| EMP-140 | IT Helpdesk | PHP; Laravel; Java; AWS; GitHub; Docker | Intermediate | Testing, System Design |
| EMP-141 | Software Developer | ReactJS; NodeJS; PostgreSQL | Advanced | DevOps; Containerization |
| EMP-142 | QA Engineer | Python; TypeScript; Java | Beginner | Automation Testing; API Testing, Performance Testing |
| EMP-143 | Software Developer | Java; Spring Boot; ReactJS; PostgreSQL | Advanced | Automation Testing; Containerization |
| EMP-144 | Mobile Developer | Java; Kotlin; Swift; NodeJS; TypeScript; ReactJS; NextJS | Advanced | Web Development; Containerization |
| EMP-145 | Software Developer | C#; ASP.NET Core | Advanced | Azure Cloud, Automation Testing; Containerization |
| EMP-146 | Software Engineer | JavaScript; TypeScript; ReactJS; Python | Beginner | UI/UX, AI, Data Analysis; Containerization |
| EMP-147 | Software Developer | SQL Server; C#; HTML; Power Query | Advanced | Cloud Services |
| EMP-148 | QA Engineer | JavaScript | Advanced | DevOps; Automation Testing, API Testing |
| EMP-149 | Intern | Java; Spring Boot; ReactJS; PostgreSQL | Beginner | DevOps, Automation Testing, UI/UX, AI Agent; Containerization |
| EMP-150 | Intern | Golang; NodeJS; ReactJS; NextJS; PostgreSQL | Beginner | DevOps; Containerization |
| EMP-151 | Intern | Python; PostgreSQL; MySQL; Go; Power BI; Tableau; Apache Spark; Airflow; Docker; MLflow | Intermediate | Data Analysis, Data Science, Data Engineering Pipeline; Cloud Services |
| EMP-152 | Software Developer | NextJS; React; Vue; Python; NodeJS; .NET; C/C++; PostgreSQL; MySQL | Beginner | Embedded Development, DevOps; Containerization |
| EMP-153 | PHP Developer | PHP; Python; JavaScript; VueJS; ReactJS; MySQL; PostgreSQL | Advanced | DevOps, UI/UX; Containerization |
| EMP-154 | IT Infrastructure Engineer | C++; Python; JavaScript | Beginner | AI Training Model; Containerization |
| EMP-155 | Python Developer | Python; C++; Qt; HTML/CSS; ReactJS | Beginner | UI/UX, Frontend; Containerization |
| EMP-156 | Intern | C/C++; CMake; Python; FastAPI; PostgreSQL | Beginner | Computer Vision Model Training; Containerization |
| EMP-157 | Backend Developer | Python; FastAPI; Flask; MySQL | Beginner | DevOps, Data Engineering; Containerization |
| EMP-158 | UI/UX Designer | Figma | Beginner | 2D Artist; User Research, Prototyping |
| EMP-159 | Project Manager | Java; Spring Boot; ReactJS; MySQL; Angular; JavaScript; NodeJS | Advanced | UI/UX, Team Management; Agile/Scrum |
| EMP-160 | Frontend Developer | ReactJS; PostgreSQL; NextJS; NestJS; TypeScript | Beginner | Cloud Services, Technical Depth |
| EMP-161 | Software Developer | ReactJS; NodeJS; PostgreSQL; MySQL; Java; NextJS; NestJS | Beginner | Cloud Services, Technical Depth |
| EMP-162 | AI Lead | Python; BigQuery; SQL; Shell Script; C++; Rust; dbt; Scikit-learn; TensorFlow; Keras; PyTorch; LangChain; Kubernetes; Docker; Jenkins; Terraform; GitHub Actions; GCP; Azure; AWS | Beginner | MLOps, Technical Depth, Mathematical Analysis |
| EMP-163 | Backend Developer | Java; Spring Boot; PostgreSQL | Beginner | Golang, gRPC; Version Control (Git), Cloud Services |
| EMP-164 | Software Developer | Python; FastAPI; PostgreSQL | Intermediate | Golang; Microservices, Container Orchestration |
| EMP-165 | Fullstack Developer | NodeJS; ReactJS; PostgreSQL | Intermediate | Golang, Kubernetes; System Architecture, Cloud Services |
| EMP-166 | Java Developer | Java; Spring Boot; MySQL; Redis | Beginner | Golang, gRPC; Version Control (Git), Cloud Services |
| EMP-167 | Software Engineer | TypeScript; NestJS; PostgreSQL | Intermediate | Golang; Microservices, Container Orchestration |
| EMP-168 | Backend Developer | Python; Django; MySQL | Advanced | Golang, Kubernetes; System Architecture, Cloud Services |
| EMP-169 | Software Developer | Java; Kotlin; Spring Boot | Intermediate | Golang, gRPC; Version Control (Git), Cloud Services |
| EMP-170 | Fullstack Developer | NodeJS; Express; MongoDB | Beginner | Golang; Microservices, Container Orchestration |
| EMP-171 | Java Developer | ReactJS; NodeJS; PostgreSQL | Beginner | Golang, Kubernetes; System Architecture, Cloud Services |
| EMP-172 | Software Engineer | Java; Spring Boot; Kafka; PostgreSQL | Intermediate | Golang, gRPC; Version Control (Git), Cloud Services |
| EMP-173 | Backend Developer | Python; FastAPI; Redis; PostgreSQL | Intermediate | Golang; Microservices, Container Orchestration |
| EMP-174 | Software Developer | Java; Spring Boot; Elasticsearch | Beginner | Golang, Kubernetes; System Architecture, Cloud Services |
| EMP-175 | Fullstack Developer | NodeJS; NestJS; MySQL | Intermediate | Golang, gRPC; Version Control (Git), Cloud Services |
| EMP-176 | Java Developer | Python; Flask; SQLite | Advanced | Golang; Microservices, Container Orchestration |
| EMP-177 | DevOps Engineer | Python; Docker; Linux; Bash | Beginner | Kubernetes, CI/CD, Monitoring/Observability; Cloud Security |
| EMP-178 | Backend Developer | Java; Spring Boot; Docker | Intermediate | K8s orchestration, GitOps; Container Security |
| EMP-179 | Software Developer | NodeJS; Docker; AWS | Beginner | CI/CD pipeline design, Infrastructure as Code; Cloud Deployment |
| EMP-180 | Software Engineer | Python; Ansible; Terraform | Intermediate | Performance Tuning, SRE practices; Observability Stack |
| EMP-181 | QA Engineer | Java; SQL; Postman | Beginner | Automation Testing (Playwright); API Testing, Performance Testing |
| EMP-182 | Software Developer | JavaScript; SQL; Manual Testing | Beginner | Automation Testing; CI/CD Integration, Test Framework Design |
| EMP-183 | Software Engineer | Python; MySQL; Manual Testing | Intermediate | Automation Testing, Script Writing; API Testing, Performance Testing |
| EMP-184 | Frontend Developer | Java; TestNG; JUnit | Beginner | Playwright, Cypress; Performance Testing, Security Testing |
| EMP-185 | Backend Developer | JavaScript; ReactJS; Manual Testing | Beginner | Automation Testing (Selenium/Playwright); CI/CD Pipeline, Test Reporting |
| EMP-186 | Java Developer | Python; Selenium (basic); SQL | Intermediate | Automation Testing (Playwright); API Testing, Performance Testing |
| EMP-187 | QA Engineer | Java; Cucumber (basic); SQL | Beginner | Automation Testing; CI/CD Integration, Test Framework Design |
| EMP-188 | Software Developer | TypeScript; Jest; SQL | Beginner | Automation Testing, Script Writing; API Testing, Performance Testing |
| EMP-189 | Software Engineer | Java; Spring Boot (basic); SQL | Intermediate | Playwright, Cypress; Performance Testing, Security Testing |
| EMP-190 | Frontend Developer | JavaScript; Playwright (basic); SQL | Beginner | Automation Testing (Selenium/Playwright); CI/CD Pipeline, Test Reporting |
| EMP-191 | Backend Developer | Java; SQL; JIRA | Beginner | Automation Testing (Playwright); API Testing, Performance Testing |
| EMP-192 | Java Developer | Python; SQL; API Testing (basic) | Intermediate | Automation Testing; CI/CD Integration, Test Framework Design |
| EMP-193 | QA Engineer | Java; Postman; SQL | Beginner | Automation Testing, Script Writing; API Testing, Performance Testing |
| EMP-194 | Software Developer | JavaScript; Cypress (basic); SQL | Beginner | Playwright, Cypress; Performance Testing, Security Testing |
| EMP-195 | Software Engineer | Python; Robot Framework (basic); SQL | Intermediate | Automation Testing (Selenium/Playwright); CI/CD Pipeline, Test Reporting |
| EMP-196 | Frontend Developer | Java; SQL; JMeter (basic) | Beginner | Automation Testing (Playwright); API Testing, Performance Testing |
| EMP-197 | Backend Developer | TypeScript; Postman; SQL | Beginner | Automation Testing; CI/CD Integration, Test Framework Design |
| EMP-198 | Java Developer | Java; SQL; Selenium IDE | Intermediate | Automation Testing, Script Writing; API Testing, Performance Testing |
| EMP-199 | QA Engineer | JavaScript; SQL; Manual QA | Beginner | Playwright, Cypress; Performance Testing, Security Testing |
| EMP-200 | Software Developer | Python; SQL; API Testing | Beginner | Automation Testing (Selenium/Playwright); CI/CD Pipeline, Test Reporting |
| EMP-201 | Software Engineer | Java; SQL; JUnit | Intermediate | Automation Testing (Playwright); API Testing, Performance Testing |
| EMP-202 | Frontend Developer | TypeScript; Playwright (basic); SQL | Beginner | Automation Testing; CI/CD Integration, Test Framework Design |
| EMP-203 | Backend Developer | Python; SQL; Automation (basic) | Beginner | Automation Testing, Script Writing; API Testing, Performance Testing |
| EMP-204 | Java Developer | Java; SQL; TestNG (basic) | Intermediate | Playwright, Cypress; Performance Testing, Security Testing |
| EMP-205 | QA Engineer | JavaScript; SQL; Cypress (basic) | Beginner | Automation Testing (Selenium/Playwright); CI/CD Pipeline, Test Reporting |

## DS02_Project_Roadmap
| Project\_ID | Required\_Skills | Timeline |
| --- | --- | --- |
| PRJ-001 | Python, FastAPI, PostgreSQL, Docker | Q1–Q2 2025 |
| PRJ-002 | Java, Spring Boot, Kubernetes, AWS | Q2–Q3 2025 |
| PRJ-003 | ReactJS, NodeJS, MongoDB, Redis | Q3–Q4 2025 |
| PRJ-004 | Python, TensorFlow, MLOps, GCP | Q1–Q2 2026 |
| PRJ-005 | FastAPI, Kubernetes, Docker, CI/CD | Q2–Q3 2026 |
| PRJ-006 | .NET, Angular, SQL Server, Azure | Q3–Q4 2025 |
| PRJ-007 | Golang, gRPC, Kafka, Kubernetes | Q4 2025–Q1 2026 |
| PRJ-008 | Python, LangChain, OpenAI API, Vector DB, Docker | Q1–Q2 2026 |
| PRJ-009 | AWS, Terraform, Kubernetes, Security (OWASP), CI/CD | Q2–Q3 2026 |
| PRJ-010 | Azure, .NET, AI Services, Power Platform | Q3–Q4 2026 |
| PRJ-011 | GCP, BigQuery, Vertex AI, MLOps, Python | Q1–Q2 2027 |
| PRJ-012 | Cybersecurity, Penetration Testing, SIEM, SOC | Q2–Q3 2026 |
| PRJ-013 | React, NodeJS, AWS Lambda, DynamoDB, Cognito | Q3–Q4 2026 |
| PRJ-014 | LLM Fine-tuning, RAG, Claude API, Prompt Engineering | Q1–Q2 2027 |
| PRJ-015 | DevSecOps, Container Security, Vault, IAM | Q2–Q3 2027 |
| PRJ-016 | Multi-cloud (AWS/Azure/GCP), Cost Optimization, FinOps | Q3–Q4 2027 |
| PRJ-017 | AI Agent Development, AutoGen, CrewAI, Python | Q1–Q2 2027 |
| PRJ-018 | React Native, iOS, Android, Firebase, GraphQL | Q2–Q3 2026 |
| PRJ-019 | Data Engineering, Airflow, Spark, Databricks, Delta Lake | Q3–Q4 2026 |
| PRJ-020 | Computer Vision, TensorFlow, PyTorch, Edge AI, IoT | Q1–Q2 2027 |

## DS03_Training_Need_Survey
| Survey\_ID | Employee\_ID | Training\_Topic | Priority |
| --- | --- | --- | --- |
| SUR\_2025\_Q4 | EMP-001 | Advanced system design and architecture | High |
| SUR\_2025\_Q4 | EMP-007 | CI/CD and DevOps fundamentals | Medium |
| SUR\_2025\_Q4 | EMP-010 | Microservices and container orchestration | High |
| SUR\_2025\_Q4 | EMP-013 | Machine Learning fundamentals - online course | Medium |
| SUR\_2025\_Q4 | EMP-016 | Advanced ReactJS and state management | Medium |
| SUR\_2025\_Q4 | EMP-018 | Backend development with NodeJS - internal | High |
| SUR\_2025\_Q4 | EMP-021 | Spring Boot advanced topics - internal | High |
| SUR\_2025\_Q4 | EMP-024 | Go language development - internal | High |
| SUR\_2025\_Q4 | EMP-028 | Cloud deployment on AWS - online | Medium |
| SUR\_2025\_Q4 | EMP-031 | AI and Cloud fundamentals | High |
| SUR\_2025\_Q4 | EMP-036 | Kubernetes and container orchestration | High |
| SUR\_2025\_Q4 | EMP-037 | CKA certification prep - online | Medium |
| SUR\_2025\_Q4 | EMP-041 | LLM application development | High |
| SUR\_2025\_Q4 | EMP-044 | MLOps practices and tooling | High |
| SUR\_2025\_Q4 | EMP-047 | Java performance tuning - internal | Medium |
| SUR\_2025\_Q4 | EMP-048 | AWS solutions architect - online | High |
| SUR\_2025\_Q4 | EMP-060 | Team leadership and strategic planning | High |
| SUR\_2025\_Q4 | EMP-061 | ML integration with data pipelines | Medium |
| SUR\_2025\_Q4 | EMP-062 | Model deployment and MLOps | High |
| SUR\_2025\_Q4 | EMP-066 | Azure DevOps - online course | Medium |
| SUR\_2025\_Q4 | EMP-076 | AI and ML foundations - online | High |
| SUR\_2025\_Q4 | EMP-077 | Data engineering pipelines - internal | Medium |
| SUR\_2025\_Q4 | EMP-081 | AWS data services - online | High |
| SUR\_2025\_Q4 | EMP-086 | DevOps foundations - internal | High |
| SUR\_2025\_Q4 | EMP-089 | Advanced Playwright and AI testing | High |
| SUR\_2025\_Q4 | EMP-090 | DevOps and cloud - internal | Medium |
| SUR\_2025\_Q4 | EMP-092 | Cloud certification prep - online | High |
| SUR\_2025\_Q4 | EMP-093 | Leadership and team management | Medium |
| SUR\_2025\_Q4 | EMP-094 | System design and architecture | Medium |
| SUR\_2025\_Q4 | EMP-098 | AI agents and LLM workflows - internal | High |
| SUR\_2025\_Q4 | EMP-103 | Frontend performance and testing - internal | Medium |
| SUR\_2025\_Q4 | EMP-106 | Technology strategy and roadmap planning | Medium |
| SUR\_2025\_Q4 | EMP-117 | Security and threat detection - online | High |
| SUR\_2025\_Q4 | EMP-119 | Advanced ML and deep learning - online | High |
| SUR\_2025\_Q4 | EMP-124 | Product and project management skills | Medium |
| SUR\_2025\_Q4 | EMP-127 | LLM fine-tuning and GenAI - online | High |
| SUR\_2025\_Q4 | EMP-131 | Advanced PM and stakeholder management | High |
| SUR\_2025\_Q4 | EMP-135 | Technical leadership and architecture review | High |
| SUR\_2025\_Q4 | EMP-137 | AI adoption strategy and roadmap | High |
| SUR\_2025\_Q4 | EMP-159 | AI-assisted project management tools | Medium |
| SUR\_2026\_Q1 | EMP-001 | Leadership skills | High |
| SUR\_2026\_Q1 | EMP-002 | Soft skills, online learning | Low |
| SUR\_2026\_Q1 | EMP-003 | Japanese language - self-learning | Medium |
| SUR\_2026\_Q1 | EMP-005 | Build personal agent to enhance workflow | Medium |
| SUR\_2026\_Q1 | EMP-007 | Interview skills | High |
| SUR\_2026\_Q1 | EMP-008 | AI-related skills | Low |
| SUR\_2026\_Q1 | EMP-009 | Self-learning external courses | Low |
| SUR\_2026\_Q1 | EMP-010 | DevOps | Medium |
| SUR\_2026\_Q1 | EMP-011 | Planning skills | Medium |
| SUR\_2026\_Q1 | EMP-012 | Automation Testing | Low |
| SUR\_2026\_Q1 | EMP-013 | AI Agent, MLOps, Security - internal training | Low |
| SUR\_2026\_Q1 | EMP-014 | Python development - internal training | Medium |
| SUR\_2026\_Q1 | EMP-015 | Data Scientist skills - online course | Medium |
| SUR\_2026\_Q1 | EMP-016 | Planning Skills, Agentic AI knowledge | High |
| SUR\_2026\_Q1 | EMP-018 | Python backend (internal), AWS/GCP (online), Japanese (online) | High |
| SUR\_2026\_Q1 | EMP-020 | Technical skills with project practice opportunity | Low |
| SUR\_2026\_Q1 | EMP-021 | DevOps, modern backend technologies | High |
| SUR\_2026\_Q1 | EMP-025 | Communication and leadership skills | Medium |
| SUR\_2026\_Q1 | EMP-027 | Automation testing from basics | Medium |
| SUR\_2026\_Q1 | EMP-030 | Advanced React | Low |
| SUR\_2026\_Q1 | EMP-031 | AI, English, Cloud | High |
| SUR\_2026\_Q1 | EMP-035 | Soft skills, client communication, problem-solving | Low |
| SUR\_2026\_Q1 | EMP-037 | CKA certification - online, DevOps - online | Medium |
| SUR\_2026\_Q1 | EMP-039 | Internal DevOps training course | High |
| SUR\_2026\_Q1 | EMP-040 | English communication | Medium |
| SUR\_2026\_Q1 | EMP-042 | Communication skills | Medium |
| SUR\_2026\_Q1 | EMP-043 | Automation skill - Python | Low |
| SUR\_2026\_Q1 | EMP-045 | Python/Golang internal; communication/leadership internal | High |
| SUR\_2026\_Q1 | EMP-046 | Mobile App Automation Testing | Medium |
| SUR\_2026\_Q1 | EMP-047 | C++ development | Medium |
| SUR\_2026\_Q1 | EMP-048 | AWS Cloud Architecture and Cloud Security - internal training | High |
| SUR\_2026\_Q1 | EMP-049 | AI integration into systems - internal training | Medium |
| SUR\_2026\_Q1 | EMP-051 | Cloud services | Medium |
| SUR\_2026\_Q1 | EMP-053 | CI/CD pipeline | Low |
| SUR\_2026\_Q1 | EMP-054 | Communication, leadership, PM skills | Medium |
| SUR\_2026\_Q1 | EMP-056 | Java development - online course | Low |
| SUR\_2026\_Q1 | EMP-058 | Communication skills | High |
| SUR\_2026\_Q1 | EMP-061 | GenAI, LLM skills - online course | Low |
| SUR\_2026\_Q1 | EMP-062 | Management skills | High |
| SUR\_2026\_Q1 | EMP-063 | Automation Testing for beginners | Low |
| SUR\_2026\_Q1 | EMP-064 | Backend/AI skills - internal training | High |
| SUR\_2026\_Q1 | EMP-065 | AI agent - online course | Low |
| SUR\_2026\_Q1 | EMP-066 | Infrastructure & Cloud, Management skills | Medium |
| SUR\_2026\_Q1 | EMP-068 | Python, Java | Medium |
| SUR\_2026\_Q1 | EMP-069 | Cloud, Domain knowledge, Architecture - online | Low |
| SUR\_2026\_Q1 | EMP-070 | New language skills (e.g., Chinese/Korean) | Low |
| SUR\_2026\_Q1 | EMP-073 | NodeJS, Python, leadership, communication - online | Low |
| SUR\_2026\_Q1 | EMP-074 | Cross-functional project participation as learner | Low |
| SUR\_2026\_Q1 | EMP-075 | Python development, DevOps | Medium |
| SUR\_2026\_Q1 | EMP-079 | Online course with self-study materials | High |
| SUR\_2026\_Q1 | EMP-080 | Not sure yet | Medium |
| SUR\_2026\_Q1 | EMP-082 | Omniverse development - internal training | Low |
| SUR\_2026\_Q1 | EMP-084 | Planning skills | Low |
| SUR\_2026\_Q1 | EMP-085 | Scrum Master certification | Medium |
| SUR\_2026\_Q1 | EMP-086 | DevOps | High |
| SUR\_2026\_Q1 | EMP-089 | Automation Testing (Playwright) + AI Testing | High |
| SUR\_2026\_Q1 | EMP-090 | DevOps - internal training | High |
| SUR\_2026\_Q1 | EMP-091 | Python, foreign language | Medium |
| SUR\_2026\_Q1 | EMP-092 | Cloud Services (AWS, GCP) - online, Cloud certification | High |
| SUR\_2026\_Q1 | EMP-094 | English - internal; Safe and effective AI usage - internal/online | High |
| SUR\_2026\_Q1 | EMP-095 | Python + AI skills | Medium |
| SUR\_2026\_Q1 | EMP-096 | Effective AI usage in testing | Medium |
| SUR\_2026\_Q1 | EMP-099 | Online course | High |
| SUR\_2026\_Q1 | EMP-101 | Self-learning | High |
| SUR\_2026\_Q1 | EMP-102 | Leadership and people management | Low |
| SUR\_2026\_Q1 | EMP-105 | Java development, Software architecture - internal training | Medium |
| SUR\_2026\_Q1 | EMP-108 | Automation testing | Medium |
| SUR\_2026\_Q1 | EMP-109 | Data engineering/Backend development - internal training | Medium |
| SUR\_2026\_Q1 | EMP-110 | Japanese language class - offline | Low |
| SUR\_2026\_Q1 | EMP-111 | Data Engineering skills - online | Medium |
| SUR\_2026\_Q1 | EMP-113 | DevOps - internal; Python + React - online | Medium |
| SUR\_2026\_Q1 | EMP-116 | English - online course | High |
| SUR\_2026\_Q1 | EMP-118 | ISTQB certification | Low |
| SUR\_2026\_Q1 | EMP-119 | Self-learning online | Low |
| SUR\_2026\_Q1 | EMP-120 | Motion design - online course | Medium |
| SUR\_2026\_Q1 | EMP-121 | ISTQB certification | Medium |
| SUR\_2026\_Q1 | EMP-124 | PMP certification - international | Low |
| SUR\_2026\_Q1 | EMP-125 | Management skills | High |
| SUR\_2026\_Q1 | EMP-128 | DevOps | Medium |
| SUR\_2026\_Q1 | EMP-129 | Go development | High |
| SUR\_2026\_Q1 | EMP-130 | Domain knowledge - Product Mindset | High |
| SUR\_2026\_Q1 | EMP-132 | Tech Lead and leadership skills | Low |
| SUR\_2026\_Q1 | EMP-133 | AWS advanced cases sharing - internal | Low |
| SUR\_2026\_Q1 | EMP-134 | AI for developers - online; Time management, prioritization - online | Medium |
| SUR\_2026\_Q1 | EMP-138 | Automation testing - online course | High |
| SUR\_2026\_Q1 | EMP-139 | Soft skills - online course | Medium |
| SUR\_2026\_Q1 | EMP-143 | AI skills | Medium |
| SUR\_2026\_Q1 | EMP-144 | Backend JS - online course | Medium |
| SUR\_2026\_Q1 | EMP-147 | PM and BA skills | Medium |
| SUR\_2026\_Q1 | EMP-149 | Planning skills | High |
| SUR\_2026\_Q1 | EMP-151 | English skills | Low |
| SUR\_2026\_Q1 | EMP-153 | Python, ReactJS - online or internal | High |
| SUR\_2026\_Q1 | EMP-155 | Frontend development | High |
| SUR\_2026\_Q1 | EMP-158 | 3D design, UI motion | High |
| SUR\_2026\_Q1 | EMP-159 | AI-powered workflow management | Low |
| SUR\_2026\_Q1 | EMP-160 | System Design fundamentals | Low |
| SUR\_2026\_Q1 | EMP-163 | Design - internal training or online course | High |
| SUR\_2026\_Q1 | EMP-164 | Coding Skills - TypeScript, JavaScript - internal | High |
| SUR\_2026\_Q1 | EMP-165 | UX analysis, product skills | Low |
| SUR\_2026\_Q1 | EMP-166 | Data analysis, Stress management, Project management - mixed | Medium |
| SUR\_2026\_Q1 | EMP-167 | Leadership skills - online or internal; Total reward knowledge | Low |

## DS04_Internal_Trainer_List
| Trainer\_ID | Expertise | Availability\_Hours\_Per\_Month |
| --- | --- | --- |
| TRN-001 | Java, Management skills | 4 |
| TRN-002 | Java; Spring Boot; ReactJS; MySQL; Angular; JavaScript; NodeJS; Revit; Project Management | 8 |
| TRN-003 | C#; Python; ReactJS; Angular; SQL | 8 |
| TRN-004 | Java; Spring Boot; Python; FastAPI; Golang; Bash; PostgreSQL; MySQL; Terraform; Ansible; AWS; GCP; Jenkins; Docker; Kubernetes; Nginx; Prometheus; Grafana | 8 |
| TRN-005 | Project Management; Java; Spring Boot; ReactJS; AI; DBA; Cloud Platform | 4 |
| TRN-006 | Python; DevOps; Project Management; UI/UX Design | 4 |
| TRN-007 | Python; Agentic AI; LLM; Machine Learning | 4 |
| TRN-008 | Python; Docker; ReactJS; C/C++ | 4 |
| TRN-009 | Python; BigQuery; SQL; Shell Script; C++; Rust; dbt; Scikit-learn; TensorFlow; PyTorch; LangChain; Kubernetes; Docker; Jenkins; Terraform; GitHub Actions; GCP; Azure; AWS | 4 |
| TRN-010 | Python; Spring Boot; MySQL; Java | 4 |

## DS05_BOD_Training_Goals
| Goal\_ID | Goal\_Description | Target\_Quarter |
| --- | --- | --- |
| GOAL-2025-08 | Prepare selected employees with interview skills for technical leadership roles, covering leadership responsibilities, problem-solving approaches, team communication, and technical experience across web/backend/DB/system design/infra/cloud domains. | Q3\_2025 |
| GOAL-2025-09 | Address technical skill gaps required by current project demands, focusing on platform-specific testing experience and automation test framework knowledge to align with client requirements. | Q3\_2025 |
| GOAL-2025-11 | Build next-generation DevOps capability capable of supporting AI-heavy projects with high traffic, using modern LLM-serving technology stacks. | Q4\_2025 |
| GOAL-2026-01 | Develop next-generation leadership pipeline with team-leading capability and strong communication skills to support organizational growth. | Q1\_2026 |
| GOAL-2026-04 | Train engineering staff to achieve AI application proficiency and earn professional certifications in AI tools and architecture. | Q2\_2026 |
| GOAL-2026-07 | Upskill at least 60% of development team in cloud-native technologies (Kubernetes, CI/CD, IaC) to support cloud-first project delivery. | Q3\_2026 |
| GOAL-2026-10 | Establish internal AI agent development competency so teams can prototype and deploy AI-powered workflows independently. | Q4\_2026 |