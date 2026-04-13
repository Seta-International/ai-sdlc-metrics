# Voice Capture & AI Extraction Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Owns:** Audio recording/upload, speech-to-text transcription, AI action item extraction
**Requirements source:** `docs/requirements/planner.md` (REQ-08 — Voice Recording Capture)

---

## Overview

Voice capture enables SETA employees to record casual conversations (hallway discussions, client visits, phone calls) and extract action items via AI. The feature is built as **reusable shared packages** + **module-specific pipelines**.

The shared packages (`@future/stt`, `packages/ui` AudioRecorder) can be reused by any module. The planner module owns the first pipeline: record → transcribe → extract → draft tasks → human review. Other modules (performance, hiring) can build their own pipelines using the same packages later.

### Architecture Split

| Layer                                | What                                               | Owner                          |
| ------------------------------------ | -------------------------------------------------- | ------------------------------ |
| `@future/stt` package                | STT provider interface + Whisper API adapter       | Shared infrastructure          |
| `@future/storage` package            | S3 pre-signed URLs, lifecycle                      | Shared infrastructure (exists) |
| `packages/ui` AudioRecorder          | Recording + upload UI component                    | Shared UI                      |
| Planner `IActionExtractor` port      | Text → structured action items                     | Planner domain                 |
| Planner `ProcessRecording` pipeline  | Orchestrate: upload → transcribe → extract → draft | Planner application            |
| Integrations `IActionExtractor` port | Same capability, own port per DDD                  | Integrations domain            |

### Tech Stack

| Concern           | Technology                              | Notes                                  |
| ----------------- | --------------------------------------- | -------------------------------------- |
| STT (v1)          | OpenAI Whisper API (`whisper-1`)        | $0.006/min, no diarization             |
| STT (future)      | faster-whisper + whisperX               | Self-hosted, diarization, same quality |
| Action extraction | OpenAI structured output (gpt-5.4-nano) | Confidence scoring, multi-language     |
| Audio recording   | MediaRecorder API (WebM/Opus, MP4/AAC)  | PWA-compatible                         |
| Audio storage     | S3 with 30-day lifecycle                | Pre-signed URL upload                  |
| Processing        | pg-boss job queue                       | Async pipeline                         |

### Prerequisites

- **`@future/core` package** — exports `DomainException` base class. Refactoring spec required.
- **`@future/stt` package** — must be created first (`turbo gen workspace` per CLAUDE.md). After creation, `bun run --filter @future/stt build` before tests.
- **`@future/storage` package** — must exist (already does) for pre-signed URL generation.
- **Planner module Phase 2+** — the recording pipeline dispatches `CreateTask` commands to planner.
- OpenAI API key configured for Whisper + structured output.

### Pattern Reference

- **Package creation**: `turbo gen workspace` (per CLAUDE.md). Never create manually.
- **Module patterns**: Follow `modules/people/` as the canonical reference (see planner spec for full file list).
- **IActionExtractor duplication note**: Both planner and integrations modules define their own `IActionExtractor` port. This is intentional per DDD — each module owns its ports. The infrastructure adapters (`OpenAiActionExtractor`) may share similar prompt logic but are independent implementations.

### Implementation Order

**Phase 1 — `@future/stt` Package (no module dependencies)**

1. Create package: `turbo gen workspace` → `packages/stt`
2. Define `ISpeechToTextProvider` interface + types
3. Implement `WhisperApiAdapter`
4. Unit tests for adapter
5. Export from package index

**Phase 2 — Planner Recording Domain (depends on Planner Phase 1)**

6. `recording` table in planner schema + migration
7. `Recording` entity interface + `RecordingStatus` type
8. `IRecordingRepository` port
9. `IActionExtractor` port + `ExtractedAction` type
10. Recording exceptions

**Phase 3 — Planner Recording Application (depends on Phase 2 + `@future/stt`)**

11. `DrizzleRecordingRepository`
12. `OpenAiActionExtractor` infrastructure adapter
13. `WhisperSttProvider` infrastructure adapter (wraps `@future/stt`)
14. `RequestUploadUrl`, `SubmitRecording` commands + handlers
15. `ProcessRecording` command + handler (pg-boss worker)
16. `ListRecordings`, `GetRecording` queries
17. tRPC recording procedures
18. Module wiring updates

**Phase 4 — `AudioRecorder` UI Component (no backend dependencies)**

19. `AudioRecorder` component in `packages/ui` (can be built in parallel with Phase 2-3)
20. MediaRecorder + file upload modes
21. Storybook stories / visual tests

**Phase 5 — Frontend Recording Page (depends on Phase 3 + 4)**

22. `/planner/record` page in `web-planner`
23. S3 upload flow with pre-signed URLs
24. Processing status indicator
25. Link to `/planner/drafts`

---

## Package: `@future/stt`

Speech-to-text abstraction. Provider-agnostic interface with pluggable adapters.

### Interface

```typescript
// src/stt-provider.ts
export const STT_PROVIDER = Symbol('ISpeechToTextProvider')

export interface ISpeechToTextProvider {
  transcribe(audioUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult>
}

export interface TranscribeOptions {
  language?: string // 'vi', 'en', or 'auto' (default: 'auto')
  diarization?: boolean // request speaker segments if supported
  format?: 'text' | 'verbose' // verbose includes timestamps
}

export interface TranscriptionResult {
  text: string
  language: string // detected language
  duration: number // audio duration in seconds
  segments?: DiarizedSegment[] // null if provider doesn't support
}

export interface DiarizedSegment {
  speaker: string // 'speaker_0', 'speaker_1', etc.
  start: number // seconds
  end: number
  text: string
}
```

### Whisper API Adapter

```typescript
// src/adapters/whisper-api.adapter.ts
export class WhisperApiAdapter implements ISpeechToTextProvider {
  constructor(private readonly config: { apiKey: string; model?: string }) {}

  async transcribe(audioUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult> {
    // 1. Download audio from S3 pre-signed URL
    // 2. POST to OpenAI /v1/audio/transcriptions with model 'whisper-1'
    // 3. Map response to TranscriptionResult
    // 4. segments: undefined (Whisper API does not support diarization)
  }
}
```

### Package structure

```
packages/stt/
  src/
    stt-provider.ts              — ISpeechToTextProvider interface + types
    adapters/
      whisper-api.adapter.ts     — OpenAI Whisper API implementation
    index.ts                     — re-exports all
  package.json
  tsconfig.json
```

### Future adapters (added as new files, no interface changes)

- `faster-whisper.adapter.ts` — self-hosted with diarization via whisperX
- `azure-speech.adapter.ts` — Azure AI Speech Services

### Cost at scale

| Volume     | Whisper API | faster-whisper (GPU spot) | Break-even             |
| ---------- | ----------- | ------------------------- | ---------------------- |
| 100 hr/mo  | $36         | $25-50                    | Not worth self-hosting |
| 500 hr/mo  | $180        | $80-120                   | Self-hosting wins      |
| 1000 hr/mo | $360        | $150-200                  | Clear self-hosting win |

Migrate to self-hosted adapter when volume exceeds ~500 hr/month or diarization becomes critical.

---

## Shared UI: AudioRecorder Component

In `packages/ui`, a reusable recording and upload component.

### Props

```typescript
interface AudioRecorderProps {
  onComplete: (file: File, metadata: RecordingMetadata) => void
  maxDuration?: number // seconds, default 3600 (1 hour)
  acceptFormats?: string // default: 'audio/*'
}

interface RecordingMetadata {
  duration: number
  mimeType: string
  source: 'recording' | 'upload'
}
```

### Behavior

- **Record mode**: large record/stop button, live duration timer, waveform visualization
- **Upload mode**: file picker for existing audio (MP3, M4A, WAV, OGG, WebM)
- Uses MediaRecorder API — WebM/Opus on Chrome/Android, MP4/AAC on Safari/iOS
- Returns File object + metadata to parent — does NOT handle S3 upload
- Mobile-optimized: large touch targets, minimal chrome
- Follows DESIGN.md: industrial aesthetic, navy accent, Geist font

---

## Planner Module: Voice Recording Pipeline

### New domain entity

```typescript
// domain/entities/recording.entity.ts
export interface Recording {
  id: string
  tenantId: string
  submittedBy: string
  s3Key: string
  mimeType: string
  durationSeconds: number | null
  language: string | null
  transcript: string | null
  status: RecordingStatus
  errorMessage: string | null
  createdAt: Date
  processedAt: Date | null
}

export type RecordingStatus = 'uploaded' | 'transcribing' | 'extracting' | 'done' | 'error'
```

### New table — `recording` (in `planner` schema)

| Column           | Type      | Notes                                                     |
| ---------------- | --------- | --------------------------------------------------------- |
| id               | uuid v7   | PK                                                        |
| tenant_id        | uuid      | NOT NULL                                                  |
| submitted_by     | uuid      | actor who uploaded                                        |
| s3_key           | text      | NOT NULL — audio file path in S3                          |
| mime_type        | text      | NOT NULL                                                  |
| duration_seconds | integer   | nullable — populated after transcription                  |
| language         | text      | nullable — detected or user-specified                     |
| transcript       | text      | nullable — populated after transcription                  |
| status           | enum      | `uploaded`, `transcribing`, `extracting`, `done`, `error` |
| error_message    | text      | nullable                                                  |
| created_at       | timestamp |                                                           |
| processed_at     | timestamp | nullable                                                  |

S3 storage path: `audio/{tenant_id}/{recording_id}/{filename}`
S3 lifecycle: 30-day expiration on `audio/` prefix.

### New ports

```typescript
// domain/ports/speech-to-text.port.ts
// Re-exports from @future/stt for module-level injection
export { STT_PROVIDER, type ISpeechToTextProvider } from '@future/stt'

// domain/ports/action-extractor.port.ts
export const ACTION_EXTRACTOR = Symbol('IActionExtractor')
export interface IActionExtractor {
  extractFromTranscript(
    transcript: string,
    options?: { language?: string },
  ): Promise<ExtractedAction[]>
}

export interface ExtractedAction {
  title: string
  ownerHint: string | null
  deadlineHint: string | null
  confidence: number // 0.0 - 1.0
  sourceQuote: string | null
}
```

### New repository interface

```typescript
// domain/repositories/recording.repository.ts
export const RECORDING_REPOSITORY = Symbol('IRecordingRepository')
export interface IRecordingRepository {
  findById(id: string, tenantId: string): Promise<Recording | null>
  insert(data: Omit<Recording, 'id' | 'createdAt' | 'processedAt'>): Promise<Recording>
  updateStatus(
    id: string,
    tenantId: string,
    status: RecordingStatus,
    updates?: Partial<
      Pick<
        Recording,
        'transcript' | 'language' | 'durationSeconds' | 'errorMessage' | 'processedAt'
      >
    >,
  ): Promise<void>
  listBySubmitter(
    tenantId: string,
    submittedBy: string,
    opts: { limit: number; offset: number },
  ): Promise<Recording[]>
}
```

### New exception

```
RecordingNotFoundException — code: 'RECORDING_NOT_FOUND'
TranscriptionFailedException — code: 'TRANSCRIPTION_FAILED'
ExtractionFailedException — code: 'EXTRACTION_FAILED'
```

### New commands

| Command            | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `RequestUploadUrl` | Generate S3 pre-signed URL via `@future/storage`                       |
| `SubmitRecording`  | Confirm upload complete, create Recording entity, queue processing job |
| `ProcessRecording` | pg-boss worker: transcribe → extract → create draft tasks              |

### New queries

| Query            | Description                                        |
| ---------------- | -------------------------------------------------- |
| `ListRecordings` | User's submitted recordings with processing status |
| `GetRecording`   | Single recording with transcript                   |

### Processing flow

```
1. User opens /planner/record (mobile-optimized page)
2. Records audio or uploads file via AudioRecorder component
3. Frontend calls planner.recording.requestUploadUrl
   → returns { url, s3Key, expiresIn }
4. Frontend uploads directly to S3 via pre-signed URL
5. Frontend calls planner.recording.submit with:
   { s3Key, mimeType, durationSeconds, language? }
6. SubmitRecording handler:
   a. Create Recording entity (status: 'uploaded')
   b. Queue pg-boss job 'planner.process-recording' with { recordingId, tenantId }
7. pg-boss worker (ProcessRecording handler):
   a. Load recording entity
   b. Update status → 'transcribing'
   c. Generate S3 pre-signed download URL for the audio
   d. Call ISpeechToTextProvider.transcribe(downloadUrl, { language })
   e. Store transcript + detected language + duration in recording entity
   f. Update status → 'extracting'
   g. Call IActionExtractor.extractFromTranscript(transcript, { language })
   h. For each extracted action with confidence >= 0.5:
      - Dispatch CreateTask command:
        - source_type: 'voice_recording'
        - source_ref: { recordingId, sourceQuote, confidence }
        - status category: 'draft'
        - title: extracted title
        - created_by: recording.submittedBy
   i. Update status → 'done', set processedAt
   j. Dispatch SendNotificationCommand:
      "N action items extracted from your recording — review and confirm"
   k. On any error at any step: status → 'error', store errorMessage, do not retry transcription (expensive)
```

### tRPC procedures (added to planner router)

```
planner.
  recording.requestUploadUrl  — mutation
  recording.submit            — mutation
  recording.list              — query
  recording.get               — query
```

### pg-boss job

| Job                         | Schedule  | Description                                                 |
| --------------------------- | --------- | ----------------------------------------------------------- |
| `planner.process-recording` | On demand | Queued by SubmitRecording. Singleton key: `recording-${id}` |

---

## Infrastructure Adapters (Planner Module)

### OpenAI Action Extractor

```typescript
// infrastructure/ai/openai-action-extractor.ts
@Injectable()
export class OpenAiActionExtractor implements IActionExtractor {
  constructor(private readonly openai: OpenAI) {}

  async extractFromTranscript(
    transcript: string,
    options?: { language?: string },
  ): Promise<ExtractedAction[]> {
    // Uses OpenAI structured output (response_format: { type: 'json_schema' })
    // Model: gpt-5.4-nano (classify tier per CLAUDE.md AI config)
    // System prompt: extract action items with title, ownerHint, deadlineHint, confidence, sourceQuote
    // Instructs model to normalize output to English regardless of transcript language
    // Filters results below confidence 0.5
  }
}
```

### Whisper STT Provider

```typescript
// infrastructure/stt/whisper-stt.provider.ts
@Injectable()
export class WhisperSttProvider implements ISpeechToTextProvider {
  // Wraps WhisperApiAdapter from @future/stt
  // Configured via environment variables (OPENAI_API_KEY)
}
```

### Module wiring additions

```typescript
// In planner.module.ts providers:
{ provide: RECORDING_REPOSITORY, useClass: DrizzleRecordingRepository },
{ provide: STT_PROVIDER, useClass: WhisperSttProvider },
{ provide: ACTION_EXTRACTOR, useClass: OpenAiActionExtractor },
RequestUploadUrlHandler,
SubmitRecordingHandler,
ProcessRecordingHandler,
ListRecordingsHandler,
GetRecordingHandler,
```

---

## Frontend: Recording Page

### Route

```
/planner/record → Mobile-optimized recording page
```

### Layout

- Minimal chrome — no sidebar on mobile, just GlobalNav header
- **Record tab**: AudioRecorder component (big button, timer, waveform)
- **Upload tab**: file picker with drag-and-drop
- **Language selector**: Auto / Vietnamese / English
- **Submit button**: uploads to S3, calls `recording.submit`, shows processing status
- **Processing indicator**: uploaded → transcribing → extracting → done
- **"Review drafts" link** appears once processing completes → navigates to `/planner/drafts`

### PWA considerations

- Works when added to mobile home screen
- Recording works offline (MediaRecorder saves to local storage)
- Upload queues when connection is restored (background sync via service worker)
- Minimal JS bundle — AudioRecorder + upload logic only

---

## Integrations Module: Action Extractor Port

The integrations module defines its own `IActionExtractor` port (per DDD — each module owns its ports):

```typescript
// integrations/domain/ports/action-extractor.port.ts
export const ACTION_EXTRACTOR = Symbol('IActionExtractor')
export interface IActionExtractor {
  extractFromTranscript(
    transcript: string,
    options?: { language?: string },
  ): Promise<ExtractedAction[]>
  extractFromEmail(subject: string, body: string): Promise<ExtractedAction[]>
}
```

The integrations module has its own `OpenAiActionExtractor` in `infrastructure/ai/` that implements both transcript and email extraction. The prompt templates may differ from planner's — email extraction needs different heuristics than voice transcript extraction.

---

## What This Spec Does NOT Own

- **Draft task review UI** — planner module (`/planner/drafts`), already spec'd
- **Email-to-action pipeline** — integrations module (MS365 spec)
- **Teams transcript pipeline** — integrations module (MS365 spec)
- **Notification delivery** — notifications module
- **AI agent capabilities** — agents module (future)

---

## Verification Criteria

You know voice capture is working when:

1. **Package build**: `bun run --filter @future/stt build` succeeds, exports are available
2. **Whisper adapter**: Unit test passes — mock audio URL → adapter calls OpenAI API → returns `TranscriptionResult` with text + language + duration
3. **Upload flow**: Frontend calls `recording.requestUploadUrl` → gets pre-signed S3 URL → uploads audio file → S3 object exists at expected path
4. **Submit recording**: Call `recording.submit` with valid s3Key → `Recording` entity created with status `uploaded` → pg-boss job queued
5. **Transcription**: pg-boss processes job → recording status goes `uploaded` → `transcribing` → transcript stored in entity → status goes to `extracting`
6. **Action extraction**: OpenAI structured output returns 3 actions with confidence 0.3, 0.6, 0.8 → only 2 draft tasks created (confidence >= 0.5 filter)
7. **Draft tasks**: Created tasks have `source_type: 'voice_recording'`, `source_ref` with `recordingId`, status category `draft`, NO sequence number
8. **Error handling**: Whisper API returns error → recording status goes to `error` with `errorMessage` set → no draft tasks created → no retry
9. **AudioRecorder component**: Record 10 seconds → stop → `onComplete` fires with File object (WebM or MP4) + metadata with `duration: ~10`, `source: 'recording'`
10. **S3 lifecycle**: Upload audio → wait 30 days → S3 object deleted automatically
