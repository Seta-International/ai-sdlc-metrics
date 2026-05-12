import type { LLMRecording } from './types'

export function isStreamingResponse(headers: Headers): boolean {
  const ct = headers.get('content-type') || ''
  return ct.includes('text/event-stream') || ct.includes('text/plain')
}

export async function captureStreamingResponse(
  response: Response,
): Promise<{ chunks: string[]; timings: number[] }> {
  const chunks: string[] = []
  const timings: number[] = []
  const reader = response.body?.getReader()
  if (!reader) return { chunks, timings }

  const decoder = new TextDecoder()
  let lastTime = Date.now()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value, { stream: true }))
      const now = Date.now()
      timings.push(now - lastTime)
      lastTime = now
    }
  } finally {
    reader.releaseLock()
  }
  return { chunks, timings }
}

export function createStreamingResponse(recording: LLMRecording): Response {
  const chunks = recording.response.chunks ?? []
  let i = 0
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[i] as string))
      i++
    },
  })
  return new Response(stream, {
    status: recording.response.status,
    statusText: recording.response.statusText,
    headers: recording.response.headers,
  })
}
