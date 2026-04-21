import { NodeSDK } from '@opentelemetry/sdk-node'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import type { ClsService } from 'nestjs-cls'
import { TenantSpanProcessor } from './tenant-span-processor'

export type OtelHandle = {
  shutdown(): Promise<void>
}

/**
 * Initializes the OpenTelemetry Node SDK for the API process.
 *
 * The exporter endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`) is the only required
 * env knob. When unset, the SDK is not started and this function returns a
 * no-op handle — dev and unit-test runs carry zero observability overhead.
 *
 * Vendor-agnostic by design: any OTLP-compatible collector is supported.
 * Backend selection (Tempo, Honeycomb, ClickHouse via otel-collector, etc.)
 * is a deploy-time decision that never touches emission code — see
 * docs/agents/plans/07-observability.md §2 vendor-neutrality invariant.
 *
 * Must be invoked BEFORE `NestFactory.create` so auto-instrumentation hooks
 * into Nest modules as they load.
 */
export function startOtel(opts: { cls: ClsService; serviceName?: string }): OtelHandle {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  if (!endpoint) {
    return { shutdown: async () => {} }
  }

  const serviceName = opts.serviceName ?? process.env['OTEL_SERVICE_NAME'] ?? 'future-api'
  const serviceVersion = process.env['OTEL_SERVICE_VERSION'] ?? '0.0.0'

  const tenantProcessor = new TenantSpanProcessor(opts.cls)
  const batchProcessor: SpanProcessor = new BatchSpanProcessor(
    new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  )

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    spanProcessors: [tenantProcessor, batchProcessor],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 60_000,
    }),
    contextManager: new AsyncLocalStorageContextManager(),
  })

  sdk.start()

  return {
    shutdown: () => sdk.shutdown(),
  }
}
