import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  type AgentConfig,
  createAdapterRegistry,
  createAnthropicAdapter,
  type KernelChunk,
  type RunInput,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenancy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AgentMemoryProvider } from '../../src/provider'
import { closeTestSql, ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const RECORDINGS_DIR = path.resolve(__dirname, './__recordings__')
const TENANT = '00000000-0000-0000-0000-000000000099'

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || hasRecording(name)
}

function buildRegistry() {
  const reg = createAdapterRegistry()
  reg.register(
    'anthropic',
    createAnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'sk-test' }),
  )
  return reg
}

async function drain(stream: AsyncIterable<KernelChunk>): Promise<KernelChunk[]> {
  const chunks: KernelChunk[] = []
  for await (const c of stream) chunks.push(c)
  return chunks
}

const FROZEN_NOW = new Date('2026-05-13T00:00:00Z').getTime()
const ctxOverrides = {
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })

beforeAll(async () => {
  await ensureMigrations()
})

beforeEach(async () => {
  await truncateMemoryTables()
})

afterEach(() => {
  recording.stop()
})

afterAll(async () => {
  await closeTestSql()
})

describe('kernel + AgentMemoryProvider round-trip', () => {
  it.skipIf(!shouldRun('memory-round-trip'))(
    'persists turn 1 and recalls it in turn 2',
    async () => {
      recording = setupLLMRecording({ name: 'memory-round-trip', recordingsDir: RECORDINGS_DIR })
      recording.start()

      const memory = new AgentMemoryProvider({ sql: testSql() })
      const adapters = buildRegistry()
      const cfg: AgentConfig = {
        model: 'anthropic/claude-haiku-4-5',
        systemPrompt: 'reply with one short word',
        maxTokens: 32,
      }
      const threadId = randomUUID()

      // Turn 1
      const turn1Input: RunInput = {
        threadId,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'say hi' }] }],
      }
      await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
        const chunks = await drain(run(cfg, turn1Input, { adapters, memory, ...ctxOverrides }))
        expect(chunks.some((c) => c.type === 'finish')).toBe(true)
      })

      // Turn 2 on the same thread
      const turn2Input: RunInput = {
        threadId,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'thanks' }] }],
      }
      await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
        await drain(run(cfg, turn2Input, { adapters, memory, ...ctxOverrides }))
      })

      // Both turns persisted: at least user1, asst1, user2, asst2.
      const rows = await testSql()<Array<{ role: string }>>`
        SELECT role FROM agent_memory.messages
        WHERE thread_id = ${threadId} AND tenant_id = ${TENANT}
        ORDER BY created_at, id
      `
      expect(rows.length).toBeGreaterThanOrEqual(4)
      const roles = rows.map((r) => r.role)
      expect(roles.filter((r) => r === 'user').length).toBeGreaterThanOrEqual(2)
      expect(roles.filter((r) => r === 'assistant').length).toBeGreaterThanOrEqual(2)
    },
  )
})
