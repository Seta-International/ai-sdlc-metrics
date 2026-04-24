# `@future/e2e`

## Environment Variables

The Microsoft 365 connect smoke test (`admin-ms-sync-connect.spec.ts`) requires:

- `TEST_MS_TENANT_AD_ID`
- `TEST_MS_CLIENT_ID`
- `TEST_MS_CLIENT_SECRET`

In CI, these values are provisioned from GitHub Secrets.
