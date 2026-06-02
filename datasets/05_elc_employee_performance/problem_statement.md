## **5. Employee Performance Tracking & Reporting Agent**

**Context:**  HR, Leaders, or BOD need to review employee performance by individual, project, or account → collect data from PMO Tool, EMS, Jira, and Timesheet → export and consolidate data manually → cross-check with Leaders → create performance reports or management slides.

This process is time-consuming because performance data is scattered across multiple systems, difficult to track historically, and hard to combine between quantitative data and qualitative assessment. Manual reporting can lead to missing context, inconsistent evaluation, or delayed management insights.

**Input:** Employee performance data (RA, log work, timesheet, violation/attitude records) + NORM/rule-based performance standards

**The agent must:**

1. Generate a centralized performance profile by employee, project, or account.
2. Summarize quantitative performance indicators such as KPI, effort, utilization, log work, and task completion.
3. Summarize qualitative indicators such as log work compliance, attitude, and internal rule violations.
4. Evaluate performance based on company NORM and rule-based criteria.
5. Generate performance reports in the company's internal format.
6. Support natural language queries for HR/Leader/BOD to quickly retrieve performance insights.
7. Highlight performance risks or outstanding employees by project/account.

**Expected output:** Employee Performance Report

**Why agentic:** Requires multi-step reasoning across fragmented internal systems: collect data → consolidate profile → calculate metrics → apply NORM/rules → interpret qualitative signals → generate report → answer ad-hoc queries.

**Guardrails**:

• Do not make final performance conclusions without a Leader/HR review, especially for attitude, violation, promotion, or talent risk.

• Do not evaluate performance without project/account context, as this may lead to wrong interpretations of performance or violations.

• Do not expose sensitive employee data if the user does not have the right permission.

• Avoid biased language when assessing attitude or qualitative performance signals.
