'use client'

// Zone-level event emitter — wired to analytics backend in a later plan.
export function emit(name: string, data: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[telemetry]', name, data)
  }
}
