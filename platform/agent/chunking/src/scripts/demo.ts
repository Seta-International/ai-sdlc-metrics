#!/usr/bin/env tsx
// Run: pnpm tsx platform/agent/chunking/src/scripts/demo.ts
import { chunkText } from '../index'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'

const SAMPLES = [
  {
    label: 'English — short (fits in 1 chunk)',
    input: 'Hello, world!',
    opts: { maxTokens: 10, overlapTokens: 2, model: 'text-embedding-3-small' } as const,
  },
  {
    label: 'English — long prose with overlap',
    input:
      'The Seta Agent helps teams manage tasks directly from Microsoft Teams. ' +
      'Users can create, update, and track work items from any conversation. ' +
      'The agent syncs automatically with MS Planner and notifies the channel when something changes. ' +
      'To get started, type "create task" or "list tasks" in any channel.',
    opts: { maxTokens: 20, overlapTokens: 4, model: 'text-embedding-3-small' } as const,
  },
  {
    label: 'Vietnamese — long prose with overlap',
    input:
      'Hệ thống Seta Agent hỗ trợ quản lý công việc qua Microsoft Teams. ' +
      'Người dùng có thể tạo, cập nhật và theo dõi task trực tiếp từ hội thoại. ' +
      'Agent sẽ tự động đồng bộ với MS Planner và gửi thông báo khi có thay đổi. ' +
      'Để bắt đầu, hãy nhắn tin "tạo task" hoặc "danh sách task" vào kênh bất kỳ.',
    opts: { maxTokens: 20, overlapTokens: 4, model: 'text-embedding-3-small' } as const,
  },
  {
    label: 'CJK + emoji mix — no overlap',
    input: '今天天气真好 🌍 我们去公园散步吧。Hello world こんにちは 안녕하세요',
    opts: { maxTokens: 8, overlapTokens: 0, model: 'gpt-5' } as const,
  },
]

for (const { label, input, opts } of SAMPLES) {
  const chunks = chunkText(input, opts)

  console.log()
  console.log(`${BOLD}━━━ ${label} ${'━'.repeat(Math.max(0, 60 - label.length))}${RESET}`)
  console.log(
    `${DIM}opts: maxTokens=${opts.maxTokens} overlapTokens=${opts.overlapTokens} model=${opts.model}${RESET}`,
  )
  console.log(`${DIM}input (${input.length} chars): ${input}${RESET}`)
  console.log()

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!
    const roundtrip = c.content === input.slice(c.startChar, c.endChar)
    const icon = roundtrip ? `${GREEN}✓${RESET}` : `${YELLOW}✗${RESET}`
    console.log(
      `  ${icon} ${CYAN}chunk ${String(i).padStart(2)}${RESET}` +
        `  ${MAGENTA}[${c.startChar}–${c.endChar}]${RESET}` +
        `  ${c.tokenCount} tok` +
        `  "${c.content}"`,
    )
  }

  const allMatch = chunks.every((c) => c.content === input.slice(c.startChar, c.endChar))
  console.log()
  console.log(
    `  ${allMatch ? `${GREEN}All offsets round-trip ✓${RESET}` : `${YELLOW}Offset mismatch detected ✗${RESET}`}` +
      `  ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}`,
  )
}

console.log()
