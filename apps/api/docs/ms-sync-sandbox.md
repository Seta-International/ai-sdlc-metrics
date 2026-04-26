# MS Sync Sandbox Provisioning

This document explains how to set up and maintain the Microsoft 365 sandbox tenant used by the nightly contract tests in `.github/workflows/contract-tests.yml`.

## Prerequisites

- Global Administrator or Application Administrator role in the sandbox AAD tenant
- Microsoft 365 E3/E5 trial or developer subscription (Microsoft 365 Developer Program is free)

---

## 1. Create the sandbox tenant

1. Go to [https://developer.microsoft.com/en-us/microsoft-365/dev-program](https://developer.microsoft.com/en-us/microsoft-365/dev-program) and join the program.
2. Create a **Microsoft 365 E5 Developer** sandbox subscription.
3. Note the **Tenant ID** (visible in Azure Portal → Azure Active Directory → Overview). This is `MS_SANDBOX_TENANT_AD_ID`.

---

## 2. Register an application and assign scopes

### 2a. Create an app registration

1. Azure Portal → **Azure Active Directory** → **App registrations** → **New registration**.
2. Name: `Future MS Sync Contract Tests`.
3. Supported account types: **Accounts in this organizational directory only**.
4. No redirect URI needed.
5. Click **Register**.
6. Note the **Application (client) ID** → `MS_SANDBOX_CLIENT_ID`.

### 2b. Create a client secret

1. **Certificates & secrets** → **New client secret**.
2. Description: `contract-tests`.
3. Expiry: 24 months (set a calendar reminder to rotate).
4. Copy the **Value** immediately → `MS_SANDBOX_CLIENT_SECRET`.

### 2c. Assign Microsoft Graph API permissions

1. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**.
2. Add all of the following:

| Permission            | Reason                                          |
| --------------------- | ----------------------------------------------- |
| `Group.Read.All`      | List M365 group plans                           |
| `Tasks.Read.All`      | Read Planner plans, buckets, tasks              |
| `Tasks.ReadWrite.All` | Reorder tasks in the order-hint round-trip test |

3. Click **Grant admin consent** for the tenant.

---

## 3. Seed the known plan

The contract tests require at least one Planner plan with **at least two tasks**.

### 3a. Create an M365 Group and plan

Using the Microsoft 365 admin centre or Graph Explorer:

```http
POST https://graph.microsoft.com/v1.0/groups
Content-Type: application/json

{
  "displayName": "Future Contract Test Group",
  "mailNickname": "future-contract-test",
  "groupTypes": ["Unified"],
  "mailEnabled": true,
  "securityEnabled": false
}
```

Wait ~60 seconds for the group to provision. A default Planner plan is created automatically.

### 3b. Find the plan ID

```http
GET https://graph.microsoft.com/v1.0/groups/{groupId}/planner/plans
```

Note the plan `id` → `MS_SANDBOX_PLAN_ID`.

### 3c. Seed at least two tasks

```http
POST https://graph.microsoft.com/v1.0/planner/tasks
Content-Type: application/json

{
  "planId": "<MS_SANDBOX_PLAN_ID>",
  "title": "Contract Task Alpha",
  "orderHint": " !"
}
```

```http
POST https://graph.microsoft.com/v1.0/planner/tasks
Content-Type: application/json

{
  "planId": "<MS_SANDBOX_PLAN_ID>",
  "title": "Contract Task Beta",
  "orderHint": " !"
}
```

Do **not** delete these tasks. The contract tests reorder them and then restore the original order.

---

## 4. Store secrets in GitHub

Go to **Repository → Settings → Secrets and variables → Actions** and add:

| Secret name                | Value                      |
| -------------------------- | -------------------------- |
| `MS_SANDBOX_TENANT_AD_ID`  | AAD tenant ID (GUID)       |
| `MS_SANDBOX_CLIENT_ID`     | App registration client ID |
| `MS_SANDBOX_CLIENT_SECRET` | Client secret value        |
| `MS_SANDBOX_PLAN_ID`       | Known plan ID              |

---

## 5. Secret rotation

Client secrets expire. When the GitHub Action fails with a `401` / token acquisition error:

1. Azure Portal → app registration → **Certificates & secrets** → create a new secret.
2. Update the `MS_SANDBOX_CLIENT_SECRET` GitHub secret.
3. Delete the old secret from Azure.

Set a recurring calendar reminder 2 weeks before the expiry date.

---

## 6. Running the contract tests locally

```bash
export MS_SANDBOX_TENANT_AD_ID=<tenant-ad-id>
export MS_SANDBOX_CLIENT_ID=<client-id>
export MS_SANDBOX_CLIENT_SECRET=<client-secret>
export MS_SANDBOX_PLAN_ID=<plan-id>

cd apps/api
bun vitest run src/modules/planner/infrastructure/ms-graph/__contract__
```
