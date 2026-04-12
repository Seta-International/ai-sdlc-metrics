import { describe, expect, it } from 'vitest'
import { ToolPermission, TOOL_PERMISSION_KEY } from './tool-permission.decorator'
import { Reflector } from '@nestjs/core'

describe('ToolPermission decorator', () => {
  const reflector = new Reflector()

  it('should set permission metadata on the decorated method', () => {
    class TestTool {
      @ToolPermission('people:profile:read')
      async getProfile() {
        return {}
      }
    }
    const permission = reflector.get<string>(TOOL_PERMISSION_KEY, TestTool.prototype.getProfile)
    expect(permission).toBe('people:profile:read')
  })

  it('should set compound permission keys', () => {
    class TestTool {
      @ToolPermission('time:leave:self:submit')
      async submitLeave() {
        return {}
      }
    }
    const permission = reflector.get<string>(TOOL_PERMISSION_KEY, TestTool.prototype.submitLeave)
    expect(permission).toBe('time:leave:self:submit')
  })

  it('should support scope metadata alongside permission', () => {
    class TestTool {
      @ToolPermission('people:profile:read', { scopeType: 'department' })
      async getTeamProfiles() {
        return {}
      }
    }
    const permission = reflector.get<string>(
      TOOL_PERMISSION_KEY,
      TestTool.prototype.getTeamProfiles,
    )
    expect(permission).toBe('people:profile:read')
    const scopeMeta = reflector.get<{ scopeType?: string }>(
      `${TOOL_PERMISSION_KEY}_scope`,
      TestTool.prototype.getTeamProfiles,
    )
    expect(scopeMeta).toEqual({ scopeType: 'department' })
  })
})
