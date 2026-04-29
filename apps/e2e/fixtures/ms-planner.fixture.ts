import { test as base } from '@playwright/test'

export interface MsPlannerFixture {
  msPlanner: {
    listTasks: (msPlanId: string) => Promise<Array<{ id: string; title: string }>>
    patchTask: (msTaskId: string, patch: { title?: string }) => Promise<void>
    createPlan: (groupId: string, title: string) => Promise<{ id: string }>
    deleteTask: (msTaskId: string) => Promise<void>
  }
}

export const test = base.extend<MsPlannerFixture>({
  msPlanner: async ({}, use) => {
    const tenantId = process.env['MS_E2E_TENANT_AD_ID'] ?? ''
    const clientId = process.env['MS_E2E_CLIENT_ID'] ?? ''
    const clientSecret = process.env['MS_E2E_CLIENT_SECRET'] ?? ''

    async function getToken(): Promise<string> {
      if (!tenantId || !clientId || !clientSecret) {
        throw new Error(
          'MS E2E credentials not set — set MS_E2E_TENANT_AD_ID, MS_E2E_CLIENT_ID, MS_E2E_CLIENT_SECRET',
        )
      }
      const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
        }).toString(),
      })
      const data = (await resp.json()) as { access_token: string }
      return data.access_token
    }

    async function graphGet<T>(path: string): Promise<T> {
      const token = await getToken()
      const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return resp.json() as T
    }

    async function graphPatch(path: string, body: unknown): Promise<void> {
      const token = await getToken()
      await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    }

    await use({
      listTasks: async (msPlanId: string) => {
        const result = await graphGet<{ value: Array<{ id: string; title: string }> }>(
          `/planner/plans/${msPlanId}/tasks`,
        )
        return result.value ?? []
      },

      patchTask: async (msTaskId: string, patch: { title?: string }) => {
        await graphPatch(`/planner/tasks/${msTaskId}`, patch)
      },

      createPlan: async (groupId: string, title: string) => {
        const token = await getToken()
        const resp = await fetch('https://graph.microsoft.com/v1.0/planner/plans', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ owner: groupId, title }),
        })
        return resp.json() as { id: string }
      },

      deleteTask: async (msTaskId: string) => {
        const token = await getToken()
        await fetch(`https://graph.microsoft.com/v1.0/planner/tasks/${msTaskId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      },
    })
  },
})

export { expect } from '@playwright/test'
