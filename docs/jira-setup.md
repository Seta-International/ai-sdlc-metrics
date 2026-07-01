# Jira Setup Guide

Creates the 3 custom fields needed for AI SDLC metrics collection: AI Usage,
AI Time Saved, AI Tool.

**Team-managed ("next-gen") Jira projects** — the common case on Jira Cloud
today — don't expose issue-type-scheme or screen/tab APIs publicly. If your
project is team-managed (check `simplified: true` on `GET
/rest/api/3/project/{key}`), skip straight to the "Manual" steps at the
bottom for field association and the Incident issue type; the API calls
below only get you as far as *creating* the fields, not attaching them to a
project.

## Prerequisites

You need a Jira API token:
1. Go to https://id.atlassian.com → **Security** → **API tokens** → **Create API token**
2. Copy the token value

Then export your credentials once before running any command below:

```bash
export JIRA_EMAIL="your-email@seta-international.vn"
export JIRA_TOKEN="your-api-token-here"
export JIRA_BASE="https://your-site.atlassian.net"
```

Verify it works:
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" "$JIRA_BASE/rest/api/3/myself" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Logged in as:', d['displayName'])"
```

Expected: `Logged in as: <your name>`

---

## Step 1 — Create "AI Usage" field (single select)

Omit `searcherKey` — Jira assigns a default searcher automatically, and
passing an explicit one (e.g. `selectsearcher`) fails with `"Unknown
searcher chosen"`.

```bash
AI_USAGE_FIELD_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Usage",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:select"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "AI_USAGE_FIELD_ID=$AI_USAGE_FIELD_ID"
```

Expected: `AI_USAGE_FIELD_ID=customfield_10XXX`

### Add options to AI Usage

Jira auto-creates a default global context when the field is created — fetch
its id rather than POSTing a new context (POSTing a second global context
for the same field fails with `"Invalid request payload"`).

```bash
AI_USAGE_CONTEXT_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  "$JIRA_BASE/rest/api/3/field/$AI_USAGE_FIELD_ID/context" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['values'][0]['id'])")

echo "AI_USAGE_CONTEXT_ID=$AI_USAGE_CONTEXT_ID"

curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field/$AI_USAGE_FIELD_ID/context/$AI_USAGE_CONTEXT_ID/option" \
  -H "Content-Type: application/json" \
  -d '{
    "options": [
      {"value": "None"},
      {"value": "Assisted"},
      {"value": "Agent"}
    ]
  }' | python3 -m json.tool
```

Expected: 3 options returned with IDs. Record the `id` of the "Assisted"
option and "Agent" option — `collector/metrics.py`'s `calc_a3`/`calc_a4`
match on the option **value** ("Agent"/anything but "None"), not the id, so
no further wiring is needed here.

---

## Step 2 — Create "AI Time Saved" field (number)

```bash
AI_TIME_SAVED_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Time Saved",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:float"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "AI_TIME_SAVED_ID=$AI_TIME_SAVED_ID"
```

Consumed by `collector/update_ticket.py`, which accumulates hours parsed from each
merged PR's "AI time saved (hours)" description field onto this field.

---

## Step 3 — Create "AI Tool" field (single select), no default

```bash
AI_TOOL_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Tool",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:select"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "AI_TOOL_ID=$AI_TOOL_ID"

AI_TOOL_CONTEXT_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  "$JIRA_BASE/rest/api/3/field/$AI_TOOL_ID/context" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['values'][0]['id'])")

OPTIONS_JSON=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field/$AI_TOOL_ID/context/$AI_TOOL_CONTEXT_ID/option" \
  -H "Content-Type: application/json" \
  -d '{
    "options": [
      {"value": "Copilot"},
      {"value": "Claude Code"},
      {"value": "Cursor"},
      {"value": "Khác"}
    ]
  }')
echo "$OPTIONS_JSON" | python3 -m json.tool
```

Deliberately no default value here. `collector/update_ticket.py` writes this
field once per ticket, from the merged PR's Co-authored-by trailer
(Claude/Copilot), and only when the field is currently empty. A context
default value auto-fills new issues at creation time in Jira Cloud, which
would make every ticket look pre-attributed to whatever the default is and
defeat that detection.

If a default value was set on this field from an earlier setup, clear it in
the browser instead of via API (the default-value REST endpoint's "clear"
payload isn't reliably documented): `<project>` → **Project settings** →
**Fields** → find "AI Tool" → its context → **Edit default value** →
clear the selection → **Save**.

---

## Manual steps (team-managed projects)

These have no public REST API for team-managed ("next-gen") projects — do
them in the browser. (A company-managed project *does* expose
`issuetypescheme`/`screens` APIs; if yours is company-managed, the original
plan's scripted approach works and these manual steps aren't needed.)

1. **Attach the 3 fields to the project**: `<project>` → **Project settings**
   → **Fields** → use the **Search** box at the top (the page says *"Add a
   global field to the table below to use it on work items in this
   space"*) → search "AI Usage" / "AI Time Saved" / "AI Tool" → add each one.
   Repeat per issue type if the UI asks (Task/Bug/Story etc. each need the
   field attached).

2. **Incident issue type** (for B3/B4 metrics — change failure rate, MTTR):
   `<project>` → **Project settings** → **Issue types** → **Add issue
   type** → name it "Incident". A globally-created "Incident" issue type
   (via `POST /rest/api/3/issuetype`) is *not* usable here — team-managed
   projects only recognize issue types created directly within their own
   settings.

3. **"AI Usage" required on Done** (2 min):
   `<project>` → **Project settings** → **Workflows** → edit the active
   workflow → click the **Done** transition → **Validators** → **Add
   validator** → **Field Required** → select **AI Usage** → **Add** →
   **Publish**.

---

## Note your field IDs for GitHub secrets

```bash
echo "JIRA_AI_USAGE_FIELD=$AI_USAGE_FIELD_ID"
echo "JIRA_AI_TOOL_FIELD=$AI_TOOL_ID"
echo "JIRA_AI_TIME_SAVED_FIELD=$AI_TIME_SAVED_ID"
```

Set them as **repo secrets** (not org — org-level secret management needs
`admin:org`, which most accounts don't have) on the project's own repo. All
three are required for `collector/update_ticket.py` (the PR-merge → Jira
ticket automation) as well as `JIRA_AI_USAGE_FIELD` alone for `collect.py`:

```bash
gh auth switch --user seta-canhta
gh secret set JIRA_AI_USAGE_FIELD --body "$AI_USAGE_FIELD_ID" --repo <org>/<repo>
gh secret set JIRA_AI_TOOL_FIELD --body "$AI_TOOL_ID" --repo <org>/<repo>
gh secret set JIRA_AI_TIME_SAVED_FIELD --body "$AI_TIME_SAVED_ID" --repo <org>/<repo>
```
