# Teams Channel — Azure & Microsoft 365 Setup Guide

**Audience:** Developer setting up Azure Bot Service + Teams app for local development.
**Applies to:** EP-13 WBS 13.1–13.4 (scaffold through OBO token refresh).

**Prerequisites:**
- Azure subscription with Contributor access on a resource group
- Microsoft 365 tenant with Teams (developer tenant or production)
- ngrok installed locally (`brew install ngrok` / `scoop install ngrok`)
- `pnpm dev` running on port 8080

---

## 1. Create the Azure Bot resource

1. Open [Azure Portal](https://portal.azure.com) → search **"Azure Bot"** → **Create**.
2. Fill in:
   - **Bot handle:** `seta-agent-dev` (dev) or `seta-agent` (prod)
   - **Subscription / Resource group:** use your dev resource group
   - **Pricing tier:** F0 (free, 10 k messages/month — sufficient for dev)
   - **Microsoft App ID:** select **Create new Microsoft App ID**
   - **Type of app:** Multi-tenant
3. **Review + create** → **Create**.
4. Once deployed, open the resource → **Configuration** → note the **Microsoft App ID** → this is `MS_BOT_ID`.

## 2. Create a client secret

1. Azure Bot resource → **Configuration** → click **Manage Password** (opens the App Registration).
2. **Certificates & secrets** → **New client secret** → set expiry → **Add**.
3. Copy the **Value** immediately (shown once) → this is `MS_BOT_SECRET`.

## 3. Enable the Teams channel

1. Azure Bot resource → **Channels** → click the **Microsoft Teams** icon.
2. Accept the Terms of Service → **Apply**.
3. Status shows **Running**.

## 4. Start ngrok and set the messaging endpoint

```bash
ngrok http 8080
# Output: Forwarding  https://abc123.ngrok-free.app -> http://localhost:8080
```

1. Copy the HTTPS forwarding URL (e.g. `https://abc123.ngrok-free.app`).
2. Azure Bot → **Configuration** → **Messaging endpoint:** `https://abc123.ngrok-free.app/teams/messages`
3. **Apply**.

> **Note:** The ngrok URL changes on every restart (free tier). Re-paste it into the Azure Bot after each restart.

## 5. Build and sideload the Teams app manifest

```bash
# Set MS_BOT_ID in your shell so the build script can substitute it
export MS_BOT_ID=<Application ID from step 1>

pnpm --filter @seta/teams build:manifest
# Produces: modules/channels/teams/dist/seta-agent.zip
```

1. Open **Microsoft Teams** (desktop or web).
2. Left sidebar → **Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app**.
3. Select `modules/channels/teams/dist/seta-agent.zip`.
4. Click **Add** → **Open** to start a 1:1 chat with SetaAgent.

## 6. Grant admin consent (required before 13.4 OBO works)

This step can be done now or deferred until 13.4.

1. Azure Portal → **Azure Active Directory** → **App registrations** → find the app created in step 1.
2. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:
   - `User.Read`
   - `Tasks.ReadWrite`
   - `Tasks.Read`
3. **Grant admin consent for [your tenant]** → **Yes**.

## 7. Set environment variables

Add to `apps/api/.env.local` (git-ignored — never commit):

```env
MS_BOT_ID=<Application ID from step 1>
MS_BOT_SECRET=<client secret from step 2>
TEAMS_SKIP_JWT_VERIFY=true    # dev only — remove this line when 13.3 ships
```

## 8. Verify the setup

```bash
pnpm dev
```

In another terminal:

```bash
curl http://localhost:8080/teams/health
# Expected: {"ok":true}
```

Then open the 1:1 chat with SetaAgent in Teams and send `show my tasks` — you should see a task-list Adaptive Card (requires 13.2 to be shipped).

---

## Reference: manifest substitution variables

| Variable | Source |
|---|---|
| `{{MS_BOT_ID}}` | App Registration → Application (client) ID |
| `{{APP_VERSION}}` | `modules/channels/teams/package.json` → `version` field |
| `{{VALID_DOMAINS}}` | ngrok hostname for dev (e.g. `abc123.ngrok-free.app`); production domain for prod |

## Reference: required env vars per WBS task

| Task | New env vars |
|---|---|
| 13.1 | `MS_BOT_ID`, `MS_BOT_SECRET`, `TEAMS_SKIP_JWT_VERIFY` |
| 13.2 | (none — uses vars from 13.1) |
| 13.3 | Remove `TEAMS_SKIP_JWT_VERIFY` |
| 13.4 | (none — OBO uses `MS_BOT_ID` + oauth infrastructure from Epic 1) |
