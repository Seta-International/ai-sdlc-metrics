import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateBuckets } from './gen-buckets.js'
import { generatePlanMembers } from './gen-plan-members.js'
import { generatePlans } from './gen-plans.js'
import { generateTasks } from './gen-tasks.js'
import { generateTimesheet } from './gen-timesheet.js'
import { generateUsers } from './gen-users.js'
import { createRng } from './rng.js'
import { writeCsv } from './write-csv.js'

function parseArgs(argv: readonly string[]): { seed: number; out: string } {
  let seed = 20260520
  let out = 'mock'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--seed') seed = Number(argv[++i])
    else if (arg === '--out') out = String(argv[++i])
  }
  return { seed, out }
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

function main(): void {
  const { seed, out } = parseArgs(process.argv.slice(2))
  const dir = isAbsolute(out) ? out : resolve(REPO_ROOT, out)
  mkdirSync(dir, { recursive: true })

  const rng = createRng(seed)
  const users = generateUsers(rng, 300)
  const plans = generatePlans(
    rng,
    50,
    users.map((u) => u.user_id),
  )
  const plan_members = generatePlanMembers(
    rng,
    plans.map((p) => p.plan_id),
    users.map((u) => u.user_id),
  )
  const buckets = generateBuckets(
    rng,
    plans.map((p) => p.plan_id),
  )
  const tasks = generateTasks(
    rng,
    600,
    plans.map((p) => p.plan_id),
    buckets,
    plan_members,
  )
  const timesheet = generateTimesheet(
    rng,
    400,
    users.map((u) => u.user_id),
  )

  writeCsv(
    `${dir}/users.csv`,
    ['user_id', 'name', 'email', 'project', 'role', 'rbac_role', 'skills'],
    users,
  )
  writeCsv(`${dir}/plans.csv`, ['plan_id', 'title', 'description', 'tags', 'owner'], plans)
  writeCsv(`${dir}/plan_members.csv`, ['plan_id', 'member_id'], plan_members)
  writeCsv(`${dir}/buckets.csv`, ['bucket_id', 'plan_id', 'name'], buckets)
  writeCsv(
    `${dir}/tasks.csv`,
    [
      'task_id',
      'plan_id',
      'bucket_id',
      'assignee_ids',
      'title',
      'description',
      'status',
      'priority',
      'due_date',
      'tags',
      'checklist',
      'comments',
      'attachments',
    ],
    tasks,
  )
  writeCsv(
    `${dir}/timesheet.csv`,
    ['leave_id', 'employee_id', 'start_date', 'end_date', 'type', 'status'],
    timesheet,
  )

  process.stdout.write(`Wrote 6 files to ${dir}:\n`)
  process.stdout.write(
    `  users=${users.length}  plans=${plans.length}  plan_members=${plan_members.length}  buckets=${buckets.length}  tasks=${tasks.length}  timesheet=${timesheet.length}\n`,
  )
}

main()
