import { SetMetadata } from '@nestjs/common'

export const TOOL_PERMISSION_KEY = 'tool_permission'

export interface ToolPermissionScopeMeta {
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
}

export function ToolPermission(
  permission: string,
  scope?: ToolPermissionScopeMeta,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(TOOL_PERMISSION_KEY, permission)(target, propertyKey!, descriptor)
    if (scope) {
      SetMetadata(`${TOOL_PERMISSION_KEY}_scope`, scope)(target, propertyKey!, descriptor)
    }
    return descriptor
  }
}
