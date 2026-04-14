# Module: audit-log

## Source — entity, Kafka consumer, event types

### Entity: `AuditLog` (`src/core/models/audit_log.py`)

Table: `audit_logs`

| Column       | Type                   | Notes                                  |
| ------------ | ---------------------- | -------------------------------------- |
| `id`         | Integer PK             | Auto-increment                         |
| `action`     | Enum (varchar 50)      | `AuditAction` — stored as string value |
| `session_id` | Integer                | FK-ish reference to `EmployeeSession`  |
| `metadata`   | JSONB (col="metadata") | Arbitrary payload about the change     |
| `object`     | Enum (varchar 50)      | `AuditObject` — stored as string value |
| `timestamp`  | DateTime               | Defaults to `datetime.now()`           |

### Enums

**AuditAction**: `create`, `update`, `delete`, `login`, `logout`

**AuditObject**: `employee`, `project`, `project_employee`, `contract`, `role`, `schedule`

### Kafka Consumer (`worker/consumer/audit_log/`)

Three files: `__init__.py`, `audit_log_consumer.py`, `audit_log_repository.py`.

**AuditLogConsumer** subscribes to Kafka topics and creates `AuditLog` rows. Supports two message formats:

1. **Simple format** — direct events published by application code:

   ```json
   { "action": "create", "session_id": 123, "metadata": { "target_id": 456 } }
   ```

2. **Debezium CDC format** — change-data-capture from PostgreSQL WAL:
   ```json
   {
     "payload": {
       "before": {...}, "after": {...},
       "source": {"table": "project_employee", ...},
       "op": "c|u|d|r", "ts_ms": 1234567890
     }
   }
   ```

**Topic-to-object mapping** (only one configured):

- `ems_cdc.public.project_employee` -> `AuditObject.PROJECT_EMPLOYEE`

**Debezium op mapping**: `c` -> CREATE, `u` -> UPDATE, `d` -> DELETE, `r` (snapshot) -> CREATE.

The consumer extracts `session_id` from the `updated_by` field in CDC `after`/`before` payloads. When no session is found (system/automated changes), it defaults to `session_id = 0`.

**Consumer configuration** uses `confluent_kafka.Consumer` with SASL auth (`settings.kafka_*`). Consumer group: `audit-log-consumer-group`. Supports runtime topic addition via `add_topic()`.

The consumer's own `AuditLogRepository` duplicates the main repo but adds explicit commit/rollback/refresh inside `create_log`.

### DTO (`src/present/dto/audit_log/audit_log.py`)

- `AuditLogDTO`: id, action, object, employee_id, metadata, timestamp
- `AuditLogFilterParams`: object_type, action (both optional)

## Business Logic — event capture, session tracking, querying

### Service: `AuditLogService` (`src/core/services/audit_log_service.py`)

**Write operations:**

| Method       | What it does                                      |
| ------------ | ------------------------------------------------- |
| `create_log` | Core writer: builds `AuditLog`, delegates to repo |
| `log_create` | Convenience: `create_log(CREATE, ...)`            |
| `log_update` | Convenience: `create_log(UPDATE, ...)`            |
| `log_delete` | Convenience: `create_log(DELETE, ...)`            |
| `log_login`  | Convenience: `create_log(LOGIN, EMPLOYEE, ...)`   |
| `log_logout` | Convenience: `create_log(LOGOUT, EMPLOYEE, ...)`  |

**Read operations:**

| Method                 | What it does                                                  |
| ---------------------- | ------------------------------------------------------------- |
| `get_logs`             | Paginated list with optional `object_type` + `action` filters |
| `get_log_by_id`        | Single log by PK; raises `NotFoundException` if missing       |
| `get_logs_by_employee` | Paginated logs for a specific `session_id`                    |

**Session tracking**: All audit entries reference a `session_id` (integer). The repository JOINs `AuditLog` with `EmployeeSession` to resolve the `employee_id` for display. This means audit logs are tied to authentication sessions, not directly to users.

**Pagination**: Uses a `Pagination[T]` generic wrapper with `total`, `page`, `size`, `items`.

### Repository: `AuditLogRepository` (`src/repository/audit_log_repository.py`)

Extends `BaseRepository[AuditLog]`. Key queries:

- `get_logs` — JOIN with `EmployeeSession`, optional filters on `action` and `object`, ordered by `timestamp DESC`, offset/limit pagination.
- `count_logs` — matching count for pagination total.
- `get_logs_by_employee` — same JOIN, filtered by `session_id`.
- `count_logs_by_employee` — matching count.
- `get_by_id` — inherited from `BaseRepository`.

## API Endpoints — all routes

**Prefix**: `/audit-logs`  
**Tag**: `Audit Logs`

All endpoints require organization-level roles: `SUPER_ADMIN`, `HR`, or `EXECUTIVE`.

| Method | Path                               | Handler                     | Response                  | Description                                            |
| ------ | ---------------------------------- | --------------------------- | ------------------------- | ------------------------------------------------------ |
| GET    | `/audit-logs`                      | `get_audit_logs`            | `Pagination[AuditLogDTO]` | List with page, page_size, object_type, action filters |
| GET    | `/audit-logs/session/{session_id}` | `get_audit_logs_by_session` | `Pagination[AuditLogDTO]` | Logs for a specific session                            |
| GET    | `/audit-logs/{log_id}`             | `get_audit_log_by_id`       | `AuditLogDTO`             | Single log by ID                                       |

**Query params** for list endpoint: `page` (default 1), `page_size` (default 10, max 100), `object_type` (AuditObject enum), `action` (AuditAction enum).

There are no write endpoints — audit logs are created only via:

1. Direct service calls from other modules (e.g., `log_login`, `log_create`)
2. Kafka consumer processing CDC or simple events

### Controller (`src/present/controllers/audit_log_controller.py`)

Thin pass-through layer between router and service. The `get_logs_by_session` method has a bug: it re-maps `result.items` to `AuditLogDTO` using `log.session_id` (which does not exist on `AuditLogDTO`), but the field is named `employee_id` on the DTO. This would cause a runtime error if the code path is hit in practice. The `get_logs` and `get_log_by_id` paths delegate cleanly to the service.

## Target Overlap — what exists in kernel module (audit_event)

The **Future** project already has a fully implemented audit event subsystem in `apps/api/src/modules/kernel/`:

### Schema: `core.audit_event`

| Column       | Type          | Notes                                     |
| ------------ | ------------- | ----------------------------------------- |
| `id`         | UUID (UUIDv7) | PK, auto-generated                        |
| `tenant_id`  | UUID          | Multi-tenant (mandatory per hard rules)   |
| `actor_id`   | UUID          | Who performed the action                  |
| `event_type` | text          | Free-form (replaces legacy `AuditAction`) |
| `module`     | text          | Which domain module emitted the event     |
| `subject_id` | UUID          | The entity acted upon                     |
| `payload`    | JSONB         | Arbitrary event data                      |
| `created_at` | timestamp     | Default `now()`                           |

**INSERT-ONLY**: The schema comment explicitly states no UPDATE or DELETE ever.

### Repository: `DrizzleAuditEventRepository`

Implements `IAuditEventRepository` with three methods:

- `insert` — creates a single audit event row
- `query` — paginated filtered query (by tenantId, actorId, eventType, module, dateFrom, dateTo)
- `queryAll` — unbounded filtered query for export

### Facade: `KernelAuditFacade`

Cross-module write interface. Other modules call:

- `recordEvent(data)` — write an audit event
- `publishOutboxEvent(data)` — write an outbox event (for async relay)
- `queryAuditLog(tenantId, filters)` — paginated read
- `exportAuditLog(tenantId, filters)` — full export

### Key Differences from Legacy

| Aspect          | Legacy EMS                      | Future kernel                           |
| --------------- | ------------------------------- | --------------------------------------- |
| ID type         | Auto-increment integer          | UUIDv7                                  |
| Multi-tenant    | No `tenant_id`                  | `tenant_id` required                    |
| Actor reference | `session_id` (int) + JOIN       | `actor_id` (UUID) — direct              |
| Action taxonomy | Fixed enum (5 values)           | Free-form `event_type` string           |
| Object taxonomy | Fixed enum (6 values)           | `module` (string) + `subject_id` (UUID) |
| Event ingestion | Kafka consumer + direct service | `KernelAuditFacade.recordEvent()` sync  |
| Async events    | Kafka topics + Debezium CDC     | `outbox_event` + polling relay          |
| Query interface | REST endpoints + session JOIN   | Facade methods (tRPC layer TBD)         |
| Export          | Not supported                   | `exportAuditLog` / `queryAll`           |

## Dependencies — Kafka infrastructure

### Legacy Dependencies

- **confluent_kafka** (`Consumer`, `KafkaException`, `KafkaError`) — Python Kafka client
- **Kafka cluster** with SASL authentication (`bootstrap_servers`, `security_protocol`, `sasl_mechanism`, `sasl_username`, `sasl_password`)
- **Debezium** connector publishing CDC events from PostgreSQL WAL to Kafka topics (e.g., `ems_cdc.public.project_employee`)
- **SQLAlchemy** ORM + PostgreSQL (single-tenant, no schema isolation)
- **FastAPI** for REST endpoints with role-based access control (`RequireRole` dependency)
- **EmployeeSession** table — required for JOIN to resolve `employee_id` from `session_id`

### Consumer Configuration

```
kafka_bootstrap_servers, kafka_security_protocol, kafka_sasl_mechanism,
kafka_sasl_username, kafka_sasl_password, kafka_auto_offset_reset,
kafka_enable_auto_commit, kafka_audit_consumer_group_id
```

All sourced from `src/config/config.settings`.

## Migration Notes — Kafka consumer to outbox_event pattern

### What is already done in Future

1. **Schema** — `core.audit_event` table exists with multi-tenant support.
2. **Repository** — `DrizzleAuditEventRepository` with insert, query, queryAll.
3. **Facade** — `KernelAuditFacade` provides `recordEvent()` and `queryAuditLog()` as the cross-module API.
4. **Outbox** — `publishOutboxEvent()` on the facade replaces Kafka for async event relay.

### What still needs migration

1. **tRPC router** — No audit-log query endpoints exist yet in the tRPC layer. The legacy REST endpoints (`GET /audit-logs`, `GET /audit-logs/session/{session_id}`, `GET /audit-logs/{log_id}`) need tRPC equivalents. The facade already supports the underlying queries.

2. **Caller integration** — Legacy modules call `AuditLogService.log_create()` etc. directly. Future modules must instead call `KernelAuditFacade.recordEvent()` with appropriate `eventType` and `module` strings. Each calling module needs to be updated as it is migrated.

3. **CDC replacement** — Debezium CDC events (Kafka topic `ems_cdc.public.project_employee`) are replaced by the outbox pattern. Modules that need to emit change events should call `KernelAuditFacade.publishOutboxEvent()` within the same transaction, and the polling relay will handle delivery.

4. **Event type taxonomy** — Legacy uses fixed enums (`AuditAction` x `AuditObject`). Future uses free-form `eventType` + `module` strings. Define a naming convention (e.g., `people.employee.created`, `time.leave.approved`) to replace the enum pairs.

5. **Session-to-actor mapping** — Legacy resolves `employee_id` by JOINing `session_id` with `EmployeeSession`. Future stores `actor_id` directly — no JOIN needed. During migration, ensure the calling context always has the actor's UUID available.

6. **Login/logout events** — Legacy tracks `LOGIN`/`LOGOUT` as audit actions on `EMPLOYEE` objects. In Future, these belong in the `identity` module and should be recorded as `identity.session.login` / `identity.session.logout` event types.

7. **Access control** — Legacy restricts audit log reads to `SUPER_ADMIN`, `HR`, `EXECUTIVE` org roles. The tRPC router in Future needs equivalent permission checks via the kernel authority system.

### Kafka infrastructure can be decommissioned

The Kafka consumer, Debezium connector, and all Kafka config (`kafka_*` settings) are fully replaced by:

- **Sync writes**: `KernelAuditFacade.recordEvent()` called in-process
- **Async relay**: `outbox_event` table + polling relay (pg-boss) replaces Kafka topics

No Kafka infrastructure is needed in the Future stack.
