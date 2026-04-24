export function getPermissionModule(permissionKey: string): string {
  return permissionKey.split(/[:.]/, 1)[0] ?? ''
}

export function getPermissionVerb(permissionKey: string): string {
  const segments = permissionKey.split(/[:.]/)
  const last = segments[segments.length - 1] ?? permissionKey
  return last.replace(/[-_]/g, ' ').toLowerCase()
}
