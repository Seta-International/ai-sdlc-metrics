import { NAMED_USERS } from './cast.js'
import { assignEmails } from './email.js'
import {
  ALIAS_SKILLS,
  FAMILY_NAMES,
  GIVEN_NAMES,
  MIDDLE_NAMES,
  PROJECTS,
  ROLE_HEADCOUNT_TARGET,
  ROLE_SKILL_PROFILE,
  type Seniority,
  SKILL_CATALOG,
  seniorityOf,
} from './pools.js'
import { roleToRbac } from './rbac.js'
import type { Rng } from './rng.js'
import type { User } from './types.js'

const NAMED_IDS = new Set(NAMED_USERS.map((u) => u.user_id))
const HIGHEST_NAMED_NUM = Math.max(
  ...NAMED_USERS.map((u) => Number.parseInt(u.user_id.slice(1), 10)),
)

const CANONICAL_OF_ALIAS: Record<string, string> = {
  k8s: 'Kubernetes',
  ts: 'TypeScript',
  postgres: 'PostgreSQL',
  pg: 'PostgreSQL',
  js: 'JavaScript',
  node: 'Node.js',
}

function makeId(num: number): string {
  return `u${String(num).padStart(3, '0')}`
}

function makeName(rng: Rng): string {
  return `${rng.pick(FAMILY_NAMES)} ${rng.pick(MIDDLE_NAMES)} ${rng.pick(GIVEN_NAMES)}`
}

function skillCountForSeniority(rng: Rng, sen: Seniority): number {
  if (sen === 'junior') return rng.intRange(2, 3)
  if (sen === 'senior') return rng.intRange(5, 7)
  return rng.intRange(4, 5)
}

function makeSkillsForRole(rng: Rng, role: string): string {
  const baseProfile = ROLE_SKILL_PROFILE[role] ?? []
  const sen = seniorityOf(role)
  const wantTotal = skillCountForSeniority(rng, sen)

  const profileTake = Math.min(baseProfile.length, wantTotal)
  const base = rng.sample(baseProfile, profileTake)

  let skills: string[] = [...base]
  if (sen !== 'junior' && skills.length < wantTotal) {
    const need = wantTotal - skills.length
    const pool = SKILL_CATALOG.filter((s) => !skills.includes(s))
    if (need > 0 && pool.length > 0) {
      const extras = rng.sample(pool, Math.min(need, pool.length))
      skills = [...skills, ...extras]
    }
  }

  skills = skills.slice(0, wantTotal)

  if (rng.chance(0.15)) {
    const candidates = (ALIAS_SKILLS as readonly string[]).filter((a) => {
      const canonical = CANONICAL_OF_ALIAS[a]
      return canonical !== undefined && skills.includes(canonical)
    })
    if (candidates.length > 0) {
      const alias = rng.pick(candidates)
      const canonical = CANONICAL_OF_ALIAS[alias]
      if (canonical !== undefined) {
        const idx = skills.indexOf(canonical)
        if (idx >= 0) skills[idx] = alias
      }
    }
  }

  return [...new Set(skills)].join(',')
}

function buildVolumeFillRoleQueue(): string[] {
  const castCountByRole = new Map<string, number>()
  for (const u of NAMED_USERS) {
    if (u.role === '') continue
    castCountByRole.set(u.role, (castCountByRole.get(u.role) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [role, target] of Object.entries(ROLE_HEADCOUNT_TARGET)) {
    const reserved = castCountByRole.get(role) ?? 0
    const fill = target - reserved
    if (fill < 0) {
      throw new Error(
        `cast has ${reserved} '${role}' rows but ROLE_HEADCOUNT_TARGET allocates only ${target}`,
      )
    }
    for (let i = 0; i < fill; i++) queue.push(role)
  }
  return queue
}

export function generateUsers(rng: Rng, total: number): User[] {
  const volumeFillCount = total - NAMED_USERS.length
  const queue = buildVolumeFillRoleQueue()

  if (queue.length !== volumeFillCount) {
    throw new Error(
      `volume-fill mismatch: queue=${queue.length} required=${volumeFillCount} (total=${total}, cast=${NAMED_USERS.length})`,
    )
  }

  type FillDraft = Omit<User, 'email'>
  const fillDrafts: FillDraft[] = []
  let nextNum = HIGHEST_NAMED_NUM + 1
  for (const role of queue) {
    let id = makeId(nextNum++)
    while (NAMED_IDS.has(id)) id = makeId(nextNum++)
    const name = makeName(rng)
    const project = rng.chance(0.13) ? '' : rng.pick(PROJECTS)
    const skills = rng.chance(0.05) ? '' : makeSkillsForRole(rng, role)
    fillDrafts.push({
      user_id: id,
      name,
      project,
      role,
      rbac_role: roleToRbac(role),
      skills,
    })
  }

  const reservedEmails = new Set(NAMED_USERS.map((u) => u.email))
  const fillEmails = assignEmails(
    fillDrafts.map((d) => d.name),
    reservedEmails,
  )

  return [...NAMED_USERS, ...fillDrafts.map((d, i) => ({ ...d, email: fillEmails[i] as string }))]
}
