## **7. Training Effectiveness Reporting Agent**

**Context:** L&D Manager needs to evaluate training effectiveness and report to BOD → collect attendance from Teams → gather Excel files from OneDrive → download Google Form feedback → consolidate data manually → create charts and PowerPoint/Word reports.

Training evaluation is inconsistent; key insights are easily missed due to scattered data and manual reporting, making it difficult to assess training effectiveness accurately.

**Input:**

Training data, trainee performance/feedback data, L&D evaluation rules, training NORM, company report templates, and related post-training performance data.

**The agent must:**

1. Ingest training data from Teams, OneDrive, Google Forms, and related internal sources.
2. Consolidate data by course, team, month, and quarter.
3. Calculate key metrics such as trainee count, completion rate, attendance rate, average score, training hours, and training cost.
4. Highlight outstanding trainees or trainees who need support based on L&D rules.
5. Analyze training effectiveness based on internal criteria and training NORM.
6. Generate PowerPoint/Word reports using the company's standard template.
7. Support ad-hoc insights on training results and historical training performance.

**Expected output:** Training Effectiveness Report with training metrics, trainee highlights, effectiveness analysis, and a PowerPoint/Word report in the company template.

**Why agentic:** Requires multi-step reasoning across multiple training data sources: ingest → consolidate → calculate metrics → apply L&D rules → analyze effectiveness → generate report → support ad-hoc insights.

**Guardrails:**

• Do not conclude training effectiveness if source data is incomplete or not synced correctly.

• Do not expose individual trainee scores or trainer evaluations to unauthorized users.
