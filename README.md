# ai-sdlc-metrics

Automated AI adoption and DORA metrics across the SDLC.

Reads from GitHub and Jira, writes to a shared RDS Postgres, and displays live
dashboards in Grafana — one for the team (current-sprint operational view) and
one for the BOD (sprint-over-sprint strategic view).

Reusable across projects: add a per-project caller workflow and two secrets to
track any additional Jira project + GitHub repo pair.
