import { NAMED_LEAVES } from './cast.js'
import type { Rng } from './rng.js'
import type { LeaveEntry } from './types.js'

const NAMED_IDS = new Set(NAMED_LEAVES.map((l) => l.leave_id))
const HIGHEST_NAMED_NUM = Math.max(
  ...NAMED_LEAVES.map((l) => Number.parseInt(l.leave_id.slice(2), 10)),
)
const TYPES: readonly LeaveEntry['type'][] = ['annual', 'sick', 'personal', 'unpaid']

function makeId(num: number): string {
  return `lv${String(num).padStart(3, '0')}`
}

function pickStatus(rng: Rng): LeaveEntry['status'] {
  const roll = rng.next()
  if (roll < 0.7) return 'approved'
  if (roll < 0.95) return 'pending'
  return 'rejected'
}

function makeWindow(rng: Rng): { start_date: string; end_date: string } {
  const anchor = new Date('2026-05-20T00:00:00Z')
  const offset = rng.intRange(-180, 180)
  const start = new Date(anchor.getTime() + offset * 86_400_000)
  const length = rng.intRange(0, 10)
  const end = new Date(start.getTime() + length * 86_400_000)
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  }
}

export function generateTimesheet(
  rng: Rng,
  total: number,
  userIds: readonly string[],
): LeaveEntry[] {
  const leaves: LeaveEntry[] = [...NAMED_LEAVES]
  let nextNum = HIGHEST_NAMED_NUM + 1

  while (leaves.length < total) {
    const id = makeId(nextNum++)
    if (NAMED_IDS.has(id)) continue
    const { start_date, end_date } = makeWindow(rng)
    leaves.push({
      leave_id: id,
      employee_id: rng.pick(userIds),
      start_date,
      end_date,
      type: rng.pick(TYPES),
      status: pickStatus(rng),
    })
  }

  return leaves
}
