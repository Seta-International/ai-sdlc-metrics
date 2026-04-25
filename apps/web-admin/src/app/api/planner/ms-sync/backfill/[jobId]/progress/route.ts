import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const MAX_DURATION_MS = 10 * 60 * 1000 // 10 minutes

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let cursor = '00000000-0000-0000-0000-000000000000'
      const deadline = Date.now() + MAX_DURATION_MS

      function send(data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      while (Date.now() < deadline) {
        // Poll for progress events newer than cursor
        const progressResult = await pool.query<{
          id: string
          payload: { jobId: string; processed: number; total: number }
        }>(
          `SELECT id, payload FROM core.outbox_event
           WHERE event_name = 'planner.ms_sync.backfill_progress'
             AND payload->>'jobId' = $1
             AND id > $2
           ORDER BY created_at ASC
           LIMIT 50`,
          [jobId, cursor],
        )

        for (const row of progressResult.rows) {
          cursor = row.id
          const { processed, total } = row.payload
          send({ type: 'progress', processed, total })

          // Treat completion as: processed >= total && total > 0
          if (total > 0 && processed >= total) {
            send({ type: 'completed' })
            controller.close()
            return
          }
        }

        // Wait 1 second before polling again
        await new Promise<void>((resolve) => setTimeout(resolve, 1000))
      }

      // Safety: close after max duration
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
