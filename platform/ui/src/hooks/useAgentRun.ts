import { type KernelChunk, parseSseStream, type RunStatus } from '@seta/agent-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAgentClient } from '../provider/useAgentClient'

interface TokenUsage {
  in: number
  out: number
}

export interface UseAgentRunResult {
  chunks: KernelChunk[]
  status: RunStatus
  tokenUsage: TokenUsage
  start: () => void
  abort: () => void
}

export function useAgentRun(runId: string): UseAgentRunResult {
  const client = useAgentClient()
  const [chunks, setChunks] = useState<KernelChunk[]>([])
  const [status, setStatus] = useState<RunStatus>('idle')
  const ctrlRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(
    () => () => {
      mountedRef.current = false
      ctrlRef.current?.abort()
    },
    [],
  )

  const start = useCallback(() => {
    if (ctrlRef.current) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setChunks([])
    setStatus('running')
    void client
      .streamRun(runId, { signal: ctrl.signal })
      .then((res) =>
        parseSseStream(
          res.body!,
          (chunk) => {
            if (!mountedRef.current) return
            setChunks((prev) => [...prev, chunk])
            if (chunk.type === 'error') setStatus('failed')
            if (chunk.type === 'abort') setStatus('aborted')
          },
          { signal: ctrl.signal },
        ),
      )
      .then(() => {
        if (!mountedRef.current) return
        setStatus((prev) => (prev === 'running' ? 'completed' : prev))
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return
        const name = (err as { name?: string }).name
        if (name === 'AbortError') setStatus('aborted')
        else setStatus('failed')
      })
      .finally(() => {
        ctrlRef.current = null
      })
  }, [client, runId])

  const abort = useCallback(() => {
    ctrlRef.current?.abort()
    setStatus('aborted')
  }, [])

  const tokenUsage = useMemo<TokenUsage>(() => {
    let inTok = 0
    let outTok = 0
    for (const c of chunks) {
      if (c.type === 'finish' && c.usage) {
        inTok += c.usage.inputTokens
        outTok += c.usage.outputTokens
      }
    }
    return { in: inTok, out: outTok }
  }, [chunks])

  return { chunks, status, tokenUsage, start, abort }
}
