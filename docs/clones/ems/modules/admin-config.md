# Module: admin-config

## Source — entities, settings keys, partner system

### Database tables

| Table             | PK                                  | Columns                                                                                                                                             |
| ----------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system_settings` | `id` (int, AI)                      | `key` varchar(255) UNIQUE, `value` varchar(255), `created_at`, `updated_at`                                                                         |
| `partners`        | `id` (bigint, AI)                   | `name` varchar(255), `description` varchar(255), `created_at`, `updated_at`                                                                         |
| `partner_access`  | `id` (bigint, AI)                   | `partner_id` bigint, `employee_id` bigint, `created_at`, `updated_at`                                                                               |
| `keys`            | (`partner_id`, `type`) composite PK | `value` varchar(255), `created_at`, `updated_at`                                                                                                    |
| `webhooks`        | `id` (bigint, AI)                   | `partner_id` bigint, `name` varchar(255), `url` varchar(255), `event` varchar(255), `is_active` bool, `created_at`, `updated_at`                    |
| `webhook_logs`    | `id` (bigint, AI)                   | `partner_id` bigint, `url` varchar(255), `event` varchar(255), `payload` text, `response_status` bigint, `response_body` text, `timestamp` datetime |

### System settings keys

```python
class SystemSettingKey(str, Enum):
    EVALUATION_REMINDER_DAYS = "EVALUATION_REMINDER_DAYS"   # default 30
    CONTRACT_REMINDER_DAYS   = "CONTRACT_REMINDER_DAYS"     # default 30
```

Auto-seeded on first read: if DB has fewer rows than `SYSTEM_SETTINGS_DEFAULT`, missing keys are inserted with their default values.

### Enums

```python
class KeyType(str, Enum):
    WEBHOOK = "webhook"
    API     = "api"

class WebhookEventEnum(str, Enum):
    EMPLOYEE_CREATED  = "employee_created"
    EMPLOYEE_DEACTIVED = "employee_deactived"
    TEST_EVENT        = "test"
```

### Partner / integration model

- **Partner** — represents an external integration consumer (third-party system).
- **PartnerAccess** — M:N join granting employees permission to manage a partner's developer resources (webhooks, keys).
- **Key** — AES-encrypted API/webhook key per partner. Composite PK `(partner_id, type)`. Only one key per type per partner; `create_key_for_webhook` upserts.
- **Webhook** — outbound webhook registration. Max 1 webhook per event per partner.
- **WebhookLog** — delivery log with payload, response status, response body. Used for retry.

---

## Business Logic — system settings CRUD, partner access management, contract renewal config

### SystemSettingsService

| Method                                              | Description                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `get_system_settings()`                             | Returns all settings; auto-seeds missing keys from `SYSTEM_SETTINGS_DEFAULT`                    |
| `update_reminder_days(dto)`                         | Simple key/value update (non-contract keys)                                                     |
| `upsert_handler_reminder_days(dto)`                 | Updates `CONTRACT_REMINDER_DAYS` **and** reschedules all active contract evaluation reminders   |
| `send_manual_reminder(contract_version_id, target)` | Sends an immediate email reminder for a specific contract — target is `"handler"` or `"leader"` |

**Contract reminder scheduling logic:**

- When `CONTRACT_REMINDER_DAYS` is updated, the service iterates all active contract versions, computes `reminder_date = end_date - reminder_days`, and either:
  - Fires immediately (if `reminder_date <= now`) — removes existing scheduler job, sends email, logs execution.
  - Reschedules (if `reminder_date > now`) — calls APScheduler `reschedule_job` or creates a new job if none exists.
- Job IDs follow pattern: `contract_evaluation_reminder_{handler|leader}_{contract_version_id}`.
- Email jobs: `send_contract_evaluation_reminder_to_handlers`, `send_contract_evaluation_reminder_to_leaders`.
- `_build_job_kwargs` computes contract term in Vietnamese ("2 nam 3 thang"), builds evaluation link.

**Leader reminder** code exists but is fully **commented out** — only handler reminders are active.

### PartnerService

| Method                                                  | Description                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `list()`                                                | Lists all partners with their access employees (joined query) |
| `add_employee_to_partner(partner_id, employee_id)`      | Grants employee access to a partner                           |
| `remove_employee_from_partner(partner_id, employee_id)` | Revokes access; raises NotFoundException if not found         |
| `get_partner_employees(partner_id)`                     | Returns list of employee IDs with access                      |
| `get_all_accessible_partners(employee_id)`              | Returns partners the employee can manage                      |

### KeyService

| Method                                              | Description                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `create_key_for_webhook(partner_id, key_type)`      | Generates a 64-char random key, AES-encrypts it, upserts into `keys` table. Returns raw value once. |
| `get_key(partner_id, key_type)`                     | Returns masked key (first 3 + `***` + last 3 chars)                                                 |
| `update_key(key_type, target_id, partner_id, name)` | Updates key name                                                                                    |
| `delete_key(key)`                                   | Deletes a key                                                                                       |

### WebhookService

| Method                                         | Description                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `create_webhook(partner_id, name, url, event)` | Creates webhook; enforces max 1 per event per partner                                            |
| `get_all_webhooks(partner_id, page, size)`     | Paginated list of webhooks                                                                       |
| `update_webhook(webhook_id, dto)`              | Partial update (name, url, event, key, is_active)                                                |
| `delete_webhook(partner_id, webhook_id)`       | Deletes webhook                                                                                  |
| `send_webhook(payload)`                        | Sends payload to all active webhooks for the event — decrypts key, POSTs with `X-API-KEY` header |
| `get_webhook_logs(...)`                        | Paginated logs with optional status filter                                                       |
| `retry_webhook(partner_id, log_id)`            | Re-sends a failed webhook from log payload                                                       |
| `test_webhook(partner_id, webhook_id)`         | Sends test payload with dummy employee data                                                      |

Delivery: 3 retries with 1ms delay between. Logs every attempt (success or failure).

---

## API Endpoints — all routes with roles

### System Settings (`/system-settings`)

| Method  | Path               | Roles                        | Handler                                                                                                         |
| ------- | ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/system-settings` | SUPER_ADMIN, EXECUTIVE (org) | `get_system_settings` — returns all settings                                                                    |
| `PATCH` | `/system-settings` | SUPER_ADMIN (org)            | `update_reminder_days` — if key is `CONTRACT_REMINDER_DAYS`, reschedules all contracts; otherwise simple update |

### Developer / Partner (`/developer`)

| Method   | Path                                                            | Roles / Guard                              | Handler                                   |
| -------- | --------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| `GET`    | `/developer/partners`                                           | SUPER_ADMIN, HR (org)                      | Lists all partners with access employees  |
| `GET`    | `/developer/partners/accessible`                                | any authenticated                          | Lists partners accessible by current user |
| `POST`   | `/developer/partners/{partner_id}/access/{employee_id}`         | SUPER_ADMIN, HR (org)                      | Grants employee access to partner         |
| `DELETE` | `/developer/partners/{partner_id}/access/{employee_id}`         | SUPER_ADMIN, HR (org)                      | Revokes employee access                   |
| `POST`   | `/developer/partners/{partner_id}/webhooks`                     | RequirePartnerPermission                   | Creates a webhook                         |
| `GET`    | `/developer/partners/{partner_id}/webhooks`                     | RequirePartnerPermission                   | Lists webhooks (paginated)                |
| `PUT`    | `/developer/partners/{partner_id}/webhooks/{webhook_id}`        | RequirePartnerPermission + ValidateWebhook | Updates webhook                           |
| `DELETE` | `/developer/partners/{partner_id}/webhooks/{webhook_id}`        | RequirePartnerPermission + ValidateWebhook | Deletes webhook                           |
| `POST`   | `/developer/partners/{partner_id}/webhooks/{webhook_id}/test`   | RequirePartnerPermission + ValidateWebhook | Sends test webhook                        |
| `POST`   | `/developer/partners/{partner_id}/webhooks/keys/generate`       | RequirePartnerPermission                   | Generates/rotates webhook key             |
| `GET`    | `/developer/partners/{partner_id}/webhooks/keys`                | RequirePartnerPermission                   | Gets masked key                           |
| `GET`    | `/developer/partners/{partner_id}/webhooks/logs`                | RequirePartnerPermission                   | Lists webhook logs (paginated)            |
| `POST`   | `/developer/partners/{partner_id}/webhooks/logs/{log_id}/retry` | RequirePartnerPermission                   | Retries a failed webhook                  |
| `GET`    | `/developer/webhooks/{webhook_id}`                              | any authenticated                          | Gets webhook by ID                        |
| `GET`    | `/developer/webhooks/logs/{webhook_id}`                         | RequirePartnerPermission                   | Gets logs for a webhook                   |
| `PUT`    | `/developer/keys/{key_type}/{target_id}/partner/{partner_id}`   | RequirePartnerPermission                   | Updates key name                          |
| `DELETE` | `/developer/keys/{key_type}/{target_id}/partner/{partner_id}`   | RequirePartnerPermission                   | Deletes key                               |

**RequirePartnerPermission** — checks that the authenticated employee has a row in `partner_access` for the requested `partner_id`.

**ValidateWebhook** — checks that the webhook belongs to the partner.

---

## Target Overlap — what exists in admin module

The Future `admin` module (`apps/api/src/modules/admin/`) currently contains:

| Feature                        | Status                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit log** (query + export) | Implemented — `QueryAuditLogHandler`, `ExportAuditLogHandler`, tRPC routes with `admin:audit:read` permission                                        |
| **Role permission management** | Implemented — list roles, get/add/remove permissions, reset to defaults; delegates to `KernelModule` facades                                         |
| **Tenant email config**        | Schema + entity + repository port defined; `tenant_email_config` table in `admin` schema with provider (`ses`/`smtp`), SMTP settings, credential ref |
| **System settings**            | **Not started** — no settings entity, schema, or routes                                                                                              |
| **Partner / developer portal** | **Not started** — no partner, webhook, or key entities                                                                                               |

The target admin module has no overlap with legacy system settings or partner/developer features. These are net-new implementations.

---

## Dependencies — contract module (renewal settings)

| Dependency             | Direction            | What                                                                                                                           |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Contract module**    | admin-config reads   | `ContractVersionRepository.get_all_active_contract_versions()` — to reschedule reminders when `CONTRACT_REMINDER_DAYS` changes |
| **Contract module**    | admin-config reads   | `ContractVersionRepository.get_version_by_id()` — to build reminder job kwargs (contract term, type)                           |
| **Contract type**      | admin-config reads   | `ContractTypeRepository.get()` — to resolve contract type name for email                                                       |
| **Employee module**    | admin-config reads   | `EmployeeRepository.get_employee_by_id()`, `get_employees_by_ids()` — employee name, position for emails                       |
| **Schedule module**    | admin-config writes  | `ScheduleService.schedule_contract_handler_reminder()`, `schedule_contract_leader_reminder()` — APScheduler job management     |
| **Evaluation leaders** | admin-config reads   | `ContractEvaluationLeaderRepository.get_all_infor_by_contract_version_id()` — for leader reminders (lazy import)               |
| **Contract handlers**  | admin-config reads   | `ContractHandlerRepository.list_all_contract_handler()` — for handler reminders (lazy import)                                  |
| **Email jobs**         | admin-config calls   | `send_contract_evaluation_reminder_to_handlers()`, `send_contract_evaluation_reminder_to_leaders()`                            |
| **AES encryptor**      | partner/key services | `encrypt_aes()`, `decrypt_aes()` — key encryption at rest using `settings.webhook_key`                                         |
| **Partner access**     | webhook/key routes   | `RequirePartnerPermission` dependency checks `partner_access` table                                                            |

---

## Migration Notes — settings key mapping, partner access model

### System settings

- Legacy stores settings as flat `key`/`value` string pairs in a single table. Future should model this as a typed settings table in the `admin` schema with `tenant_id`.
- Only 2 keys exist: `EVALUATION_REMINDER_DAYS` and `CONTRACT_REMINDER_DAYS`, both defaulting to 30. In the future system, contract reminder scheduling belongs in the `time` or a dedicated contract module, not admin. Admin should only own generic tenant settings.
- The auto-seed-on-read pattern (insert missing defaults during GET) is fragile. Future should use a proper migration to seed defaults.

### Partner / developer portal

- **Rename "Partner" to a tenant-scoped integration concept.** Legacy has no `tenant_id` on any of these tables. Future must add `tenant_id` to all partner-related tables.
- **Key management** — legacy uses AES-encrypted keys stored in DB. Future should store key references in AWS Secrets Manager (per CLAUDE.md hard rules) and only keep a masked fingerprint in the DB.
- **PartnerAccess** is a simple M:N join. In the future system, this maps to the `kernel` authority model — partner management permission should be a role permission (`admin:integration:manage`) rather than a separate access table.
- **Webhook delivery** — legacy uses synchronous `requests.post` with a 3-retry loop (1ms delay). Future should use pg-boss jobs for async delivery with exponential backoff.
- **Webhook event types** — currently only `employee_created` and `employee_deactived` (typo: should be "deactivated"). Future should use domain events from `@future/event-contracts`.
- **Max 1 webhook per event per partner** — this limit may be too restrictive. Consider allowing multiple endpoints per event.
- **ValidateWebhook / RequirePartnerPermission** guards become tRPC middleware using the kernel permission system.
- The `developer_router.py` controller pattern (`build_controllers(db)`) is a service-locator anti-pattern. Future uses NestJS DI.

### Role mapping

| Legacy Role                                | Future Permission                                         |
| ------------------------------------------ | --------------------------------------------------------- |
| SUPER_ADMIN (system settings read/write)   | `admin:settings:read`, `admin:settings:manage`            |
| EXECUTIVE (system settings read)           | `admin:settings:read`                                     |
| SUPER_ADMIN, HR (partner management)       | `admin:integration:manage`                                |
| RequirePartnerPermission (webhook/key ops) | `admin:integration:manage` + per-integration access check |

### What to skip

- **Leader reminder scheduling** — fully commented out in legacy. Do not migrate.
- **Manual reminder send** — niche feature, low usage. Defer or drop.
- **Vietnamese contract term formatting** — move to i18n/locale layer, not hardcoded in service.
- **AES key encryption in DB** — replace with Secrets Manager references.
