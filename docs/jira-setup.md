# Jira Setup Guide

Creates the 4 custom fields, Incident issue type, and screen association needed for AI SDLC metrics collection.

## Prerequisites

You need a Jira API token:
1. Go to https://id.atlassian.com → **Security** → **API tokens** → **Create API token**
2. Copy the token value

Then export your credentials once before running any command below:

```bash
export JIRA_EMAIL="your-email@seta-international.vn"
export JIRA_TOKEN="your-api-token-here"
export JIRA_BASE="https://all-it.atlassian.net"
```

Verify it works:
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" "$JIRA_BASE/rest/api/3/myself" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Logged in as:', d['displayName'])"
```

Expected: `Logged in as: Canh Ta`

---

## Step 1 — Create "AI Usage" field (single select)

```bash
AI_USAGE_FIELD_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Usage",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:select",
    "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:selectsearcher"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "AI_USAGE_FIELD_ID=$AI_USAGE_FIELD_ID"
```

Expected: `AI_USAGE_FIELD_ID=customfield_10XXX`

### Add options to AI Usage

```bash
# Create a global context first
AI_USAGE_CONTEXT_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field/$AI_USAGE_FIELD_ID/context" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Usage Global Context",
    "isGlobalContext": true,
    "isAnyIssueType": true
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "AI_USAGE_CONTEXT_ID=$AI_USAGE_CONTEXT_ID"

# Add the three options
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field/$AI_USAGE_FIELD_ID/context/$AI_USAGE_CONTEXT_ID/option" \
  -H "Content-Type: application/json" \
  -d '{
    "options": [
      {"value": "Không"},
      {"value": "Có hỗ trợ"},
      {"value": "Tác tử"}
    ]
  }' | python3 -m json.tool
```

Expected: 3 options returned with IDs.

---

## Step 2 — Create "AI Time Saved" field (number)

```bash
AI_TIME_SAVED_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Time Saved",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:float",
    "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:exactnumber"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "AI_TIME_SAVED_ID=$AI_TIME_SAVED_ID"
```

---

## Step 3 — Create "AI Tool" field (single select)

```bash
AI_TOOL_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Tool",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:select",
    "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:selectsearcher"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "AI_TOOL_ID=$AI_TOOL_ID"

# Create context + options
AI_TOOL_CONTEXT_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field/$AI_TOOL_ID/context" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Tool Global Context",
    "isGlobalContext": true,
    "isAnyIssueType": true
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field/$AI_TOOL_ID/context/$AI_TOOL_CONTEXT_ID/option" \
  -H "Content-Type: application/json" \
  -d '{
    "options": [
      {"value": "Copilot"},
      {"value": "Claude Code"},
      {"value": "Cursor"},
      {"value": "Khác"}
    ]
  }' | python3 -m json.tool
```

---

## Step 4 — Create "Caused by deploy" field (URL)

```bash
CAUSED_BY_DEPLOY_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/field" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Caused by deploy",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:url",
    "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:textsearcher"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "CAUSED_BY_DEPLOY_ID=$CAUSED_BY_DEPLOY_ID"
```

---

## Step 5 — Create "Incident" issue type

```bash
INCIDENT_TYPE_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X POST "$JIRA_BASE/rest/api/3/issuetype" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Incident",
    "type": "standard",
    "description": "Production incident — used for CFR and MTTR metrics"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "INCIDENT_TYPE_ID=$INCIDENT_TYPE_ID"
```

### Add Incident type to the FUT project

```bash
# Get the FUT project's issue type scheme ID
SCHEME_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  "$JIRA_BASE/rest/api/3/project/FUT/issueTypeScheme" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['issueTypeScheme']['id'])")

echo "SCHEME_ID=$SCHEME_ID"

curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -X PUT "$JIRA_BASE/rest/api/3/issuetypescheme/$SCHEME_ID/issuetype" \
  -H "Content-Type: application/json" \
  -d "{\"issueTypeIds\": [\"$INCIDENT_TYPE_ID\"]}"
```

---

## Step 6 — Add all 4 fields to the FUT default screen

```bash
# Find the FUT default screen
SCREEN_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  "$JIRA_BASE/rest/api/3/screens?queryString=FUT&maxResults=10" \
  | python3 -c "import sys,json; screens=json.load(sys.stdin)['values']; print(screens[0]['id']) if screens else print('NOT FOUND')")

echo "SCREEN_ID=$SCREEN_ID"

# Get the first tab of that screen
TAB_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  "$JIRA_BASE/rest/api/3/screens/$SCREEN_ID/tabs" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

echo "TAB_ID=$TAB_ID"

# Add each field (replace IDs with the values you captured above)
for FIELD_ID in "$AI_USAGE_FIELD_ID" "$AI_TIME_SAVED_ID" "$AI_TOOL_ID" "$CAUSED_BY_DEPLOY_ID"; do
  echo "Adding $FIELD_ID..."
  curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
    -X POST "$JIRA_BASE/rest/api/3/screens/$SCREEN_ID/tabs/$TAB_ID/fields" \
    -H "Content-Type: application/json" \
    -d "{\"fieldId\": \"$FIELD_ID\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  added:', d.get('id', d))"
done
```

---

## Step 7 — Manual: add workflow validator (2 min in browser)

This cannot be done via API — requires the Jira workflow editor:

1. Go to: `https://all-it.atlassian.net/jira/software/projects/FUT/project-settings/workflows`
2. Click **Edit** on the active workflow
3. Click the **Done** transition arrow
4. Click **Validators** → **Add validator** → **Field Required**
5. Select **AI Usage** → **Add**
6. Click **Publish workflow**

---

## Step 8 — Note your field IDs for GitHub secrets

At the end of all steps, run:

```bash
echo ""
echo "=== Copy these for GitHub secrets ==="
echo "JIRA_AI_USAGE_FIELD=$AI_USAGE_FIELD_ID"
echo ""
echo "=== For reference only (not used by collector) ==="
echo "AI_TIME_SAVED_ID=$AI_TIME_SAVED_ID"
echo "AI_TOOL_ID=$AI_TOOL_ID"
echo "CAUSED_BY_DEPLOY_ID=$CAUSED_BY_DEPLOY_ID"
echo "INCIDENT_TYPE_ID=$INCIDENT_TYPE_ID"
```

Then set the org secret:

```bash
gh auth switch --user seta-canhta
gh secret set JIRA_AI_USAGE_FIELD --body "$AI_USAGE_FIELD_ID" --org Seta-International
```
