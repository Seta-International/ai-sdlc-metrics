import type { Page } from '@playwright/test'

export async function seedTestTenant(_page: Page): Promise<{ tenantId: string }> {
  // TODO: call staging API to create a test tenant and return tenantId
  throw new Error('seedTestTenant: not yet implemented')
}

export async function teardownTestTenant(_tenantId: string): Promise<void> {
  // TODO: call staging API to delete the test tenant
  throw new Error('teardownTestTenant: not yet implemented')
}
