import { registerOTel } from '@vercel/otel'
import { LangfuseExporter } from 'langfuse-vercel'

export interface LangfuseOTelHandle {
  shutdown: () => Promise<void>
}

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`${key} env var is required for Langfuse OTel wiring`)
  return value
}

/**
 * Registers OpenTelemetry with a Langfuse exporter. Must be called at NestJS bootstrap
 * BEFORE any LLM call fires, otherwise spans emitted via `experimental_telemetry` are lost.
 *
 * Sampling is always-on at the OTel layer; stratified sampling (spec §12) is decided
 * downstream by setting `experimental_telemetry.isEnabled = true/false` per-call.
 */
export function initLangfuseOTel(): LangfuseOTelHandle {
  const exporter = new LangfuseExporter({
    secretKey: requireEnv('LANGFUSE_SECRET_KEY'),
    publicKey: requireEnv('LANGFUSE_PUBLIC_KEY'),
    baseUrl: requireEnv('LANGFUSE_BASE_URL'),
  })

  registerOTel({
    serviceName: 'future-agents',
    traceExporter: exporter,
  })

  return {
    shutdown: async () => {
      await exporter.forceFlush()
      await exporter.shutdown()
    },
  }
}
