/**
 * Segment-boundary permission prefix match.
 *
 * Extracted from ToolRegistry so the pipeline layer can reuse the same logic
 * without importing from an unrelated class.
 *
 * `permissionMatchesAnyPrefix('planner:task:read', ['planner:task'])` → true
 * `permissionMatchesAnyPrefix('planner:tasks:read', ['planner:task'])` → false  (different segment)
 *
 * Splits both sides on ':' and checks that every segment of each prefix matches
 * the corresponding segment of the permission exactly.
 */
export function permissionMatchesAnyPrefix(
  permission: string,
  prefixes: ReadonlyArray<string>,
): boolean {
  return prefixes.some((prefix) => isPermissionInScope(permission, prefix))
}

/**
 * Returns true when `prefix` is a proper segment-boundary prefix of `permission`.
 *
 * Examples:
 *   isPermissionInScope('planner:task:read', 'planner:task')  → true
 *   isPermissionInScope('planner:tasks:read', 'planner:task') → false  (segment 'tasks' ≠ 'task')
 *   isPermissionInScope('people:profile', 'people:profile:read') → false  (prefix longer than perm)
 */
function isPermissionInScope(permission: string, prefix: string): boolean {
  const permSegs = permission.split(':')
  const prefixSegs = prefix.split(':')

  if (prefixSegs.length > permSegs.length) {
    return false
  }

  return prefixSegs.every((seg, i) => seg === permSegs[i])
}
