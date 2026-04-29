# MS Sync Rollout Watch Runbook

Internal 2-week watch window guide for the MS 365 Planner bidirectional sync feature.

## Feature Flags

| Flag                                  | Default | Purpose                    |
| ------------------------------------- | ------- | -------------------------- |
| `planner.ms_sync.enabled`             | false   | Master sync enable/disable |
| `planner.ms_sync.attachments.enabled` | false   | SharePoint attachment sync |
| `planner.ms_sync.rosters.enabled`     | false   | Group roster sync          |
| `MS_SYNC_HEALTH_REPORT_ENABLED`       | false   | Daily email health report  |

Enable all flags for SETA internal tenant via the Admin UI or DB:

```sql
-- Example: enable for a specific tenant
UPDATE admin.tenant_feature_flags
SET enabled = true
WHERE tenant_id = '<seta-tenant-id>'
  AND flag IN (
    'planner.ms_sync.enabled',
    'planner.ms_sync.attachments.enabled',
    'planner.ms_sync.rosters.enabled'
  );
```

## Key Metrics to Watch

### Conflict rate (target: < 10 open conflicts after 2 weeks)

```sql
-- Open conflicts per tenant
SELECT tenant_id, kind, COUNT(*) as count
FROM planner.ms_sync_conflict
WHERE resolved_at IS NULL
GROUP BY tenant_id, kind
ORDER BY count DESC;
```

### Stuck sync detection

```sql
-- Tasks not pushed in > 30 min despite having changes
SELECT t.id, t.ms_task_id, t.last_pushed_at, t.updated_at
FROM planner.task t
WHERE t.ms_task_id IS NOT NULL
  AND t.last_pushed_at < NOW() - INTERVAL '30 minutes'
  AND t.updated_at > t.last_pushed_at
LIMIT 50;
```

### Poll lag

```sql
-- Groups not polled in > 6 hours
SELECT g.tenant_id, g.ms_group_id, ps.last_polled_at
FROM planner.ms_linked_group g
LEFT JOIN planner.ms_plan_sync_state ps ON ps.ms_group_id = g.ms_group_id
WHERE ps.last_polled_at < NOW() - INTERVAL '6 hours'
   OR ps.last_polled_at IS NULL;
```

## Common Conflict Triage Flow

1. Go to Admin UI → Integrations → Microsoft → Conflicts tab
2. Review open conflicts by kind:
   - `push_412_exhausted`: task etag mismatch — use **Retry** to re-push
   - `push_403_quota`: MS quota exceeded — wait, then use **Retry**
   - `push_failed`: transient error — use **Retry**
   - `field_lww`: field conflict resolved automatically (informational)
   - `pull_unresolved_assignee`: user not in MS — resolves after directory sync
   - `credential_invalidated`: reconnect the integration
   - `attachment_upload_failed`: use **Retry upload**

## Exit Criteria for Watch Window

- [ ] Open conflicts < 10 after 14 days
- [ ] No credential_invalidated conflicts
- [ ] Poll lag < 1 hour for all groups
- [ ] Zero push queue depth for > 30 min consistently
- [ ] At least 1 full sync cycle completed without manual intervention

## Inviting External Pilot Tenant

After the internal 2-week window closes with acceptable metrics:

1. Identify pilot tenant from customer success list
2. Walk through connection flow with their IT admin
3. Monitor for 1 week with the same metrics above
4. If clean, proceed to general availability rollout
