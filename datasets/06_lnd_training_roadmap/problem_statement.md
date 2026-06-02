## **6. Training Roadmap & Skill Gap Analysis Agent**

**Context:** L&D needs to build training plans based on employee skills, project roadmap, training needs, and company business direction → collect input from HR data, PM/Leader feedback, internal surveys, project roadmap, and market research → analyze skill gaps → propose training roadmap → prepare Word/PPT proposal for BOD review.

This process is time-consuming because skill and training data are not centralized, planning depends heavily on manual input from multiple teams, and training priorities can be subjective when there is no clear data foundation.

**Input:** Employee skill data + project roadmap and training needs + internal trainer list + training survey results + BOD training goals + relevant market/technology trends.

**The agent must:**

1. Analyze employee skill gaps based on role, project needs, and business direction.
2. Map skill gaps and project roadmap to suitable training courses or learning topics.
3. Recommend training roadmap by quarter/year.
4. Suggest suitable internal trainers and employees who should join each training program.
5. Prioritize training initiatives based on project roadmap and business goals.
6. Generate a Word/PPT training proposal for L&D/BOD review.

**Expected Output:** Training Roadmap Proposal + Target trainee list and trainers

**Why agentic:**
 Requires multi-step reasoning across HR data, project roadmap, training needs, business goals, and market trends: collect input → analyze skill gap → map training needs → prioritize roadmap → recommend trainees/trainers → generate proposal.

**Guardrails:**

• Do not recommend training that is not aligned with real project needs or business goals.

• Do not rely too much on market trends without internal company context.
