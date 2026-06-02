## 📋 LEGEND & SUMMARY
| Unnamed: 0 | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 |
| --- | --- | --- | --- | --- | --- |
| NaN | 📋  Mock Data Legend & Dataset Summary — SETA AI Agent Hackathon 2026 | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | 📁  Field Dictionary — LD\_07\_Training\_Effectiveness.xlsx | NaN | NaN | NaN | NaN |
| NaN | 🎯  Đề bài 07 — Training Effectiveness Reporting Agent  |  Dữ liệu đầu vào cho agent đánh giá hiệu quả đào tạo và sinh báo cáo theo template công ty. | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | Dataset / Sheet | Field Name | Data Type | Example Value | Description |
| NaN | DS-06 · Course Catalog\n\nDanh mục các khóa học với thông tin cơ bản. Là bảng tham chiếu trung tâm cho toàn bộ TE data.\n\n(1 row = 1 khóa học) | Course\_ID | String | Golang\_04\_2026 | Mã khóa học duy nhất. |
| NaN | NaN | Course\_Name | String | Golang Backend… | Tên khóa học. |
| NaN | NaN | Topic\_Category | String | Backend Dev | Phân loại chủ đề: QA/DevOps/AI/Cloud/Soft Skills… |
| NaN | NaN | Trainer\_ID | String | TRN-004 | Mã trainer phụ trách (FK → DS04\_Internal\_Trainer\_List). |
| NaN | NaN | Total\_Sessions | Integer | 6 | Tổng số buổi học. |
| NaN | NaN | Hours\_Per\_Session | Float | 2.0 | Số giờ mỗi buổi. |
| NaN | NaN | Total\_Hours | Float | 12.0 | Tổng giờ học = Total\_Sessions × Hours\_Per\_Session. |
| NaN | NaN | Pass\_Threshold\_Score | Float | 6.0 | Ngưỡng điểm đạt (thang 10). Dùng để tính Pass\_Status. |
| NaN | NaN | Start\_Date | Date | 2026-04-07 | Ngày bắt đầu khóa học (YYYY-MM-DD). |
| NaN | NaN | End\_Date | Date | 2026-04-25 | Ngày kết thúc khóa học. |
| NaN | NaN | Status | Enum | Completed | Trạng thái: Completed / In Progress / Planned. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-07 · Attendance Log\n\nBản ghi tham dự theo từng buổi học của từng học viên.\n\n(1 row = 1 học viên × 1 buổi học) | Course\_ID | String | Golang\_04\_2026 | FK → DS06\_Course\_Catalog. |
| NaN | NaN | Session\_ID | String | Golang\_04\_2026\_S3 | Mã buổi học (Course\_ID + số thứ tự buổi). |
| NaN | NaN | Employee\_ID | String | EMP-044 | Mã học viên ẩn danh. |
| NaN | NaN | Attendance\_Status | Enum | Present | Trạng thái: Present / Absent. |
| NaN | NaN | Training\_Hours | Float | 2.0 | Số giờ của buổi đó (= Hours\_Per\_Session trong catalog). |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-08 · Assessment Score\n\nĐiểm đánh giá cuối khóa của từng học viên. Có chứa các edge case cố ý (xem bảng edge case).\n\n(1 row = 1 học viên × 1 khóa học) | Course\_ID | String | Golang\_04\_2026 | FK → DS06\_Course\_Catalog. |
| NaN | NaN | Employee\_ID | String | EMP-044 | FK → học viên. |
| NaN | NaN | Score\_0\_to\_10 | Float | 7.4 | Điểm số thang 10. Có thể = 0 (không nộp bài). |
| NaN | NaN | Pass\_Status | Boolean | TRUE | TRUE nếu Score >= Pass\_Threshold\_Score trong catalog. |
| NaN | NaN | Generalized\_Feedback | String | Strong collab… | Nhận xét tổng hợp (đã generalize, không có PII). Có thể NULL. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-09 · Feedback Survey\n\nPhản hồi của học viên về chất lượng trainer và nội dung khóa học.\n\n(1 row = 1 học viên × 1 khóa học) | Course\_ID | String | Golang\_04\_2026 | FK → DS06\_Course\_Catalog. |
| NaN | NaN | Employee\_ID | String | EMP-044 | FK → học viên. |
| NaN | NaN | Trainer\_Rating\_1\_to\_5 | Float | 4.0 | Đánh giá trainer thang 1–5. Có 2–3 record = 3 (edge case). |
| NaN | NaN | Content\_Rating\_1\_to\_5 | Float | 4.5 | Đánh giá nội dung khóa học thang 1–5. |
| NaN | NaN | Comment | String | Good pacing… | Nhận xét dạng text (đã generalize sang English category). |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-10 · Training Cost & ROI\n\nTóm tắt chi phí và hiệu quả đầu tư theo khóa học. Dùng đơn vị scaled (không phải VND thật).\n\n(1 row = 1 khóa học) | Course\_ID | String | Golang\_04\_2026 | FK → DS06\_Course\_Catalog. |
| NaN | NaN | Cost\_Per\_Session\_Scaled | Float | 1.0 | Chi phí mỗi buổi (scaled unit; 1.0 = mức chuẩn). Không phải VND. |
| NaN | NaN | Total\_Sessions | Integer | 6 | Tổng số buổi. |
| NaN | NaN | Total\_Cost\_Scaled | Float | 6.0 | NaN |
| NaN | NaN | Trainee\_Count | Integer | 17 | Số học viên tham gia. |
| NaN | NaN | Completion\_Rate | Float | 0.88 | Tỷ lệ hoàn thành (>= 70% số buổi = completed). NULL nếu in-progress. |
| NaN | NaN | Avg\_Score | Float | 7.19 | Điểm trung bình. NULL nếu chưa có điểm. |
| NaN | NaN | Pass\_Rate | Float | 0.82 | Tỷ lệ đạt = số pass / tổng học viên có điểm. |
| NaN | NaN | Post\_Training\_Perf\_Delta | Float | 0.020 | Delta hiệu suất sau đào tạo (proxy). NULL nếu in-progress. |
| NaN | NaN | Notes | String | In progress… | Ghi chú đặc biệt, ví dụ khóa đang chạy chưa có metrics. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-11 · L&D Training NORM / Evaluation Rules\n\nBộ 15 quy tắc đánh giá L&D. Agent đọc sheet này như rule engine để phân loại và flag tự động.\n\n(1 row = 1 quy tắc) | Rule\_ID | String | NORM-01 | Mã quy tắc duy nhất. |
| NaN | NaN | Category | String | Effectiveness | Nhóm quy tắc: Effectiveness/Attendance/Individual/Trainer/ROI/Reporting. |
| NaN | NaN | Rule\_Description | String | Pass rate < 70% | Mô tả điều kiện kích hoạt quy tắc. |
| NaN | NaN | Threshold | String | Pass\_Rate < 0.70 | Ngưỡng/điều kiện cụ thể dưới dạng logic. |
| NaN | NaN | Action\_If\_Triggered | String | Flag for review | Hành động agent cần thực hiện khi rule bị kích hoạt. |
| NaN | NaN | Priority | Enum | High | Mức độ ưu tiên: High / Medium / Low. |
| NaN | NaN | NaN | NaN | NaN | NaN |
| NaN | DS-12 · Report Template Structure\n\nCấu trúc 10 sections của báo cáo hiệu quả đào tạo theo template chuẩn công ty.\n\n(1 row = 1 section trong báo cáo) | Section\_ID | String | SEC-01 | Mã section. |
| NaN | NaN | Section\_Name | String | Executive Summary | Tên section. |
| NaN | NaN | Content\_Description | String | Total courses… | Mô tả nội dung cần có trong section. |
| NaN | NaN | Data\_Source | String | DS07+DS08+DS10 | Dataset nào cần dùng để điền section này. |
| NaN | NaN | Required | Enum | Yes | Yes = bắt buộc trong mọi báo cáo; Optional = tuỳ ngữ cảnh. |

## DS06_Course_Catalog
| Course\_ID | Course\_Name | Topic\_Category | Trainer\_ID | Total\_Sessions | Hours\_Per\_Session | Total\_Hours | Pass\_Threshold\_Score | Start\_Date | End\_Date | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Automation\_testing\_01\_2026 | Automation Testing with Playwright | QA & Testing | TRN-004 | 6 | 2.0 | 12.0 | 6.0 | 2026-01-06 | 2026-01-31 | Completed |
| DevOps\_02\_2026 | DevOps Fundamentals: CI/CD, K8s, Monitoring | DevOps & Infrastructure | TRN-004 | 15 | 1.5 | 22.5 | 6.0 | 2026-02-03 | 2026-02-28 | Completed |
| Golang\_04\_2026 | Golang Backend Development | Backend Development | TRN-009 | 6 | 2.0 | 12.0 | 6.0 | 2026-04-07 | 2026-04-25 | Completed |
| AIAgent\_05\_2026 | AI Agent & LLM Application Development | AI/ML | TRN-007 | 8 | 2.0 | 16.0 | 6.5 | 2026-05-05 | 2026-05-30 | Completed |
| CloudAWS\_03\_2026 | AWS Cloud Architecture & Services | Cloud | TRN-004 | 10 | 2.0 | 20.0 | 6.5 | 2026-03-03 | 2026-03-28 | Completed |
| Leadership\_06\_2026 | Technical Leadership & Communication | Soft Skills / Leadership | TRN-005 | 6 | 1.5 | 9.0 | 7.0 | 2026-06-02 | 2026-06-27 | In Progress |

## DS07_Attendance_Log
| Course\_ID | Session\_ID | Employee\_ID | Attendance\_Status | Training\_Hours |
| --- | --- | --- | --- | --- |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-121 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-121 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-121 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-121 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-121 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-121 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-017 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-017 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-017 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-017 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-017 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-017 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-138 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-138 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-138 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-138 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-138 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-138 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-181 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-181 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-181 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-181 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-181 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-181 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-182 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-182 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-182 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-182 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-182 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-182 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-183 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-183 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-183 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-183 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-183 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-183 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-184 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-184 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-184 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-184 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-184 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-184 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-185 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-185 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-185 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-185 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-185 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-185 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-067 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-067 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-067 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-067 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-067 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-067 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-013 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-013 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-013 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-013 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-013 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-013 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-186 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-186 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-186 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-186 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-186 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-186 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-130 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-130 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-130 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-130 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-130 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-130 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-012 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-012 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-012 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-012 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-012 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-012 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-018 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-018 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-018 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-018 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-018 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-018 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-187 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-187 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-187 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-187 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-187 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-187 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-188 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-188 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-188 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-188 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-188 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-188 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-189 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-189 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-189 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-189 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-189 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-189 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-190 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-190 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-190 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-190 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-190 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-190 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-191 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-191 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-191 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-191 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-191 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-191 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-006 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-006 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-006 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-006 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-006 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-006 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-033 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-033 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-033 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-033 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-033 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-033 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-192 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-192 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-192 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-192 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-192 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-192 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-063 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-063 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-063 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-063 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-063 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-063 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-193 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-193 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-193 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-193 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-193 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-193 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-194 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-194 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-194 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-194 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-194 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-194 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-195 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-195 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-195 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-195 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-195 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-195 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-196 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-196 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-196 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-196 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-196 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-196 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-007 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-007 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-007 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-007 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-007 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-007 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-197 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-197 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-197 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-197 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-197 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-197 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-198 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-198 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-198 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-198 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-198 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-198 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-199 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-199 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-199 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-199 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-199 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-199 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-200 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-200 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-200 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-200 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-200 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-200 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-201 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-201 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-201 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-201 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-201 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-201 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-202 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-202 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-202 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-202 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-202 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-202 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-203 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-203 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-203 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-203 | Absent | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-203 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-203 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-204 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-204 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-204 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-204 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-204 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-204 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S1 | EMP-205 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S2 | EMP-205 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S3 | EMP-205 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S4 | EMP-205 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S5 | EMP-205 | Present | 2.0 |
| Automation\_testing\_01\_2026 | Automation\_testing\_01\_2026\_S6 | EMP-205 | Present | 2.0 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-177 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-178 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-179 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-180 | Absent | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-180 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-036 | Absent | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-036 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-037 | Absent | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-037 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-117 | Absent | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-117 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-024 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-028 | Absent | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-028 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S1 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S2 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S3 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S4 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S5 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S6 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S7 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S8 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S9 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S10 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S11 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S12 | EMP-094 | Absent | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S13 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S14 | EMP-094 | Present | 1.5 |
| DevOps\_02\_2026 | DevOps\_02\_2026\_S15 | EMP-094 | Present | 1.5 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-162 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-162 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-162 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-162 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-162 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-162 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-074 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-074 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-074 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-074 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-074 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-074 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-163 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-163 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-163 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-163 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-163 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-163 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-164 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-164 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-164 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-164 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-164 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-164 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-165 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-165 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-165 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-165 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-165 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-165 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-166 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-166 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-166 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-166 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-166 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-166 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-167 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-167 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-167 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-167 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-167 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-167 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-168 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-168 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-168 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-168 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-168 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-168 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-169 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-169 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-169 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-169 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-169 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-169 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-094 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-094 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-094 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-094 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-094 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-094 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-170 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-170 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-170 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-170 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-170 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-170 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-171 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-171 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-171 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-171 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-171 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-171 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-172 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-172 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-172 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-172 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-172 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-172 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-173 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-173 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-173 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-173 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-173 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-173 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-174 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-174 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-174 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-174 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-174 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-174 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-175 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-175 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-175 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-175 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-175 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-175 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S1 | EMP-176 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S2 | EMP-176 | Absent | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S3 | EMP-176 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S4 | EMP-176 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S5 | EMP-176 | Present | 2.0 |
| Golang\_04\_2026 | Golang\_04\_2026\_S6 | EMP-176 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-041 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-041 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-041 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-041 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-041 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-041 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-041 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-041 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-044 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-062 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-062 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-062 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-062 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-062 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-062 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-062 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-062 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-127 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-127 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-127 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-127 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-127 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-127 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-127 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-127 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-022 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-022 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-022 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-022 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-022 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-022 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-022 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-022 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-162 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-162 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-162 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-162 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-162 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-162 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-162 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-162 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-098 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-098 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-098 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-098 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-098 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-098 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-098 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-098 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-005 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-035 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-035 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-035 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-035 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-035 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-035 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-035 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-035 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-076 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-076 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-076 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-076 | Absent | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-076 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-076 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-076 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-076 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-077 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-090 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S1 | EMP-119 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S2 | EMP-119 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S3 | EMP-119 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S4 | EMP-119 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S5 | EMP-119 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S6 | EMP-119 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S7 | EMP-119 | Present | 2.0 |
| AIAgent\_05\_2026 | AIAgent\_05\_2026\_S8 | EMP-119 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-048 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-092 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-092 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-031 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-031 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-066 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-133 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-140 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-140 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-101 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-061 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-061 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-061 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-081 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-081 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-024 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-094 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-094 | Absent | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-094 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S1 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S2 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S3 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S4 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S5 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S6 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S7 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S8 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S9 | EMP-145 | Present | 2.0 |
| CloudAWS\_03\_2026 | CloudAWS\_03\_2026\_S10 | EMP-145 | Present | 2.0 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-019 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-019 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-019 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-029 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-029 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-029 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-047 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-047 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-047 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-060 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-060 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-060 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-093 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-093 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-093 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-124 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-124 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-124 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-131 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-131 | Absent | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-131 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S1 | EMP-135 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S2 | EMP-135 | Present | 1.5 |
| Leadership\_06\_2026 | Leadership\_06\_2026\_S3 | EMP-135 | Present | 1.5 |

## DS08_Assessment_Score
| Course\_ID | Employee\_ID | Score\_0\_to\_10 | Pass\_Status | Generalized\_Feedback |
| --- | --- | --- | --- | --- |
| Automation\_testing\_01\_2026 | EMP-121 | 9.5 | True | Good practical exposure in live project; needs to strengthen scripting skills. Reduce AI over-reliance. |
| Automation\_testing\_01\_2026 | EMP-017 | 8.7 | True | Solid grasp of Playwright basics with exposure to multiple frameworks. Coding discipline needs improvement. |
| Automation\_testing\_01\_2026 | EMP-138 | 9.0 | True | Playwright knowledge needs reinforcement; potential to transition to automation role with further coaching. |
| Automation\_testing\_01\_2026 | EMP-181 | 6.6 | True | Completed all assignments; needs more hands-on project practice. |
| Automation\_testing\_01\_2026 | EMP-182 | 7.0 | True | Good theoretical knowledge; practical application skills need strengthening. |
| Automation\_testing\_01\_2026 | EMP-183 | 9.4 | True | Good theoretical knowledge; practical application skills need strengthening. |
| Automation\_testing\_01\_2026 | EMP-184 | 9.2 | True | NaN |
| Automation\_testing\_01\_2026 | EMP-185 | 9.4 | True | Has QA experience; coding remains a challenge. Needs project with automation practice to progress. |
| Automation\_testing\_01\_2026 | EMP-067 | 9.7 | True | Developer background makes automation transition smooth. Role-switch motivation not yet confirmed. |
| Automation\_testing\_01\_2026 | EMP-013 | 9.0 | True | Good Playwright grasp with development background. Long-term commitment to automation role not yet confirmed. |
| Automation\_testing\_01\_2026 | EMP-186 | 9.2 | True | NaN |
| Automation\_testing\_01\_2026 | EMP-130 | 8.0 | True | NaN |
| Automation\_testing\_01\_2026 | EMP-012 | 8.0 | True | Basic Playwright knowledge understood; coding skills need improvement. Reduce AI dependency on exercises. |
| Automation\_testing\_01\_2026 | EMP-018 | 2.7 | False | Did not complete required assignments and final assessment. |
| Automation\_testing\_01\_2026 | EMP-187 | 6.6 | True | Good theoretical knowledge; practical application skills need strengthening. |
| Automation\_testing\_01\_2026 | EMP-188 | 8.2 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| Automation\_testing\_01\_2026 | EMP-189 | 8.9 | True | Steady performance; should improve debugging and troubleshooting skills. |
| Automation\_testing\_01\_2026 | EMP-190 | 2.1 | False | Did not complete required assignments and final assessment. |
| Automation\_testing\_01\_2026 | EMP-191 | 8.4 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| Automation\_testing\_01\_2026 | EMP-006 | 0.0 | False | Did not complete required assignments and final assessment. |
| Automation\_testing\_01\_2026 | EMP-033 | 7.0 | True | Steady performance; should improve debugging and troubleshooting skills. |
| Automation\_testing\_01\_2026 | EMP-192 | 7.0 | True | Good understanding of core concepts; performance tuning skills needed. |
| Automation\_testing\_01\_2026 | EMP-063 | 8.9 | True | Basic Playwright knowledge acquired; coding needs improvement. Currently on manual testing; needs practice opportunity. |
| Automation\_testing\_01\_2026 | EMP-193 | 7.8 | True | Good understanding of core concepts; performance tuning skills needed. |
| Automation\_testing\_01\_2026 | EMP-194 | 8.5 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| Automation\_testing\_01\_2026 | EMP-195 | 8.3 | True | Steady performance; should improve debugging and troubleshooting skills. |
| Automation\_testing\_01\_2026 | EMP-196 | 3.1 | False | Attendance gaps impacted learning outcomes; recommend re-enrollment. |
| Automation\_testing\_01\_2026 | EMP-007 | 9.3 | True | Shows good progress; code quality and testing discipline need improvement. |
| Automation\_testing\_01\_2026 | EMP-197 | 6.7 | True | Shows good progress; code quality and testing discipline need improvement. |
| Automation\_testing\_01\_2026 | EMP-198 | 9.8 | True | Shows good progress; code quality and testing discipline need improvement. |
| Automation\_testing\_01\_2026 | EMP-199 | 7.8 | True | NaN |
| Automation\_testing\_01\_2026 | EMP-200 | 7.7 | True | Good understanding of core concepts; performance tuning skills needed. |
| Automation\_testing\_01\_2026 | EMP-201 | 8.7 | True | Good theoretical knowledge; practical application skills need strengthening. |
| Automation\_testing\_01\_2026 | EMP-202 | 7.1 | True | Shows good progress; code quality and testing discipline need improvement. |
| Automation\_testing\_01\_2026 | EMP-203 | 7.8 | True | Shows good progress; code quality and testing discipline need improvement. |
| Automation\_testing\_01\_2026 | EMP-204 | 9.3 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| Automation\_testing\_01\_2026 | EMP-205 | 6.6 | True | Good understanding of core concepts; performance tuning skills needed. |
| DevOps\_02\_2026 | EMP-177 | 8.6 | True | Proactive with assignments; good K8s practical skills. Needs to connect deployment steps more coherently. |
| DevOps\_02\_2026 | EMP-178 | 8.3 | True | Good theoretical understanding of Performance Testing. Needs improvement in practical config and production implications. |
| DevOps\_02\_2026 | EMP-179 | 8.1 | True | Good theoretical understanding; needs clarity on configuration intent and system behavior in real environments. |
| DevOps\_02\_2026 | EMP-180 | 7.6 | True | Proactive learner; theoretical knowledge solid. Practical debugging and configuration skills need development. |
| DevOps\_02\_2026 | EMP-036 | 6.7 | True | Good understanding of core concepts; performance tuning skills needed. |
| DevOps\_02\_2026 | EMP-037 | 8.1 | True | NaN |
| DevOps\_02\_2026 | EMP-117 | 7.0 | True | Completed all assignments; needs more hands-on project practice. |
| DevOps\_02\_2026 | EMP-024 | 7.9 | True | Steady performance; should improve debugging and troubleshooting skills. |
| DevOps\_02\_2026 | EMP-028 | 9.8 | True | Demonstrates solid foundational understanding; should reduce over-reliance on AI tools. |
| DevOps\_02\_2026 | EMP-094 | 6.8 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| Golang\_04\_2026 | EMP-162 | 7.0 | True | Demonstrates solid foundational understanding; should reduce over-reliance on AI tools. |
| Golang\_04\_2026 | EMP-074 | 7.9 | True | Good theoretical knowledge; practical application skills need strengthening. |
| Golang\_04\_2026 | EMP-163 | 8.5 | True | NaN |
| Golang\_04\_2026 | EMP-164 | 9.7 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| Golang\_04\_2026 | EMP-165 | 6.1 | True | Quick learner with clean code style; needs improvement in unit test coverage and edge case error handling. |
| Golang\_04\_2026 | EMP-166 | 5.5 | False | Good logical thinking; debugging and performance optimization skills need significant improvement. |
| Golang\_04\_2026 | EMP-167 | 7.9 | True | Strong Go concurrency knowledge; database schema design and query optimization need development. |
| Golang\_04\_2026 | EMP-168 | 7.0 | True | Diligent and meets deadlines; API design skills and authentication/authorization handling need improvement. |
| Golang\_04\_2026 | EMP-169 | 8.7 | True | Good self-learning ability; code review practices and team communication need improvement. |
| Golang\_04\_2026 | EMP-094 | 6.5 | True | Solid Golang fundamentals; microservices architecture and container orchestration practice needed. |
| Golang\_04\_2026 | EMP-170 | 7.4 | True | Clear systems thinking; needs more attention to error handling and logging for production readiness. |
| Golang\_04\_2026 | EMP-171 | 5.6 | True | High learning motivation; testing skills and Go design patterns need improvement. |
| Golang\_04\_2026 | EMP-172 | 5.0 | False | Getting acquainted with Golang; needs more practice time and side project participation. |
| Golang\_04\_2026 | EMP-173 | 7.4 | True | Energetic contributor; needs improvement in service independence design and branch management. |
| Golang\_04\_2026 | EMP-174 | 6.3 | False | Diligent and methodical; needs more domain knowledge and must address memory overflow risks. |
| Golang\_04\_2026 | EMP-175 | 9.4 | True | Clear architectural thinking and strong testing awareness. Needs to ensure design-implementation consistency. |
| Golang\_04\_2026 | EMP-176 | 8.4 | True | Strong code organization and parallel data processing; needs proactive communication improvement. |
| AIAgent\_05\_2026 | EMP-041 | 6.9 | True | Completed all assignments; needs more hands-on project practice. |
| AIAgent\_05\_2026 | EMP-044 | 7.6 | True | Completed all assignments; needs more hands-on project practice. |
| AIAgent\_05\_2026 | EMP-062 | 8.0 | True | Completed all assignments; needs more hands-on project practice. |
| AIAgent\_05\_2026 | EMP-127 | 9.0 | True | Good theoretical knowledge; practical application skills need strengthening. |
| AIAgent\_05\_2026 | EMP-022 | 7.5 | True | Shows good progress; code quality and testing discipline need improvement. |
| AIAgent\_05\_2026 | EMP-162 | 9.0 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| AIAgent\_05\_2026 | EMP-098 | 8.1 | True | Good theoretical knowledge; practical application skills need strengthening. |
| AIAgent\_05\_2026 | EMP-005 | 9.4 | True | Completed all assignments; needs more hands-on project practice. |
| AIAgent\_05\_2026 | EMP-035 | 7.3 | True | Good theoretical knowledge; practical application skills need strengthening. |
| AIAgent\_05\_2026 | EMP-076 | 3.9 | False | Did not complete required assignments and final assessment. |
| AIAgent\_05\_2026 | EMP-077 | 8.3 | True | Demonstrates solid foundational understanding; should reduce over-reliance on AI tools. |
| AIAgent\_05\_2026 | EMP-090 | 8.1 | True | Demonstrates solid foundational understanding; should reduce over-reliance on AI tools. |
| AIAgent\_05\_2026 | EMP-119 | 9.4 | True | Steady performance; should improve debugging and troubleshooting skills. |
| CloudAWS\_03\_2026 | EMP-048 | 9.6 | True | Shows good progress; code quality and testing discipline need improvement. |
| CloudAWS\_03\_2026 | EMP-092 | 7.8 | True | Good understanding of core concepts; performance tuning skills needed. |
| CloudAWS\_03\_2026 | EMP-031 | 8.2 | True | Good theoretical knowledge; practical application skills need strengthening. |
| CloudAWS\_03\_2026 | EMP-066 | 6.7 | True | Strong overall performance; needs to improve error handling and edge case coverage. |
| CloudAWS\_03\_2026 | EMP-133 | 7.3 | True | Shows good progress; code quality and testing discipline need improvement. |
| CloudAWS\_03\_2026 | EMP-140 | 4.8 | False | Did not complete required assignments and final assessment. |
| CloudAWS\_03\_2026 | EMP-101 | 9.5 | True | Good understanding of core concepts; performance tuning skills needed. |
| CloudAWS\_03\_2026 | EMP-061 | 2.9 | False | Attendance gaps impacted learning outcomes; recommend re-enrollment. |
| CloudAWS\_03\_2026 | EMP-081 | 8.3 | True | NaN |
| CloudAWS\_03\_2026 | EMP-024 | 8.1 | True | Steady performance; should improve debugging and troubleshooting skills. |
| CloudAWS\_03\_2026 | EMP-094 | 6.8 | True | Steady performance; should improve debugging and troubleshooting skills. |
| CloudAWS\_03\_2026 | EMP-145 | 7.9 | True | Strong overall performance; needs to improve error handling and edge case coverage. |

## DS09_Feedback_Survey
| Course\_ID | Employee\_ID | Trainer\_Rating\_1\_to\_5 | Content\_Rating\_1\_to\_5 | Comment |
| --- | --- | --- | --- | --- |
| Automation\_testing\_01\_2026 | EMP-121 | 4 | 4 | Practical focus was appreciated; theory-practice balance was good. |
| Automation\_testing\_01\_2026 | EMP-017 | 5 | 4 | Interactive sessions; good knowledge transfer overall. |
| Automation\_testing\_01\_2026 | EMP-138 | 5 | 4 | Content was relevant and immediately applicable to work. |
| Automation\_testing\_01\_2026 | EMP-181 | 5 | 5 | Trainer shared valuable real-world experience throughout. |
| Automation\_testing\_01\_2026 | EMP-182 | 5 | 5 | Interactive sessions; good knowledge transfer overall. |
| Automation\_testing\_01\_2026 | EMP-183 | 4 | 5 | Good pacing; more hands-on lab time would be beneficial. |
| Automation\_testing\_01\_2026 | EMP-184 | 4 | 4 | Excellent trainer support; Q&A sessions were particularly helpful. |
| Automation\_testing\_01\_2026 | EMP-185 | 5 | 4 | High-quality training; hope company continues this series. |
| Automation\_testing\_01\_2026 | EMP-067 | 5 | 5 | Solid course; material can be applied immediately to current work. |
| Automation\_testing\_01\_2026 | EMP-013 | 5 | 4 | Trainer shared valuable real-world experience throughout. |
| Automation\_testing\_01\_2026 | EMP-186 | 5 | 4 | Practical focus was appreciated; theory-practice balance was good. |
| Automation\_testing\_01\_2026 | EMP-130 | 5 | 5 | Would like more practice mini-projects in future sessions. |
| Automation\_testing\_01\_2026 | EMP-012 | 5 | 5 | Content well-structured; would appreciate more advanced follow-up topics. |
| Automation\_testing\_01\_2026 | EMP-018 | 3 | 3 | Content was good but pacing was too fast; some participants struggled to keep up. |
| Automation\_testing\_01\_2026 | EMP-187 | 5 | 5 | Solid course; material can be applied immediately to current work. |
| Automation\_testing\_01\_2026 | EMP-188 | 4 | 4 | Useful content; recommend more advanced courses in this area. |
| Automation\_testing\_01\_2026 | EMP-189 | 4 | 4 | No additional comments; overall satisfied with the course. |
| Automation\_testing\_01\_2026 | EMP-190 | 4 | 3 | Trainer was excellent but the course content felt outdated in some sections. |
| Automation\_testing\_01\_2026 | EMP-191 | 5 | 4 | Looking forward to more courses at this level. |
| Automation\_testing\_01\_2026 | EMP-006 | 3 | 3 | Trainer knowledge is strong but explanation style needs improvement for mixed-level groups. |
| Automation\_testing\_01\_2026 | EMP-033 | 4 | 4 | Excellent trainer support; Q&A sessions were particularly helpful. |
| Automation\_testing\_01\_2026 | EMP-192 | 4 | 4 | Practical focus was appreciated; theory-practice balance was good. |
| Automation\_testing\_01\_2026 | EMP-063 | 4 | 4 | Very practical course; content aligned well with real project needs. |
| Automation\_testing\_01\_2026 | EMP-193 | 4 | 5 | Looking forward to more courses at this level. |
| Automation\_testing\_01\_2026 | EMP-194 | 5 | 5 | Solid course; material can be applied immediately to current work. |
| Automation\_testing\_01\_2026 | EMP-195 | 5 | 4 | Very satisfied with training quality and delivery approach. |
| Automation\_testing\_01\_2026 | EMP-196 | 5 | 4 | Would like more practice mini-projects in future sessions. |
| Automation\_testing\_01\_2026 | EMP-007 | 5 | 5 | Excellent trainer support; Q&A sessions were particularly helpful. |
| Automation\_testing\_01\_2026 | EMP-197 | 4 | 5 | Good pacing; more hands-on lab time would be beneficial. |
| Automation\_testing\_01\_2026 | EMP-198 | 4 | 4 | Looking forward to more courses at this level. |
| Automation\_testing\_01\_2026 | EMP-199 | 5 | 4 | Trainer was supportive and knowledgeable; good learning environment. |
| Automation\_testing\_01\_2026 | EMP-200 | 4 | 4 | Trainer was supportive and knowledgeable; good learning environment. |
| Automation\_testing\_01\_2026 | EMP-201 | 5 | 4 | Content was relevant and immediately applicable to work. |
| Automation\_testing\_01\_2026 | EMP-202 | 5 | 4 | Would like more practice mini-projects in future sessions. |
| Automation\_testing\_01\_2026 | EMP-203 | 4 | 4 | Very satisfied with training quality and delivery approach. |
| Automation\_testing\_01\_2026 | EMP-204 | 4 | 4 | Content well-structured; would appreciate more advanced follow-up topics. |
| Automation\_testing\_01\_2026 | EMP-205 | 5 | 5 | Solid course; material can be applied immediately to current work. |
| DevOps\_02\_2026 | EMP-177 | 5 | 4 | Very satisfied with training quality and delivery approach. |
| DevOps\_02\_2026 | EMP-178 | 5 | 5 | Very practical course; content aligned well with real project needs. |
| DevOps\_02\_2026 | EMP-179 | 4 | 5 | Very satisfied with training quality and delivery approach. |
| DevOps\_02\_2026 | EMP-180 | 4 | 4 | Useful content; recommend more advanced courses in this area. |
| DevOps\_02\_2026 | EMP-036 | 5 | 5 | Trainer shared valuable real-world experience throughout. |
| DevOps\_02\_2026 | EMP-037 | 5 | 5 | Trainer was clear and easy to follow; some advanced topics moved too quickly. |
| DevOps\_02\_2026 | EMP-117 | 4 | 4 | Content well-structured; would appreciate more advanced follow-up topics. |
| DevOps\_02\_2026 | EMP-024 | 4 | 5 | Content well-structured; would appreciate more advanced follow-up topics. |
| DevOps\_02\_2026 | EMP-028 | 5 | 4 | Very practical course; content aligned well with real project needs. |
| DevOps\_02\_2026 | EMP-094 | 5 | 5 | Very practical course; content aligned well with real project needs. |
| Golang\_04\_2026 | EMP-162 | 5 | 4 | Interactive sessions; good knowledge transfer overall. |
| Golang\_04\_2026 | EMP-074 | 4 | 5 | High-quality training; hope company continues this series. |
| Golang\_04\_2026 | EMP-163 | 5 | 4 | Trainer shared valuable real-world experience throughout. |
| Golang\_04\_2026 | EMP-164 | 5 | 5 | Trainer was clear and easy to follow; some advanced topics moved too quickly. |
| Golang\_04\_2026 | EMP-165 | 5 | 5 | High-quality training; hope company continues this series. |
| Golang\_04\_2026 | EMP-166 | 5 | 5 | Trainer shared valuable real-world experience throughout. |
| Golang\_04\_2026 | EMP-167 | 4 | 5 | Very practical course; content aligned well with real project needs. |
| Golang\_04\_2026 | EMP-168 | 5 | 4 | Solid course; material can be applied immediately to current work. |
| Golang\_04\_2026 | EMP-169 | 5 | 5 | Would like more practice mini-projects in future sessions. |
| Golang\_04\_2026 | EMP-094 | 5 | 4 | Trainer was clear and easy to follow; some advanced topics moved too quickly. |
| Golang\_04\_2026 | EMP-170 | 5 | 5 | Useful content; recommend more advanced courses in this area. |
| Golang\_04\_2026 | EMP-171 | 5 | 4 | Very satisfied with training quality and delivery approach. |
| Golang\_04\_2026 | EMP-172 | 5 | 5 | Useful content; recommend more advanced courses in this area. |
| Golang\_04\_2026 | EMP-173 | 4 | 4 | Very satisfied with training quality and delivery approach. |
| Golang\_04\_2026 | EMP-174 | 5 | 5 | Very practical course; content aligned well with real project needs. |
| Golang\_04\_2026 | EMP-175 | 4 | 5 | Trainer was supportive and knowledgeable; good learning environment. |
| Golang\_04\_2026 | EMP-176 | 5 | 5 | Looking forward to more courses at this level. |
| AIAgent\_05\_2026 | EMP-041 | 4 | 5 | Solid course; material can be applied immediately to current work. |
| AIAgent\_05\_2026 | EMP-044 | 5 | 4 | High-quality training; hope company continues this series. |
| AIAgent\_05\_2026 | EMP-062 | 4 | 4 | Trainer was supportive and knowledgeable; good learning environment. |
| AIAgent\_05\_2026 | EMP-127 | 5 | 4 | Useful content; recommend more advanced courses in this area. |
| AIAgent\_05\_2026 | EMP-022 | 5 | 4 | Would like more practice mini-projects in future sessions. |
| AIAgent\_05\_2026 | EMP-162 | 5 | 5 | Useful content; recommend more advanced courses in this area. |
| AIAgent\_05\_2026 | EMP-098 | 5 | 5 | Content well-structured; would appreciate more advanced follow-up topics. |
| AIAgent\_05\_2026 | EMP-005 | 5 | 5 | Practical focus was appreciated; theory-practice balance was good. |
| AIAgent\_05\_2026 | EMP-035 | 5 | 5 | Practical focus was appreciated; theory-practice balance was good. |
| AIAgent\_05\_2026 | EMP-076 | 4 | 5 | Would like more practice mini-projects in future sessions. |
| AIAgent\_05\_2026 | EMP-077 | 5 | 5 | Useful content; recommend more advanced courses in this area. |
| AIAgent\_05\_2026 | EMP-090 | 5 | 5 | Content was relevant and immediately applicable to work. |
| AIAgent\_05\_2026 | EMP-119 | 5 | 5 | Trainer shared valuable real-world experience throughout. |
| CloudAWS\_03\_2026 | EMP-048 | 4 | 5 | Looking forward to more courses at this level. |
| CloudAWS\_03\_2026 | EMP-092 | 5 | 4 | Interactive sessions; good knowledge transfer overall. |
| CloudAWS\_03\_2026 | EMP-031 | 5 | 4 | Solid course; material can be applied immediately to current work. |
| CloudAWS\_03\_2026 | EMP-066 | 5 | 4 | Very practical course; content aligned well with real project needs. |
| CloudAWS\_03\_2026 | EMP-133 | 5 | 5 | Excellent trainer support; Q&A sessions were particularly helpful. |
| CloudAWS\_03\_2026 | EMP-140 | 5 | 5 | Solid course; material can be applied immediately to current work. |
| CloudAWS\_03\_2026 | EMP-101 | 5 | 5 | Practical focus was appreciated; theory-practice balance was good. |
| CloudAWS\_03\_2026 | EMP-061 | 5 | 4 | Trainer was clear and easy to follow; some advanced topics moved too quickly. |
| CloudAWS\_03\_2026 | EMP-081 | 4 | 5 | Interactive sessions; good knowledge transfer overall. |
| CloudAWS\_03\_2026 | EMP-024 | 5 | 5 | Very practical course; content aligned well with real project needs. |
| CloudAWS\_03\_2026 | EMP-094 | 5 | 4 | Content was relevant and immediately applicable to work. |
| CloudAWS\_03\_2026 | EMP-145 | 5 | 5 | Looking forward to more courses at this level. |
| Leadership\_06\_2026 | EMP-019 | 5 | 5 | Content well-structured; would appreciate more advanced follow-up topics. |
| Leadership\_06\_2026 | EMP-029 | 5 | 5 | Very practical course; content aligned well with real project needs. |
| Leadership\_06\_2026 | EMP-047 | 5 | 5 | Excellent trainer support; Q&A sessions were particularly helpful. |
| Leadership\_06\_2026 | EMP-060 | 4 | 5 | Content well-structured; would appreciate more advanced follow-up topics. |
| Leadership\_06\_2026 | EMP-093 | 5 | 4 | Excellent trainer support; Q&A sessions were particularly helpful. |

## DS10_Training_Cost_ROI
| Course\_ID | Cost\_Per\_Session\_Scaled | Total\_Sessions | Total\_Cost\_Scaled | Trainee\_Count | Completion\_Rate | Avg\_Score | Pass\_Rate | Post\_Training\_Perf\_Delta | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Automation\_testing\_01\_2026 | 1.0 | 6 | 6.0 | 37 | 0.97 | 7.59 | 0.89 | 0.026 | NaN |
| DevOps\_02\_2026 | 1.0 | 15 | 15.0 | 10 | 1.00 | 7.89 | 1.00 | 0.031 | NaN |
| Golang\_04\_2026 | 1.0 | 6 | 6.0 | 17 | 0.88 | 7.31 | 0.82 | 0.022 | NaN |
| AIAgent\_05\_2026 | 1.2 | 8 | 9.6 | 13 | 1.00 | 7.88 | 0.92 | 0.031 | NaN |
| CloudAWS\_03\_2026 | 1.1 | 10 | 11.0 | 12 | 1.00 | 7.33 | 0.83 | 0.022 | NaN |
| Leadership\_06\_2026 | 0.8 | 6 | 4.8 | 8 | NaN | NaN | NaN | NaN | In progress — 3/6 sessions completed; metrics not yet available |

## DS11_LnD_Training_NORM
| Rule\_ID | Category | Rule\_Description | Threshold | Action\_If\_Triggered | Priority |
| --- | --- | --- | --- | --- | --- |
| NORM-01 | Effectiveness | Pass rate per course below threshold | Pass\_Rate < 0.70 | Flag course for content review; notify L&D manager | High |
| NORM-02 | Effectiveness | Average score below minimum acceptable level | Avg\_Score < 6.5 | Trigger course redesign review; consider re-delivery | High |
| NORM-03 | Attendance | Attendance rate per course below target | Attendance\_Rate < 0.75 | Send reminder to absentees; flag to direct manager | Medium |
| NORM-04 | Individual | Trainee passes with low attendance (possible policy violation) | Score >= Pass\_Threshold AND Attendance\_Rate < 0.70 | Flag for L&D review; verify with manager | Medium |
| NORM-05 | Individual | Trainee score = 0 or did not submit assessment | Score = 0 OR assessment not submitted | Mark as Incomplete; recommend re-enrollment in next cohort | High |
| NORM-06 | Individual | Outstanding trainee highlight | Score >= 9.0 AND Attendance\_Rate = 1.0 | Add to "Star Learner" report section; recommend for mentorship role | Low |
| NORM-07 | Individual | At-risk trainee — needs support | Score < Pass\_Threshold AND Attendance\_Rate >= 0.70 | Flag for 1:1 coaching; assign buddy or additional practice resource | High |
| NORM-08 | Trainer | Trainer rating below acceptable standard | Trainer\_Rating\_Avg < 3.5 | Escalate to L&D Manager; schedule trainer coaching session | High |
| NORM-09 | ROI | Low completion rate despite high cost | Completion\_Rate < 0.80 AND Total\_Cost\_Scaled > 8.0 | Review course necessity; consider split delivery or self-paced format | Medium |
| NORM-10 | ROI | Negative or zero post-training performance delta | Post\_Training\_Perf\_Delta <= 0 | Audit course design and on-the-job application support | High |
| NORM-11 | Reporting | Course with missing data cannot be reported | Any required field is NULL for Completed course status | Block course from effectiveness report; flag as data incomplete | High |
| NORM-12 | Attendance | Trainee marked Late treated as partial attendance | Attendance\_Status = Late | Count as 0.5 session for attendance rate calculation | Low |
| NORM-13 | Effectiveness | Course completion rate calculation basis | Completion defined as >= 70% sessions attended | Apply consistently across all courses; document in report footnote | Medium |
| NORM-14 | Feedback | Minimum feedback response rate for valid analysis | Feedback\_Response\_Rate < 0.60 | Mark feedback analysis as statistically insufficient; note in report | Medium |
| NORM-15 | Individual | Score inconsistency detection | Pass\_Status = True AND Score < Pass\_Threshold, OR Pass\_Status = False AND Score >= Pass\_Threshold | Flag as data integrity issue; verify with trainer before report generation | High |

## DS12_Report_Template_Structure
| Section\_ID | Section\_Name | Content\_Description | Data\_Source | Required |
| --- | --- | --- | --- | --- |
| SEC-01 | Executive Summary | Total courses, total trainees, overall pass rate, overall completion rate, total training hours, total cost (scaled) | DS07+DS08+DS10 | Yes |
| SEC-02 | Course-Level Metrics | Per-course: trainee count, attendance rate, avg score, pass rate, completion rate, cost, perf delta | DS07+DS08+DS10 | Yes |
| SEC-03 | Trainee Highlights | Outstanding trainees (score ≥ 9.0, full attendance); At-risk trainees (score < pass threshold); Trainees who passed with low attendance | DS08 | Yes |
| SEC-04 | Trainer Evaluation | Avg trainer rating per course; avg content rating per course; notable feedback themes | DS09 | Yes |
| SEC-05 | Attendance Analysis | Per-course attendance heatmap by session; full-absent cases; late patterns | DS07 | Yes |
| SEC-06 | Effectiveness Analysis | Comparison of avg score vs pass threshold; courses below NORM-01/NORM-02; ROI analysis | DS08+DS10+DS11 | Yes |
| SEC-07 | Trend Comparison | Quarter-over-quarter comparison (if prior quarter data available) | DS07+DS08 historical | Optional |
| SEC-08 | Data Quality Flags | List of NORM violations: score inconsistencies, missing data, incomplete courses | DS11 | Yes |
| SEC-09 | Recommendations | L&D-generated recommendations based on effectiveness analysis and NORM triggers | All | Yes |
| SEC-10 | Appendix — Raw Data | Full attendance log, score list, feedback list (anonymized, for L&D internal use only) | All | Optional |