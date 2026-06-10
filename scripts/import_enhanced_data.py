#!/usr/bin/env python3
"""
Merge enhanced Excel datasets into the existing seed files (000–007).

Usage:
    python3 scripts/import_enhanced_data.py

Each seed file gets an auto-generated block appended between
  -- ===== BEGIN ENHANCED DATA =====
  -- ===== END ENHANCED DATA =====
Re-running replaces the block in-place, so it is fully idempotent.
Requires: openpyxl  (pip install openpyxl)
"""

import io
import os
import re
import sys
from datetime import datetime, date

import openpyxl

# ─── file paths ───────────────────────────────────────────────────────────────
TA03 = "datasets/03_ta_hire_request_jd_generation/originals/mock_data.xlsx"
TA04 = "datasets/04_ta_cv_screening/originals/mock_data.xlsx"
ELC05 = "datasets/05_elc_employee_performance/originals/mock_data.xlsx"
LND06 = "datasets/06_lnd_training_roadmap/originals/mock_data.xlsx"
LND07 = "datasets/07_lnd_training_effectiveness/originals/mock_data.xlsx"


# ─── helpers ──────────────────────────────────────────────────────────────────

def read_sheet(path: str, sheet: str, skip_rows: int = 1) -> list[dict]:
    """Return list-of-dicts for a sheet.  skip_rows discards decorative header rows."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    rows = list(ws.iter_rows(min_row=skip_rows + 1, values_only=True))
    wb.close()
    if not rows:
        return []
    headers = rows[0]
    result = []
    for row in rows[1:]:
        if all(c is None for c in row):
            continue
        result.append(dict(zip(headers, row)))
    return result


def q(v) -> str:
    """SQL-quote a value. None → NULL."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (datetime, date)):
        return f"'{v.strftime('%Y-%m-%d')}'"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def parse_date(v, fmt: str = "%d/%m/%Y") -> str | None:
    """Parse a date value from Excel (may already be a date, or a string)."""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    try:
        return datetime.strptime(str(v).strip(), fmt).strftime("%Y-%m-%d")
    except ValueError:
        return str(v).strip() if str(v).strip() else None


def parse_salary(s: str) -> tuple[float | None, float | None]:
    """Parse '$1500–$2500/month' → (1.50, 2.50)  (scaled ÷1000)."""
    if not s:
        return None, None
    nums = re.findall(r"[\d,]+", str(s).replace(",", ""))
    nums = [int(n) for n in nums if n]
    if len(nums) >= 2:
        return round(nums[0] / 1000, 2), round(nums[1] / 1000, 2)
    if len(nums) == 1:
        return round(nums[0] / 1000, 2), None
    return None, None


def slugify(name: str) -> str:
    """Make a lowercase skill_code from a skill name."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def session_no(session_id: str) -> int:
    """Extract session number from 'Course_ID_S3' → 3."""
    m = re.search(r"_S(\d+)$", str(session_id))
    return int(m.group(1)) if m else 1


def salary_band_letter(raw: str) -> str | None:
    """'Band C' → 'C'."""
    if not raw:
        return None
    m = re.search(r"\b([A-F])\b", str(raw))
    return m.group(1) if m else None


# ─── role-title → role_code mapping ──────────────────────────────────────────
ROLE_MAP = {
    "Senior Software Engineer": "BE",
    "Software Engineer": "BE",
    "Junior Software Engineer": "BE",
    "Principal Engineer": "BE",
    "Tech Lead": "TL",
    "Engineering Manager": "EM",
    "Delivery Manager": "DM",
    "Junior QA Engineer": "QA",
    "QA Engineer": "QA",
    "Senior QA Engineer": "QA",
    "QA Lead": "QA",
    "Business Analyst": "BA",
    "Senior Business Analyst": "BA",
    "Project Manager": "PM",
    "Senior Project Manager": "PM",
    "DevOps Engineer": "DevOps",
    "Senior DevOps Engineer": "DevOps",
    "HR Executive": "HR",
    "HR Manager": "HR",
    "Admin Executive": "Admin",
    "BD Manager": "BD",
    "Business Dev Executive": "BD",
    "Finance Manager": "Finance",
    "Accountant": "Finance",
}

# department-name → dept_code
DEPT_MAP = {
    "IT - Engineering": "IT-ENG",
    "IT - QA": "IT-QA",
    "IT - PM": "IT-PM",
    "IT - BA": "IT-BA",
    "IT - DevOps": "IT-DEVOPS",
    "IT - Delivery": "IT-DELIVERY",
    "Admin - Finance": "ADMIN-FIN",
    "Admin - GA": "ADMIN-GA",
    "Admin - HR": "ADMIN-HR",
    "Admin - Sales": "ADMIN-SALES",
}

# ─── collect all employee IDs referenced across all files ────────────────────

def all_emp_ids() -> set[str]:
    ids: set[str] = set()
    for path, sheet, skip in [
        (ELC05, "DS00_Employee_Master", 0),
        (ELC05, "DS02_Performance_by_Project", 0),
        (ELC05, "DS03_Timesheet_Logwork", 0),
        (ELC05, "DS04_Violation_Attitude", 0),
        (ELC05, "DS05_Promotion_Intent", 0),
        (ELC05, "DS06_Salary_Band", 0),
        (LND06, "DS01_Employee_Skill_Profile", 0),
        (LND06, "DS03_Training_Need_Survey", 0),
        (LND07, "DS07_Attendance_Log", 0),
        (LND07, "DS08_Assessment_Score", 0),
        (LND07, "DS09_Feedback_Survey", 0),
    ]:
        rows = read_sheet(path, sheet, skip)
        for r in rows:
            for key in ("member_id", "Employee_ID", "emp_code"):
                v = r.get(key)
                if v and str(v).startswith("EMP-"):
                    ids.add(str(v))
    return ids


# ─── seed-file patching ───────────────────────────────────────────────────────

SEED_DIR = os.path.join(os.path.dirname(__file__), "..", "db", "seed")
BEGIN = "-- ===== BEGIN ENHANCED DATA =====\n"
END   = "-- ===== END ENHANCED DATA =====\n"


def patch_seed(filename: str, new_block: str) -> None:
    """Replace (or append) the BEGIN/END block in an existing seed file."""
    path = os.path.join(SEED_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        original = f.read()

    # Strip any previously generated block
    if BEGIN in original:
        before = original[: original.index(BEGIN)]
    else:
        before = original.rstrip() + "\n\n"

    updated = before + BEGIN + new_block + END

    with open(path, "w", encoding="utf-8") as f:
        f.write(updated)

    print(f"  patched {filename}", file=sys.stderr)


def build(sections: list[str]) -> str:
    """Join section strings into a single block."""
    return "\n".join(s.rstrip("\n") + "\n" for s in sections) + "\n"


# ─── main generator ───────────────────────────────────────────────────────────

def main():
    buf000 = io.StringIO()  # → 000__core.sql
    buf003 = io.StringIO()  # → 003__ta_hire.sql
    buf004 = io.StringIO()  # → 004__ta_screening.sql
    buf005 = io.StringIO()  # → 005__elc.sql
    buf006 = io.StringIO()  # → 006__lnd_roadmap.sql
    buf007 = io.StringIO()  # → 007__lnd_effectiveness.sql

    # ── 1. NEW REFERENCE DATA ─────────────────────────────────────────────────

    buf000.write("-- ── 1a. New departments ────────────────────────────────────────\n")
    dept_rows = [
        ("IT-ENG",      "IT Engineering"),
        ("IT-QA",       "IT Quality Assurance"),
        ("IT-PM",       "IT Project Management"),
        ("IT-BA",       "IT Business Analysis"),
        ("IT-DEVOPS",   "IT DevOps"),
        ("IT-DELIVERY", "IT Delivery"),
        ("ADMIN-FIN",   "Admin Finance"),
        ("ADMIN-GA",    "Admin General Affairs"),
        ("ADMIN-HR",    "Admin HR"),
        ("ADMIN-SALES", "Admin Sales"),
    ]
    vals = ",\n  ".join(f"({q(c)}, {q(n)})" for c, n in dept_rows)
    buf000.write(f"INSERT INTO core.department (dept_code, name) VALUES\n  {vals}\nON CONFLICT (dept_code) DO NOTHING;\n\n")

    buf000.write("-- ── 1b. New roles ──────────────────────────────────────────────\n")
    role_rows = [
        ("TL",      "Tech Lead"),
        ("EM",      "Engineering Manager"),
        ("DM",      "Delivery Manager"),
        ("HR",      "HR"),
        ("Admin",   "Admin"),
        ("BD",      "Business Development"),
        ("Finance", "Finance"),
    ]
    vals = ",\n  ".join(f"({q(c)}, {q(n)})" for c, n in role_rows)
    buf000.write(f"INSERT INTO core.role (role_code, name) VALUES\n  {vals}\nON CONFLICT (role_code) DO NOTHING;\n\n")

    buf000.write("-- ── 1c. New accounts ───────────────────────────────────────────\n")
    acct_rows = [
        ("ACC-D", "Account Delta",   False),
        ("ACC-E", "Account Epsilon", False),
    ]
    vals = ",\n  ".join(f"({q(c)}, {q(n)}, {q(i)})" for c, n, i in acct_rows)
    buf000.write(f"INSERT INTO core.account (account_code, name, is_internal) VALUES\n  {vals}\nON CONFLICT (account_code) DO NOTHING;\n\n")

    buf000.write("-- ── 1d. New projects (from ELC REF_Project_Master) ─────────────\n")
    project_rows = [
        ("ACC-A-P01", "Project ACC-A-P01", "ACC-A"),
        ("ACC-A-P02", "Project ACC-A-P02", "ACC-A"),
        ("ACC-A-P03", "Project ACC-A-P03", "ACC-A"),
        ("ACC-A-P04", "Project ACC-A-P04", "ACC-A"),
        ("ACC-B-P01", "Project ACC-B-P01", "ACC-B"),
        ("ACC-B-P02", "Project ACC-B-P02", "ACC-B"),
        ("ACC-B-P03", "Project ACC-B-P03", "ACC-B"),
        ("ACC-C-P01", "Project ACC-C-P01", "ACC-C"),
        ("ACC-C-P02", "Project ACC-C-P02", "ACC-C"),
        ("ACC-C-P03", "Project ACC-C-P03", "ACC-C"),
        ("ACC-D-P01", "Project ACC-D-P01", "ACC-D"),
        ("ACC-D-P02", "Project ACC-D-P02", "ACC-D"),
        ("ACC-E-P01", "Project ACC-E-P01", "ACC-E"),
        ("ACC-E-P02", "Project ACC-E-P02", "ACC-E"),
        ("INT-P00",   "Bench / Internal",  "INTERNAL"),
    ]
    vals = ",\n  ".join(f"({q(c)}, {q(n)}, {q(a)})" for c, n, a in project_rows)
    buf000.write(
        "INSERT INTO core.project\n"
        "  (project_code, name, account_id, project_type_id, status, is_historical, start_date, planned_end_date)\n"
        "SELECT v.code, v.name,\n"
        "       (SELECT account_id FROM core.account WHERE account_code = v.acc),\n"
        "       (SELECT project_type_id FROM core.project_type WHERE type_code = 'Software'),\n"
        "       'Active', false, '2026-01-01', '2026-12-31'\n"
        "FROM (VALUES\n"
        f"  {vals}\n"
        ") AS v(code, name, acc)\nON CONFLICT (project_code) DO NOTHING;\n\n"
    )

    buf000.write("-- ── 1e. New skills (from training & candidate data) ─────────────\n")
    new_skills = [
        ("csharp",        "C#",                     "technical"),
        ("angular",       "Angular",                "technical"),
        ("nodejs",        "NodeJS",                 "technical"),
        ("mysql",         "MySQL",                  "technical"),
        ("redis",         "Redis",                  "technical"),
        ("kafka",         "Kafka",                  "technical"),
        ("rabbitmq",      "RabbitMQ",               "technical"),
        ("flask",         "Flask",                  "technical"),
        ("sqlalchemy",    "SQLAlchemy",             "technical"),
        ("elasticsearch", "Elasticsearch",          "technical"),
        ("spring_boot",   "Spring Boot",            "technical"),
        ("kotlin",        "Kotlin",                 "technical"),
        ("gcp",           "GCP",                    "technical"),
        ("azure",         "Azure",                  "technical"),
        ("jenkins",       "Jenkins",                "technical"),
        ("nginx",         "Nginx",                  "technical"),
        ("prometheus",    "Prometheus",             "technical"),
        ("grafana",       "Grafana",                "technical"),
        ("ansible",       "Ansible",                "technical"),
        ("dbt",           "dbt",                    "technical"),
        ("pytorch",       "PyTorch",                "technical"),
        ("tensorflow",    "TensorFlow",             "technical"),
        ("langchain",     "LangChain",              "technical"),
        ("playwright",    "Playwright",             "technical"),
        ("jmeter",        "JMeter",                 "technical"),
        ("reactjs",       "ReactJS",                "technical"),
        ("sql",           "SQL",                    "technical"),
        ("mongodb",       "MongoDB",                "technical"),
        ("bash",          "Bash",                   "technical"),
        ("restapi",       "REST API",               "technical"),
        ("microservices", "Microservices",          "technical"),
        ("system_design", "System Design",          "technical"),
        ("llm",           "LLM",                    "technical"),
        ("agentic_ai",    "Agentic AI",             "technical"),
        ("bigquery",      "BigQuery",               "technical"),
        ("scikit_learn",  "Scikit-learn",           "technical"),
        ("celery",        "Celery",                 "technical"),
        ("typescript",    "TypeScript",             "technical"),
        ("swift",         "Swift",                  "technical"),
        ("revit",         "Revit",                  "technical"),
        ("project_mgmt",  "Project Management",     "soft"),
        ("strategic_plan","Strategic Planning",     "soft"),
        ("cloud_general", "Cloud",                  "technical"),
        ("git",           "Git",                    "technical"),
        ("containerization","Containerization",     "technical"),
        ("automation",    "Automation",             "technical"),
        ("api_testing",   "API Testing",            "technical"),
        ("perf_testing",  "Performance Testing",    "technical"),
        ("gcp_pro_de",    "GCP Professional Data Engineer", "certification"),
        ("ckad",          "CKAD",                   "certification"),
        ("aws_sarch",     "AWS Solutions Architect","certification"),
    ]
    vals = ",\n  ".join(f"({q(c)}, {q(n)}, {q(cat)})" for c, n, cat in new_skills)
    buf000.write(
        "INSERT INTO core.skill (skill_code, name, skill_category_id)\n"
        "SELECT v.code, v.name, c.skill_category_id\n"
        "FROM (VALUES\n"
        f"  {vals}\n"
        ") AS v(code, name, cat)\n"
        "JOIN core.skill_category c ON c.category_code = v.cat\n"
        "ON CONFLICT (skill_code) DO NOTHING;\n\n"
    )

    buf000.write("-- ── 1f. New trainers (TRN-006..TRN-010) ────────────────────────\n")
    new_trainers = [
        ("TRN-006", None, "Trainer 006", 4),
        ("TRN-007", None, "Trainer 007", 4),
        ("TRN-008", None, "Trainer 008", 4),
        ("TRN-009", None, "Trainer 009", 4),
        ("TRN-010", None, "Trainer 010", 4),
    ]
    vals = ",\n  ".join(f"({q(c)}, NULL, {q(d)}, {h})" for c, _, d, h in new_trainers)
    buf000.write(
        "INSERT INTO core.trainer (trainer_code, employee_id, display_name, availability_hours_per_month)\n"
        "VALUES\n"
        f"  {vals}\nON CONFLICT (trainer_code) DO NOTHING;\n\n"
    )

    # ── 2. EMPLOYEES (ELC DS00 + synthetic for remaining IDs) ────────────────
    buf000.write("-- ── 2. Employees ────────────────────────────────────────────────\n")
    elc_employees = read_sheet(ELC05, "DS00_Employee_Master", 0)
    emp_by_code = {r["member_id"]: r for r in elc_employees if r.get("member_id")}

    referenced = all_emp_ids()
    all_emps = {}
    for code in sorted(referenced):
        if code in emp_by_code:
            all_emps[code] = emp_by_code[code]
        else:
            all_emps[code] = {
                "member_id": code,
                "role_title": "Software Engineer",
                "department": "IT - Engineering",
                "level": "L3",
                "employment_status": "Active",
                "join_date": "2022-01-01",
            }

    rows_sql = []
    for code, r in sorted(all_emps.items()):
        dept_raw = r.get("department") or "IT - Engineering"
        dept_code = DEPT_MAP.get(dept_raw, "IT-ENG")
        role_title = r.get("role_title") or "Software Engineer"
        role_code = ROLE_MAP.get(role_title, "BE")
        level = r.get("level") or "L3"
        status = r.get("employment_status") or "Active"
        if status not in ("Active", "Resigned", "On Leave", "PIP", "Probation"):
            status = "Active"
        jd_raw = r.get("join_date") or "2022-01-01"
        jd = parse_date(jd_raw, "%Y-%m-%d") or str(jd_raw)[:10]
        full_name = f"Employee {code}"
        email = f"{code.lower().replace('-', '.')}@company.com"
        rows_sql.append(
            f"  ({q(code)}, {q(full_name)}, {q(email)}, {q(dept_code)}, {q(role_code)}, {q(level)}, {q(status)}, {q(jd)})"
        )
    buf000.write(
        "INSERT INTO core.employee\n"
        "  (emp_code, full_name, email,\n"
        "   department_id, role_id, career_level_id, worker_type_id,\n"
        "   employment_type, employment_status_id, is_billable,\n"
        "   std_hours_week, join_date, exit_date)\n"
        "SELECT v.emp_code, v.full_name, v.email,\n"
        "       (SELECT department_id FROM core.department WHERE dept_code = v.dept),\n"
        "       (SELECT role_id       FROM core.role       WHERE role_code = v.role),\n"
        "       (SELECT career_level_id FROM core.career_level WHERE level_code = v.lvl),\n"
        "       (SELECT worker_type_id FROM core.worker_type WHERE type_code = 'Permanent'),\n"
        "       'FT',\n"
        "       (SELECT employment_status_id FROM core.employment_status WHERE status_code = v.status),\n"
        "       true, 40, v.join_date::date, NULL\n"
        "FROM (VALUES\n"
        + ",\n".join(rows_sql) +
        "\n) AS v(emp_code, full_name, email, dept, role, lvl, status, join_date)\n"
        "ON CONFLICT (emp_code) DO NOTHING;\n\n"
    )

    # ── 3. ELC DATA ───────────────────────────────────────────────────────────

    # 3a. violation_type (DS04b)
    buf005.write("-- ── 3a. elc.violation_type ─────────────────────────────────────\n")
    vt_rows = read_sheet(ELC05, "DS04b_ViolationType_Ref", 0)
    vals = ",\n  ".join(
        f"({q(r['violation_type_code'])}, {q(r['category'])}, {q(r['violation_type_desc'])}, "
        f"{q(r['typical_severity'])}, {q(r['typical_consequence'])})"
        for r in vt_rows if r.get("violation_type_code")
    )
    buf005.write(
        "INSERT INTO elc.violation_type\n"
        "  (violation_type_code, category, violation_type_desc, typical_severity, typical_consequence)\n"
        "VALUES\n"
        f"  {vals}\nON CONFLICT (violation_type_code) DO NOTHING;\n\n"
    )

    # 3b. performance_norm (DS07)
    buf005.write("-- ── 3b. elc.performance_norm ───────────────────────────────────\n")
    pn_rows = read_sheet(ELC05, "DS07_Performance_NORM", 0)
    vals = ",\n  ".join(
        f"({q(r['norm_id'])}, {q(r['category'])}, {q(r['rule_description'])}, "
        f"{q(r['threshold'])}, {q(r['classification_label'])}, "
        f"{q(r['action_if_triggered'])}, {q(r['priority'])}, {q(r['applies_to'])})"
        for r in pn_rows if r.get("norm_id")
    )
    buf005.write(
        "INSERT INTO elc.performance_norm\n"
        "  (norm_code, category, rule_description, threshold, classification_label,\n"
        "   action_if_triggered, priority, applies_to)\n"
        "VALUES\n"
        f"  {vals}\nON CONFLICT (norm_code) DO NOTHING;\n\n"
    )

    # 3c. performance_review (DS02)
    buf005.write("-- ── 3c. elc.performance_review ────────────────────────────────\n")
    pr_rows = read_sheet(ELC05, "DS02_Performance_by_Project", 0)
    class_map = {
        "Exceeds Expectations": "Excellent",
        "Excellent": "Excellent",
        "Good": "Good",
        "Meets Expectations": "Meets Expectations",
        "Below Expectations": "Below Expectations",
        "Needs Improvement": "Below Expectations",
        "Poor": "Poor",
    }
    pr_vals = []
    for r in pr_rows:
        emp = r.get("member_id")
        rev = r.get("reviewer_id")
        if not emp or not r.get("report_period"):
            continue
        if rev and not str(rev).startswith("EMP-"):
            rev = None
        cls_raw = str(r.get("classification") or "Meets Expectations")
        cls = class_map.get(cls_raw, "Meets Expectations")
        pts = r.get("total_point")
        if pts is None:
            continue
        period = str(r.get("report_period"))[:7]
        freq = r.get("review_frequency") or "Monthly"
        fb = r.get("feedback_category") or ""
        pr_vals.append(
            f"  ({q(emp)}, {q(rev)}, {q(period)}, {pts}, {q(cls)}, {q(fb)}, {q(freq)})"
        )
    buf005.write(
        "INSERT INTO elc.performance_review\n"
        "  (employee_id, reviewer_id, report_period, total_point, classification, feedback_category, review_frequency)\n"
        "SELECT\n"
        "  (SELECT employee_id FROM core.employee WHERE emp_code = v.emp),\n"
        "  (SELECT employee_id FROM core.employee WHERE emp_code = v.rev),\n"
        "  v.period, v.points::numeric, v.class, v.feedback, v.freq\n"
        "FROM (VALUES\n"
        + ",\n".join(pr_vals) +
        "\n) AS v(emp, rev, period, points, class, feedback, freq)\n"
        "ON CONFLICT (employee_id, report_period) DO NOTHING;\n\n"
    )

    # 3d. timesheet_monthly (DS03)
    buf005.write("-- ── 3d. elc.timesheet_monthly ──────────────────────────────────\n")
    ts_rows = read_sheet(ELC05, "DS03_Timesheet_Logwork", 0)
    ts_vals = []
    for r in ts_rows:
        emp = r.get("member_id")
        period = str(r.get("report_period") or "")[:7]
        if not emp or not period:
            continue
        def n(k, default=0, _r=r):
            v = _r.get(k)
            return v if v is not None else default
        ts_vals.append(
            f"  ({q(emp)}, {q(period)}, {n('work_days_in_month')}, "
            f"{n('days_probation')}, {n('days_official')}, {n('days_holiday_official')}, "
            f"{n('days_leave_approved')}, {n('days_late')}, {n('days_absent_unapproved')}, {n('actual_work_days')}, "
            f"{n('ot_hours_weekday')}, {n('ot_hours_weekend')}, {n('ot_hours_holiday')}, "
            f"{n('total_ot_hours')}, {n('night_shift_hours')})"
        )
    buf005.write(
        "INSERT INTO elc.timesheet_monthly\n"
        "  (employee_id, report_period, work_days_in_month,\n"
        "   days_probation, days_official, days_holiday_official,\n"
        "   days_leave_approved, days_late, days_absent_unapproved, actual_work_days,\n"
        "   ot_hours_weekday, ot_hours_weekend, ot_hours_holiday, total_ot_hours, night_shift_hours)\n"
        "SELECT\n"
        "  (SELECT employee_id FROM core.employee WHERE emp_code = v.emp),\n"
        "  v.period, v.wdm::int,\n"
        "  v.dp::numeric, v.do_::numeric, v.dho::numeric,\n"
        "  v.dla::numeric, v.dlate::numeric, v.dau::numeric, v.awd::numeric,\n"
        "  v.ot_wd::numeric, v.ot_we::numeric, v.ot_hol::numeric, v.tot_ot::numeric, v.ns::numeric\n"
        "FROM (VALUES\n"
        + ",\n".join(ts_vals) +
        "\n) AS v(emp, period, wdm, dp, do_, dho, dla, dlate, dau, awd,\n"
        "       ot_wd, ot_we, ot_hol, tot_ot, ns)\n"
        "ON CONFLICT (employee_id, report_period) DO NOTHING;\n\n"
    )

    # 3e. violation (DS04)
    buf005.write("-- ── 3e. elc.violation ───────────────────────────────────────────\n")
    v_rows = read_sheet(ELC05, "DS04_Violation_Attitude", 0)
    v_vals = []
    for r in v_rows:
        vcode = r.get("violation_id")
        emp = r.get("member_id")
        if not vcode or not emp:
            continue
        vtype = r.get("violation_type_code")
        sev = r.get("severity") or "Low"
        cons = r.get("consequence") or ""
        status_raw = str(r.get("status") or "Open")
        valid_statuses = {"Open", "Under Review", "Resolved", "Escalated", "Closed - No Action"}
        status = status_raw if status_raw in valid_statuses else "Open"
        idate = parse_date(r.get("incident_date")) or "2024-01-01"
        reported = r.get("reported_by") or ""
        action = r.get("action_taken") or ""
        v_vals.append(
            f"  ({q(vcode)}, {q(emp)}, {q(vtype)}, {q(sev)}, {q(cons)}, "
            f"{q(status)}, {q(idate)}, {q(reported)}, {q(action)})"
        )
    buf005.write(
        "INSERT INTO elc.violation\n"
        "  (violation_code, employee_id, violation_type_code, severity, consequence,\n"
        "   status, incident_date, reported_by, action_taken)\n"
        "SELECT\n"
        "  v.vcode,\n"
        "  (SELECT employee_id FROM core.employee WHERE emp_code = v.emp),\n"
        "  v.vtype, v.severity, v.consequence, v.status,\n"
        "  v.idate::date, v.reported_by, v.action\n"
        "FROM (VALUES\n"
        + ",\n".join(v_vals) +
        "\n) AS v(vcode, emp, vtype, severity, consequence, status, idate, reported_by, action)\n"
        "ON CONFLICT (violation_code) DO NOTHING;\n\n"
    )

    # 3f. promotion_intent (DS05)
    buf005.write("-- ── 3f. elc.promotion_intent ───────────────────────────────────\n")
    pi_rows = read_sheet(ELC05, "DS05_Promotion_Intent", 0)
    valid_levels = {"L1", "L2", "L3", "L4", "L5", "L6", "L7"}
    pi_vals = []
    for r in pi_rows:
        emp = r.get("member_id")
        cur = r.get("current_level")
        tgt = r.get("target_level")
        score = r.get("readiness_score")
        if not emp or not cur or not tgt or score is None:
            continue
        cur = cur if cur in valid_levels else "L7"
        tgt = tgt if tgt in valid_levels else "L7"
        pi_vals.append(f"  ({q(emp)}, {q(cur)}, {q(tgt)}, {score})")
    buf005.write(
        "INSERT INTO elc.promotion_intent\n"
        "  (employee_id, current_level_id, target_level_id, readiness_score)\n"
        "SELECT\n"
        "  (SELECT employee_id    FROM core.employee    WHERE emp_code    = v.emp),\n"
        "  (SELECT career_level_id FROM core.career_level WHERE level_code = v.cur),\n"
        "  (SELECT career_level_id FROM core.career_level WHERE level_code = v.tgt),\n"
        "  v.score::numeric\n"
        "FROM (VALUES\n"
        + ",\n".join(pi_vals) +
        "\n) AS v(emp, cur, tgt, score)\n"
        "ON CONFLICT (employee_id) DO NOTHING;\n\n"
    )

    # 3g. salary_band (DS06)
    buf005.write("-- ── 3g. elc.salary_band ────────────────────────────────────────\n")
    sb_rows = read_sheet(ELC05, "DS06_Salary_Band", 0)
    sb_vals = []
    for r in sb_rows:
        emp = r.get("member_id")
        band_raw = r.get("salary_band")
        band = salary_band_letter(str(band_raw)) if band_raw else None
        edate_raw = r.get("effective_date")
        edate = parse_date(edate_raw, "%Y-%m-%d") or str(edate_raw)[:10]
        if not emp or not band:
            continue
        sb_vals.append(f"  ({q(emp)}, {q(band)}, {q(edate)})")
    buf005.write(
        "INSERT INTO elc.salary_band (employee_id, salary_band, effective_date)\n"
        "SELECT\n"
        "  (SELECT employee_id FROM core.employee WHERE emp_code = v.emp),\n"
        "  v.band, v.edate::date\n"
        "FROM (VALUES\n"
        + ",\n".join(sb_vals) +
        "\n) AS v(emp, band, edate)\n"
        "ON CONFLICT (employee_id, effective_date) DO NOTHING;\n\n"
    )

    # ── 4. LnD DATA ───────────────────────────────────────────────────────────

    # 4a. bod_training_goal (DS05)
    buf006.write("-- ── 4a. lnd.bod_training_goal ──────────────────────────────────\n")
    goal_rows = read_sheet(LND06, "DS05_BOD_Training_Goals", 0)
    goal_vals = [
        f"  ({q(r['Goal_ID'])}, {q(r['Goal_Description'])}, {q(r['Target_Quarter'])})"
        for r in goal_rows if r.get("Goal_ID")
    ]
    buf006.write(
        "INSERT INTO lnd.bod_training_goal (goal_code, goal_description, target_quarter)\n"
        "VALUES\n"
        + ",\n".join(goal_vals) +
        "\nON CONFLICT (goal_code) DO NOTHING;\n\n"
    )

    # 4b. training_need_survey (DS03)
    buf006.write("-- ── 4b. lnd.training_need_survey ───────────────────────────────\n")
    tn_rows = read_sheet(LND06, "DS03_Training_Need_Survey", 0)
    tn_vals = []
    seen_wave_emp = set()
    for r in tn_rows:
        wave = r.get("Survey_ID")
        emp = r.get("Employee_ID")
        topic = r.get("Training_Topic")
        prio = r.get("Priority") or "Medium"
        if not wave or not emp or not topic:
            continue
        key = (wave, emp)
        if key in seen_wave_emp:
            continue
        seen_wave_emp.add(key)
        code = f"SUR-{wave}-{emp}"
        tn_vals.append(f"  ({q(code)}, {q(wave)}, {q(emp)}, {q(topic)}, {q(prio)})")
    buf006.write(
        "INSERT INTO lnd.training_need_survey\n"
        "  (survey_response_code, survey_wave, employee_id, training_topic, priority)\n"
        "SELECT\n"
        "  v.code, v.wave,\n"
        "  (SELECT employee_id FROM core.employee WHERE emp_code = v.emp),\n"
        "  v.topic, v.priority\n"
        "FROM (VALUES\n"
        + ",\n".join(tn_vals) +
        "\n) AS v(code, wave, emp, topic, priority)\n"
        "ON CONFLICT (survey_response_code) DO NOTHING;\n\n"
    )

    # 4c. employee_skill_gap from DS01
    buf006.write("-- ── 4c. lnd.employee_skill_gap ─────────────────────────────────\n")
    sg_rows = read_sheet(LND06, "DS01_Employee_Skill_Profile", 0)
    skill_name_to_code: dict[str, str] = {}

    def register_skill(name: str) -> str:
        name = name.strip()
        scode = slugify(name)[:50]
        skill_name_to_code[name] = scode
        return scode

    gap_pairs: list[tuple[str, str, str]] = []
    for r in sg_rows:
        emp = r.get("Employee_ID")
        gap_raw = r.get("Skill_Gap") or ""
        if not emp or not gap_raw:
            continue
        for skill in re.split(r"[;,]", str(gap_raw)):
            skill = skill.strip()
            if skill:
                scode = register_skill(skill)
                gap_pairs.append((emp, scode, skill))

    if gap_pairs:
        buf006.write("-- ensure gap skill codes exist\n")
        new_gap_skills = {(scode, name) for _, scode, name in gap_pairs}
        vals = ",\n  ".join(f"({q(c)}, {q(n)}, 'technical')" for c, n in sorted(new_gap_skills))
        buf006.write(
            "INSERT INTO core.skill (skill_code, name, skill_category_id)\n"
            "SELECT v.code, v.name, c.skill_category_id\n"
            "FROM (VALUES\n"
            f"  {vals}\n"
            ") AS v(code, name, cat)\n"
            "JOIN core.skill_category c ON c.category_code = v.cat\n"
            "ON CONFLICT (skill_code) DO NOTHING;\n\n"
        )
        seen_gaps: set[tuple[str, str]] = set()
        gap_vals = []
        for emp, scode, _ in gap_pairs:
            key = (emp, scode)
            if key in seen_gaps:
                continue
            seen_gaps.add(key)
            gap_vals.append(f"  ({q(emp)}, {q(scode)})")
        buf006.write(
            "INSERT INTO lnd.employee_skill_gap\n"
            "  (employee_id, skill_id, gap_source, priority)\n"
            "SELECT\n"
            "  (SELECT employee_id FROM core.employee WHERE emp_code = v.emp),\n"
            "  (SELECT skill_id    FROM core.skill    WHERE skill_code = v.skill),\n"
            "  'Project', 'High'\n"
            "FROM (VALUES\n"
            + ",\n".join(gap_vals) +
            "\n) AS v(emp, skill)\n"
            "ON CONFLICT (employee_id, skill_id) DO NOTHING;\n\n"
        )

    # 4d. course_catalog (DS06 from LND07)
    buf007.write("-- ── 4d. lnd.course_catalog ─────────────────────────────────────\n")
    cc_rows = read_sheet(LND07, "DS06_Course_Catalog", 0)
    cc_vals = []
    for r in cc_rows:
        code = r.get("Course_ID")
        if not code:
            continue
        sd = parse_date(r.get("Start_Date"), "%Y-%m-%d") or str(r.get("Start_Date"))[:10]
        ed = parse_date(r.get("End_Date"), "%Y-%m-%d") or str(r.get("End_Date"))[:10]
        cc_vals.append(
            f"  ({q(code)}, {q(r['Course_Name'])}, {q(r['Topic_Category'])}, "
            f"{q(r['Trainer_ID'])}, {r['Total_Sessions']}, {r['Hours_Per_Session']}, "
            f"{r['Total_Hours']}, {r['Pass_Threshold_Score']}, {q(sd)}, {q(ed)}, {q(r['Status'])})"
        )
    buf007.write(
        "INSERT INTO lnd.course_catalog\n"
        "  (course_code, course_name, topic_category, trainer_id,\n"
        "   total_sessions, hours_per_session, total_hours,\n"
        "   pass_threshold_score, start_date, end_date, status)\n"
        "SELECT\n"
        "  v.code, v.name, v.cat,\n"
        "  (SELECT trainer_id FROM core.trainer WHERE trainer_code = v.trainer),\n"
        "  v.ts::int, v.hps::numeric, v.th::numeric,\n"
        "  v.pts::numeric, v.sd::date, v.ed::date, v.status\n"
        "FROM (VALUES\n"
        + ",\n".join(cc_vals) +
        "\n) AS v(code, name, cat, trainer, ts, hps, th, pts, sd, ed, status)\n"
        "ON CONFLICT (course_code) DO NOTHING;\n\n"
    )

    # 4e. attendance_log (DS07)
    buf007.write("-- ── 4e. lnd.attendance_log ─────────────────────────────────────\n")
    al_rows = read_sheet(LND07, "DS07_Attendance_Log", 0)
    al_vals = []
    seen_al: set[tuple[str, int, str]] = set()
    for r in al_rows:
        course = r.get("Course_ID")
        sid = r.get("Session_ID")
        emp = r.get("Employee_ID")
        status = r.get("Attendance_Status") or "Present"
        hours = r.get("Training_Hours") or 0
        if not course or not sid or not emp:
            continue
        sno = session_no(str(sid))
        key = (course, sno, emp)
        if key in seen_al:
            continue
        seen_al.add(key)
        al_vals.append(f"  ({q(course)}, {sno}, {q(emp)}, {q(status)}, {hours})")
    buf007.write(
        "INSERT INTO lnd.attendance_log\n"
        "  (course_id, session_no, employee_id, attendance_status, training_hours)\n"
        "SELECT\n"
        "  (SELECT course_id   FROM lnd.course_catalog WHERE course_code = v.course),\n"
        "  v.sno::int,\n"
        "  (SELECT employee_id FROM core.employee      WHERE emp_code    = v.emp),\n"
        "  v.status, v.hours::numeric\n"
        "FROM (VALUES\n"
        + ",\n".join(al_vals) +
        "\n) AS v(course, sno, emp, status, hours)\n"
        "ON CONFLICT (course_id, session_no, employee_id) DO NOTHING;\n\n"
    )

    # 4f. assessment_score (DS08)
    buf007.write("-- ── 4f. lnd.assessment_score ───────────────────────────────────\n")
    as_rows = read_sheet(LND07, "DS08_Assessment_Score", 0)
    as_vals = []
    seen_as: set[tuple[str, str]] = set()
    for r in as_rows:
        course = r.get("Course_ID")
        emp = r.get("Employee_ID")
        score = r.get("Score_0_to_10")
        pass_s = r.get("Pass_Status")
        feedback = r.get("Generalized_Feedback") or ""
        if not course or not emp or score is None:
            continue
        key = (course, emp)
        if key in seen_as:
            continue
        seen_as.add(key)
        pass_sql = "true" if pass_s else "false"
        as_vals.append(f"  ({q(course)}, {q(emp)}, {score}, {pass_sql}, {q(feedback)})")
    buf007.write(
        "INSERT INTO lnd.assessment_score\n"
        "  (course_id, employee_id, score_0_to_10, pass_status, generalized_feedback)\n"
        "SELECT\n"
        "  (SELECT course_id   FROM lnd.course_catalog WHERE course_code = v.course),\n"
        "  (SELECT employee_id FROM core.employee      WHERE emp_code    = v.emp),\n"
        "  v.score::numeric, v.pass_status::boolean, v.feedback\n"
        "FROM (VALUES\n"
        + ",\n".join(as_vals) +
        "\n) AS v(course, emp, score, pass_status, feedback)\n"
        "ON CONFLICT (course_id, employee_id) DO NOTHING;\n\n"
    )

    # 4g. feedback_survey (DS09)
    buf007.write("-- ── 4g. lnd.feedback_survey ────────────────────────────────────\n")
    fs_rows = read_sheet(LND07, "DS09_Feedback_Survey", 0)
    fs_vals = []
    seen_fs: set[tuple[str, str]] = set()
    for r in fs_rows:
        course = r.get("Course_ID")
        emp = r.get("Employee_ID")
        tr = r.get("Trainer_Rating_1_to_5")
        cr = r.get("Content_Rating_1_to_5")
        comment = r.get("Comment") or ""
        if not course or not emp or tr is None or cr is None:
            continue
        key = (course, emp)
        if key in seen_fs:
            continue
        seen_fs.add(key)
        fs_vals.append(f"  ({q(course)}, {q(emp)}, {tr}, {cr}, {q(comment)})")
    buf007.write(
        "INSERT INTO lnd.feedback_survey\n"
        "  (course_id, employee_id, trainer_rating, content_rating, comment)\n"
        "SELECT\n"
        "  (SELECT course_id   FROM lnd.course_catalog WHERE course_code = v.course),\n"
        "  (SELECT employee_id FROM core.employee      WHERE emp_code    = v.emp),\n"
        "  v.tr::numeric, v.cr::numeric, v.comment\n"
        "FROM (VALUES\n"
        + ",\n".join(fs_vals) +
        "\n) AS v(course, emp, tr, cr, comment)\n"
        "ON CONFLICT (course_id, employee_id) DO NOTHING;\n\n"
    )

    # 4h. training_cost (DS10)
    buf007.write("-- ── 4h. lnd.training_cost ──────────────────────────────────────\n")
    tc_rows = read_sheet(LND07, "DS10_Training_Cost_ROI", 0)
    tc_vals = []
    for r in tc_rows:
        course = r.get("Course_ID")
        cps = r.get("Cost_Per_Session_Scaled")
        tc = r.get("Total_Cost_Scaled")
        delta = r.get("Post_Training_Perf_Delta")
        if not course or cps is None or tc is None:
            continue
        delta_sql = str(delta) if delta is not None else "NULL"
        tc_vals.append(f"  ({q(course)}, {cps}, {tc}, {delta_sql})")
    buf007.write(
        "INSERT INTO lnd.training_cost\n"
        "  (course_id, cost_per_session_scaled, total_cost_scaled, post_training_perf_delta)\n"
        "SELECT\n"
        "  (SELECT course_id FROM lnd.course_catalog WHERE course_code = v.course),\n"
        "  v.cps::numeric, v.tc::numeric, v.delta\n"
        "FROM (VALUES\n"
        + ",\n".join(tc_vals) +
        "\n) AS v(course, cps, tc, delta)\n"
        "ON CONFLICT (course_id) DO NOTHING;\n\n"
    )

    # 4i. training_norm (DS11)
    buf007.write("-- ── 4i. lnd.training_norm ──────────────────────────────────────\n")
    tn2_rows = read_sheet(LND07, "DS11_LnD_Training_NORM", 0)
    tn2_vals = []
    for r in tn2_rows:
        code = r.get("Rule_ID")
        if not code:
            continue
        tn2_vals.append(
            f"  ({q(code)}, {q(r['Category'])}, {q(r['Rule_Description'])}, "
            f"{q(r['Threshold'])}, {q(r['Action_If_Triggered'])}, {q(r['Priority'])})"
        )
    buf007.write(
        "INSERT INTO lnd.training_norm\n"
        "  (rule_code, category, rule_description, threshold, action_if_triggered, priority)\n"
        "VALUES\n"
        + ",\n".join(tn2_vals) +
        "\nON CONFLICT (rule_code) DO NOTHING;\n\n"
    )

    # 4j. report_template_section (DS12)
    buf007.write("-- ── 4j. lnd.report_template_section ────────────────────────────\n")
    rts_rows = read_sheet(LND07, "DS12_Report_Template_Structure", 0)
    rts_vals = []
    for r in rts_rows:
        code = r.get("Section_ID")
        if not code:
            continue
        req_raw = str(r.get("Required") or "Yes")
        is_req = req_raw.strip().lower() in ("yes", "true", "1")
        rts_vals.append(
            f"  ({q(code)}, {q(r['Section_Name'])}, {q(r['Content_Description'])}, "
            f"{q(r['Data_Source'])}, {q(is_req)})"
        )
    buf007.write(
        "INSERT INTO lnd.report_template_section\n"
        "  (section_code, section_name, content_description, data_source, is_required)\n"
        "VALUES\n"
        + ",\n".join(rts_vals) +
        "\nON CONFLICT (section_code) DO NOTHING;\n\n"
    )

    # ── 5. TA DATA ────────────────────────────────────────────────────────────

    # 5a. business_context (DS-01) — add new contexts only
    buf003.write("-- ── 5a. ta.business_context (new contexts only) ────────────────\n")
    bc_rows = read_sheet(TA03, "DS-01_Business_Context", 1)
    existing_ctx = {"CTX-001", "CTX-002", "CTX-003", "CTX-004", "CTX-005", "CTX-006", "CTX-007"}
    new_bc = [r for r in bc_rows if r.get("context_id") and r["context_id"] not in existing_ctx]
    if new_bc:
        vals = ",\n  ".join(
            f"({q(r['context_id'])}, {q(r.get('project_name',''))}, {q(r.get('business_roadmap_summary',''))})"
            for r in new_bc
        )
        buf003.write(
            "INSERT INTO ta.business_context (context_code, project_name, roadmap_summary)\n"
            "VALUES\n"
            f"  {vals}\nON CONFLICT (context_code) DO NOTHING;\n"
        )
    else:
        buf003.write("-- (all context IDs already covered by seed 003)\n")
    buf003.write("\n")

    # 5b. headcount_plan (DS-02) — add new plan codes only
    buf003.write("-- ── 5b. ta.headcount_plan (new plans only) ─────────────────────\n")
    hp_rows = read_sheet(TA03, "DS-02_Headcount_Plan", 1)
    existing_hc = {"HC-2025-Q2-001", "HC-2025-Q2-002", "HC-2025-Q3-001",
                   "HC-2025-Q3-002", "HC-2025-Q3-003", "HC-2025-Q4-001", "HC-2025-Q4-002"}
    new_hp = [r for r in hp_rows if r.get("hc_plan_id") and r["hc_plan_id"] not in existing_hc]
    if new_hp:
        hp_vals = []
        for r in new_hp:
            smin, smax = parse_salary(r.get("salary_range") or "")
            tsd = parse_date(r.get("target_start_date"), "%Y-%m-%d") or "2026-01-01"
            hp_vals.append(
                f"  ({q(r['hc_plan_id'])}, {q(r.get('context_id',''))}, "
                f"{q(r.get('position',''))}, {r.get('headcount',1)}, "
                f"{q(smin)}, {q(smax)}, {q(tsd)})"
            )
        buf003.write(
            "INSERT INTO ta.headcount_plan\n"
            "  (hc_plan_code, context_id, position, headcount,\n"
            "   salary_min_scaled, salary_max_scaled, target_start_date)\n"
            "SELECT\n"
            "  v.code,\n"
            "  (SELECT business_context_id FROM ta.business_context WHERE context_code = v.ctx),\n"
            "  v.position, v.hc::int, v.smin, v.smax, v.tsd::date\n"
            "FROM (VALUES\n"
            + ",\n".join(hp_vals) +
            "\n) AS v(code, ctx, position, hc, smin, smax, tsd)\n"
            "ON CONFLICT (hc_plan_code) DO NOTHING;\n"
        )
    else:
        buf003.write("-- (all plan IDs already covered by seed 003)\n")
    buf003.write("\n")

    # 5b2. jd_template (DS-03) — add 9 new enhanced JDs
    buf003.write("-- ── 5b3. ta.jd_template (enhanced JDs) ─────────────────────────\n")
    SENIORITY_MAP_LOCAL = {'Middle': 'Mid'}
    WORK_MAP_LOCAL = {
        'Hybrid (3 days office)': 'Hybrid', 'Any (remote-friendly)': 'Any',
        'Remote-first': 'Remote', 'Remote or Hybrid': 'Hybrid',
        'Onsite': 'On-site', 'onsite': 'On-site',
    }
    ENGLISH_MAP_LOCAL = {'c1': 'C1', 'c2': 'C2', 'Onsite': None}
    JD_ROLE_MAP = {
        'Senior Backend Developer': 'BE', 'Backend Developer': 'BE',
        'Python Developer': 'BE', 'Full-Stack Developer': 'BE',
        'Fullstack (ReactJS+Python)': 'BE',
        'QA Automation Engineer': 'QA', 'Senior QA Engineer': 'QA', 'PQA': 'QA',
        'Mobile Developer (React Native)': 'Mobile', 'Flutter Developer': 'Mobile',
        'Data Engineer': 'DevOps', 'DevOps Engineer': 'DevOps',
        'AI/ML Engineer': 'ML', 'Senior Frontend Developer': 'FE',
        'Frontend Developer': 'FE', 'Scrum Master': 'PM',
    }
    EXISTING_JD = {
        'JD-BE-SR-001','JD-BE-SR-002','JD-MOB-MID-001','JD-QA-MID-001',
        'JD-DE-SR-001','JD-DO-SR-001','JD-AI-SR-001','JD-FE-SR-001',
    }
    jd_rows = read_sheet(TA03, "DS-03_JD_Template", 1)
    new_jds = [r for r in jd_rows if r.get("jd_id") and r["jd_id"] not in EXISTING_JD]
    if new_jds:
        jd_vals = []
        for r in new_jds:
            pos = r.get("position", "")
            role = JD_ROLE_MAP.get(pos, "BE")
            hc = r.get("hc_plan_id")
            ver = r.get("jd_version")
            stat = r.get("status", "Ready")
            if stat not in ('In Draft','Not Started','Ready','Approved','Archived'):
                stat = 'Ready'
            raw_sen = str(r.get("seniority_level") or "").strip()
            sen = SENIORITY_MAP_LOCAL.get(raw_sen, raw_sen)
            if sen not in ('Junior','Mid','Senior','Lead','Principal'): sen = None
            raw_eng = str(r.get("english_level_required") or "").strip()
            eng = ENGLISH_MAP_LOCAL.get(raw_eng, raw_eng)
            if eng not in ('A1','A2','B1','B2','C1','C2'): eng = None
            raw_wm = str(r.get("work_mode") or "").strip()
            wm = WORK_MAP_LOCAL.get(raw_wm, raw_wm)
            if wm not in ('On-site','Hybrid','Remote','Any'): wm = None
            lu = r.get("last_updated")
            lu_s = f"'{lu.strftime('%Y-%m-%d')}'" if hasattr(lu, 'strftime') else 'NULL'
            smin, smax = parse_salary(r.get("salary_range") or "")
            min_y = r.get("min_yoe")
            max_y = r.get("max_yoe")
            jd_vals.append(
                f"  ({q(r['jd_id'])},{q(pos)},{q(role)},{q(hc)},"
                f"{q(ver)},{q(stat)},{lu_s},"
                f"{'NULL' if min_y is None else int(min_y)},"
                f"{'NULL' if max_y is None else int(max_y)},"
                f"{q(sen)},{q(eng)},{q(wm)},"
                f"{'NULL' if smin is None else smin},"
                f"{'NULL' if smax is None else smax},"
                f"{q(r.get('must_have_skills',''))},"
                f"{q(r.get('nice_to_have_skills',''))},"
                f"{q(r.get('key_responsibilities',''))},"
                f"{q(r.get('jd_full_text',''))})"
            )
        buf003.write(
            "INSERT INTO ta.jd_template\n"
            "  (jd_code, position, role_id, hc_plan_id,\n"
            "   jd_version, jd_status, last_updated, min_yoe, max_yoe,\n"
            "   seniority_level, english_level_required, work_mode,\n"
            "   salary_min_scaled, salary_max_scaled,\n"
            "   must_have_skills, nice_to_have_skills, key_responsibilities, jd_full_text)\n"
            "SELECT v.code, v.pos,\n"
            "  (SELECT role_id FROM core.role WHERE role_code = v.role),\n"
            "  (SELECT headcount_plan_id FROM ta.headcount_plan WHERE hc_plan_code = v.hc),\n"
            "  v.ver, v.status, v.lu::date, v.min_yoe::int, v.max_yoe::int,\n"
            "  v.sen, v.eng, v.wm, v.smin::numeric, v.smax::numeric,\n"
            "  v.mh, v.nth, v.kr, v.ft\n"
            "FROM (VALUES\n"
            + ",\n".join(jd_vals) +
            "\n) AS v(code,pos,role,hc,ver,status,lu,min_yoe,max_yoe,sen,eng,wm,smin,smax,mh,nth,kr,ft)\n"
            "ON CONFLICT (jd_code) DO NOTHING;\n"
        )
        buf003.write("\n")
        buf003.write("-- ── 5b4. ta.jd_required_skill (for enhanced JDs) ────────────────\n")
        buf003.write(
            "INSERT INTO ta.jd_required_skill (jd_id, skill_id, skill_type)\n"
            "SELECT j.jd_template_id, s.skill_id, v.stype\n"
            "FROM (VALUES\n"
            "  ('JD-PY-MID-001','python','must_have'),('JD-PY-MID-001','fastapi','must_have'),('JD-PY-MID-001','sql','must_have'),\n"
            "  ('JD-PY-MID-001','docker','nice_to_have'),('JD-PY-MID-001','redis','nice_to_have'),\n"
            "  ('JD-FS-MID-001','reactjs','must_have'),('JD-FS-MID-001','python','must_have'),('JD-FS-MID-001','restapi','must_have'),\n"
            "  ('JD-FS-MID-001','docker','nice_to_have'),('JD-FS-MID-001','aws','nice_to_have'),('JD-FS-MID-001','cicd','nice_to_have'),\n"
            "  ('JD-QA-MID-002','selenium','must_have'),('JD-QA-MID-002','api_testing','must_have'),('JD-QA-MID-002','sql','must_have'),\n"
            "  ('JD-QA-MID-002','playwright','nice_to_have'),('JD-QA-MID-002','jenkins','nice_to_have'),\n"
            "  ('JD-DO-SR-002','docker','must_have'),('JD-DO-SR-002','k8s','must_have'),('JD-DO-SR-002','cicd','must_have'),\n"
            "  ('JD-DO-SR-002','terraform','nice_to_have'),('JD-DO-SR-002','aws','nice_to_have'),\n"
            "  ('JD-FE-MID-002','reactjs','must_have'),('JD-FE-MID-002','typescript','must_have'),('JD-FE-MID-002','restapi','must_have'),\n"
            "  ('JD-FE-MID-002','react','nice_to_have'),\n"
            "  ('JD-MOB-MID-002','reactnative','must_have'),('JD-MOB-MID-002','restapi','must_have'),\n"
            "  ('JD-MOB-MID-002','react','nice_to_have'),\n"
            "  ('JD-FL-MID-001','restapi','must_have'),('JD-FL-MID-001','git','must_have'),\n"
            "  ('JD-FL-MID-001','cicd','nice_to_have'),\n"
            "  ('JD-SM-SR-001','agile','must_have'),('JD-SM-SR-001','communication','must_have'),('JD-SM-SR-001','project_mgmt','must_have'),\n"
            "  ('JD-SM-SR-001','mentoring','nice_to_have'),\n"
            "  ('JD-PQA-SR-001','communication','must_have'),('JD-PQA-SR-001','project_mgmt','must_have'),\n"
            "  ('JD-PQA-SR-001','agile','nice_to_have'),('JD-PQA-SR-001','istqb','nice_to_have')\n"
            ") AS v(jd, skill, stype)\n"
            "JOIN ta.jd_template j ON j.jd_code = v.jd\n"
            "JOIN core.skill s ON s.skill_code = v.skill\n"
            "ON CONFLICT (jd_id, skill_id) DO NOTHING;\n"
        )
        buf003.write("\n")
    else:
        buf003.write("-- (all enhanced JDs already covered by seed 003)\n\n")

    # 5c. candidates (DS-06 from TA04)
    buf004.write("-- ── 5c. ta.candidate ───────────────────────────────────────────\n")
    cand_rows = read_sheet(TA04, "DS-06_Candidate_Database", 1)
    valid_sources = {"LinkedIn", "TopCV", "Email", "FB"}
    valid_statuses = {"Passed", "In-pool", "Rejected", "Failed", "Applied"}
    status_fix = {"Applied": "In-pool", "CV Review": "In-pool", "Phone Screen": "In-pool"}

    cand_vals = []
    cand_skills_map: dict[str, list[str]] = {}
    for r in cand_rows:
        code = r.get("candidate_id")
        if not code:
            continue
        status_raw = str(r.get("status") or "In-pool")
        status = status_fix.get(status_raw, status_raw)
        if status not in valid_statuses or status == "Applied":
            status = "In-pool"
        source_raw = str(r.get("source") or "LinkedIn")
        source = source_raw if source_raw in valid_sources else "LinkedIn"
        smin, smax = parse_salary(r.get("salary_expectation") or "")
        skills_raw = str(r.get("cv_skills") or "")
        skills = [s.strip() for s in re.split(r"[,;]", skills_raw) if s.strip()]
        cand_skills_map[code] = skills
        cand_vals.append(
            f"  ({q(code)}, {q(r.get('full_name',''))}, {q(r.get('email',''))}, "
            f"{q(r.get('phone',''))}, {q(r.get('applied_position',''))}, "
            f"{q(smin)}, {q(smax)}, {q(status)}, {q(source)})"
        )
    buf004.write(
        "INSERT INTO ta.candidate\n"
        "  (candidate_code, full_name, email, phone,\n"
        "   applied_position, salary_expectation_min_scaled, salary_expectation_max_scaled,\n"
        "   status, source)\n"
        "VALUES\n"
        + ",\n".join(cand_vals) +
        "\nON CONFLICT (candidate_code) DO NOTHING;\n\n"
    )

    # 5d. candidate_skill — ensure skills exist first
    buf004.write("-- ── 5d. ta.candidate_skill ─────────────────────────────────────\n")
    all_cand_skills: set[tuple[str, str]] = set()
    for code, skills in cand_skills_map.items():
        for sk in skills:
            sc = slugify(sk)[:50]
            all_cand_skills.add((sc, sk))

    if all_cand_skills:
        vals = ",\n  ".join(f"({q(c)}, {q(n)}, 'technical')" for c, n in sorted(all_cand_skills))
        buf004.write(
            "INSERT INTO core.skill (skill_code, name, skill_category_id)\n"
            "SELECT v.code, v.name, c.skill_category_id\n"
            "FROM (VALUES\n"
            f"  {vals}\n"
            ") AS v(code, name, cat)\n"
            "JOIN core.skill_category c ON c.category_code = v.cat\n"
            "ON CONFLICT (skill_code) DO NOTHING;\n\n"
        )

    cs_vals = []
    seen_cs: set[tuple[str, str]] = set()
    for code, skills in cand_skills_map.items():
        for sk in skills:
            sc = slugify(sk)[:50]
            key = (code, sc)
            if key in seen_cs:
                continue
            seen_cs.add(key)
            cs_vals.append(f"  ({q(code)}, {q(sc)})")
    buf004.write(
        "INSERT INTO ta.candidate_skill (candidate_id, skill_id)\n"
        "SELECT\n"
        "  (SELECT candidate_id FROM ta.candidate WHERE candidate_code = v.cand),\n"
        "  (SELECT skill_id     FROM core.skill    WHERE skill_code    = v.skill)\n"
        "FROM (VALUES\n"
        + ",\n".join(cs_vals) +
        "\n) AS v(cand, skill)\n"
        "WHERE (SELECT candidate_id FROM ta.candidate WHERE candidate_code = v.cand) IS NOT NULL\n"
        "  AND (SELECT skill_id     FROM core.skill    WHERE skill_code    = v.skill) IS NOT NULL\n"
        "ON CONFLICT (candidate_id, skill_id) DO NOTHING;\n\n"
    )

    # 5e. screening_criteria (DS-07)
    buf004.write("-- ── 5e. ta.screening_criteria & screening_criteria_skill ────────\n")
    sc_rows = read_sheet(TA04, "DS-07_Screening_Criteria", 1)
    existing_crit = {"SCR-BE-001", "SCR-MOB-001", "SCR-QA-001", "SCR-DE-001",
                     "SCR-DO-001", "SCR-AI-001", "SCR-FE-001"}
    new_sc = [r for r in sc_rows if r.get("criteria_id") and r["criteria_id"] not in existing_crit]
    if new_sc:
        vals = ",\n  ".join(
            f"({q(r['criteria_id'])}, {q(r.get('position',''))})"
            for r in new_sc
        )
        buf004.write(
            "INSERT INTO ta.screening_criteria (criteria_code, position)\n"
            f"VALUES\n  {vals}\nON CONFLICT (criteria_code) DO NOTHING;\n\n"
        )
    else:
        buf004.write("-- (all criteria already covered by seed 004)\n\n")

    # 5f. outreach_template (DS-08)
    buf004.write("-- ── 5f. ta.outreach_template ───────────────────────────────────\n")
    ot_rows = read_sheet(TA04, "DS-08_Outreach_Template", 1)
    valid_channels = {"LinkedIn", "Email", "TopCV"}
    ot_vals = []
    for r in ot_rows:
        code = r.get("template_id")
        if not code:
            continue
        channel_raw = str(r.get("channel") or "Email")
        channel = channel_raw if channel_raw in valid_channels else "Email"
        content = r.get("template_content") or ""
        ot_vals.append(f"  ({q(code)}, {q(channel)}, {q(content)})")
    buf004.write(
        "INSERT INTO ta.outreach_template (template_code, channel, template_content)\n"
        "VALUES\n"
        + ",\n".join(ot_vals) +
        "\nON CONFLICT (template_code) DO NOTHING;\n\n"
    )

    # ── patch seed files ──────────────────────────────────────────────────────
    patch_seed("000__core.sql",             buf000.getvalue())
    patch_seed("003__ta_hire.sql",          buf003.getvalue())
    patch_seed("004__ta_screening.sql",     buf004.getvalue())
    patch_seed("005__elc.sql",              buf005.getvalue())
    patch_seed("006__lnd_roadmap.sql",      buf006.getvalue())
    patch_seed("007__lnd_effectiveness.sql", buf007.getvalue())

    # remove the standalone 008 file if it exists
    f008 = os.path.join(SEED_DIR, "008__enhanced_data.sql")
    if os.path.exists(f008):
        os.remove(f008)
        print("  removed 008__enhanced_data.sql", file=sys.stderr)


if __name__ == "__main__":
    main()
