import { type KernelChunk, parseChunk } from '../schemas/chunk'

export interface ParseOptions {
  signal?: AbortSignal
}

export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (c: KernelChunk) => void,
  opts: ParseOptions = {},
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const onAbort = () => {
    reader.cancel(new DOMException('Aborted', 'AbortError')).catch(() => {})
  }
  opts.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    while (true) {
      const { value, done } = await reader.read()
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const chunk = parseFrame(frame)
        if (chunk) onChunk(chunk)
        sep = buffer.indexOf('\n\n')
      }
    }

    const tail = buffer.trim()
    if (tail) {
      const chunk = parseFrame(tail)
      if (chunk) onChunk(chunk)
    }
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

function parseFrame(frame: string): KernelChunk | null {
  const dataLines: string[] = []
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.length === 0 || line.startsWith(':')) continue
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
      continue
    }
    if (line.startsWith('event:') || line.startsWith('id:') || line.startsWith('retry:')) {
      continue
    }
    throw new Error(`sse parse: unexpected field in frame: ${line.slice(0, 32)}`)
  }
  if (dataLines.length === 0) return null
  const data = dataLines.join('\n')
  if (data.length === 0) return null
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch (e) {
    throw new Error(`sse parse: invalid JSON in data: ${(e as Error).message}`)
  }
  return parseChunk(raw)
}
