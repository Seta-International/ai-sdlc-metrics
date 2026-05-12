import pino, { type DestinationStream, type LoggerOptions } from 'pino'

export type Logger = pino.Logger

export type CreateLoggerOpts = {
  level?: pino.LevelWithSilent
  service?: string
  destination?: DestinationStream
}

// pino's `*` wildcard matches exactly ONE nesting level, so `*.access_token`
// catches `{ x: { access_token } }` but NOT a top-level `{ access_token }`.
// We list BOTH forms for every sensitive key so logs are scrubbed regardless
// of whether the secret appears at the top level (common for OAuth response
// bundles) or one level deep (common for `{ req: { headers: ... } }` shapes).
// Pino does not support recursive globs (no `**`); a key nested two or more
// levels deep won't be matched. Keep this in mind when designing log shapes.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'password',
  'passwordHash',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'api_key',
  'apiKey',
  'secret',
  'dek',
  'plaintext',
  '*.password',
  '*.passwordHash',
  '*.access_token',
  '*.refresh_token',
  '*.id_token',
  '*.client_secret',
  '*.api_key',
  '*.apiKey',
  '*.secret',
  '*.dek',
  '*.plaintext',
  'env.OPENAI_API_KEY',
  'env.ANTHROPIC_API_KEY',
  'env.ENTRA_CLIENT_SECRET',
]

export function createLogger(opts: CreateLoggerOpts = {}): Logger {
  const baseOpts: LoggerOptions = {
    level: opts.level ?? (process.env.LOG_LEVEL as pino.LevelWithSilent) ?? 'info',
    base: { service: opts.service ?? 'seta-os', env: process.env.NODE_ENV ?? 'development' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  }
  return opts.destination ? pino(baseOpts, opts.destination) : pino(baseOpts)
}

export const logger = createLogger()
