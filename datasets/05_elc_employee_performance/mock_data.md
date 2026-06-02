## 📋 LEGEND & SUMMARY
| Unnamed: 0 | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 |
| --- | --- | --- | --- | --- | --- |
| NaN | 📋  Mock Data Legend & Dataset Summary — SETA AI Agent Hackathon 2026 | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | 📁  Field Dictionary — ELC\_05\_Employee\_Performance\_Tracking.xlsx | NaN | NaN | NaN | NaN |
| NaN | 🎯  Đề bài 05 — Employee Performance Tracking & Reporting Agent  |  Dữ liệu đầu vào để agent tổng hợp hồ sơ hiệu suất nhân viên, đánh giá theo NORM và sinh báo cáo. | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | Dataset / Sheet | Field Name | Data Type | Example Value | Description |
| NaN | DS-00 · Employee Master\n\nThông tin tổng quan mỗi nhân viên. Là bảng reference trung tâm cho toàn bộ dataset.\n\n(1 row = 1 nhân viên) | member\_id | String | EMP-031 | Mã nhân viên ẩn danh. Khóa chính toàn dataset. |
| NaN | NaN | role\_title | String | Senior Software Eng. | Chức danh hiện tại. |
| NaN | NaN | department | String | IT - Engineering | Phòng ban. |
| NaN | NaN | level | String | L4 | Cấp bậc: L1 (intern) → L7 (C-level). |
| NaN | NaN | employment\_status | Enum | Active | Active / Probation / On Leave / Resigned. |
| NaN | NaN | join\_date | Date | 2020-03-25 | Ngày gia nhập công ty. |
| NaN | NaN | performance\_tier | String | Exceeds Expectations | Tier đánh giá tổng quát từ hệ thống HR. |
| NaN | NaN | overall\_score\_latest | Float | 4.8 | Điểm hiệu suất tổng hợp gần nhất (thang 5). |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-01 · Resource Allocation\n\nPhân bổ nhân lực theo dự án/account. Thể hiện khối lượng công việc và mức độ overload.\n\n(1 row = 1 nhân viên (allocation tại thời điểm hiện tại)) | member\_id | String | EMP-031 | FK → DS00\_Employee\_Master. |
| NaN | NaN | account\_id | String | ACC-B | Mã account (client/project group). |
| NaN | NaN | project\_id | String | ACC-B-P01 | Mã dự án cụ thể. |
| NaN | NaN | assignment\_type | Enum | Main Account | Main Account / Support / Bench / Internal. |
| NaN | NaN | role | Enum | BE | Vai trò trong dự án: BE/FE/QA/PM/BA/DevOps/Mobile… |
| NaN | NaN | report\_to | String | TL-BE-001 | Mã người quản lý trực tiếp (ẩn danh). |
| NaN | NaN | allocation\_pct | Float | 1.0 | Tỷ lệ phân bổ: 1.0 = 100%. >1.0 = overloaded. |
| NaN | NaN | work\_on\_other | String | Yes | Có tham gia dự án khác không (Yes/No). |
| NaN | NaN | other\_project\_ids | String | ACC-A-P02 | Dự án phụ nếu work\_on\_other = Yes. |
| NaN | NaN | notes | String | Overloaded | Ghi chú bổ sung (ví dụ: bench, overloaded). |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-02 · Performance by Project\n\nKết quả đánh giá hiệu suất hàng tháng theo dự án. Có 2 tháng (T3 + T4/2026) cho mỗi nhân viên.\n\n(1 row = 1 nhân viên × 1 tháng) | member\_id | String | EMP-031 | FK → DS00\_Employee\_Master. |
| NaN | NaN | reviewer\_id | String | TL-BE-001 | Mã người review (ẩn danh). |
| NaN | NaN | report\_period | String | 2026-04 | Kỳ đánh giá (YYYY-MM). |
| NaN | NaN | total\_point | Float | 4.2 | Điểm tổng hợp thang 5. ≥4.5=Excellent; <2.5=risk. |
| NaN | NaN | classification | Enum | Good | Excellent / Good / Meets Expectations / Below / Poor. |
| NaN | NaN | feedback\_category | String | Strong collab | Nhận xét dạng category (đã generalize, không có PII). |
| NaN | NaN | review\_frequency | Enum | Monthly | Tần suất: Monthly. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-03 · Timesheet & Logwork\n\nDữ liệu chấm công hàng tháng. Phục vụ tính tuân thủ, OT và phát hiện vi phạm.\n\n(1 row = 1 nhân viên × 1 tháng) | member\_id | String | EMP-031 | FK → DS00\_Employee\_Master. |
| NaN | NaN | report\_period | String | 2026-04 | Tháng báo cáo (YYYY-MM). |
| NaN | NaN | work\_days\_in\_month | Integer | 22 | Tổng ngày làm việc trong tháng (không tính nghỉ lễ). |
| NaN | NaN | days\_probation | Float | 0 | Số ngày làm trong trạng thái thử việc. |
| NaN | NaN | days\_official | Float | 22 | Số ngày làm chính thức. |
| NaN | NaN | days\_holiday\_official | Float | 2 | Số ngày lễ chính thức trong tháng. |
| NaN | NaN | days\_leave\_approved | Float | 1 | Ngày nghỉ phép đã được duyệt. |
| NaN | NaN | days\_late | Float | 0 | Số lần đi muộn. ≥3 lần → Late Pattern (NORM-T02). |
| NaN | NaN | days\_absent\_unapproved | Float | 0 | Số ngày vắng không phép. ≥1 → vi phạm (NORM-T03). |
| NaN | NaN | actual\_work\_days | Float | 22 | Số ngày công thực tế = official + leave + holiday. |
| NaN | NaN | ot\_hours\_weekday | Float | 8 | Giờ tăng ca ngày thường. |
| NaN | NaN | ot\_hours\_weekend | Float | 0 | Giờ tăng ca ngày nghỉ/cuối tuần. |
| NaN | NaN | ot\_hours\_holiday | Float | 0 | Giờ tăng ca ngày lễ. |
| NaN | NaN | total\_ot\_hours | Float | 8 | Tổng giờ OT. >40h/tháng → OT Overload (NORM-T04). |
| NaN | NaN | night\_shift\_hours | Float | 0 | Giờ làm ca đêm (tính phụ cấp). |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-04 · Violation & Attitude Records\n\nHồ sơ vi phạm và thái độ của nhân viên. Dữ liệu nhạy cảm cao, chỉ HR/Leader được xem.\n\n(1 row = 1 sự kiện vi phạm) | violation\_id | String | VIO-0055 | Mã vi phạm duy nhất. |
| NaN | NaN | member\_id | String | EMP-004 | FK → DS00\_Employee\_Master. |
| NaN | NaN | category | Enum | Conduct | Nhóm vi phạm: Attendance/Attitude/Performance/Policy/Conduct. |
| NaN | NaN | violation\_type\_code | String | CON-02 | Mã loại vi phạm (FK → DS04b\_ViolationType\_Ref). |
| NaN | NaN | violation\_type\_desc | String | Dishonesty… | Mô tả loại vi phạm. |
| NaN | NaN | severity | Enum | Critical | Mức độ: Low / Medium / High / Critical. |
| NaN | NaN | consequence | String | Termination… | Hình thức xử lý tương ứng. |
| NaN | NaN | status | Enum | Escalated | Open / Under Review / Resolved / Escalated / Closed. |
| NaN | NaN | incident\_date | Date | 2025-12-17 | Ngày xảy ra sự kiện. |
| NaN | NaN | reported\_by | String | MGR-004 | Mã người báo cáo (ẩn danh: HR-xxx / MGR-xxx / SELF / PEER-ANON). |
| NaN | NaN | action\_taken | String | Suspended… | Hành động đã xử lý. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-04b · Violation Type Reference\n\nBảng tra cứu 26 loại vi phạm kèm mức độ và hậu quả điển hình.\n\n(1 row = 1 loại vi phạm) | category | Enum | Conduct | 5 nhóm chính. |
| NaN | NaN | violation\_type\_code | String | CON-02 | Mã loại vi phạm. |
| NaN | NaN | violation\_type\_desc | String | Dishonesty… | Mô tả chi tiết loại vi phạm. |
| NaN | NaN | typical\_severity | Enum | High | Mức độ điển hình của loại vi phạm này. |
| NaN | NaN | typical\_consequence | String | Final warning… | Hậu quả thông thường. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-04c · Violation Summary per Employee\n\nTóm tắt tổng hợp vi phạm theo từng nhân viên. Dễ dùng cho risk flagging.\n\n(1 row = 1 nhân viên) | member\_id | String | EMP-031 | FK → DS00\_Employee\_Master. |
| NaN | NaN | total\_violations | Integer | 5 | Tổng số vi phạm từ trước đến nay. |
| NaN | NaN | critical\_count | Integer | 1 | Số vi phạm mức Critical. |
| NaN | NaN | high\_count | Integer | 2 | Số vi phạm mức High. |
| NaN | NaN | medium\_count | Integer | 1 | Số vi phạm mức Medium. |
| NaN | NaN | low\_count | Integer | 1 | Số vi phạm mức Low. |
| NaN | NaN | open\_cases | Integer | 3 | Số case chưa đóng (Open / Under Review / Escalated). |
| NaN | NaN | risk\_flag | Enum | 🔴 High Risk | 🔴 High Risk / 🟡 Watch / 🟢 Minor / — (no violations). |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-05 · Promotion Intent\n\nĐề xuất thăng tiến từ HR/Leader. Cực kỳ nhạy cảm — chỉ HR/BOD được xem.\n\n(1 row = 1 nhân viên) | member\_id | String | EMP-031 | FK → DS00\_Employee\_Master. |
| NaN | NaN | current\_level | String | L3 | Cấp bậc hiện tại. |
| NaN | NaN | target\_level | String | L4 | Cấp bậc đề xuất thăng tiến. |
| NaN | NaN | readiness\_score | Float | 0.72 | Điểm sẵn sàng thăng tiến 0.0–1.0. Không public cho nhân viên. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-06 · Salary Band\n\nDải lương theo band. Tuyệt đối không cấp số lương thật. Chỉ HR/BOD xem.\n\n(1 row = 1 nhân viên) | member\_id | String | EMP-031 | FK → DS00\_Employee\_Master. |
| NaN | NaN | salary\_band | Enum | Band C | Band A (thấp nhất) → Band E (cao nhất). Không có số thật. |
| NaN | NaN | effective\_date | Date | 2025-01-01 | Ngày áp dụng mức lương hiện tại. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-07 · Performance NORM / Rule-based Standards\n\nBộ 27 quy tắc đánh giá hiệu suất. Agent đọc như rule engine. 6 nhóm: KPI/Timesheet/RA/Violation/Composite/Report Guard.\n\n(1 row = 1 quy tắc) | norm\_id | String | NORM-P01 | Mã quy tắc duy nhất. |
| NaN | NaN | category | String | KPI Score | Nhóm: KPI Score / Timesheet / Resource Allocation / Violation / Composite Risk / Report Guard. |
| NaN | NaN | rule\_description | String | Score ≥4.5… | Mô tả điều kiện kích hoạt. |
| NaN | NaN | threshold | String | >= 4.5 | Ngưỡng/logic điều kiện. |
| NaN | NaN | classification\_label | String | Excellent | Nhãn phân loại khi rule match. |
| NaN | NaN | action\_if\_triggered | String | Highlight… | Hành động cần thực hiện. |
| NaN | NaN | priority | Enum | High | Critical / High / Medium / Low. |
| NaN | NaN | applies\_to | String | All employees | Phạm vi áp dụng. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-08 · Performance Profile (Aggregated)\n\nView tổng hợp per-employee từ DS01–DS07. Derived dataset — không phải raw data. Dùng để query nhanh và highlight risk.\n\n(1 row = 1 nhân viên (snapshot T3–T4/2026)) | member\_id | String | EMP-031 | FK → DS00\_Employee\_Master. |
| NaN | NaN | avg\_score\_t3\_t4 | Float | 3.4 | Điểm trung bình T3+T4. NULL nếu không có dữ liệu. |
| NaN | NaN | classification\_latest | Enum | Good | Classification tháng gần nhất (T4/2026). |
| NaN | NaN | ts\_compliance\_t4 | Enum | Compliant | Tuân thủ chấm công T4: Compliant/Minor Late/Late Pattern/Unapproved Absence/No data. |
| NaN | NaN | total\_ot\_hours\_t4 | Float | 16 | Tổng OT hours T4. |
| NaN | NaN | violation\_risk\_flag | Enum | 🔴 High Risk | Risk flag tổng hợp từ DS04c. |
| NaN | NaN | open\_violation\_count | Integer | 3 | Số case vi phạm chưa đóng. |
| NaN | NaN | allocation\_status | Enum | Overloaded | Active / Overloaded / Under-allocated / Bench / Unknown. |
| NaN | NaN | readiness\_score | Float | 0.72 | FK từ DS05 Promotion Intent. |
| NaN | NaN | salary\_band | Enum | Band C | FK từ DS06 Salary Band. |
| NaN | NaN | perf\_risk\_note | String | Low KPI; Bench | Tổng hợp risk flags dưới dạng text. 'No flags' = không có vấn đề. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | REF · Project Master\n\nBảng tham chiếu account và dự án. Dùng để decode account\_id/project\_id trong DS01.\n\n(1 row = 1 dự án) | account\_id | String | ACC-B | Mã account (client group). |
| NaN | NaN | account\_name | String | Account Beta | Tên account (ẩn danh). |
| NaN | NaN | project\_id | String | ACC-B-P01 | Mã dự án. |
| NaN | NaN | project\_name | String | Project Beta… | Tên dự án (ẩn danh). |

## DS00_Employee_Master
| member\_id | role\_title | department | level | employment\_status | join\_date | performance\_tier | overall\_score\_latest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | Senior Software Engineer | IT - Engineering | L4 | Active | 2020-03-25 | Exceeds Expectations | 4.8 |
| EMP-002 | Junior QA Engineer | IT - QA | L2 | Active | 2025-04-25 | Meets Expectations | 3.7 |
| EMP-003 | Engineering Manager | IT - Engineering | L6 | Active | 2020-06-01 | Exceeds Expectations | 4.3 |
| EMP-004 | QA Lead | IT - QA | L5 | Active | 2022-10-05 | Meets Expectations | 3.2 |
| EMP-005 | Senior Project Manager | IT - PM | L6 | Active | 2022-03-10 | Meets Expectations | 3.8 |
| EMP-006 | Senior DevOps Engineer | IT - DevOps | L4 | Active | 2025-04-25 | Meets Expectations | 3.9 |
| EMP-007 | QA Engineer | IT - QA | L3 | Active | 2024-07-25 | Meets Expectations | 3.4 |
| EMP-008 | Junior QA Engineer | IT - QA | L1 | Active | 2024-02-01 | Partially Meets | 2.2 |
| EMP-009 | Senior QA Engineer | IT - QA | L4 | Active | 2025-01-25 | Meets Expectations | 3.8 |
| EMP-010 | Junior Software Engineer | IT - Engineering | L1 | Active | 2021-09-05 | Meets Expectations | 3.3 |
| EMP-011 | Junior Software Engineer | IT - Engineering | L1 | Active | 2022-08-01 | Exceeds Expectations | 4.5 |
| EMP-012 | DevOps Engineer | IT - DevOps | L3 | Active | 2025-03-05 | Meets Expectations | 4.1 |
| EMP-013 | Tech Lead | IT - Engineering | L5 | Active | 2025-08-01 | Meets Expectations | 3.3 |
| EMP-014 | Software Engineer | IT - Engineering | L3 | Active | 2022-02-20 | Meets Expectations | 3.8 |
| EMP-015 | Junior QA Engineer | IT - QA | L2 | Active | 2018-02-25 | Meets Expectations | 3.6 |
| EMP-016 | Senior DevOps Engineer | IT - DevOps | L4 | Active | 2020-04-05 | Meets Expectations | 3.3 |
| EMP-017 | Senior Business Analyst | IT - BA | L4 | Active | 2017-11-20 | Partially Meets | 3.1 |
| EMP-018 | Junior Software Engineer | IT - Engineering | L1 | Resigned | 2023-01-15 | Meets Expectations | 3.9 |
| EMP-019 | QA Engineer | IT - QA | L3 | Active | 2017-10-25 | Meets Expectations | 3.9 |
| EMP-020 | Junior QA Engineer | IT - QA | L1 | Active | 2018-10-01 | Meets Expectations | 3.4 |
| EMP-021 | Senior Software Engineer | IT - Engineering | L4 | Active | 2025-06-10 | Meets Expectations | 3.8 |
| EMP-022 | Junior Software Engineer | IT - Engineering | L2 | PIP | 2024-10-20 | Does Not Meet | 1.1 |
| EMP-023 | Delivery Manager | IT - Delivery | L7 | Active | 2024-09-25 | Meets Expectations | 4.1 |
| EMP-024 | Tech Lead | IT - Engineering | L5 | Active | 2018-12-20 | Exceeds Expectations | 4.4 |
| EMP-025 | QA Engineer | IT - QA | L3 | Resigned | 2018-11-15 | Partially Meets | 2.0 |
| EMP-026 | DevOps Engineer | IT - DevOps | L3 | Active | 2017-02-01 | Does Not Meet | 1.6 |
| EMP-027 | Senior Project Manager | IT - PM | L6 | Active | 2022-01-10 | Meets Expectations | 3.4 |
| EMP-028 | Senior Software Engineer | IT - Engineering | L4 | PIP | 2017-03-25 | Does Not Meet | 1.7 |
| EMP-029 | Senior Project Manager | IT - PM | L6 | Active | 2020-04-15 | Meets Expectations | 3.9 |
| EMP-030 | Tech Lead | IT - Engineering | L5 | Active | 2022-11-20 | Meets Expectations | 4.1 |
| EMP-031 | Senior DevOps Engineer | IT - DevOps | L4 | Active | 2023-06-25 | Partially Meets | 2.5 |
| EMP-032 | Junior Software Engineer | IT - Engineering | L1 | Active | 2025-09-25 | Meets Expectations | 3.9 |
| EMP-033 | Business Dev Executive | Admin - Sales | L3 | Active | 2021-09-10 | Meets Expectations | 3.5 |
| EMP-034 | Business Analyst | IT - BA | L3 | Active | 2017-05-10 | Meets Expectations | 3.9 |
| EMP-035 | HR Executive | Admin - HR | L2 | Active | 2018-05-20 | Meets Expectations | 3.8 |
| EMP-036 | Senior Software Engineer | IT - Engineering | L4 | Active | 2024-10-01 | Meets Expectations | 4.0 |
| EMP-037 | Senior Business Analyst | IT - BA | L4 | Active | 2020-03-25 | Meets Expectations | 3.2 |
| EMP-038 | Principal Engineer | IT - Engineering | L5 | Active | 2025-07-20 | Meets Expectations | 3.3 |
| EMP-039 | Tech Lead | IT - Engineering | L5 | Active | 2024-02-25 | Meets Expectations | 3.4 |
| EMP-040 | Senior QA Engineer | IT - QA | L4 | Active | 2023-06-20 | Meets Expectations | 3.3 |
| EMP-041 | Junior Software Engineer | IT - Engineering | L1 | Active | 2022-05-15 | Partially Meets | 3.0 |
| EMP-042 | Junior Software Engineer | IT - Engineering | L2 | Active | 2023-12-05 | Partially Meets | 3.0 |
| EMP-043 | Project Manager | IT - PM | L5 | Active | 2024-03-01 | Meets Expectations | 3.5 |
| EMP-044 | Junior QA Engineer | IT - QA | L1 | Active | 2025-01-10 | Meets Expectations | 3.3 |
| EMP-045 | Senior Software Engineer | IT - Engineering | L4 | Active | 2019-08-25 | Exceeds Expectations | 5.0 |
| EMP-046 | Senior QA Engineer | IT - QA | L4 | Active | 2017-05-20 | Meets Expectations | 4.1 |
| EMP-047 | Accountant | Admin - Finance | L2 | Active | 2018-10-01 | Meets Expectations | 3.6 |
| EMP-048 | Senior Project Manager | IT - PM | L6 | Active | 2024-12-05 | Meets Expectations | 3.9 |
| EMP-049 | Senior DevOps Engineer | IT - DevOps | L4 | Active | 2022-04-01 | Meets Expectations | 3.6 |
| EMP-050 | Junior QA Engineer | IT - QA | L2 | Active | 2021-06-10 | Partially Meets | 2.8 |
| EMP-051 | Delivery Manager | IT - Delivery | L7 | Active | 2025-04-25 | Meets Expectations | 3.8 |
| EMP-052 | Software Engineer | IT - Engineering | L3 | Active | 2024-09-20 | Meets Expectations | 4.1 |
| EMP-053 | Business Dev Executive | Admin - Sales | L3 | Active | 2020-06-01 | Meets Expectations | 4.1 |
| EMP-054 | Junior QA Engineer | IT - QA | L2 | Resigned | 2021-04-10 | Exceeds Expectations | 4.2 |
| EMP-055 | Junior Software Engineer | IT - Engineering | L2 | Active | 2021-08-15 | Meets Expectations | 3.4 |
| EMP-056 | Project Manager | IT - PM | L5 | Active | 2017-03-05 | Partially Meets | 3.0 |
| EMP-057 | QA Engineer | IT - QA | L3 | Resigned | 2024-08-10 | Partially Meets | 3.1 |
| EMP-058 | Senior Business Analyst | IT - BA | L4 | Active | 2018-03-05 | Exceeds Expectations | 4.3 |
| EMP-059 | Admin Executive | Admin - GA | L2 | Active | 2021-12-15 | Exceeds Expectations | 4.4 |
| EMP-060 | Senior Software Engineer | IT - Engineering | L4 | Active | 2017-03-10 | Meets Expectations | 3.9 |
| EMP-061 | QA Engineer | IT - QA | L3 | Active | 2024-08-01 | Meets Expectations | 4.0 |
| EMP-062 | Junior Software Engineer | IT - Engineering | L2 | Active | 2024-09-25 | Meets Expectations | 3.5 |
| EMP-063 | Junior Software Engineer | IT - Engineering | L1 | Active | 2022-11-01 | Partially Meets | 2.4 |
| EMP-064 | Senior QA Engineer | IT - QA | L4 | Active | 2022-02-15 | Partially Meets | 2.9 |
| EMP-065 | QA Engineer | IT - QA | L3 | Active | 2020-05-20 | Exceeds Expectations | 4.4 |
| EMP-066 | Junior Software Engineer | IT - Engineering | L2 | Active | 2025-07-01 | Meets Expectations | 4.0 |
| EMP-067 | Engineering Manager | IT - Engineering | L6 | Active | 2024-04-15 | Meets Expectations | 3.5 |
| EMP-068 | Principal Engineer | IT - Engineering | L5 | PIP | 2021-10-20 | Does Not Meet | 1.4 |
| EMP-069 | Finance Manager | Admin - Finance | L5 | Active | 2020-10-15 | Meets Expectations | 3.9 |
| EMP-070 | Software Engineer | IT - Engineering | L3 | Active | 2019-09-20 | Meets Expectations | 3.3 |
| EMP-071 | Senior Software Engineer | IT - Engineering | L4 | Active | 2024-05-10 | Meets Expectations | 3.6 |
| EMP-072 | Software Engineer | IT - Engineering | L3 | Resigned | 2018-04-25 | Meets Expectations | 3.5 |
| EMP-073 | Junior QA Engineer | IT - QA | L2 | Active | 2017-06-01 | Meets Expectations | 3.5 |
| EMP-074 | Principal Engineer | IT - Engineering | L5 | Active | 2023-10-25 | Meets Expectations | 4.0 |
| EMP-075 | HR Manager | Admin - HR | L5 | Active | 2025-03-01 | Meets Expectations | 3.5 |
| EMP-076 | Senior DevOps Engineer | IT - DevOps | L4 | Active | 2020-07-20 | Meets Expectations | 3.5 |
| EMP-077 | Tech Lead | IT - Engineering | L5 | Active | 2024-05-05 | Meets Expectations | 3.5 |
| EMP-078 | Senior Project Manager | IT - PM | L6 | Active | 2024-01-20 | Meets Expectations | 3.3 |
| EMP-079 | Software Engineer | IT - Engineering | L3 | Active | 2025-09-10 | Partially Meets | 2.3 |
| EMP-080 | Senior Project Manager | IT - PM | L6 | Active | 2020-11-25 | Meets Expectations | 3.6 |
| EMP-081 | QA Lead | IT - QA | L5 | Active | 2022-11-25 | Meets Expectations | 3.7 |
| EMP-082 | Business Analyst | IT - BA | L3 | PIP | 2018-11-15 | Does Not Meet | 1.3 |
| EMP-083 | Senior Software Engineer | IT - Engineering | L4 | Active | 2025-03-15 | Meets Expectations | 3.8 |
| EMP-084 | Delivery Manager | IT - Delivery | L7 | Active | 2023-05-01 | Meets Expectations | 3.4 |
| EMP-085 | DevOps Engineer | IT - DevOps | L3 | Active | 2021-04-01 | Does Not Meet | 1.7 |
| EMP-086 | Senior Software Engineer | IT - Engineering | L4 | Active | 2019-10-05 | Exceeds Expectations | 4.8 |
| EMP-087 | Senior Project Manager | IT - PM | L6 | Active | 2019-09-10 | Partially Meets | 2.1 |
| EMP-088 | Junior Software Engineer | IT - Engineering | L2 | Active | 2021-01-05 | Meets Expectations | 3.7 |
| EMP-089 | Principal Engineer | IT - Engineering | L5 | Active | 2017-12-25 | Meets Expectations | 3.6 |
| EMP-090 | Senior Software Engineer | IT - Engineering | L4 | Resigned | 2018-06-20 | Exceeds Expectations | 4.3 |
| EMP-091 | Finance Manager | Admin - Finance | L5 | Active | 2018-11-25 | Partially Meets | 2.6 |
| EMP-092 | Senior QA Engineer | IT - QA | L4 | Active | 2018-06-15 | Meets Expectations | 3.4 |
| EMP-093 | BD Manager | Admin - Sales | L6 | Active | 2022-03-20 | Exceeds Expectations | 5.0 |
| EMP-094 | Senior Project Manager | IT - PM | L6 | Active | 2022-02-20 | Meets Expectations | 3.3 |
| EMP-095 | Business Analyst | IT - BA | L3 | Active | 2023-09-20 | Meets Expectations | 3.8 |
| EMP-096 | Junior Software Engineer | IT - Engineering | L2 | Active | 2022-01-05 | Partially Meets | 2.6 |
| EMP-097 | QA Engineer | IT - QA | L3 | Active | 2023-07-15 | Meets Expectations | 3.5 |
| EMP-098 | QA Engineer | IT - QA | L3 | Active | 2018-05-15 | Meets Expectations | 3.6 |
| EMP-099 | Principal Engineer | IT - Engineering | L5 | Active | 2024-09-25 | Meets Expectations | 3.4 |
| EMP-100 | QA Lead | IT - QA | L5 | Active | 2022-02-01 | Meets Expectations | 3.6 |

## DS01_Resource_Allocation
| member\_id | account\_id | project\_id | assignment\_type | role | report\_to | allocation\_pct | work\_on\_other | other\_project\_ids | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | ACC-C | ACC-C-P02 | Main Account | UI/UX | TL-UX-001 | 0.7500 | Yes | ACC-A-P02 | Also 25% on ACC-A-P02 |
| EMP-002 | ACC-D | ACC-D-P01 | Main Account | BE | TL-BE-001 | 1.0000 | No | NaN | NaN |
| EMP-003 | ACC-B | ACC-B-P01 | Main Account | BA | TL-BA-001 | 1.0000 | No | NaN | NaN |
| EMP-004 | ACC-B | ACC-B-P01 | Main Account | BE | EM-001 | 1.0000 | No | NaN | NaN |
| EMP-005 | ACC-E | ACC-E-P02 | Main Account | DevOps | EM-003 | 0.5000 | Yes | ACC-B-P02 | Also 50% on ACC-B-P02 |
| EMP-006 | ACC-D | ACC-D-P01 | Main Account | BA | TL-BA-001 | 1.0000 | No | NaN | NaN |
| EMP-007 | ACC-C | ACC-C-P03 | Main Account | PM | DM-001 | 0.5000 | Yes | ACC-D-P01 | Also 50% on ACC-D-P01 |
| EMP-008 | ACC-E | ACC-E-P01 | Main Account | QA | TL-QA-001 | 1.0000 | No | NaN | NaN |
| EMP-009 | Internal | Bench / Internal | Bench | DevOps | TL-DO-001 | 0.8000 | No | NaN | Awaiting assignment |
| EMP-010 | ACC-D | ACC-D-P02 | Main Account | Mobile | TL-MB-001 | 1.0000 | No | NaN | NaN |
| EMP-011 | ACC-A | ACC-A-P01 | Main Account | QA | QA-MGR-001 | 1.0000 | No | NaN | NaN |
| EMP-012 | ACC-C | ACC-C-P01 | Main Account | PM | DM-001 | 1.0000 | No | NaN | NaN |
| EMP-013 | ACC-B | ACC-B-P03 | Main Account | QA | TL-QA-001 | 1.0000 | No | NaN | NaN |
| EMP-014 | ACC-C | ACC-C-P02 | Support | BE | TL-BE-001 | 0.0150 | Yes | ACC-E-P02, ACC-D-P01 | Overloaded |
| EMP-015 | ACC-A | ACC-A-P01 | Main Account | FE | EM-001 | 1.0000 | No | NaN | NaN |
| EMP-016 | ACC-E | ACC-E-P02 | Main Account | BE | EM-001 | 0.5000 | Yes | ACC-A-P02 | Also 50% on ACC-A-P02 |
| EMP-017 | Internal | Bench / Internal | Bench | BE | TL-BE-002 | 0.8000 | No | NaN | Awaiting assignment |
| EMP-018 | ACC-A | ACC-A-P04 | Main Account | BA | PM-002 | 1.0000 | No | NaN | NaN |
| EMP-019 | ACC-D | ACC-D-P02 | Main Account | FE | EM-001 | 1.0000 | No | NaN | NaN |
| EMP-020 | ACC-D | ACC-D-P01 | Main Account | UI/UX | TL-UX-001 | 1.0000 | No | NaN | NaN |
| EMP-021 | ACC-D | ACC-D-P01 | Main Account | Fullstack | TL-FS-001 | 1.0000 | No | NaN | NaN |
| EMP-022 | Internal | Bench / Internal | Bench | Fullstack | EM-002 | 0.5000 | No | NaN | Awaiting assignment |
| EMP-023 | ACC-B | ACC-B-P03 | Main Account | BE | TL-BE-002 | 1.0000 | No | NaN | NaN |
| EMP-024 | ACC-C | ACC-C-P02 | Main Account | BE | EM-001 | 0.5000 | Yes | ACC-A-P01 | Also 50% on ACC-A-P01 |
| EMP-025 | ACC-A | ACC-A-P01 | Main Account | Mobile | TL-MB-001 | 1.0000 | No | NaN | NaN |
| EMP-026 | ACC-A | ACC-A-P04 | Main Account | Fullstack | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-027 | ACC-E | ACC-E-P02 | Main Account | FE | TL-FE-001 | 1.0000 | No | NaN | NaN |
| EMP-028 | ACC-A | ACC-A-P04 | Support | QA | TL-QA-001 | 0.0150 | Yes | ACC-A-P02, ACC-C-P03 | Overloaded |
| EMP-029 | Internal | Bench / Internal | Bench | QA | TL-QA-001 | 0.5000 | No | NaN | Awaiting assignment |
| EMP-030 | Internal | Bench / Internal | Bench | UI/UX | TL-UX-001 | 0.5000 | No | NaN | Awaiting assignment |
| EMP-031 | ACC-B | ACC-B-P02 | Main Account | BE | TL-BE-002 | 1.0000 | No | NaN | NaN |
| EMP-032 | ACC-E | ACC-E-P01 | Main Account | Mobile | TL-MB-001 | 1.0000 | No | NaN | NaN |
| EMP-033 | ACC-B | ACC-B-P01 | Main Account | UI/UX | PM-001 | 0.5000 | Yes | ACC-E-P02 | Also 50% on ACC-E-P02 |
| EMP-034 | ACC-E | ACC-E-P02 | Main Account | BA | TL-BA-001 | 0.5000 | Yes | ACC-B-P01 | Also 50% on ACC-B-P01 |
| EMP-035 | ACC-A | ACC-A-P01 | Main Account | BE | TL-BE-001 | 1.0000 | No | NaN | NaN |
| EMP-036 | ACC-A | ACC-A-P03 | Main Account | BE | TL-BE-002 | 1.0000 | No | NaN | NaN |
| EMP-037 | ACC-C | ACC-C-P02 | Main Account | BE | EM-001 | 1.0000 | No | NaN | NaN |
| EMP-038 | ACC-B | ACC-B-P02 | Main Account | Mobile | TL-MB-001 | 1.0000 | No | NaN | NaN |
| EMP-039 | ACC-C | ACC-C-P01 | Main Account | DevOps | TL-DO-001 | 1.0000 | No | NaN | NaN |
| EMP-040 | ACC-B | ACC-B-P03 | Main Account | FE | EM-001 | 0.7500 | Yes | ACC-B-P02 | Also 25% on ACC-B-P02 |
| EMP-041 | ACC-A | ACC-A-P01 | Main Account | PM | AM-001 | 0.7500 | Yes | ACC-A-P02 | Also 25% on ACC-A-P02 |
| EMP-042 | ACC-C | ACC-C-P03 | Main Account | BE | TL-BE-001 | 1.0000 | No | NaN | NaN |
| EMP-043 | Internal | Bench / Internal | Bench | QA | QA-MGR-001 | 0.8000 | No | NaN | Awaiting assignment |
| EMP-044 | ACC-A | ACC-A-P02 | Main Account | UI/UX | PM-001 | 0.7500 | Yes | ACC-D-P02 | Also 25% on ACC-D-P02 |
| EMP-045 | ACC-D | ACC-D-P01 | Main Account | QA | QA-MGR-001 | 1.0000 | No | NaN | NaN |
| EMP-046 | ACC-E | ACC-E-P01 | Main Account | Fullstack | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-047 | ACC-A | ACC-A-P02 | Support | QA | QA-MGR-001 | 0.0175 | Yes | ACC-D-P01 | Overloaded |
| EMP-048 | ACC-A | ACC-A-P04 | Main Account | QA | TL-QA-001 | 1.0000 | No | NaN | NaN |
| EMP-049 | ACC-B | ACC-B-P03 | Main Account | Fullstack | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-050 | ACC-A | ACC-A-P04 | Support | FE | TL-FE-002 | 0.0125 | Yes | ACC-A-P01, ACC-C-P02 | Overloaded |
| EMP-051 | Internal | Bench / Internal | Bench | Fullstack | EM-002 | 0.7500 | No | NaN | Awaiting assignment |
| EMP-052 | ACC-B | ACC-B-P01 | Support | Mobile | EM-002 | 0.0150 | Yes | ACC-D-P01, ACC-A-P04 | Overloaded |
| EMP-053 | ACC-B | ACC-B-P03 | Main Account | BE | TL-BE-001 | 1.0000 | No | NaN | NaN |
| EMP-054 | ACC-A | ACC-A-P04 | Main Account | BA | TL-BA-001 | 1.0000 | No | NaN | NaN |
| EMP-055 | ACC-B | ACC-B-P03 | Main Account | PM | AM-001 | 1.0000 | No | NaN | NaN |
| EMP-056 | ACC-D | ACC-D-P01 | Main Account | PM | DM-001 | 1.0000 | No | NaN | NaN |
| EMP-057 | ACC-D | ACC-D-P01 | Main Account | UI/UX | TL-UX-001 | 0.5000 | Yes | ACC-A-P01 | Also 50% on ACC-A-P01 |
| EMP-058 | ACC-B | ACC-B-P02 | Main Account | UI/UX | TL-UX-001 | 1.0000 | No | NaN | NaN |
| EMP-059 | ACC-A | ACC-A-P01 | Main Account | FE | EM-001 | 0.5000 | Yes | ACC-B-P02 | Also 50% on ACC-B-P02 |
| EMP-060 | ACC-C | ACC-C-P01 | Main Account | UI/UX | TL-UX-001 | 1.0000 | No | NaN | NaN |
| EMP-061 | ACC-D | ACC-D-P02 | Main Account | UI/UX | TL-UX-001 | 0.5000 | Yes | ACC-E-P02 | Also 50% on ACC-E-P02 |
| EMP-062 | Internal | Bench / Internal | Bench | DevOps | EM-003 | 0.7500 | No | NaN | Awaiting assignment |
| EMP-063 | ACC-C | ACC-C-P02 | Support | Fullstack | TL-FS-001 | 0.7500 | Yes | ACC-B-P02 | Overloaded |
| EMP-064 | ACC-B | ACC-B-P02 | Main Account | UI/UX | TL-UX-001 | 1.0000 | No | NaN | NaN |
| EMP-065 | ACC-C | ACC-C-P02 | Main Account | UI/UX | TL-UX-001 | 0.7500 | Yes | ACC-E-P01 | Also 25% on ACC-E-P01 |
| EMP-066 | ACC-C | ACC-C-P01 | Main Account | Fullstack | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-067 | ACC-E | ACC-E-P01 | Main Account | QA | QA-MGR-001 | 1.0000 | No | NaN | NaN |
| EMP-068 | ACC-B | ACC-B-P03 | Main Account | FE | EM-001 | 1.0000 | No | NaN | NaN |
| EMP-069 | ACC-D | ACC-D-P02 | Main Account | Fullstack | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-070 | Internal | Bench / Internal | Bench | FE | TL-FE-002 | 0.8000 | No | NaN | Awaiting assignment |
| EMP-071 | ACC-B | ACC-B-P02 | Main Account | FE | TL-FE-002 | 0.5000 | Yes | ACC-A-P02 | Also 50% on ACC-A-P02 |
| EMP-072 | ACC-A | ACC-A-P02 | Main Account | FE | TL-FE-002 | 1.0000 | No | NaN | NaN |
| EMP-073 | ACC-B | ACC-B-P01 | Main Account | PM | AM-001 | 0.5000 | Yes | ACC-A-P01 | Also 50% on ACC-A-P01 |
| EMP-074 | ACC-C | ACC-C-P01 | Main Account | QA | TL-QA-001 | 1.0000 | No | NaN | NaN |
| EMP-075 | ACC-D | ACC-D-P01 | Main Account | FE | TL-FE-001 | 1.0000 | No | NaN | NaN |
| EMP-076 | ACC-B | ACC-B-P03 | Main Account | UI/UX | TL-UX-001 | 0.5000 | Yes | ACC-C-P03 | Also 50% on ACC-C-P03 |
| EMP-077 | ACC-A | ACC-A-P01 | Main Account | DevOps | EM-003 | 0.5000 | Yes | ACC-C-P03 | Also 50% on ACC-C-P03 |
| EMP-078 | ACC-A | ACC-A-P03 | Main Account | DevOps | TL-DO-001 | 0.7500 | Yes | ACC-A-P01 | Also 25% on ACC-A-P01 |
| EMP-079 | ACC-D | ACC-D-P01 | Main Account | Fullstack | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-080 | ACC-B | ACC-B-P01 | Main Account | FE | TL-FE-002 | 1.0000 | No | NaN | NaN |
| EMP-081 | ACC-E | ACC-E-P02 | Support | PM | DM-001 | 0.0150 | Yes | ACC-C-P01, ACC-A-P02 | Overloaded |
| EMP-082 | ACC-C | ACC-C-P03 | Main Account | FE | EM-001 | 0.5000 | Yes | ACC-B-P01 | Also 50% on ACC-B-P01 |
| EMP-083 | ACC-C | ACC-C-P02 | Support | BE | TL-BE-002 | 0.0125 | Yes | ACC-C-P01 | Overloaded |
| EMP-084 | ACC-B | ACC-B-P02 | Main Account | Fullstack | TL-FS-001 | 1.0000 | No | NaN | NaN |
| EMP-085 | Internal | Bench / Internal | Bench | FE | TL-FE-001 | 0.8000 | No | NaN | Awaiting assignment |
| EMP-086 | ACC-A | ACC-A-P01 | Main Account | BE | TL-BE-001 | 0.7500 | Yes | ACC-D-P01 | Also 25% on ACC-D-P01 |
| EMP-087 | ACC-C | ACC-C-P02 | Support | Fullstack | TL-FS-001 | 0.0150 | Yes | ACC-B-P01 | Overloaded |
| EMP-088 | ACC-C | ACC-C-P02 | Main Account | Mobile | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-089 | ACC-D | ACC-D-P02 | Main Account | BE | TL-BE-001 | 1.0000 | No | NaN | NaN |
| EMP-090 | ACC-C | ACC-C-P03 | Main Account | FE | EM-001 | 1.0000 | No | NaN | NaN |
| EMP-091 | ACC-D | ACC-D-P02 | Main Account | QA | TL-QA-001 | 1.0000 | No | NaN | NaN |
| EMP-092 | ACC-A | ACC-A-P04 | Support | FE | TL-FE-001 | 0.0150 | Yes | ACC-C-P01, ACC-B-P02 | Overloaded |
| EMP-093 | ACC-D | ACC-D-P01 | Main Account | FE | TL-FE-001 | 1.0000 | No | NaN | NaN |
| EMP-094 | ACC-E | ACC-E-P02 | Main Account | DevOps | EM-003 | 1.0000 | No | NaN | NaN |
| EMP-095 | ACC-E | ACC-E-P01 | Main Account | Fullstack | EM-002 | 1.0000 | No | NaN | NaN |
| EMP-096 | ACC-B | ACC-B-P02 | Main Account | FE | TL-FE-002 | 0.7500 | Yes | ACC-D-P01 | Also 25% on ACC-D-P01 |
| EMP-097 | ACC-A | ACC-A-P02 | Main Account | PM | DM-001 | 1.0000 | No | NaN | NaN |
| EMP-098 | ACC-B | ACC-B-P03 | Support | DevOps | EM-003 | 0.0125 | Yes | ACC-B-P02, ACC-E-P02 | Overloaded |
| EMP-099 | ACC-D | ACC-D-P01 | Main Account | FE | TL-FE-002 | 1.0000 | No | NaN | NaN |
| EMP-100 | ACC-E | ACC-E-P01 | Main Account | FE | TL-FE-002 | 0.7500 | Yes | ACC-C-P01 | Also 25% on ACC-C-P01 |

## DS02_Performance_by_Project
| member\_id | reviewer\_id | report\_period | total\_point | classification | feedback\_category | review\_frequency |
| --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | TL-MB-001 | 2026-03 | 4.52 | Excellent | Consistent delivery and accountability | Monthly |
| EMP-001 | TL-MB-001 | 2026-04 | 4.42 | Good | Meets expectations | Monthly |
| EMP-002 | TL-MB-001 | 2026-03 | 3.81 | Good | Consistent delivery and accountability | Monthly |
| EMP-002 | TL-MB-001 | 2026-04 | 3.85 | Good | Consistent delivery and accountability | Monthly |
| EMP-003 | EM-001 | 2026-03 | 4.90 | Excellent | High learning agility and initiative | Monthly |
| EMP-003 | EM-001 | 2026-04 | 4.95 | Excellent | Strong leadership and coordination | Monthly |
| EMP-004 | MGR-004 | 2026-03 | 1.80 | Below Expectations | Needs additional coaching and support | Monthly |
| EMP-004 | MGR-004 | 2026-04 | 1.60 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-005 | TL-BA-001 | 2026-03 | 3.96 | Good | Meets expectations | Monthly |
| EMP-005 | TL-BA-001 | 2026-04 | 4.04 | Good | Good client management and issue resolution | Monthly |
| EMP-006 | TL-QA-001 | 2026-03 | 3.69 | Good | Good client management and issue resolution | Monthly |
| EMP-006 | TL-QA-001 | 2026-04 | 3.53 | Good | Consistent performance maintained | Monthly |
| EMP-007 | TL-MB-001 | 2026-03 | 3.32 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-007 | TL-MB-001 | 2026-04 | 3.36 | Meets Expectations | Meets expectations | Monthly |
| EMP-008 | QA-MGR-001 | 2026-03 | 2.22 | Below Expectations | Needs additional coaching and support | Monthly |
| EMP-008 | QA-MGR-001 | 2026-04 | 2.05 | Below Expectations | Needs additional coaching and support | Monthly |
| EMP-009 | EM-001 | 2026-03 | 3.85 | Good | Consistent delivery and accountability | Monthly |
| EMP-009 | EM-001 | 2026-04 | 3.67 | Good | Meets expectations | Monthly |
| EMP-010 | TL-FS-001 | 2026-03 | 3.59 | Good | Meets expectations | Monthly |
| EMP-010 | TL-FS-001 | 2026-04 | 3.74 | Good | Consistent performance maintained | Monthly |
| EMP-011 | EM-001 | 2026-03 | 4.80 | Excellent | Consistent delivery and accountability | Monthly |
| EMP-011 | EM-001 | 2026-04 | 4.85 | Excellent | Strong collaboration and team support | Monthly |
| EMP-012 | MGR-004 | 2026-03 | 2.10 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-012 | MGR-004 | 2026-04 | 1.90 | Below Expectations | Needs additional coaching and support | Monthly |
| EMP-013 | PM-002 | 2026-03 | 3.10 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-013 | PM-002 | 2026-04 | 3.01 | Meets Expectations | Meets expectations | Monthly |
| EMP-014 | PM-001 | 2026-03 | 4.01 | Good | Consistent delivery and accountability | Monthly |
| EMP-014 | PM-001 | 2026-04 | 3.90 | Good | Consistent delivery and accountability | Monthly |
| EMP-015 | PM-001 | 2026-03 | 3.54 | Good | Consistent delivery and accountability | Monthly |
| EMP-015 | PM-001 | 2026-04 | 3.42 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-016 | DM-001 | 2026-03 | 3.39 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-016 | DM-001 | 2026-04 | 3.54 | Good | Consistent performance maintained | Monthly |
| EMP-017 | TL-FE-001 | 2026-03 | 2.96 | Meets Expectations | Meets expectations | Monthly |
| EMP-017 | TL-FE-001 | 2026-04 | 3.06 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-018 | TL-BE-002 | 2026-03 | 4.14 | Good | Consistent performance maintained | Monthly |
| EMP-018 | TL-BE-002 | 2026-04 | 4.08 | Good | Meets expectations | Monthly |
| EMP-019 | EM-003 | 2026-03 | 3.90 | Good | Consistent delivery and accountability | Monthly |
| EMP-019 | EM-003 | 2026-04 | 4.04 | Good | Meets expectations | Monthly |
| EMP-020 | TL-FE-002 | 2026-03 | 3.58 | Good | Consistent performance maintained | Monthly |
| EMP-020 | TL-FE-002 | 2026-04 | 3.62 | Good | Consistent performance maintained | Monthly |
| EMP-021 | TL-UX-001 | 2026-03 | 3.86 | Good | Consistent performance maintained | Monthly |
| EMP-021 | TL-UX-001 | 2026-04 | 3.87 | Good | Consistent delivery and accountability | Monthly |
| EMP-022 | TL-MB-001 | 2026-03 | 1.21 | Poor | Significant gaps in delivery and quality | Monthly |
| EMP-022 | TL-MB-001 | 2026-04 | 1.32 | Poor | Significant gaps in delivery and quality | Monthly |
| EMP-023 | TL-MB-001 | 2026-03 | 3.98 | Good | Meets expectations | Monthly |
| EMP-023 | TL-MB-001 | 2026-04 | 3.96 | Good | Good client management and issue resolution | Monthly |
| EMP-024 | EM-001 | 2026-03 | 4.70 | Excellent | Consistent delivery and accountability | Monthly |
| EMP-024 | EM-001 | 2026-04 | 4.75 | Excellent | High learning agility and initiative | Monthly |
| EMP-025 | TL-FS-001 | 2026-03 | 2.21 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-025 | TL-FS-001 | 2026-04 | 2.07 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-026 | EM-003 | 2026-03 | 1.85 | Below Expectations | Needs additional coaching and support | Monthly |
| EMP-026 | EM-003 | 2026-04 | 1.85 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-027 | EM-001 | 2026-03 | 3.63 | Good | Good client management and issue resolution | Monthly |
| EMP-027 | EM-001 | 2026-04 | 3.53 | Good | Meets expectations | Monthly |
| EMP-028 | TL-DO-001 | 2026-03 | 1.45 | Poor | Significant gaps in delivery and quality | Monthly |
| EMP-028 | TL-DO-001 | 2026-04 | 1.58 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-029 | TL-FE-001 | 2026-03 | 4.00 | Good | Meets expectations | Monthly |
| EMP-029 | TL-FE-001 | 2026-04 | 3.91 | Good | Consistent performance maintained | Monthly |
| EMP-030 | DM-001 | 2026-03 | 4.36 | Good | Meets expectations | Monthly |
| EMP-030 | DM-001 | 2026-04 | 4.45 | Good | Consistent performance maintained | Monthly |
| EMP-031 | MGR-004 | 2026-03 | 2.30 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-031 | MGR-004 | 2026-04 | 2.20 | Below Expectations | Needs additional coaching and support | Monthly |
| EMP-032 | TL-DO-001 | 2026-03 | 3.80 | Good | Meets expectations | Monthly |
| EMP-032 | TL-DO-001 | 2026-04 | 3.84 | Good | Consistent delivery and accountability | Monthly |
| EMP-033 | TL-DO-001 | 2026-03 | 3.62 | Good | Consistent delivery and accountability | Monthly |
| EMP-033 | TL-DO-001 | 2026-04 | 3.51 | Good | Consistent delivery and accountability | Monthly |
| EMP-034 | PM-001 | 2026-03 | 3.64 | Good | Meets expectations | Monthly |
| EMP-034 | PM-001 | 2026-04 | 3.55 | Good | Consistent performance maintained | Monthly |
| EMP-035 | DM-001 | 2026-03 | 3.82 | Good | Consistent performance maintained | Monthly |
| EMP-035 | DM-001 | 2026-04 | 3.72 | Good | Consistent performance maintained | Monthly |
| EMP-036 | TL-BE-002 | 2026-03 | 3.81 | Good | Consistent delivery and accountability | Monthly |
| EMP-036 | TL-BE-002 | 2026-04 | 3.87 | Good | Good client management and issue resolution | Monthly |
| EMP-037 | TL-BE-002 | 2026-03 | 3.15 | Meets Expectations | Meets expectations | Monthly |
| EMP-037 | TL-BE-002 | 2026-04 | 3.22 | Meets Expectations | Meets expectations | Monthly |
| EMP-038 | EM-002 | 2026-03 | 3.24 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-038 | EM-002 | 2026-04 | 3.36 | Meets Expectations | Meets expectations | Monthly |
| EMP-039 | PM-002 | 2026-03 | 3.21 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-039 | PM-002 | 2026-04 | 3.07 | Meets Expectations | Meets expectations | Monthly |
| EMP-040 | TL-QA-001 | 2026-03 | 3.28 | Meets Expectations | Meets expectations | Monthly |
| EMP-040 | TL-QA-001 | 2026-04 | 3.26 | Meets Expectations | Meets expectations | Monthly |
| EMP-041 | EM-002 | 2026-03 | 3.09 | Meets Expectations | Meets expectations | Monthly |
| EMP-041 | EM-002 | 2026-04 | 3.28 | Meets Expectations | Meets expectations | Monthly |
| EMP-042 | TL-FE-002 | 2026-03 | 2.94 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-042 | TL-FE-002 | 2026-04 | 2.83 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-043 | EM-002 | 2026-03 | 3.30 | Meets Expectations | Meets expectations | Monthly |
| EMP-043 | EM-002 | 2026-04 | 3.49 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-044 | QA-MGR-001 | 2026-03 | 3.17 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-044 | QA-MGR-001 | 2026-04 | 3.03 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-045 | DM-001 | 2026-03 | 5.00 | Excellent | Proactive and self-motivated | Monthly |
| EMP-045 | DM-001 | 2026-04 | 5.00 | Excellent | Strong leadership and coordination | Monthly |
| EMP-046 | PM-001 | 2026-03 | 3.83 | Good | Consistent performance maintained | Monthly |
| EMP-046 | PM-001 | 2026-04 | 3.83 | Good | Meets expectations | Monthly |
| EMP-047 | EM-002 | 2026-03 | 3.88 | Good | Consistent delivery and accountability | Monthly |
| EMP-047 | EM-002 | 2026-04 | 4.02 | Good | Consistent delivery and accountability | Monthly |
| EMP-048 | TL-DO-001 | 2026-03 | 4.01 | Good | Meets expectations | Monthly |
| EMP-048 | TL-DO-001 | 2026-04 | 3.97 | Good | Meets expectations | Monthly |
| EMP-049 | EM-002 | 2026-03 | 3.67 | Good | Consistent performance maintained | Monthly |
| EMP-049 | EM-002 | 2026-04 | 3.73 | Good | Good client management and issue resolution | Monthly |
| EMP-050 | TL-QA-001 | 2026-03 | 2.62 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-050 | TL-QA-001 | 2026-04 | 2.52 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-051 | TL-FE-001 | 2026-03 | 3.90 | Good | Good client management and issue resolution | Monthly |
| EMP-051 | TL-FE-001 | 2026-04 | 3.88 | Good | Consistent delivery and accountability | Monthly |
| EMP-052 | TL-BA-001 | 2026-03 | 4.07 | Good | Consistent delivery and accountability | Monthly |
| EMP-052 | TL-BA-001 | 2026-04 | 3.90 | Good | Meets expectations | Monthly |
| EMP-053 | EM-003 | 2026-03 | 3.96 | Good | Good client management and issue resolution | Monthly |
| EMP-053 | EM-003 | 2026-04 | 4.11 | Good | Meets expectations | Monthly |
| EMP-054 | EM-001 | 2026-03 | 4.07 | Good | Consistent performance maintained | Monthly |
| EMP-054 | EM-001 | 2026-04 | 4.20 | Good | Good client management and issue resolution | Monthly |
| EMP-055 | EM-003 | 2026-03 | 3.10 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-055 | EM-003 | 2026-04 | 3.27 | Meets Expectations | Meets expectations | Monthly |
| EMP-056 | TL-FE-001 | 2026-03 | 2.86 | Meets Expectations | Meets expectations | Monthly |
| EMP-056 | TL-FE-001 | 2026-04 | 2.96 | Meets Expectations | Meets expectations | Monthly |
| EMP-057 | TL-QA-001 | 2026-03 | 2.97 | Meets Expectations | Meets expectations | Monthly |
| EMP-057 | TL-QA-001 | 2026-04 | 3.06 | Meets Expectations | Meets expectations | Monthly |
| EMP-058 | TL-QA-001 | 2026-03 | 4.30 | Good | Good client management and issue resolution | Monthly |
| EMP-058 | TL-QA-001 | 2026-04 | 4.46 | Good | Consistent delivery and accountability | Monthly |
| EMP-059 | TL-DO-001 | 2026-03 | 4.48 | Good | Good client management and issue resolution | Monthly |
| EMP-059 | TL-DO-001 | 2026-04 | 4.30 | Good | Good client management and issue resolution | Monthly |
| EMP-060 | TL-FE-001 | 2026-03 | 3.98 | Good | Good client management and issue resolution | Monthly |
| EMP-060 | TL-FE-001 | 2026-04 | 3.84 | Good | Consistent performance maintained | Monthly |
| EMP-061 | TL-BE-002 | 2026-03 | 4.04 | Good | Consistent delivery and accountability | Monthly |
| EMP-061 | TL-BE-002 | 2026-04 | 3.87 | Good | Meets expectations | Monthly |
| EMP-062 | EM-002 | 2026-03 | 3.70 | Good | Meets expectations | Monthly |
| EMP-062 | EM-002 | 2026-04 | 3.67 | Good | Consistent delivery and accountability | Monthly |
| EMP-063 | TL-FS-001 | 2026-03 | 2.32 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-063 | TL-FS-001 | 2026-04 | 2.48 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-064 | PM-002 | 2026-03 | 3.00 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-064 | PM-002 | 2026-04 | 3.11 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-065 | TL-FE-001 | 2026-03 | 4.66 | Excellent | High learning agility and initiative | Monthly |
| EMP-065 | TL-FE-001 | 2026-04 | 4.81 | Excellent | High learning agility and initiative | Monthly |
| EMP-066 | TL-BE-002 | 2026-03 | 3.71 | Good | Good client management and issue resolution | Monthly |
| EMP-066 | TL-BE-002 | 2026-04 | 3.82 | Good | Consistent performance maintained | Monthly |
| EMP-067 | PM-002 | 2026-03 | 3.36 | Meets Expectations | Meets expectations | Monthly |
| EMP-067 | PM-002 | 2026-04 | 3.31 | Meets Expectations | Meets expectations | Monthly |
| EMP-068 | TL-BE-001 | 2026-03 | 1.23 | Poor | Significant gaps in delivery and quality | Monthly |
| EMP-068 | TL-BE-001 | 2026-04 | 1.17 | Poor | Performance improvement plan required | Monthly |
| EMP-069 | PM-002 | 2026-03 | 3.61 | Good | Meets expectations | Monthly |
| EMP-069 | PM-002 | 2026-04 | 3.57 | Good | Good client management and issue resolution | Monthly |
| EMP-070 | TL-DO-001 | 2026-03 | 3.58 | Good | Good client management and issue resolution | Monthly |
| EMP-070 | TL-DO-001 | 2026-04 | 3.52 | Good | Consistent performance maintained | Monthly |
| EMP-071 | PM-001 | 2026-03 | 3.86 | Good | Consistent delivery and accountability | Monthly |
| EMP-071 | PM-001 | 2026-04 | 4.01 | Good | Good client management and issue resolution | Monthly |
| EMP-072 | TL-FE-002 | 2026-03 | 3.55 | Good | Good client management and issue resolution | Monthly |
| EMP-072 | TL-FE-002 | 2026-04 | 3.37 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-073 | EM-001 | 2026-03 | 3.64 | Good | Good client management and issue resolution | Monthly |
| EMP-073 | EM-001 | 2026-04 | 3.61 | Good | Consistent delivery and accountability | Monthly |
| EMP-074 | TL-UX-001 | 2026-03 | 4.24 | Good | Meets expectations | Monthly |
| EMP-074 | TL-UX-001 | 2026-04 | 4.14 | Good | Consistent performance maintained | Monthly |
| EMP-075 | TL-BA-001 | 2026-03 | 3.51 | Good | Meets expectations | Monthly |
| EMP-075 | TL-BA-001 | 2026-04 | 3.46 | Meets Expectations | Meets expectations | Monthly |
| EMP-076 | PM-001 | 2026-03 | 3.57 | Good | Consistent delivery and accountability | Monthly |
| EMP-076 | PM-001 | 2026-04 | 3.66 | Good | Good client management and issue resolution | Monthly |
| EMP-077 | EM-003 | 2026-03 | 3.39 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-077 | EM-003 | 2026-04 | 3.32 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-078 | TL-FE-001 | 2026-03 | 3.12 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-078 | TL-FE-001 | 2026-04 | 3.19 | Meets Expectations | Meets expectations | Monthly |
| EMP-079 | TL-FS-001 | 2026-03 | 2.24 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-079 | TL-FS-001 | 2026-04 | 2.16 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-080 | TL-BE-002 | 2026-03 | 3.77 | Good | Good client management and issue resolution | Monthly |
| EMP-080 | TL-BE-002 | 2026-04 | 3.76 | Good | Consistent performance maintained | Monthly |
| EMP-081 | DM-001 | 2026-03 | 3.71 | Good | Meets expectations | Monthly |
| EMP-081 | DM-001 | 2026-04 | 3.77 | Good | Good client management and issue resolution | Monthly |
| EMP-082 | EM-003 | 2026-03 | 1.40 | Poor | Significant gaps in delivery and quality | Monthly |
| EMP-082 | EM-003 | 2026-04 | 1.24 | Poor | Performance improvement plan required | Monthly |
| EMP-083 | TL-FS-001 | 2026-03 | 3.63 | Good | Meets expectations | Monthly |
| EMP-083 | TL-FS-001 | 2026-04 | 3.49 | Meets Expectations | Meets expectations | Monthly |
| EMP-084 | PM-002 | 2026-03 | 3.69 | Good | Consistent delivery and accountability | Monthly |
| EMP-084 | PM-002 | 2026-04 | 3.67 | Good | Meets expectations | Monthly |
| EMP-085 | TL-UX-001 | 2026-03 | 1.70 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-085 | TL-UX-001 | 2026-04 | 1.56 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-086 | TL-MB-001 | 2026-03 | 4.97 | Excellent | High learning agility and initiative | Monthly |
| EMP-086 | TL-MB-001 | 2026-04 | 4.84 | Excellent | High-quality output and completeness | Monthly |
| EMP-087 | EM-003 | 2026-03 | 2.08 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-087 | EM-003 | 2026-04 | 2.25 | Below Expectations | Performance improvement discussion initiated | Monthly |
| EMP-088 | QA-MGR-001 | 2026-03 | 3.48 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-088 | QA-MGR-001 | 2026-04 | 3.55 | Good | Good client management and issue resolution | Monthly |
| EMP-089 | QA-MGR-001 | 2026-03 | 3.67 | Good | Consistent performance maintained | Monthly |
| EMP-089 | QA-MGR-001 | 2026-04 | 3.80 | Good | Consistent performance maintained | Monthly |
| EMP-090 | TL-FE-002 | 2026-03 | 4.45 | Good | Consistent performance maintained | Monthly |
| EMP-090 | TL-FE-002 | 2026-04 | 4.43 | Good | Meets expectations | Monthly |
| EMP-091 | TL-QA-001 | 2026-03 | 2.76 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-091 | TL-QA-001 | 2026-04 | 2.81 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-092 | QA-MGR-001 | 2026-03 | 3.15 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-092 | QA-MGR-001 | 2026-04 | 3.04 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-093 | PM-001 | 2026-03 | 5.00 | Excellent | Strong leadership and coordination | Monthly |
| EMP-093 | PM-001 | 2026-04 | 4.86 | Excellent | High learning agility and initiative | Monthly |
| EMP-094 | TL-UX-001 | 2026-03 | 3.42 | Meets Expectations | Meets expectations | Monthly |
| EMP-094 | TL-UX-001 | 2026-04 | 3.25 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-095 | PM-001 | 2026-03 | 3.83 | Good | Consistent performance maintained | Monthly |
| EMP-095 | PM-001 | 2026-04 | 3.65 | Good | Consistent performance maintained | Monthly |
| EMP-096 | TL-UX-001 | 2026-03 | 2.84 | Meets Expectations | Meets expectations | Monthly |
| EMP-096 | TL-UX-001 | 2026-04 | 2.98 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-097 | TL-BE-001 | 2026-03 | 3.20 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-097 | TL-BE-001 | 2026-04 | 3.12 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-098 | TL-BE-002 | 2026-03 | 3.62 | Good | Meets expectations | Monthly |
| EMP-098 | TL-BE-002 | 2026-04 | 3.62 | Good | Good client management and issue resolution | Monthly |
| EMP-099 | TL-BE-002 | 2026-03 | 3.39 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-099 | TL-BE-002 | 2026-04 | 3.32 | Meets Expectations | Consistent performance maintained | Monthly |
| EMP-100 | TL-FE-002 | 2026-03 | 3.80 | Good | Meets expectations | Monthly |
| EMP-100 | TL-FE-002 | 2026-04 | 3.99 | Good | Consistent delivery and accountability | Monthly |

## DS03_Timesheet_Logwork
| member\_id | report\_period | work\_days\_in\_month | days\_probation | days\_official | days\_holiday\_official | days\_leave\_approved | days\_late | days\_absent\_unapproved | actual\_work\_days | ot\_hours\_weekday | ot\_hours\_weekend | ot\_hours\_holiday | total\_ot\_hours | night\_shift\_hours |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 39 |
| EMP-001 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-002 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-002 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-003 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 4 | 0 | 0 | 4 | 0 |
| EMP-003 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 6 | 0 | 0 | 6 | 78 |
| EMP-004 | 2026-03 | 22 | 0 | 18 | 0 | 0 | 3 | 1 | 18 | 0 | 0 | 0 | 0 | 0 |
| EMP-004 | 2026-04 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 4 | 0 | 0 | 4 | 0 |
| EMP-005 | 2026-03 | 22 | 0 | 21 | 2 | 1 | 0 | 0 | 24 | 6 | 0 | 0 | 6 | 0 |
| EMP-005 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 6 | 0 | 0 | 6 | 0 |
| EMP-006 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-006 | 2026-04 | 22 | 0 | 20 | 0 | 1 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-007 | 2026-03 | 22 | 0 | 17 | 2 | 1 | 4 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-007 | 2026-04 | 22 | 0 | 16 | 0 | 1 | 4 | 1 | 17 | 2 | 0 | 0 | 2 | 0 |
| EMP-008 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 2 | 0 | 0 | 2 | 117 |
| EMP-008 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 8 | 0 | 0 | 8 | 0 |
| EMP-009 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 2 | 0 | 0 | 2 | 0 |
| EMP-009 | 2026-04 | 22 | 0 | 19 | 2 | 1 | 2 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-010 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 0 |
| EMP-010 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-011 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 4 | 0 | 0 | 4 | 0 |
| EMP-011 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 2 | 0 | 2 | 4 | 0 |
| EMP-012 | 2026-03 | 22 | 0 | 15 | 2 | 1 | 5 | 1 | 18 | 8 | 0 | 0 | 8 | 0 |
| EMP-012 | 2026-04 | 22 | 0 | 17 | 0 | 1 | 4 | 0 | 18 | 0 | 0 | 0 | 0 | 0 |
| EMP-013 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 4 | 0 | 2 | 6 | 0 |
| EMP-013 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 39 |
| EMP-014 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 15 | 0 | 0 | 15 | 117 |
| EMP-014 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 15 | 0 | 0 | 15 | 0 |
| EMP-015 | 2026-03 | 22 | 0 | 20 | 0 | 1 | 1 | 0 | 21 | 6 | 0 | 0 | 6 | 78 |
| EMP-015 | 2026-04 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 8 | 0 | 0 | 8 | 0 |
| EMP-016 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 15 | 0 | 0 | 15 | 0 |
| EMP-016 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 10 | 0 | 0 | 10 | 78 |
| EMP-017 | 2026-03 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 |
| EMP-017 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 2 | 0 | 0 | 2 | 0 |
| EMP-018 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 25 | 0 | 0 | 25 | 0 |
| EMP-018 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 10 | 0 | 0 | 10 | 0 |
| EMP-019 | 2026-03 | 22 | 0 | 19 | 0 | 0 | 3 | 0 | 19 | 4 | 0 | 0 | 4 | 39 |
| EMP-019 | 2026-04 | 22 | 0 | 18 | 2 | 1 | 2 | 1 | 21 | 0 | 0 | 2 | 2 | 0 |
| EMP-020 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 4 | 0 | 0 | 4 | 117 |
| EMP-020 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-021 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-021 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-022 | 2026-03 | 22 | 0 | 21 | 2 | 1 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 |
| EMP-022 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 39 |
| EMP-023 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 117 |
| EMP-023 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 2 | 2 | 0 |
| EMP-024 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-024 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-025 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 0 | 0 | 0 |
| EMP-025 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 2 | 2 | 0 |
| EMP-026 | 2026-03 | 22 | 0 | 20 | 2 | 1 | 1 | 0 | 23 | 0 | 0 | 2 | 2 | 0 |
| EMP-026 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 4 | 0 | 0 | 4 | 0 |
| EMP-027 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 8 | 0 | 0 | 8 | 117 |
| EMP-027 | 2026-04 | 22 | 0 | 19 | 2 | 0 | 3 | 0 | 21 | 4 | 0 | 2 | 6 | 39 |
| EMP-028 | 2026-03 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 6 | 0 | 0 | 6 | 0 |
| EMP-028 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 |
| EMP-029 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-029 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 39 |
| EMP-030 | 2026-03 | 22 | 0 | 20 | 2 | 0 | 2 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-030 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 39 |
| EMP-031 | 2026-03 | 22 | 0 | 19 | 0 | 1 | 1 | 1 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-031 | 2026-04 | 22 | 0 | 17 | 0 | 1 | 3 | 1 | 18 | 0 | 0 | 0 | 0 | 0 |
| EMP-032 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 117 |
| EMP-032 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 78 |
| EMP-033 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-033 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 0 | 0 | 0 |
| EMP-034 | 2026-03 | 22 | 0 | 20 | 2 | 0 | 2 | 0 | 22 | 0 | 0 | 2 | 2 | 0 |
| EMP-034 | 2026-04 | 22 | 0 | 20 | 2 | 0 | 2 | 0 | 22 | 6 | 0 | 0 | 6 | 78 |
| EMP-035 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 8 | 0 | 0 | 8 | 39 |
| EMP-035 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 0 |
| EMP-036 | 2026-03 | 22 | 0 | 19 | 2 | 0 | 3 | 0 | 21 | 0 | 0 | 2 | 2 | 0 |
| EMP-036 | 2026-04 | 22 | 0 | 18 | 0 | 0 | 4 | 0 | 18 | 8 | 0 | 0 | 8 | 78 |
| EMP-037 | 2026-03 | 22 | 0 | 20 | 0 | 1 | 1 | 0 | 21 | 2 | 0 | 0 | 2 | 78 |
| EMP-037 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 4 | 0 | 0 | 4 | 78 |
| EMP-038 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-038 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 0 | 0 | 0 |
| EMP-039 | 2026-03 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 6 | 0 | 0 | 6 | 39 |
| EMP-039 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 0 | 0 | 0 |
| EMP-040 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 8 | 0 | 0 | 8 | 39 |
| EMP-040 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 0 |
| EMP-041 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 0 |
| EMP-041 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-042 | 2026-03 | 22 | 0 | 19 | 0 | 1 | 2 | 0 | 20 | 6 | 0 | 0 | 6 | 117 |
| EMP-042 | 2026-04 | 22 | 0 | 19 | 0 | 1 | 2 | 0 | 20 | 4 | 0 | 0 | 4 | 0 |
| EMP-043 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 0 |
| EMP-043 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 0 |
| EMP-044 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-044 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-045 | 2026-03 | 22 | 0 | 17 | 0 | 0 | 4 | 1 | 17 | 4 | 0 | 0 | 4 | 39 |
| EMP-045 | 2026-04 | 22 | 0 | 19 | 0 | 0 | 3 | 0 | 19 | 4 | 0 | 0 | 4 | 39 |
| EMP-046 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 4 | 0 | 0 | 4 | 0 |
| EMP-046 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 2 | 2 | 0 |
| EMP-047 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 78 |
| EMP-047 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 2 | 2 | 0 |
| EMP-048 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 0 |
| EMP-048 | 2026-04 | 22 | 0 | 21 | 2 | 1 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 |
| EMP-049 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 0 |
| EMP-049 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-050 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 8 | 0 | 0 | 8 | 0 |
| EMP-050 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 6 | 0 | 0 | 6 | 0 |
| EMP-051 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 6 | 0 | 0 | 6 | 0 |
| EMP-051 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 8 | 0 | 0 | 8 | 39 |
| EMP-052 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-052 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 |
| EMP-053 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-053 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 0 |
| EMP-054 | 2026-03 | 22 | 0 | 20 | 2 | 0 | 2 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-054 | 2026-04 | 22 | 0 | 20 | 2 | 0 | 2 | 0 | 22 | 8 | 0 | 2 | 10 | 0 |
| EMP-055 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-055 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 2 | 2 | 0 |
| EMP-056 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 8 | 0 | 2 | 10 | 0 |
| EMP-056 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 2 | 2 | 0 |
| EMP-057 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 6 | 0 | 0 | 6 | 0 |
| EMP-057 | 2026-04 | 22 | 0 | 20 | 0 | 1 | 1 | 0 | 21 | 6 | 0 | 0 | 6 | 39 |
| EMP-058 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-058 | 2026-04 | 22 | 0 | 18 | 0 | 0 | 4 | 0 | 18 | 4 | 0 | 0 | 4 | 0 |
| EMP-059 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 117 |
| EMP-059 | 2026-04 | 22 | 0 | 20 | 0 | 1 | 1 | 0 | 21 | 2 | 0 | 0 | 2 | 117 |
| EMP-060 | 2026-03 | 22 | 0 | 21 | 2 | 1 | 0 | 0 | 24 | 20 | 0 | 2 | 22 | 0 |
| EMP-060 | 2026-04 | 22 | 0 | 21 | 2 | 1 | 0 | 0 | 24 | 15 | 0 | 0 | 15 | 117 |
| EMP-061 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 0 |
| EMP-061 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 2 | 2 | 0 |
| EMP-062 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-062 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-063 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 8 | 0 | 0 | 8 | 0 |
| EMP-063 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-064 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 4 | 0 | 0 | 4 | 0 |
| EMP-064 | 2026-04 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 6 | 0 | 0 | 6 | 0 |
| EMP-065 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-065 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-066 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 39 |
| EMP-066 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 2 | 0 | 0 | 2 | 39 |
| EMP-067 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 2 | 0 | 0 | 2 | 78 |
| EMP-067 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 117 |
| EMP-068 | 2026-03 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 8 | 0 | 0 | 8 | 39 |
| EMP-068 | 2026-04 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 6 | 0 | 0 | 6 | 0 |
| EMP-069 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-069 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 78 |
| EMP-070 | 2026-03 | 22 | 0 | 21 | 2 | 0 | 1 | 0 | 23 | 4 | 0 | 2 | 6 | 39 |
| EMP-070 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 39 |
| EMP-071 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 39 |
| EMP-071 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-072 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-072 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-073 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 2 | 0 | 0 | 2 | 0 |
| EMP-073 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 4 | 0 | 0 | 4 | 0 |
| EMP-074 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 2 | 0 | 0 | 2 | 0 |
| EMP-074 | 2026-04 | 22 | 0 | 19 | 0 | 1 | 2 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-075 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-075 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 6 | 0 | 0 | 6 | 39 |
| EMP-076 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 78 |
| EMP-076 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 4 | 0 | 0 | 4 | 0 |
| EMP-077 | 2026-03 | 22 | 0 | 19 | 0 | 1 | 2 | 0 | 20 | 4 | 0 | 0 | 4 | 117 |
| EMP-077 | 2026-04 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-078 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-078 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 4 | 0 | 0 | 4 | 117 |
| EMP-079 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 117 |
| EMP-079 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 39 |
| EMP-080 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-080 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-081 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 0 |
| EMP-081 | 2026-04 | 22 | 0 | 21 | 2 | 1 | 0 | 0 | 24 | 2 | 0 | 2 | 4 | 39 |
| EMP-082 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 78 |
| EMP-082 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 |
| EMP-083 | 2026-03 | 22 | 0 | 20 | 0 | 1 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-083 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-084 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-084 | 2026-04 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-085 | 2026-03 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 6 | 0 | 0 | 6 | 0 |
| EMP-085 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 4 | 0 | 0 | 4 | 78 |
| EMP-086 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 2 | 0 | 0 | 2 | 117 |
| EMP-086 | 2026-04 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 0 |
| EMP-087 | 2026-03 | 22 | 0 | 20 | 2 | 0 | 2 | 0 | 22 | 4 | 0 | 0 | 4 | 117 |
| EMP-087 | 2026-04 | 22 | 0 | 20 | 0 | 1 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-088 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-088 | 2026-04 | 22 | 0 | 19 | 0 | 1 | 2 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-089 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 2 | 0 | 0 | 2 | 78 |
| EMP-089 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 8 | 0 | 0 | 8 | 117 |
| EMP-090 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-090 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-091 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-091 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-092 | 2026-03 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-092 | 2026-04 | 22 | 0 | 19 | 2 | 1 | 2 | 0 | 22 | 8 | 0 | 2 | 10 | 78 |
| EMP-093 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-093 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 2 | 0 | 2 | 4 | 0 |
| EMP-094 | 2026-03 | 22 | 0 | 20 | 0 | 0 | 2 | 0 | 20 | 0 | 0 | 0 | 0 | 0 |
| EMP-094 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 2 | 0 | 0 | 2 | 39 |
| EMP-095 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 8 | 0 | 0 | 8 | 0 |
| EMP-095 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 2 | 0 | 2 | 4 | 78 |
| EMP-096 | 2026-03 | 22 | 0 | 20 | 2 | 0 | 2 | 0 | 22 | 8 | 0 | 2 | 10 | 117 |
| EMP-096 | 2026-04 | 22 | 0 | 22 | 2 | 0 | 0 | 0 | 24 | 4 | 0 | 0 | 4 | 0 |
| EMP-097 | 2026-03 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 0 |
| EMP-097 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |
| EMP-098 | 2026-03 | 22 | 0 | 20 | 2 | 1 | 1 | 0 | 23 | 4 | 0 | 2 | 6 | 78 |
| EMP-098 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-099 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 6 | 0 | 0 | 6 | 78 |
| EMP-099 | 2026-04 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-100 | 2026-03 | 22 | 0 | 21 | 0 | 1 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| EMP-100 | 2026-04 | 22 | 0 | 21 | 0 | 0 | 1 | 0 | 21 | 0 | 0 | 0 | 0 | 0 |

## DS04_Violation_Attitude
| violation\_id | member\_id | category | violation\_type\_code | violation\_type\_desc | severity | consequence | status | incident\_date | reported\_by | action\_taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VIO-0082 | EMP-001 | Policy | POL-04 | Failure to complete mandatory training | Low | Verbal warning | Under Review | 01/02/2024 | HR-001 | Pending |
| VIO-0056 | EMP-004 | Policy | POL-04 | Failure to complete mandatory training | High | Final warning / PIP | Resolved | 02/04/2023 | HR-001 | Escalated to HR Director |
| VIO-0055 | EMP-004 | Conduct | CON-02 | Dishonesty / falsifying records | Critical | Termination consideration | Escalated | 17/12/2025 | MGR-004 | Suspended pending investigation |
| VIO-0049 | EMP-005 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | Medium | Written warning | Under Review | 14/04/2024 | MGR-003 | Pending |
| VIO-0050 | EMP-005 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | Medium | Written warning | Resolved | 23/03/2025 | SELF | Formal notice sent |
| VIO-0094 | EMP-006 | Policy | POL-03 | Sharing confidential info externally | Critical | Termination consideration | Under Review | 13/08/2025 | MGR-001 | Pending |
| VIO-0099 | EMP-007 | Conduct | CON-01 | Harassment or inappropriate language | Critical | Termination consideration | Open | 01/03/2025 | MGR-001 | Pending |
| VIO-0093 | EMP-010 | Policy | POL-05 | Violation of dress code policy | Low | Verbal warning | Closed – No Action | 06/08/2023 | SELF | Pending |
| VIO-0010 | EMP-012 | Performance | PERF-04 | Incomplete task delivery | High | Final warning / PIP | Escalated | 14/11/2023 | PEER-ANON | PIP initiated |
| VIO-0012 | EMP-012 | Policy | POL-06 | Personal use of company resources | Critical | Termination consideration | Under Review | 24/07/2024 | PEER-ANON | Pending |
| VIO-0011 | EMP-012 | Performance | PERF-01 | Missed deadline without notice | High | Final warning / PIP | Under Review | 25/06/2024 | MGR-002 | Pending |
| VIO-0095 | EMP-013 | Policy | POL-05 | Violation of dress code policy | High | Final warning / PIP | Resolved | 20/07/2024 | MGR-001 | PIP initiated |
| VIO-0101 | EMP-014 | Conduct | CON-03 | Conflict of interest not disclosed | High | Final warning / PIP | Escalated | 21/01/2024 | SELF | Escalated to HR Director |
| VIO-0074 | EMP-015 | Policy | POL-02 | Data security policy breach | Low | Verbal warning | Resolved | 24/10/2025 | HR-002 | Coaching session conducted |
| VIO-0089 | EMP-016 | Performance | PERF-01 | Missed deadline without notice | High | Final warning / PIP | Under Review | 25/10/2023 | HR-001 | Pending |
| VIO-0063 | EMP-019 | Attendance | ATT-01 | Late arrival (>15 min) | Low | Verbal warning | Resolved | 10/01/2024 | MGR-003 | Manager reminder sent |
| VIO-0064 | EMP-019 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | Medium | Written warning | Closed – No Action | 16/09/2024 | HR-001 | Pending |
| VIO-0103 | EMP-022 | Attitude | ATT-A04 | Negative attitude affecting team morale | High | Final warning / PIP | Resolved | 26/07/2023 | HR-001 | Final warning issued |
| VIO-0083 | EMP-023 | Attendance | ATT-03 | Early departure without approval | Medium | Written warning | Resolved | 08/10/2023 | SELF | Performance coaching initiated |
| VIO-0086 | EMP-024 | Attitude | ATT-A02 | Disrespectful behavior toward manager | Medium | Written warning | Closed – No Action | 02/07/2023 | MGR-003 | Pending |
| VIO-0071 | EMP-025 | Conduct | CON-01 | Harassment or inappropriate language | High | Final warning / PIP | Open | 11/04/2024 | SELF | Pending |
| VIO-0072 | EMP-025 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | Medium | Written warning | Resolved | 25/03/2024 | MGR-001 | Formal notice sent |
| VIO-0070 | EMP-026 | Policy | POL-05 | Violation of dress code policy | Critical | Termination consideration | Open | 01/04/2024 | PEER-ANON | Pending |
| VIO-0069 | EMP-026 | Performance | PERF-01 | Missed deadline without notice | Medium | Written warning | Resolved | 11/09/2025 | SELF | Formal notice sent |
| VIO-0033 | EMP-027 | Attitude | ATT-A02 | Disrespectful behavior toward manager | Medium | Written warning | Resolved | 04/10/2024 | HR-001 | Formal notice sent |
| VIO-0035 | EMP-027 | Attendance | ATT-01 | Late arrival (>15 min) | Low | Verbal warning | Open | 09/08/2024 | MGR-004 | Pending |
| VIO-0037 | EMP-027 | Attendance | ATT-05 | Repeated tardiness (3+ times/month) | Low | Verbal warning | Under Review | 10/06/2024 | MGR-002 | Pending |
| VIO-0036 | EMP-027 | Policy | POL-05 | Violation of dress code policy | Low | Verbal warning | Closed – No Action | 19/04/2025 | MGR-004 | Pending |
| VIO-0034 | EMP-027 | Policy | POL-02 | Data security policy breach | Medium | Written warning | Resolved | 20/02/2024 | HR-001 | Performance coaching initiated |
| VIO-0092 | EMP-029 | Policy | POL-01 | Unauthorized use of company equipment | Medium | Written warning | Resolved | 28/01/2025 | MGR-001 | Performance coaching initiated |
| VIO-0107 | EMP-030 | Conduct | CON-03 | Conflict of interest not disclosed | Critical | Termination consideration | Resolved | 25/11/2025 | PEER-ANON | Termination process initiated |
| VIO-0040 | EMP-031 | Conduct | CON-04 | Working for competitor without disclosure | High | Final warning / PIP | Under Review | 08/08/2025 | HR-002 | Pending |
| VIO-0041 | EMP-031 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | High | Final warning / PIP | Under Review | 11/12/2024 | SELF | Pending |
| VIO-0042 | EMP-031 | Attitude | ATT-A01 | Disrespectful behavior toward colleague | Low | Verbal warning | Open | 14/01/2025 | MGR-002 | Pending |
| VIO-0038 | EMP-031 | Attendance | ATT-05 | Repeated tardiness (3+ times/month) | Medium | Written warning | Open | 15/11/2024 | MGR-002 | Pending |
| VIO-0039 | EMP-031 | Policy | POL-02 | Data security policy breach | Low | Verbal warning | Resolved | 24/07/2025 | SELF | Coaching session conducted |
| VIO-0067 | EMP-033 | Policy | POL-01 | Unauthorized use of company equipment | High | Final warning / PIP | Closed – No Action | 25/10/2024 | PEER-ANON | Pending |
| VIO-0068 | EMP-033 | Performance | PERF-01 | Missed deadline without notice | Medium | Written warning | Closed – No Action | 28/09/2024 | MGR-002 | Pending |
| VIO-0066 | EMP-034 | Policy | POL-03 | Sharing confidential info externally | Medium | Written warning | Resolved | 01/04/2025 | MGR-001 | Performance coaching initiated |
| VIO-0065 | EMP-034 | Attendance | ATT-03 | Early departure without approval | Medium | Written warning | Closed – No Action | 25/10/2025 | HR-001 | Pending |
| VIO-0047 | EMP-035 | Policy | POL-05 | Violation of dress code policy | Low | Verbal warning | Resolved | 12/03/2023 | SELF | Coaching session conducted |
| VIO-0048 | EMP-035 | Attitude | ATT-A01 | Disrespectful behavior toward colleague | Medium | Written warning | Closed – No Action | 23/02/2024 | MGR-003 | Pending |
| VIO-0007 | EMP-036 | Conduct | CON-04 | Working for competitor without disclosure | Critical | Termination consideration | Escalated | 01/04/2024 | MGR-003 | Legal review initiated |
| VIO-0006 | EMP-036 | Policy | POL-05 | Violation of dress code policy | Critical | Termination consideration | Under Review | 16/02/2025 | MGR-003 | Pending |
| VIO-0005 | EMP-036 | Attendance | ATT-02 | Unexcused absence | Low | Verbal warning | Under Review | 17/11/2023 | HR-001 | Pending |
| VIO-0008 | EMP-036 | Policy | POL-01 | Unauthorized use of company equipment | Low | Verbal warning | Open | 22/02/2023 | MGR-001 | Pending |
| VIO-0009 | EMP-036 | Attendance | ATT-05 | Repeated tardiness (3+ times/month) | Low | Verbal warning | Resolved | 22/02/2023 | PEER-ANON | Coaching session conducted |
| VIO-0106 | EMP-037 | Conduct | CON-03 | Conflict of interest not disclosed | Critical | Termination consideration | Open | 05/09/2024 | MGR-004 | Pending |
| VIO-0002 | EMP-038 | Attendance | ATT-04 | No check-in / check-out recorded | Low | Verbal warning | Closed – No Action | 02/01/2025 | PEER-ANON | Pending |
| VIO-0004 | EMP-038 | Policy | POL-04 | Failure to complete mandatory training | Low | Verbal warning | Closed – No Action | 07/05/2023 | MGR-001 | Pending |
| VIO-0003 | EMP-038 | Policy | POL-02 | Data security policy breach | Low | Verbal warning | Resolved | 15/11/2023 | MGR-002 | Verbal warning issued |
| VIO-0001 | EMP-038 | Policy | POL-01 | Unauthorized use of company equipment | High | Final warning / PIP | Resolved | 17/05/2023 | HR-002 | Final warning issued |
| VIO-0098 | EMP-039 | Policy | POL-02 | Data security policy breach | Critical | Termination consideration | Under Review | 17/11/2025 | PEER-ANON | Pending |
| VIO-0073 | EMP-042 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | Medium | Written warning | Under Review | 26/07/2024 | MGR-001 | Pending |
| VIO-0087 | EMP-043 | Policy | POL-03 | Sharing confidential info externally | Medium | Written warning | Closed – No Action | 19/10/2025 | HR-002 | Pending |
| VIO-0015 | EMP-045 | Conduct | CON-01 | Harassment or inappropriate language | High | Final warning / PIP | Under Review | 02/06/2025 | MGR-001 | Pending |
| VIO-0013 | EMP-045 | Conduct | CON-03 | Conflict of interest not disclosed | High | Final warning / PIP | Under Review | 12/03/2023 | HR-002 | Pending |
| VIO-0016 | EMP-045 | Conduct | CON-05 | Theft or misappropriation | Critical | Termination consideration | Open | 15/06/2023 | MGR-003 | Pending |
| VIO-0017 | EMP-045 | Conduct | CON-01 | Harassment or inappropriate language | High | Final warning / PIP | Escalated | 26/07/2024 | MGR-001 | Escalated to HR Director |
| VIO-0014 | EMP-045 | Attendance | ATT-02 | Unexcused absence | Medium | Written warning | Resolved | 28/01/2025 | HR-001 | Formal notice sent |
| VIO-0058 | EMP-046 | Performance | PERF-02 | Repeated low-quality output | Medium | Written warning | Closed – No Action | 03/03/2025 | SELF | Pending |
| VIO-0057 | EMP-046 | Attitude | ATT-A04 | Negative attitude affecting team morale | High | Final warning / PIP | Open | 26/10/2025 | MGR-001 | Pending |
| VIO-0100 | EMP-048 | Performance | PERF-02 | Repeated low-quality output | High | Final warning / PIP | Closed – No Action | 06/06/2024 | PEER-ANON | Pending |
| VIO-0085 | EMP-050 | Attitude | ATT-A02 | Disrespectful behavior toward manager | Medium | Written warning | Resolved | 06/02/2025 | MGR-002 | Performance coaching initiated |
| VIO-0062 | EMP-051 | Attendance | ATT-03 | Early departure without approval | Low | Verbal warning | Open | 11/07/2023 | PEER-ANON | Pending |
| VIO-0061 | EMP-051 | Performance | PERF-01 | Missed deadline without notice | Medium | Written warning | Under Review | 26/10/2025 | HR-001 | Pending |
| VIO-0105 | EMP-052 | Policy | POL-02 | Data security policy breach | Low | Verbal warning | Resolved | 06/01/2024 | HR-002 | Manager reminder sent |
| VIO-0043 | EMP-054 | Attendance | ATT-02 | Unexcused absence | Medium | Written warning | Under Review | 10/04/2025 | SELF | Pending |
| VIO-0044 | EMP-054 | Performance | PERF-02 | Repeated low-quality output | Medium | Written warning | Resolved | 16/10/2025 | SELF | Written warning issued |
| VIO-0059 | EMP-055 | Conduct | CON-01 | Harassment or inappropriate language | High | Final warning / PIP | Open | 05/05/2024 | MGR-003 | Pending |
| VIO-0060 | EMP-055 | Conduct | CON-02 | Dishonesty / falsifying records | Critical | Termination consideration | Escalated | 13/07/2024 | PEER-ANON | Termination process initiated |
| VIO-0051 | EMP-058 | Attendance | ATT-01 | Late arrival (>15 min) | Medium | Written warning | Resolved | 04/03/2024 | MGR-002 | Performance coaching initiated |
| VIO-0052 | EMP-058 | Attendance | ATT-03 | Early departure without approval | Low | Verbal warning | Under Review | 09/09/2023 | SELF | Pending |
| VIO-0026 | EMP-061 | Attendance | ATT-04 | No check-in / check-out recorded | Medium | Written warning | Resolved | 01/03/2024 | MGR-003 | Performance coaching initiated |
| VIO-0028 | EMP-061 | Policy | POL-05 | Violation of dress code policy | Medium | Written warning | Resolved | 13/07/2023 | PEER-ANON | Formal notice sent |
| VIO-0027 | EMP-061 | Conduct | CON-04 | Working for competitor without disclosure | Critical | Termination consideration | Escalated | 27/07/2025 | PEER-ANON | Suspended pending investigation |
| VIO-0019 | EMP-062 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | Medium | Written warning | Resolved | 18/01/2023 | HR-002 | Formal notice sent |
| VIO-0021 | EMP-062 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | High | Final warning / PIP | Under Review | 19/07/2025 | SELF | Pending |
| VIO-0020 | EMP-062 | Policy | POL-05 | Violation of dress code policy | Low | Verbal warning | Under Review | 19/09/2023 | SELF | Pending |
| VIO-0018 | EMP-062 | Attendance | ATT-04 | No check-in / check-out recorded | Low | Verbal warning | Under Review | 26/01/2023 | PEER-ANON | Pending |
| VIO-0104 | EMP-063 | Attendance | ATT-05 | Repeated tardiness (3+ times/month) | Medium | Written warning | Closed – No Action | 09/01/2023 | MGR-002 | Pending |
| VIO-0054 | EMP-064 | Attitude | ATT-A03 | Unprofessional communication (chat/email) | High | Final warning / PIP | Open | 08/03/2025 | MGR-003 | Pending |
| VIO-0053 | EMP-064 | Policy | POL-01 | Unauthorized use of company equipment | Medium | Written warning | Resolved | 19/09/2023 | HR-001 | Written warning issued |
| VIO-0081 | EMP-065 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | High | Final warning / PIP | Closed – No Action | 04/12/2024 | MGR-004 | Pending |
| VIO-0097 | EMP-066 | Conduct | CON-05 | Theft or misappropriation | Critical | Termination consideration | Resolved | 10/11/2023 | HR-001 | Legal review initiated |
| VIO-0045 | EMP-069 | Policy | POL-04 | Failure to complete mandatory training | High | Final warning / PIP | Under Review | 06/01/2023 | HR-001 | Pending |
| VIO-0046 | EMP-069 | Attendance | ATT-03 | Early departure without approval | Medium | Written warning | Resolved | 27/02/2025 | SELF | Performance coaching initiated |
| VIO-0090 | EMP-071 | Attendance | ATT-01 | Late arrival (>15 min) | Low | Verbal warning | Resolved | 28/01/2023 | MGR-004 | Coaching session conducted |
| VIO-0075 | EMP-072 | Attitude | ATT-A06 | Conflict / argument in workplace | Medium | Written warning | Resolved | 04/07/2023 | MGR-001 | Formal notice sent |
| VIO-0102 | EMP-077 | Performance | PERF-01 | Missed deadline without notice | High | Final warning / PIP | Closed – No Action | 12/09/2024 | MGR-003 | Pending |
| VIO-0076 | EMP-079 | Attitude | ATT-A05 | Refusal to follow reasonable instructions | Low | Verbal warning | Resolved | 13/04/2025 | MGR-002 | Verbal warning issued |
| VIO-0079 | EMP-081 | Attitude | ATT-A04 | Negative attitude affecting team morale | Low | Verbal warning | Resolved | 01/07/2025 | HR-002 | Manager reminder sent |
| VIO-0096 | EMP-083 | Attitude | ATT-A05 | Refusal to follow reasonable instructions | High | Final warning / PIP | Under Review | 16/03/2024 | MGR-003 | Pending |
| VIO-0080 | EMP-085 | Conduct | CON-02 | Dishonesty / falsifying records | High | Final warning / PIP | Open | 04/10/2024 | SELF | Pending |
| VIO-0031 | EMP-086 | Performance | PERF-01 | Missed deadline without notice | High | Final warning / PIP | Under Review | 05/12/2024 | HR-002 | Pending |
| VIO-0030 | EMP-086 | Policy | POL-06 | Personal use of company resources | Critical | Termination consideration | Open | 12/06/2024 | HR-002 | Pending |
| VIO-0029 | EMP-086 | Policy | POL-05 | Violation of dress code policy | Medium | Written warning | Open | 17/08/2024 | MGR-003 | Pending |
| VIO-0032 | EMP-086 | Attitude | ATT-A01 | Disrespectful behavior toward colleague | High | Final warning / PIP | Escalated | 22/02/2024 | MGR-004 | PIP initiated |
| VIO-0022 | EMP-091 | Policy | POL-06 | Personal use of company resources | Critical | Termination consideration | Escalated | 07/02/2025 | PEER-ANON | Legal review initiated |
| VIO-0025 | EMP-091 | Attitude | ATT-A03 | Unprofessional communication (chat/email) | High | Final warning / PIP | Closed – No Action | 08/08/2024 | MGR-003 | Pending |
| VIO-0023 | EMP-091 | Performance | PERF-03 | Failure to meet KPI target 2 cycles | High | Final warning / PIP | Closed – No Action | 17/09/2023 | PEER-ANON | Pending |
| VIO-0024 | EMP-091 | Performance | PERF-02 | Repeated low-quality output | High | Final warning / PIP | Under Review | 22/06/2023 | MGR-002 | Pending |
| VIO-0078 | EMP-092 | Conduct | CON-03 | Conflict of interest not disclosed | High | Final warning / PIP | Escalated | 24/02/2023 | HR-001 | Escalated to HR Director |
| VIO-0091 | EMP-093 | Attitude | ATT-A04 | Negative attitude affecting team morale | Medium | Written warning | Closed – No Action | 24/05/2023 | MGR-001 | Pending |
| VIO-0084 | EMP-096 | Policy | POL-05 | Violation of dress code policy | High | Final warning / PIP | Under Review | 05/09/2025 | HR-001 | Pending |
| VIO-0077 | EMP-097 | Attendance | ATT-05 | Repeated tardiness (3+ times/month) | Medium | Written warning | Closed – No Action | 02/02/2024 | SELF | Pending |
| VIO-0088 | EMP-099 | Conduct | CON-02 | Dishonesty / falsifying records | High | Final warning / PIP | Closed – No Action | 26/04/2024 | MGR-004 | Pending |

## DS04b_ViolationType_Ref
| category | violation\_type\_code | violation\_type\_desc | typical\_severity | typical\_consequence |
| --- | --- | --- | --- | --- |
| Attendance | ATT-01 | Late arrival (>15 min) | Low | Verbal warning |
| Attendance | ATT-02 | Unexcused absence | Low | Verbal warning |
| Attendance | ATT-03 | Early departure without approval | Low | Verbal warning |
| Attendance | ATT-04 | No check-in / check-out recorded | Low | Verbal warning |
| Attendance | ATT-05 | Repeated tardiness (3+ times/month) | Low | Verbal warning |
| Attitude | ATT-A01 | Disrespectful behavior toward colleague | Medium | Written warning |
| Attitude | ATT-A02 | Disrespectful behavior toward manager | Medium | Written warning |
| Attitude | ATT-A03 | Unprofessional communication (chat/email) | Medium | Written warning |
| Attitude | ATT-A04 | Negative attitude affecting team morale | Medium | Written warning |
| Attitude | ATT-A05 | Refusal to follow reasonable instructions | Medium | Written warning |
| Attitude | ATT-A06 | Conflict / argument in workplace | Medium | Written warning |
| Performance | PERF-01 | Missed deadline without notice | Medium | Written warning |
| Performance | PERF-02 | Repeated low-quality output | Medium | Written warning |
| Performance | PERF-03 | Failure to meet KPI target 2 cycles | Medium | Written warning |
| Performance | PERF-04 | Incomplete task delivery | Medium | Written warning |
| Policy | POL-01 | Unauthorized use of company equipment | Medium | Written warning |
| Policy | POL-02 | Data security policy breach | Medium | Written warning |
| Policy | POL-03 | Sharing confidential info externally | Medium | Written warning |
| Policy | POL-04 | Failure to complete mandatory training | Medium | Written warning |
| Policy | POL-05 | Violation of dress code policy | Medium | Written warning |
| Policy | POL-06 | Personal use of company resources | Medium | Written warning |
| Conduct | CON-01 | Harassment or inappropriate language | High | Final warning / PIP |
| Conduct | CON-02 | Dishonesty / falsifying records | High | Final warning / PIP |
| Conduct | CON-03 | Conflict of interest not disclosed | High | Final warning / PIP |
| Conduct | CON-04 | Working for competitor without disclosure | High | Final warning / PIP |
| Conduct | CON-05 | Theft or misappropriation | High | Final warning / PIP |

## DS04c_Violation_Summary
| member\_id | total\_violations | critical\_count | high\_count | medium\_count | low\_count | open\_cases | risk\_flag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | 1 | 0 | 0 | 0 | 1 | 1 | 🟢 Minor |
| EMP-002 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-003 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-004 | 2 | 1 | 1 | 0 | 0 | 1 | 🔴 High Risk |
| EMP-005 | 2 | 0 | 0 | 2 | 0 | 1 | 🟡 Watch |
| EMP-006 | 1 | 1 | 0 | 0 | 0 | 1 | 🔴 High Risk |
| EMP-007 | 1 | 1 | 0 | 0 | 0 | 1 | 🔴 High Risk |
| EMP-008 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-009 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-010 | 1 | 0 | 0 | 0 | 1 | 0 | 🟢 Minor |
| EMP-011 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-012 | 3 | 1 | 2 | 0 | 0 | 3 | 🔴 High Risk |
| EMP-013 | 1 | 0 | 1 | 0 | 0 | 0 | 🟡 Watch |
| EMP-014 | 1 | 0 | 1 | 0 | 0 | 1 | 🟡 Watch |
| EMP-015 | 1 | 0 | 0 | 0 | 1 | 0 | 🟢 Minor |
| EMP-016 | 1 | 0 | 1 | 0 | 0 | 1 | 🟡 Watch |
| EMP-017 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-018 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-019 | 2 | 0 | 0 | 1 | 1 | 0 | 🟡 Watch |
| EMP-020 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-021 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-022 | 1 | 0 | 1 | 0 | 0 | 0 | 🟡 Watch |
| EMP-023 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-024 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-025 | 2 | 0 | 1 | 1 | 0 | 1 | 🟡 Watch |
| EMP-026 | 2 | 1 | 0 | 1 | 0 | 1 | 🔴 High Risk |
| EMP-027 | 5 | 0 | 0 | 2 | 3 | 2 | 🔴 High Risk |
| EMP-028 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-029 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-030 | 1 | 1 | 0 | 0 | 0 | 0 | 🔴 High Risk |
| EMP-031 | 5 | 0 | 2 | 1 | 2 | 4 | 🔴 High Risk |
| EMP-032 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-033 | 2 | 0 | 1 | 1 | 0 | 0 | 🟡 Watch |
| EMP-034 | 2 | 0 | 0 | 2 | 0 | 0 | 🟡 Watch |
| EMP-035 | 2 | 0 | 0 | 1 | 1 | 0 | 🟡 Watch |
| EMP-036 | 5 | 2 | 0 | 0 | 3 | 4 | 🔴 High Risk |
| EMP-037 | 1 | 1 | 0 | 0 | 0 | 1 | 🔴 High Risk |
| EMP-038 | 4 | 0 | 1 | 0 | 3 | 0 | 🔴 High Risk |
| EMP-039 | 1 | 1 | 0 | 0 | 0 | 1 | 🔴 High Risk |
| EMP-040 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-041 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-042 | 1 | 0 | 0 | 1 | 0 | 1 | 🟢 Minor |
| EMP-043 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-044 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-045 | 5 | 1 | 3 | 1 | 0 | 4 | 🔴 High Risk |
| EMP-046 | 2 | 0 | 1 | 1 | 0 | 1 | 🟡 Watch |
| EMP-047 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-048 | 1 | 0 | 1 | 0 | 0 | 0 | 🟡 Watch |
| EMP-049 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-050 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-051 | 2 | 0 | 0 | 1 | 1 | 2 | 🟡 Watch |
| EMP-052 | 1 | 0 | 0 | 0 | 1 | 0 | 🟢 Minor |
| EMP-053 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-054 | 2 | 0 | 0 | 2 | 0 | 1 | 🟡 Watch |
| EMP-055 | 2 | 1 | 1 | 0 | 0 | 2 | 🔴 High Risk |
| EMP-056 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-057 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-058 | 2 | 0 | 0 | 1 | 1 | 1 | 🟡 Watch |
| EMP-059 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-060 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-061 | 3 | 1 | 0 | 2 | 0 | 1 | 🔴 High Risk |
| EMP-062 | 4 | 0 | 1 | 1 | 2 | 3 | 🔴 High Risk |
| EMP-063 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-064 | 2 | 0 | 1 | 1 | 0 | 1 | 🟡 Watch |
| EMP-065 | 1 | 0 | 1 | 0 | 0 | 0 | 🟡 Watch |
| EMP-066 | 1 | 1 | 0 | 0 | 0 | 0 | 🔴 High Risk |
| EMP-067 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-068 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-069 | 2 | 0 | 1 | 1 | 0 | 1 | 🟡 Watch |
| EMP-070 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-071 | 1 | 0 | 0 | 0 | 1 | 0 | 🟢 Minor |
| EMP-072 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-073 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-074 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-075 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-076 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-077 | 1 | 0 | 1 | 0 | 0 | 0 | 🟡 Watch |
| EMP-078 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-079 | 1 | 0 | 0 | 0 | 1 | 0 | 🟢 Minor |
| EMP-080 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-081 | 1 | 0 | 0 | 0 | 1 | 0 | 🟢 Minor |
| EMP-082 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-083 | 1 | 0 | 1 | 0 | 0 | 1 | 🟡 Watch |
| EMP-084 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-085 | 1 | 0 | 1 | 0 | 0 | 1 | 🟡 Watch |
| EMP-086 | 4 | 1 | 2 | 1 | 0 | 4 | 🔴 High Risk |
| EMP-087 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-088 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-089 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-090 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-091 | 4 | 1 | 3 | 0 | 0 | 2 | 🔴 High Risk |
| EMP-092 | 1 | 0 | 1 | 0 | 0 | 1 | 🟡 Watch |
| EMP-093 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-094 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-095 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-096 | 1 | 0 | 1 | 0 | 0 | 1 | 🟡 Watch |
| EMP-097 | 1 | 0 | 0 | 1 | 0 | 0 | 🟢 Minor |
| EMP-098 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| EMP-099 | 1 | 0 | 1 | 0 | 0 | 0 | 🟡 Watch |
| EMP-100 | 0 | 0 | 0 | 0 | 0 | 0 | — |

## DS05_Promotion_Intent
| member\_id | current\_level | target\_level | readiness\_score |
| --- | --- | --- | --- |
| EMP-001 | L4 | L5 | 0.86 |
| EMP-002 | L2 | L3 | 0.55 |
| EMP-003 | L6 | L7 | 0.92 |
| EMP-004 | L5 | L6 | 0.55 |
| EMP-005 | L6 | L7 | 0.67 |
| EMP-006 | L4 | L5 | 0.51 |
| EMP-007 | L3 | L4 | 0.56 |
| EMP-008 | L1 | L2 | 0.29 |
| EMP-009 | L4 | L5 | 0.63 |
| EMP-010 | L1 | L2 | 0.65 |
| EMP-011 | L1 | L2 | 0.95 |
| EMP-012 | L3 | L4 | 0.54 |
| EMP-013 | L5 | L6 | 0.51 |
| EMP-014 | L3 | L4 | 0.55 |
| EMP-015 | L2 | L3 | 0.61 |
| EMP-016 | L4 | L5 | 0.54 |
| EMP-017 | L4 | L5 | 0.47 |
| EMP-018 | L1 | L2 | 0.61 |
| EMP-019 | L3 | L4 | 0.51 |
| EMP-020 | L1 | L2 | 0.53 |
| EMP-021 | L4 | L5 | 0.56 |
| EMP-022 | L2 | L3 | 0.09 |
| EMP-023 | L7 | L8 | 0.69 |
| EMP-024 | L5 | L6 | 0.79 |
| EMP-025 | L3 | L4 | 0.33 |
| EMP-026 | L3 | L4 | 0.08 |
| EMP-027 | L6 | L7 | 0.52 |
| EMP-028 | L4 | L5 | 0.13 |
| EMP-029 | L6 | L7 | 0.71 |
| EMP-030 | L5 | L6 | 0.63 |
| EMP-031 | L4 | L5 | 0.49 |
| EMP-032 | L1 | L2 | 0.66 |
| EMP-033 | L3 | L4 | 0.67 |
| EMP-034 | L3 | L4 | 0.65 |
| EMP-035 | L2 | L3 | 0.52 |
| EMP-036 | L4 | L5 | 0.64 |
| EMP-037 | L4 | L5 | 0.56 |
| EMP-038 | L5 | L6 | 0.71 |
| EMP-039 | L5 | L6 | 0.58 |
| EMP-040 | L4 | L5 | 0.70 |
| EMP-041 | L1 | L2 | 0.35 |
| EMP-042 | L2 | L3 | 0.49 |
| EMP-043 | L5 | L6 | 0.61 |
| EMP-044 | L1 | L2 | 0.73 |
| EMP-045 | L4 | L5 | 0.84 |
| EMP-046 | L4 | L5 | 0.60 |
| EMP-047 | L2 | L3 | 0.59 |
| EMP-048 | L6 | L7 | 0.73 |
| EMP-049 | L4 | L5 | 0.68 |
| EMP-050 | L2 | L3 | 0.32 |
| EMP-051 | L7 | L8 | 0.61 |
| EMP-052 | L3 | L4 | 0.63 |
| EMP-053 | L3 | L4 | 0.67 |
| EMP-054 | L2 | L3 | 0.86 |
| EMP-055 | L2 | L3 | 0.51 |
| EMP-056 | L5 | L6 | 0.27 |
| EMP-057 | L3 | L4 | 0.32 |
| EMP-058 | L4 | L5 | 0.75 |
| EMP-059 | L2 | L3 | 0.80 |
| EMP-060 | L4 | L5 | 0.72 |
| EMP-061 | L3 | L4 | 0.68 |
| EMP-062 | L2 | L3 | 0.74 |
| EMP-063 | L1 | L2 | 0.42 |
| EMP-064 | L4 | L5 | 0.25 |
| EMP-065 | L3 | L4 | 0.93 |
| EMP-066 | L2 | L3 | 0.53 |
| EMP-067 | L6 | L7 | 0.72 |
| EMP-068 | L5 | L6 | 0.08 |
| EMP-069 | L5 | L6 | 0.51 |
| EMP-070 | L3 | L4 | 0.70 |
| EMP-071 | L4 | L5 | 0.52 |
| EMP-072 | L3 | L4 | 0.55 |
| EMP-073 | L2 | L3 | 0.53 |
| EMP-074 | L5 | L6 | 0.53 |
| EMP-075 | L5 | L6 | 0.64 |
| EMP-076 | L4 | L5 | 0.67 |
| EMP-077 | L5 | L6 | 0.65 |
| EMP-078 | L6 | L7 | 0.72 |
| EMP-079 | L3 | L4 | 0.45 |
| EMP-080 | L6 | L7 | 0.70 |
| EMP-081 | L5 | L6 | 0.70 |
| EMP-082 | L3 | L4 | 0.13 |
| EMP-083 | L4 | L5 | 0.68 |
| EMP-084 | L7 | L8 | 0.61 |
| EMP-085 | L3 | L4 | 0.07 |
| EMP-086 | L4 | L5 | 0.79 |
| EMP-087 | L6 | L7 | 0.46 |
| EMP-088 | L2 | L3 | 0.68 |
| EMP-089 | L5 | L6 | 0.73 |
| EMP-090 | L4 | L5 | 0.87 |
| EMP-091 | L5 | L6 | 0.46 |
| EMP-092 | L4 | L5 | 0.73 |
| EMP-093 | L6 | L7 | 0.86 |
| EMP-094 | L6 | L7 | 0.62 |
| EMP-095 | L3 | L4 | 0.51 |
| EMP-096 | L2 | L3 | 0.35 |
| EMP-097 | L3 | L4 | 0.67 |
| EMP-098 | L3 | L4 | 0.61 |
| EMP-099 | L5 | L6 | 0.74 |
| EMP-100 | L5 | L6 | 0.53 |

## DS06_Salary_Band
| member\_id | salary\_band | effective\_date |
| --- | --- | --- |
| EMP-001 | Band C | 2025-01-01 |
| EMP-002 | Band A | 2025-01-01 |
| EMP-003 | Band E | 2024-01-01 |
| EMP-004 | Band D | 2024-02-01 |
| EMP-005 | Band E | 2022-10-01 |
| EMP-006 | Band C | 2025-06-01 |
| EMP-007 | Band B | 2025-12-01 |
| EMP-008 | Band A | 2025-10-01 |
| EMP-009 | Band C | 2025-11-01 |
| EMP-010 | Band A | 2023-03-01 |
| EMP-011 | Band A | 2024-04-01 |
| EMP-012 | Band B | 2025-04-01 |
| EMP-013 | Band D | 2025-10-01 |
| EMP-014 | Band B | 2023-12-01 |
| EMP-015 | Band A | 2022-11-01 |
| EMP-016 | Band C | 2025-04-01 |
| EMP-017 | Band C | 2023-03-01 |
| EMP-018 | Band A | 2024-12-01 |
| EMP-019 | Band B | 2025-09-01 |
| EMP-020 | Band A | 2023-10-01 |
| EMP-021 | Band C | 2025-03-01 |
| EMP-022 | Band A | 2025-03-01 |
| EMP-023 | Band F | 2024-11-01 |
| EMP-024 | Band D | 2024-04-01 |
| EMP-025 | Band B | 2023-11-01 |
| EMP-026 | Band B | 2022-06-01 |
| EMP-027 | Band E | 2025-10-01 |
| EMP-028 | Band C | 2023-05-01 |
| EMP-029 | Band E | 2023-01-01 |
| EMP-030 | Band D | 2022-02-01 |
| EMP-031 | Band C | 2023-07-01 |
| EMP-032 | Band A | 2025-07-01 |
| EMP-033 | Band B | 2023-04-01 |
| EMP-034 | Band B | 2024-08-01 |
| EMP-035 | Band A | 2023-11-01 |
| EMP-036 | Band C | 2025-08-01 |
| EMP-037 | Band C | 2022-08-01 |
| EMP-038 | Band D | 2025-05-01 |
| EMP-039 | Band D | 2024-03-01 |
| EMP-040 | Band C | 2024-10-01 |
| EMP-041 | Band A | 2023-08-01 |
| EMP-042 | Band A | 2025-01-01 |
| EMP-043 | Band D | 2025-07-01 |
| EMP-044 | Band A | 2025-01-01 |
| EMP-045 | Band C | 2024-06-01 |
| EMP-046 | Band C | 2023-02-01 |
| EMP-047 | Band A | 2024-01-01 |
| EMP-048 | Band E | 2025-10-01 |
| EMP-049 | Band C | 2025-06-01 |
| EMP-050 | Band A | 2022-09-01 |
| EMP-051 | Band F | 2025-02-01 |
| EMP-052 | Band B | 2025-12-01 |
| EMP-053 | Band B | 2023-04-01 |
| EMP-054 | Band A | 2024-01-01 |
| EMP-055 | Band A | 2025-02-01 |
| EMP-056 | Band D | 2023-02-01 |
| EMP-057 | Band B | 2024-10-01 |
| EMP-058 | Band C | 2025-12-01 |
| EMP-059 | Band A | 2023-07-01 |
| EMP-060 | Band C | 2025-02-01 |
| EMP-061 | Band B | 2025-01-01 |
| EMP-062 | Band A | 2025-11-01 |
| EMP-063 | Band A | 2024-11-01 |
| EMP-064 | Band C | 2025-07-01 |
| EMP-065 | Band B | 2025-02-01 |
| EMP-066 | Band A | 2025-11-01 |
| EMP-067 | Band E | 2024-02-01 |
| EMP-068 | Band D | 2025-06-01 |
| EMP-069 | Band D | 2025-12-01 |
| EMP-070 | Band B | 2022-09-01 |
| EMP-071 | Band C | 2025-11-01 |
| EMP-072 | Band B | 2022-07-01 |
| EMP-073 | Band A | 2025-10-01 |
| EMP-074 | Band D | 2024-11-01 |
| EMP-075 | Band D | 2025-12-01 |
| EMP-076 | Band C | 2022-11-01 |
| EMP-077 | Band D | 2025-11-01 |
| EMP-078 | Band E | 2025-12-01 |
| EMP-079 | Band B | 2025-05-01 |
| EMP-080 | Band E | 2024-02-01 |
| EMP-081 | Band D | 2024-02-01 |
| EMP-082 | Band B | 2023-01-01 |
| EMP-083 | Band C | 2025-10-01 |
| EMP-084 | Band F | 2023-06-01 |
| EMP-085 | Band B | 2023-11-01 |
| EMP-086 | Band C | 2023-04-01 |
| EMP-087 | Band E | 2023-01-01 |
| EMP-088 | Band A | 2025-08-01 |
| EMP-089 | Band D | 2022-08-01 |
| EMP-090 | Band C | 2024-07-01 |
| EMP-091 | Band D | 2025-08-01 |
| EMP-092 | Band C | 2025-02-01 |
| EMP-093 | Band E | 2022-07-01 |
| EMP-094 | Band E | 2022-06-01 |
| EMP-095 | Band B | 2025-12-01 |
| EMP-096 | Band A | 2023-12-01 |
| EMP-097 | Band B | 2025-10-01 |
| EMP-098 | Band B | 2024-04-01 |
| EMP-099 | Band D | 2024-01-01 |
| EMP-100 | Band D | 2023-09-01 |

## DS07_Performance_NORM
| norm\_id | category | rule\_description | threshold | classification\_label | action\_if\_triggered | priority | applies\_to |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NORM-P01 | KPI Score | Monthly performance score — Excellent | >= 4.5 | Excellent | Highlight in report; eligible for outstanding recognition | High | All employees |
| NORM-P02 | KPI Score | Monthly performance score — Good | 3.5 – 4.49 | Good | No action required; standard recognition | Medium | All employees |
| NORM-P03 | KPI Score | Monthly performance score — Meets Expectations | 2.5 – 3.49 | Meets Expectations | Monitor next cycle; optional coaching | Medium | All employees |
| NORM-P04 | KPI Score | Monthly performance score — Below Expectations | 1.5 – 2.49 | Below Expectations | Trigger PIP discussion with manager; flag to HR | High | All employees |
| NORM-P05 | KPI Score | Monthly performance score — Unsatisfactory | < 1.5 | Unsatisfactory | Escalate to HR Director; formal performance review required | Critical | All employees |
| NORM-P06 | KPI Score | Consecutive below-expectations rating (2 cycles) | Score < 2.5 for 2 consecutive months | At Risk | Mandatory PIP initiated; HR and direct manager notified | Critical | All employees |
| NORM-T01 | Timesheet | Full attendance — no absence or late | absent\_days=0 AND late\_days=0 | Compliant | Standard — no action | Low | All employees |
| NORM-T02 | Timesheet | Late arrival threshold | late\_days >= 3 in a month | Lateness Pattern | Verbal warning issued; flag to manager | Medium | All employees |
| NORM-T03 | Timesheet | Unapproved absence threshold | absent\_unapproved\_days >= 1 | Absence Violation | Written warning; escalate if repeated next month | High | All employees |
| NORM-T04 | Timesheet | Overloaded OT flag | total\_ot\_hours > 40 in a month | OT Overload | HR to verify workload; check resource allocation balance | Medium | All employees |
| NORM-T05 | Timesheet | Low actual work days vs expected | actual\_work\_days < 0.9 \* work\_days\_in\_month AND no leave approved | Attendance Gap | Flag to HR; request explanation from employee | High | All employees |
| NORM-R01 | Resource Allocation | Over-allocated employee | sum(allocation\_pct) > 1.2 (120%) | Overloaded | Alert to manager; review task redistribution within 1 week | High | All employees |
| NORM-R02 | Resource Allocation | Benched employee exceeding idle threshold | assignment\_type = Bench AND bench\_duration > 30 days | Bench Risk | Escalate to DM; assign to internal project or training | Medium | All employees |
| NORM-R03 | Resource Allocation | Multi-project employee — performance monitoring required | work\_on\_other = Yes AND allocation\_pct < 0.5 on main account | Split Focus | Flag for manager review; validate KPI context | Low | All employees |
| NORM-V01 | Violation | Critical violation — immediate escalation required | severity = Critical | Critical Risk | Suspend pending investigation; notify HR Director + Legal | Critical | All employees |
| NORM-V02 | Violation | High severity violation | severity = High | High Risk | Final warning / PIP initiated; notify HR within 48h | High | All employees |
| NORM-V03 | Violation | Medium severity violation | severity = Medium | Medium Risk | Written warning issued; document in HR record | Medium | All employees |
| NORM-V04 | Violation | Low severity violation | severity = Low | Minor | Verbal warning; manager reminder | Low | All employees |
| NORM-V05 | Violation | Multiple open violations | open\_cases >= 3 | Escalation Required | Automatic escalation to HR Director; PIP or exit review | Critical | All employees |
| NORM-V06 | Violation | Repeated same violation category (2+ times) | same category violation\_count >= 2 | Repeat Offender | Upgrade severity by one level; mandatory HR review | High | All employees |
| NORM-C01 | Composite Risk | Low KPI + Violation in same review period | Score < 2.5 AND has\_violation = True | Dual Risk Flag | Combined HR and manager review required within 5 business days | Critical | All employees |
| NORM-C02 | Composite Risk | High performer with violation — context required | Score >= 4.5 AND has\_critical\_violation = True | Context Review | Do not auto-penalize; require manager + HR joint review | High | All employees |
| NORM-C03 | Composite Risk | Bench + Low score = talent risk | assignment\_type = Bench AND score < 3.0 | Talent Risk | Priority reassignment or exit discussion with HR | High | All employees |
| NORM-C04 | Composite Risk | Multi-period downward performance trend | score decline for 3+ consecutive months | Downward Trend | Mandatory performance improvement plan; notify BOD if senior level | High | Senior employees (L5+) |
| NORM-G01 | Report Guard | Do not conclude final performance without reviewer sign-off | reviewer\_id must be non-null AND report\_period must be closed | Guard | Block report section; flag as pending review | High | All report outputs |
| NORM-G02 | Report Guard | Salary data — restricted access | salary\_band exposed only to authorized\_roles | Access Control | Mask salary\_band if user role != HR or BOD | Critical | Salary data |
| NORM-G03 | Report Guard | Avoid biased language in attitude assessment | qualitative fields must not contain direct judgment of character | Language Guard | Flag for L&D/HR editorial review before report distribution | Medium | Qualitative feedback fields |

## DS08_Perf_Profile_Agg
| member\_id | avg\_score\_t3\_t4 | classification\_latest | ts\_compliance\_t4 | total\_ot\_hours\_t4 | violation\_risk\_flag | open\_violation\_count | allocation\_status | readiness\_score | salary\_band | perf\_risk\_note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | 4.47 | Good | Compliant | 8 | 🟢 Minor | 1 | Active | 0.86 | Band C | No flags |
| EMP-002 | 3.83 | Good | Compliant | 8 | — | 0 | Active | 0.55 | Band A | No flags |
| EMP-003 | 4.93 | Excellent | Compliant | 6 | — | 0 | Active | 0.92 | Band E | Top Performer |
| EMP-004 | 1.70 | Below Expectations | Minor Late | 4 | 🔴 High Risk | 1 | Active | 0.55 | Band D | Low KPI (<2.5); High-Risk Violation |
| EMP-005 | 4.00 | Good | Minor Late | 6 | 🟡 Watch | 1 | Active | 0.67 | Band E | No flags |
| EMP-006 | 3.61 | Good | Minor Late | 0 | 🔴 High Risk | 1 | Active | 0.51 | Band C | High-Risk Violation |
| EMP-007 | 3.34 | Meets Expectations | Unapproved Absence | 2 | 🔴 High Risk | 1 | Active | 0.56 | Band B | High-Risk Violation; Absence Violation |
| EMP-008 | 2.13 | Below Expectations | Minor Late | 8 | — | 0 | Active | 0.29 | Band A | Low KPI (<2.5) |
| EMP-009 | 3.76 | Good | Minor Late | 0 | — | 0 | Bench | 0.63 | Band C | Benched |
| EMP-010 | 3.67 | Good | Compliant | 0 | 🟢 Minor | 0 | Active | 0.65 | Band A | No flags |
| EMP-011 | 4.82 | Excellent | Compliant | 4 | — | 0 | Active | 0.95 | Band A | Top Performer |
| EMP-012 | 2.00 | Below Expectations | Late Pattern | 0 | 🔴 High Risk | 3 | Active | 0.54 | Band B | Low KPI (<2.5); Multiple Open Violations; Lateness Pattern |
| EMP-013 | 3.05 | Meets Expectations | Compliant | 6 | 🟡 Watch | 0 | Active | 0.51 | Band D | No flags |
| EMP-014 | 3.96 | Good | Compliant | 15 | 🟡 Watch | 1 | Under-allocated | 0.55 | Band B | No flags |
| EMP-015 | 3.48 | Meets Expectations | Minor Late | 8 | 🟢 Minor | 0 | Active | 0.61 | Band A | No flags |
| EMP-016 | 3.46 | Good | Minor Late | 10 | 🟡 Watch | 1 | Active | 0.54 | Band C | No flags |
| EMP-017 | 3.01 | Meets Expectations | Minor Late | 2 | — | 0 | Bench | 0.47 | Band C | Benched |
| EMP-018 | 4.11 | Good | Compliant | 10 | — | 0 | Active | 0.61 | Band A | No flags |
| EMP-019 | 3.97 | Good | Unapproved Absence | 2 | 🟡 Watch | 0 | Active | 0.51 | Band B | Absence Violation |
| EMP-020 | 3.60 | Good | Compliant | 0 | — | 0 | Active | 0.53 | Band A | No flags |
| EMP-021 | 3.87 | Good | Compliant | 0 | — | 0 | Active | 0.56 | Band C | No flags |
| EMP-022 | 1.27 | Poor | Compliant | 6 | 🟡 Watch | 0 | Bench | 0.09 | Band A | Low KPI (<2.5); Benched |
| EMP-023 | 3.97 | Good | Minor Late | 2 | 🟢 Minor | 0 | Active | 0.69 | Band F | No flags |
| EMP-024 | 4.72 | Excellent | Compliant | 8 | 🟢 Minor | 0 | Active | 0.79 | Band D | Top Performer |
| EMP-025 | 2.14 | Below Expectations | Minor Late | 2 | 🟡 Watch | 1 | Active | 0.33 | Band B | Low KPI (<2.5) |
| EMP-026 | 1.85 | Below Expectations | Compliant | 4 | 🔴 High Risk | 1 | Active | 0.08 | Band B | Low KPI (<2.5); High-Risk Violation |
| EMP-027 | 3.58 | Good | Late Pattern | 6 | 🔴 High Risk | 2 | Active | 0.52 | Band E | High-Risk Violation; Lateness Pattern |
| EMP-028 | 1.52 | Below Expectations | Compliant | 0 | — | 0 | Under-allocated | 0.13 | Band C | Low KPI (<2.5) |
| EMP-029 | 3.96 | Good | Compliant | 6 | 🟢 Minor | 0 | Bench | 0.71 | Band E | Benched |
| EMP-030 | 4.41 | Good | Compliant | 8 | 🔴 High Risk | 0 | Bench | 0.63 | Band D | High-Risk Violation; Benched |
| EMP-031 | 2.25 | Below Expectations | Unapproved Absence | 0 | 🔴 High Risk | 4 | Active | 0.49 | Band C | Low KPI (<2.5); Multiple Open Violations; Absence Violation |
| EMP-032 | 3.82 | Good | Compliant | 6 | — | 0 | Active | 0.66 | Band A | No flags |
| EMP-033 | 3.56 | Good | Minor Late | 0 | 🟡 Watch | 0 | Active | 0.67 | Band B | No flags |
| EMP-034 | 3.59 | Good | Minor Late | 6 | 🟡 Watch | 0 | Active | 0.65 | Band B | No flags |
| EMP-035 | 3.77 | Good | Compliant | 2 | 🟡 Watch | 0 | Active | 0.52 | Band A | No flags |
| EMP-036 | 3.84 | Good | Late Pattern | 8 | 🔴 High Risk | 4 | Active | 0.64 | Band C | Multiple Open Violations; Lateness Pattern |
| EMP-037 | 3.19 | Meets Expectations | Compliant | 4 | 🔴 High Risk | 1 | Active | 0.56 | Band C | High-Risk Violation |
| EMP-038 | 3.30 | Meets Expectations | Minor Late | 0 | 🔴 High Risk | 0 | Active | 0.71 | Band D | High-Risk Violation |
| EMP-039 | 3.14 | Meets Expectations | Minor Late | 0 | 🔴 High Risk | 1 | Active | 0.58 | Band D | High-Risk Violation |
| EMP-040 | 3.27 | Meets Expectations | Compliant | 6 | — | 0 | Active | 0.70 | Band C | No flags |
| EMP-041 | 3.18 | Meets Expectations | Compliant | 8 | — | 0 | Active | 0.35 | Band A | No flags |
| EMP-042 | 2.88 | Meets Expectations | Minor Late | 4 | 🟢 Minor | 1 | Active | 0.49 | Band A | No flags |
| EMP-043 | 3.40 | Meets Expectations | Compliant | 2 | 🟢 Minor | 0 | Bench | 0.61 | Band D | Benched |
| EMP-044 | 3.10 | Meets Expectations | Compliant | 0 | — | 0 | Active | 0.73 | Band A | No flags |
| EMP-045 | 5.00 | Excellent | Late Pattern | 4 | 🔴 High Risk | 4 | Active | 0.84 | Band C | Top Performer; Multiple Open Violations; Lateness Pattern |
| EMP-046 | 3.83 | Good | Compliant | 2 | 🟡 Watch | 1 | Active | 0.60 | Band C | No flags |
| EMP-047 | 3.95 | Good | Compliant | 2 | — | 0 | Under-allocated | 0.59 | Band A | No flags |
| EMP-048 | 3.99 | Good | Compliant | 0 | 🟡 Watch | 0 | Active | 0.73 | Band E | No flags |
| EMP-049 | 3.70 | Good | Compliant | 0 | — | 0 | Active | 0.68 | Band C | No flags |
| EMP-050 | 2.57 | Meets Expectations | Minor Late | 6 | 🟢 Minor | 0 | Under-allocated | 0.32 | Band A | No flags |
| EMP-051 | 3.89 | Good | Minor Late | 8 | 🟡 Watch | 2 | Bench | 0.61 | Band F | Benched |
| EMP-052 | 3.99 | Good | Compliant | 0 | 🟢 Minor | 0 | Under-allocated | 0.63 | Band B | No flags |
| EMP-053 | 4.04 | Good | Compliant | 6 | — | 0 | Active | 0.67 | Band B | No flags |
| EMP-054 | 4.13 | Good | Minor Late | 10 | 🟡 Watch | 1 | Active | 0.86 | Band A | No flags |
| EMP-055 | 3.19 | Meets Expectations | Minor Late | 2 | 🔴 High Risk | 2 | Active | 0.51 | Band A | High-Risk Violation |
| EMP-056 | 2.91 | Meets Expectations | Compliant | 2 | — | 0 | Active | 0.27 | Band D | No flags |
| EMP-057 | 3.02 | Meets Expectations | Minor Late | 6 | — | 0 | Active | 0.32 | Band B | No flags |
| EMP-058 | 4.38 | Good | Late Pattern | 4 | 🟡 Watch | 1 | Active | 0.75 | Band C | Lateness Pattern |
| EMP-059 | 4.39 | Good | Minor Late | 2 | — | 0 | Active | 0.80 | Band A | No flags |
| EMP-060 | 3.91 | Good | Compliant | 15 | — | 0 | Active | 0.72 | Band C | No flags |
| EMP-061 | 3.96 | Good | Compliant | 2 | 🔴 High Risk | 1 | Active | 0.68 | Band B | High-Risk Violation |
| EMP-062 | 3.69 | Good | Compliant | 0 | 🔴 High Risk | 3 | Bench | 0.74 | Band A | Multiple Open Violations; Benched |
| EMP-063 | 2.40 | Below Expectations | Compliant | 0 | 🟢 Minor | 0 | Active | 0.42 | Band A | Low KPI (<2.5) |
| EMP-064 | 3.05 | Meets Expectations | Minor Late | 6 | 🟡 Watch | 1 | Active | 0.25 | Band C | No flags |
| EMP-065 | 4.73 | Excellent | Minor Late | 0 | 🟡 Watch | 0 | Active | 0.93 | Band B | Top Performer |
| EMP-066 | 3.76 | Good | Minor Late | 2 | 🔴 High Risk | 0 | Active | 0.53 | Band A | High-Risk Violation |
| EMP-067 | 3.33 | Meets Expectations | Compliant | 2 | — | 0 | Active | 0.72 | Band E | No flags |
| EMP-068 | 1.20 | Poor | Minor Late | 6 | — | 0 | Active | 0.08 | Band D | Low KPI (<2.5) |
| EMP-069 | 3.59 | Good | Compliant | 2 | 🟡 Watch | 1 | Active | 0.51 | Band D | No flags |
| EMP-070 | 3.55 | Good | Compliant | 2 | — | 0 | Bench | 0.70 | Band B | Benched |
| EMP-071 | 3.93 | Good | Compliant | 0 | 🟢 Minor | 0 | Active | 0.52 | Band C | No flags |
| EMP-072 | 3.46 | Meets Expectations | Compliant | 0 | 🟢 Minor | 0 | Active | 0.55 | Band B | No flags |
| EMP-073 | 3.62 | Good | Minor Late | 4 | — | 0 | Active | 0.53 | Band A | No flags |
| EMP-074 | 4.19 | Good | Minor Late | 0 | — | 0 | Active | 0.53 | Band D | No flags |
| EMP-075 | 3.48 | Meets Expectations | Minor Late | 6 | — | 0 | Active | 0.64 | Band D | No flags |
| EMP-076 | 3.62 | Good | Compliant | 4 | — | 0 | Active | 0.67 | Band C | No flags |
| EMP-077 | 3.35 | Meets Expectations | Minor Late | 0 | 🟡 Watch | 0 | Active | 0.65 | Band D | No flags |
| EMP-078 | 3.16 | Meets Expectations | Compliant | 4 | — | 0 | Active | 0.72 | Band E | No flags |
| EMP-079 | 2.20 | Below Expectations | Compliant | 2 | 🟢 Minor | 0 | Active | 0.45 | Band B | Low KPI (<2.5) |
| EMP-080 | 3.76 | Good | Compliant | 0 | — | 0 | Active | 0.70 | Band E | No flags |
| EMP-081 | 3.74 | Good | Compliant | 4 | 🟢 Minor | 0 | Under-allocated | 0.70 | Band D | No flags |
| EMP-082 | 1.32 | Poor | Compliant | 0 | — | 0 | Active | 0.13 | Band B | Low KPI (<2.5) |
| EMP-083 | 3.56 | Meets Expectations | Compliant | 0 | 🟡 Watch | 1 | Under-allocated | 0.68 | Band C | No flags |
| EMP-084 | 3.68 | Good | Minor Late | 0 | — | 0 | Active | 0.61 | Band F | No flags |
| EMP-085 | 1.63 | Below Expectations | Compliant | 4 | 🟡 Watch | 1 | Bench | 0.07 | Band B | Low KPI (<2.5); Benched |
| EMP-086 | 4.90 | Excellent | Compliant | 2 | 🔴 High Risk | 4 | Active | 0.79 | Band C | Top Performer; Multiple Open Violations |
| EMP-087 | 2.17 | Below Expectations | Minor Late | 0 | — | 0 | Under-allocated | 0.46 | Band E | Low KPI (<2.5) |
| EMP-088 | 3.51 | Good | Minor Late | 0 | — | 0 | Active | 0.68 | Band A | No flags |
| EMP-089 | 3.73 | Good | Compliant | 8 | — | 0 | Active | 0.73 | Band D | No flags |
| EMP-090 | 4.44 | Good | Compliant | 8 | — | 0 | Active | 0.87 | Band C | No flags |
| EMP-091 | 2.79 | Meets Expectations | Compliant | 0 | 🔴 High Risk | 2 | Active | 0.46 | Band D | High-Risk Violation |
| EMP-092 | 3.09 | Meets Expectations | Minor Late | 10 | 🟡 Watch | 1 | Under-allocated | 0.73 | Band C | No flags |
| EMP-093 | 4.93 | Excellent | Compliant | 4 | 🟢 Minor | 0 | Active | 0.86 | Band E | Top Performer |
| EMP-094 | 3.33 | Meets Expectations | Minor Late | 2 | — | 0 | Active | 0.62 | Band E | No flags |
| EMP-095 | 3.74 | Good | Compliant | 4 | — | 0 | Active | 0.51 | Band B | No flags |
| EMP-096 | 2.91 | Meets Expectations | Compliant | 4 | 🟡 Watch | 1 | Active | 0.35 | Band A | No flags |
| EMP-097 | 3.16 | Meets Expectations | Minor Late | 0 | 🟢 Minor | 0 | Active | 0.67 | Band B | No flags |
| EMP-098 | 3.62 | Good | Compliant | 0 | — | 0 | Under-allocated | 0.61 | Band B | No flags |
| EMP-099 | 3.35 | Meets Expectations | Compliant | 0 | 🟡 Watch | 0 | Active | 0.74 | Band D | No flags |
| EMP-100 | 3.90 | Good | Minor Late | 0 | — | 0 | Active | 0.53 | Band D | No flags |

## REF_Project_Master
| account\_id | account\_name | project\_id | project\_name |
| --- | --- | --- | --- |
| ACC-A | Account Alpha | ACC-A-P01 | Project ACC-A-P01 |
| ACC-A | Account Alpha | ACC-A-P02 | Project ACC-A-P02 |
| ACC-A | Account Alpha | ACC-A-P03 | Project ACC-A-P03 |
| ACC-A | Account Alpha | ACC-A-P04 | Project ACC-A-P04 |
| ACC-B | Account Beta | ACC-B-P01 | Project ACC-B-P01 |
| ACC-B | Account Beta | ACC-B-P02 | Project ACC-B-P02 |
| ACC-B | Account Beta | ACC-B-P03 | Project ACC-B-P03 |
| ACC-C | Account Gamma | ACC-C-P01 | Project ACC-C-P01 |
| ACC-C | Account Gamma | ACC-C-P02 | Project ACC-C-P02 |
| ACC-C | Account Gamma | ACC-C-P03 | Project ACC-C-P03 |
| ACC-D | Account Delta | ACC-D-P01 | Project ACC-D-P01 |
| ACC-D | Account Delta | ACC-D-P02 | Project ACC-D-P02 |
| ACC-E | Account Epsilon | ACC-E-P01 | Project ACC-E-P01 |
| ACC-E | Account Epsilon | ACC-E-P02 | Project ACC-E-P02 |
| INTERNAL | Internal | INT-P00 | Bench / Internal |