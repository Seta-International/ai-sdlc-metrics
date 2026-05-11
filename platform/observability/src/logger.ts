import pino, { type DestinationStream, type LoggerOptions } from 'pino'

export type Logger = pino.Logger

export type CreateLoggerOpts = {
  level?: pino.LevelWithSilent
  service?: string
  destination?: DestinationStream
}

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
