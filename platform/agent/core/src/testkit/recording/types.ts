/** Metadata stored at the top of each recording file. */
export interface RecordingMeta {
  /** Recording name (matches the filename without extension). */
  name: string
  /** ISO timestamp when the file was first created. */
  createdAt: string
  /** ISO timestamp set on every write in record/force mode. */
  updatedAt?: string
  /** Provider host inferred from the first recorded request (e.g. "anthropic", "openai"). */
  provider?: string
  /** Model id inferred from the first recorded request's `body.model`, when present. */
  model?: string
}

/** One captured request/response pair. */
export interface LLMRecording {
  /** 16-char hex prefix of `md5(serializeRequestContent(url, body))`. */
  hash: string
  request: {
    url: string
    method: string
    body: unknown
  }
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    /** Non-streaming responses store the parsed JSON (or text) body here. */
    body?: unknown
    /** Streaming responses store one entry per decoded `reader.read()`. */
    chunks?: string[]
    /** Wall-clock ms deltas captured between chunks. Kept for diagnostic value; not used during replay. */
    chunkTimings?: number[]
    /** Distinguishes the two response shapes above. */
    isStreaming: boolean
  }
}

/** On-disk file format. One JSON file per recording `name`. */
export interface RecordingFile {
  meta: RecordingMeta
  recordings: LLMRecording[]
}

/** Caller-supplied normalizer applied on BOTH record and replay before hashing. */
export type TransformRequest = (req: { url: string; body: unknown }) => {
  url: string
  body: unknown
}

export interface SetupLLMRecordingOptions {
  /** Required. Used as the filename inside `recordingsDir`. No auto-naming. */
  name: string
  /** Override the recordings directory. Default: `<cwd>/__recordings__`. */
  recordingsDir?: string
  /** Strip per-run volatile fields (run_id, tenant_id, timestamps) before hashing. */
  transformRequest?: TransformRequest
}

export interface LLMRecordingHandle {
  /** Install MSW handlers. Call from `beforeAll`. */
  start(): void
  /** Remove MSW handlers; flush any pending writes in record/force mode. Call from `afterAll`. */
  stop(): void
}

export type RecordingMode = 'replay' | 'record' | 'force'
