// @future/app-layout — shared app layout with RBAC-aware navigation
export type { NavigationConfig, NavItem, NavGroup, NavbarConfig } from './types'
export { PermissionProvider, PermissionContext } from './permission-provider'
export type { PermissionContextValue, PermissionProviderProps } from './permission-provider'
export { useCanAccess } from './use-can-access'
export { SidebarRenderer } from './sidebar/sidebar-renderer'
export type { SidebarRendererProps } from './sidebar/sidebar-renderer'
