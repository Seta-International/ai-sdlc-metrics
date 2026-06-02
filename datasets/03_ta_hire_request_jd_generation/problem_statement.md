## **3. Job Description Creation & Shortlist Review Agent**

**Context:** AHiring Manager receives a hiring request from a business/project → checks the JD template, previous JDs, team skills matrix, and headcount plan → drafts the JD with the tech stack, YOE, must-have/nice-to-have requirements, and salary range → receives a CV shortlist from TA/Recruiters → reviews each CV → evaluates fit/gap against the JD → decides pass/reject/need more information → sends feedback back to TA/Recruiters.

This process is time-consuming because HM needs to check multiple sources to draft a clear JD, manually review shortlisted CVs, compare candidates across criteria, and provide timely feedback. Delayed feedback can slow down or block the recruitment pipeline.

**Input:** Hiring request + JD templates + CVs + related hiring data

**The agent must:**

1. Draft a JD with a suitable tech stack, YOE, must-have, and nice-to-have requirements based on the benchmark.
2. Check JD completeness and score JD clarity before HR review.
3. Review each shortlisted CV against the JD criteria.
4. Suggest pass/reject/need more information for each candidate for clear reasons.
5. Highlight each candidate's key fit and gaps for HM review.
6. Track HM feedback status and remind HM if feedback is close to or past the 48-hour SLA.

**Expected output:** JD with clarity score + shortlist feedback report with pass/reject reason per CV + SLA feedback tracking for Hiring Manager.

**Why agentic:** Requires multi-step reasoning across hiring needs, team gaps, JD standards, candidate profiles, and recruitment pipeline status: understand request → draft JD → review shortlist → compare candidates → suggest questions → track feedback.

**Guardrails:**

• JD requirements must be aligned with actual project needs and team skill gaps.

• Do not overstate candidate fit or create biased summaries.

• AI summaries must support, not replace, Hiring Manager's CV review.
