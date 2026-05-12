import type { SSEMessage, SSEStreamingApi } from 'hono/streaming'

export async function safeEnqueue(stream: SSEStreamingApi, message: SSEMessage): Promise<boolean> {
  try {
    await stream.writeSSE(message)
    return true
  } catch {
    return false
  }
}

export async function safeClose(stream: SSEStreamingApi): Promise<boolean> {
  try {
    await stream.close()
    return true
  } catch {
    return false
  }
}
