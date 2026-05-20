import { NAMED_USERS } from './cast.js'
import {
  ALIAS_SKILLS,
  FAMILY_NAMES,
  GIVEN_NAMES,
  MIDDLE_NAMES,
  PROJECTS,
  ROLE_SKILL_PROFILE,
  ROLES,
  SKILL_CATALOG,
} from './pools.js'
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

function makeSkillsForRole(rng: Rng, role: string): string {
  const baseProfile = ROLE_SKILL_PROFILE[role] ?? []
  const baseSize = Math.min(baseProfile.length, rng.intRange(2, 4))
  const base = rng.sample(baseProfile, baseSize)
  const extraCount = rng.intRange(0, 3)
  const extras = rng.sample(SKILL_CATALOG, extraCount)
  const combined = [...new Set([...base, ...extras])]
  if (rng.chance(0.1)) {
    const alias = rng.pick(ALIAS_SKILLS)
    const target = CANONICAL_OF_ALIAS[alias]
    const idx = target ? combined.indexOf(target) : -1
    if (idx >= 0) combined[idx] = alias
    else combined.push(alias)
  }
  return combined.join(',')
}

export function generateUsers(rng: Rng, total: number): User[] {
  const users: User[] = [...NAMED_USERS]
  let nextNum = HIGHEST_NAMED_NUM + 1
  while (users.length < total) {
    const id = makeId(nextNum++)
    if (NAMED_IDS.has(id)) continue
    const role = rng.pick(ROLES)
    const name = makeName(rng)
    const project = rng.chance(0.1) ? '' : rng.pick(PROJECTS)
    const roleField = rng.chance(0.05) ? '' : role
    const skills = rng.chance(0.05) ? '' : makeSkillsForRole(rng, role)
    users.push({ user_id: id, name, project, role: roleField, skills })
  }
  return users
}
