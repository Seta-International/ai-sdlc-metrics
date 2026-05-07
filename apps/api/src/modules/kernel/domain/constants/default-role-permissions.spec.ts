import { describe, it, expect } from 'vitest'
import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions'
import { PERMISSIONS } from '../../../../common/auth/permissions'

const AGENT_PERMISSION_KEYS = [
  PERMISSIONS.PLANNER_AGENT_LIST_MY_TASKS,
  PERMISSIONS.PLANNER_AGENT_LIST_MY_PLANS,
  PERMISSIONS.PLANNER_AGENT_LIST_EVIDENCE,
  PERMISSIONS.AGENT_KB_RETRIEVE,
] as const

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  describe('employee', () => {
    const employeeEntries = DEFAULT_ROLE_PERMISSIONS.employee

    for (const key of AGENT_PERMISSION_KEYS) {
      it(`includes ${key}`, () => {
        expect(employeeEntries.map((e) => e.permissionKey)).toContain(key)
      })

      it(`grants ${key} with isLocked: false`, () => {
        const entry = employeeEntries.find((e) => e.permissionKey === key)
        expect(entry?.isLocked).toBe(false)
      })
    }
  })

  describe('line_manager', () => {
    const lineManagerEntries = DEFAULT_ROLE_PERMISSIONS.line_manager

    for (const key of AGENT_PERMISSION_KEYS) {
      it(`includes ${key}`, () => {
        expect(lineManagerEntries.map((e) => e.permissionKey)).toContain(key)
      })

      it(`grants ${key} with isLocked: false`, () => {
        const entry = lineManagerEntries.find((e) => e.permissionKey === key)
        expect(entry?.isLocked).toBe(false)
      })
    }
  })
})
