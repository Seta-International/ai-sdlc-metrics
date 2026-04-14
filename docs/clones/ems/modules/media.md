# Module: media

## Source -- entity, MinIO client, file types

### Media Entity (`src/core/models/media.py`)

SQLAlchemy model mapped to `medias` table:

| Column       | Type          | Notes                            |
| ------------ | ------------- | -------------------------------- |
| `id`         | `BigInteger`  | PK, autoincrement                |
| `file_name`  | `String(255)` | Original stem (no extension)     |
| `file_path`  | `String(255)` | Object key in MinIO bucket       |
| `file_type`  | `String(255)` | Extension without dot            |
| `file_size`  | `BigInteger`  | Bytes                            |
| `created_at` | `DateTime`    | server_default `now()`           |
| `updated_at` | `DateTime`    | server_default `now()`, onupdate |

No `tenant_id` column -- single-tenant legacy system.

### MediaType Enum (`src/core/enums/media.py`)

```python
class MediaType(str, Enum):
    AVATAR            = "avatar"
    EVIDENCE          = "evidence"
    CONTRACT          = "contract"
    CONTRACT_TEMPLATE = "contract_template"
    REPORT            = "report"
    OTHER             = "other"
```

Values are used as the first path segment of the object key (e.g. `avatar/photo_aB1cD.png`).

### MinIO Client (`src/sdk/minio/client.py`)

Thin wrapper around the `minio` Python SDK (`Minio` class). Connects via `settings.minio_url`, `minio_access_key`, `minio_secret_key`, `minio_bucket`, `minio_region`. Parses the URL to detect `http` vs `https` for the `secure` flag.

| Method             | Signature                                            | Behavior                                                                        |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `upload_file`      | `(content: bytes, file_name: str) -> None`           | Guesses MIME via `mimetypes.guess_type`, wraps in `BytesIO`, calls `put_object` |
| `get_media_url`    | `(object_name: str) -> str`                          | Returns 1-hour presigned GET URL                                                |
| `remove_media`     | `(object_name: str) -> bool`                         | Calls `remove_object`, returns `True`/`False`                                   |
| `list_all_objects` | `(prefix?, recursive=True) -> List[MinioObjectInfo]` | Enumerates entire bucket (or prefix), returns dataclass list                    |

`MinioObjectInfo` dataclass: `object_name`, `size`, `last_modified`, `content_type`.

## Business Logic -- upload, download, cleanup, avatar sync

### MediaService (`src/core/services/media_service.py`)

Dependencies injected: `MediaRepository`, `EmployeeRepository`, `MinioClient`, `OffboardRepository`, `TemplateRepository`.

#### Upload flows

| Method                        | MediaType           | Extra behavior                                                                                                                                |
| ----------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload_avatar`               | `AVATAR`            | After upload, calls `employee_repository.update_employee_avatar(employee_id, file_path)` to sync avatar path on the employee record           |
| `upload_evidence`             | `EVIDENCE`          | Validates extension whitelist (`.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.txt`) and strict `.txt` filename pattern (`^[A-Za-z0-9_-]+\.txt$`) |
| `upload_contract_template`    | `CONTRACT_TEMPLATE` | Only `.docx`; extracts placeholders via `docx.get_placeholders`, returns `TemplateFileDTO` with placeholder schema                            |
| `upload_contract`             | `CONTRACT`          | Accepts `io.BytesIO` + filename (server-generated content, not user upload)                                                                   |
| `upload_media` (private core) | any                 | Reads bytes, generates object key `{media_type}/{stem}_{random5}{ext}`, calls `minio_client.upload_file`, creates DB record                   |

Object key pattern: `{MediaType.value}/{original_stem}_{5-char-random}{.ext}`

#### Download / URL generation

- `get_media_url(media_id)` -- looks up DB record, returns presigned URL from MinIO.
- `get_media_url_by_path(media_path)` -- same but looks up by `file_path` column.

#### Deletion

- `remove_media(media_id)` -- deletes from MinIO, then from DB.
- `remove_media_by_path(media_path)` -- same, lookup by path.

#### Cleanup (`cleanup_all`)

Two-phase garbage collection with `dry_run` support:

1. **Phase 1 -- DB cleanup** (`_cleanup_unused_media_in_db`): Finds media rows not referenced by `templates`, `contract_documents`, `subtask_offboards`, or `employee.avatar_path`. Applies grace period (default 7 days). Deletes from MinIO first (best-effort), then from DB. Batched.

2. **Phase 2 -- Orphan cleanup** (`_cleanup_orphan_files_in_minio`): Lists all MinIO objects, diffs against `media.file_path` set in DB. Deletes objects present in MinIO but absent from DB (also with grace period). Batched.

Returns `CombinedCleanupResultDTO` with per-phase stats (counts, bytes freed, errors).

## API Endpoints -- all routes

### Media Router (`src/present/routers/media_router.py`)

Prefix: `/media`

| Method | Path                              | Handler                    | Auth | Notes                                                               |
| ------ | --------------------------------- | -------------------------- | ---- | ------------------------------------------------------------------- |
| POST   | `/media/upload/avatar`            | `upload_avatar`            | Yes  | Multipart file, syncs employee avatar                               |
| POST   | `/media/upload/contract_template` | `upload_contract_template` | Yes  | `.docx` only, returns `TemplateFileDTO`                             |
| GET    | `/media/{media_id}`               | `get_media_url`            | Yes  | Returns `{ media_url: presigned_url }`                              |
| GET    | `/media/?path=...`                | `get_media_url_by_path`    | Yes  | Lookup by object key path                                           |
| POST   | `/media/cleanupall`               | `cleanup_all_media`        | Yes  | Admin-only GC; params: `grace_period_days`, `dry_run`, `batch_size` |

### Evidence upload (lives on task_router)

| Method | Path                        | Handler           |
| ------ | --------------------------- | ----------------- |
| POST   | `/tasks/{task_id}/evidence` | `upload_evidence` |

Evidence upload is invoked from the task router, not the media router. The media service handles validation; the task controller wires the media record to the offboard subtask.

## Target Overlap -- what exists in @future/storage package

`@future/storage` (`packages/storage/`) already provides a production-ready S3 abstraction:

### StorageClient interface (`src/types.ts`)

```typescript
interface StorageClient {
  getUploadUrl(key: string, opts: UploadOpts): Promise<PresignedUrl>
  getDownloadUrl(key: string, expiresIn?: number): Promise<PresignedUrl>
  putObject(key: string, body: Buffer, contentType: string): Promise<void>
  deleteObject(key: string): Promise<void>
  headObject(key: string): Promise<ObjectMeta | null>
}
```

### S3StorageClient (`src/s3-storage-client.ts`)

Concrete implementation using `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Supports `PutObject`, `GetObject`, `DeleteObject`, `HeadObject`, and presigned URL generation (default 900s TTL).

### Key Builder (`src/key-builder.ts`)

```typescript
interface KeyParts {
  tenantId: string
  category: 'avatars' | 'documents' | 'cv' | 'exports' | 'temp'
  module?: string
  entityId?: string
  fileName: string
}
```

Generates keys as `{tenantId}/{category}/[{module}/][{entityId}/]{uuid-v4}{ext}`. Uses UUID v4 for S3 hot-shard avoidance.

### Coverage comparison

| Legacy capability               | @future/storage status             | Gap                                                                                             |
| ------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `upload_file` (server-side PUT) | `putObject` exists                 | Covered                                                                                         |
| `get_media_url` (presigned GET) | `getDownloadUrl` exists            | Covered (different TTL: legacy 1h, target 15m default)                                          |
| `remove_media`                  | `deleteObject` exists              | Covered                                                                                         |
| `list_all_objects`              | Not implemented                    | **Gap** -- needed for orphan cleanup                                                            |
| Presigned upload URL            | `getUploadUrl` exists              | Legacy does not use presigned uploads; target does                                              |
| `headObject`                    | Exists                             | Legacy has no equivalent                                                                        |
| Key building                    | `buildKey` exists                  | Different pattern; legacy uses `{type}/{name}_{rand}`, target uses `{tenant}/{category}/{uuid}` |
| MIME type guessing              | Not in package                     | Legacy does it in MinIO client; target leaves it to caller                                      |
| Media DB record management      | Not in package (belongs in module) | Expected -- storage package is infra only                                                       |

## Dependencies -- MinIO/S3 infrastructure

### Legacy infrastructure

- **MinIO server** -- S3-compatible object store, self-hosted
- **Python `minio` SDK** -- `pip install minio`
- **Config**: `minio_url`, `minio_access_key`, `minio_secret_key`, `minio_bucket`, `minio_region`
- Single bucket, no tenant isolation in object keys
- No lifecycle rules; cleanup is manual via the `cleanupall` endpoint

### Cross-module references (for unused-media detection)

The cleanup logic queries these tables to determine if a media record is "in use":

- `templates.media_id` -- contract templates
- `contract_documents.media_id` -- generated contracts
- `subtask_offboards.media_id` -- offboarding evidence
- `employees.avatar_path` -- matched against `media.file_path`

### Module dependencies in service layer

- `EmployeeRepository` -- avatar sync on upload
- `OffboardRepository` -- referenced during cleanup (indirectly via query)
- `TemplateRepository` -- referenced during cleanup (indirectly via query)
- `docx` util -- placeholder extraction from `.docx` templates

## Migration Notes -- MinIO to S3/storage abstraction

### What maps directly

1. **Upload flow** maps to `S3StorageClient.putObject`. The `upload_media` core method reads bytes, builds a key, and stores. This is functionally identical.
2. **Presigned download** maps to `S3StorageClient.getDownloadUrl`. Adjust default TTL from 1 hour to whatever the target standard is (currently 15 minutes).
3. **Delete** maps to `S3StorageClient.deleteObject`. One-to-one.
4. **Key generation** should use `buildKey` from `@future/storage` instead of the legacy `{type}/{stem}_{random}` pattern. The target pattern includes `tenantId` (mandatory in Future) and uses UUID v4 instead of a 5-char random string.

### What needs new work

1. **`listObjects` on StorageClient** -- the target `StorageClient` interface has no `listObjects` method. The cleanup/orphan-detection feature requires it. Add `listObjects(prefix?: string): AsyncIterable<ObjectMeta>` to the interface and implement via `ListObjectsV2Command`.
2. **Media domain entity** -- create in the appropriate module (likely `kernel` or a shared media concern). Must include `tenant_id`. Schema: `id` (uuid v7), `tenant_id`, `file_name`, `key` (S3 object key), `content_type`, `size_bytes`, `category` (enum: avatar, evidence, contract, contract_template, report), `created_at`, `updated_at`.
3. **Category enum** -- map legacy `MediaType` to `KeyParts.category`. Current target categories (`avatars`, `documents`, `cv`, `exports`, `temp`) partially overlap. Add `evidence` and `contracts` categories, or map `CONTRACT`/`CONTRACT_TEMPLATE` to `documents`.
4. **Avatar sync** -- in legacy this is a tight coupling (media service directly updates employee record). In Future, emit a domain event (`AvatarUploaded { employeeId, mediaKey }`) and let the `people` module handle it via event handler.
5. **Evidence upload validation** -- the extension whitelist and strict `.txt` filename validation should live in the domain layer as a value object or validation policy.
6. **Contract template placeholder extraction** -- the `.docx` parsing logic (`docx.get_placeholders`) is a utility concern. Keep it as a shared package or inline in the hiring/people module that owns contract templates.
7. **Cleanup job** -- replace the HTTP-triggered `cleanupall` endpoint with a `pg-boss` scheduled job. Two sub-tasks: (a) find unreferenced media rows older than grace period, delete from S3 + DB; (b) list S3 objects not in DB, delete orphans. Requires the new `listObjects` capability.
8. **Tenant isolation** -- all S3 keys must be prefixed with `tenant_id`. The target `buildKey` already does this. Legacy has no tenant concept.
9. **No backward compatibility** -- per project rules, do not preserve the legacy key format. All callers must use the new `buildKey` pattern. Existing MinIO data requires a one-time migration script if data is carried over.
