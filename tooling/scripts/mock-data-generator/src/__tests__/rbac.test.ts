import { describe, expect, it } from 'vitest'
import { NAMED_USERS } from '../cast.js'
import { ROLE_HEADCOUNT_TARGET, ROLES } from '../pools.js'
import { type RbacRole, roleToRbac } from '../rbac.js'

describe('roleToRbac', () => {
  it.each<[string, RbacRole]>([
    ['CEO', 'org.admin'],
    ['CTO', 'org.admin'],
    ['CDO', 'org.admin'],
    ['VP Engineering', 'org.admin'],
    ['Engineering Manager', 'planner.admin'],
    ['Tech Lead', 'planner.admin'],
    ['Software Architect', 'planner.admin'],
  ])('returns %s -> %s', (role, expected) => {
    expect(roleToRbac(role)).toBe(expected)
  })

  it('maps every developer flavor (Frontend/Backend/Fullstack/Mobile × Junior/Mid/Senior) to planner.contributor', () => {
    for (const stack of ['Frontend', 'Backend', 'Fullstack', 'Mobile']) {
      for (const sen of ['Junior', 'Mid', 'Senior']) {
        expect(roleToRbac(`${sen} ${stack} Developer`)).toBe('planner.contributor')
      }
    }
  })

  it('maps legacy IC labels (cast-only) to planner.contributor', () => {
    expect(roleToRbac('Backend Developer')).toBe('planner.contributor') // u004, u005
    expect(roleToRbac('IT Engineer')).toBe('planner.contributor') // u002, u003, u008, u010, u011
    expect(roleToRbac('PM')).toBe('planner.contributor') // u009
    expect(roleToRbac('Junior Developer')).toBe('planner.contributor') // u012
    expect(roleToRbac('Software Engineer')).toBe('planner.contributor') // u015
  })

  it('maps DevOps / SRE / Cloud / Data & AI / QA / Security / Project & product / Design to planner.contributor', () => {
    const contributors = [
      'DevOps Engineer',
      'Senior DevOps Engineer',
      'Site Reliability Engineer',
      'Cloud Engineer',
      'Data Engineer',
      'Senior Data Engineer',
      'Data Scientist',
      'Senior Data Scientist',
      'ML Engineer',
      'MLOps Engineer',
      'AI Engineer',
      'Generative AI Engineer',
      'Junior QA Engineer',
      'QA Engineer',
      'Senior QA Engineer',
      'QA Automation Engineer',
      'QA Lead',
      'Security Engineer',
      'Senior Security Engineer',
      'Security Lead',
      'Project Manager',
      'Senior Project Manager',
      'Delivery Manager',
      'Scrum Master',
      'Product Owner',
      'Business Analyst',
      'UI/UX Designer',
      'Senior UI/UX Designer',
      'Design Lead',
    ]
    for (const role of contributors) {
      expect(roleToRbac(role)).toBe('planner.contributor')
    }
  })

  it('maps PMO / HR / Internal IT / Business ops / Internal comms to planner.viewer', () => {
    const viewers = [
      'PMO Lead',
      'PMO Analyst',
      'HR Manager',
      'HR Generalist',
      'HR Business Partner',
      'Talent Acquisition',
      'IT Support',
      'IT Administrator',
      'Account Manager',
      'Sales Manager',
      'Marketing Specialist',
      'Finance / Accountant',
      'Operations Manager',
      'Office Administrator',
      'IC Executive',
    ]
    for (const role of viewers) {
      expect(roleToRbac(role)).toBe('planner.viewer')
    }
  })

  it('defaults empty role to planner.viewer (u013)', () => {
    expect(roleToRbac('')).toBe('planner.viewer')
  })

  it('covers every role in ROLES from pools.ts (no orphan mapping)', () => {
    for (const role of ROLES) {
      expect(() => roleToRbac(role)).not.toThrow()
      expect(['org.admin', 'planner.admin', 'planner.contributor', 'planner.viewer']).toContain(
        roleToRbac(role),
      )
    }
  })

  it('throws on an unrecognized non-empty role (defensive)', () => {
    expect(() => roleToRbac('Chief Vibe Officer')).toThrow()
  })

  it('catalog rbac totals match the spec rollup (4 / 19 / 248 / 29)', () => {
    const counts = {
      'org.admin': 0,
      'planner.admin': 0,
      'planner.contributor': 0,
      'planner.viewer': 0,
    }
    let total = 0
    for (const [role, n] of Object.entries(ROLE_HEADCOUNT_TARGET)) {
      counts[roleToRbac(role)] += n
      total += n
    }
    // u013 has role='' and is the 300th row; it maps to planner.viewer.
    counts['planner.viewer'] += 1
    total += 1
    expect(total).toBe(300)
    expect(counts).toEqual({
      'org.admin': 4,
      'planner.admin': 19,
      'planner.contributor': 248,
      'planner.viewer': 29,
    })
  })
})

describe('NAMED_USERS consistency', () => {
  it('every cast row rbac_role equals roleToRbac(role)', () => {
    for (const u of NAMED_USERS) {
      expect(u.rbac_role).toBe(roleToRbac(u.role))
    }
  })
})
