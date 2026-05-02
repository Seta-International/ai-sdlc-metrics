'use client'

import { useMutation, useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import type { UseMutationResult } from '@future/api-client'
import type { MyDayTask } from '@future/api-client/planner'
import { trpc } from '../trpc'
import { personalKeys } from '../query-keys'

export interface AddVariables {
  taskId: string
  /** Pre-fetched task shape to render optimistically. Supplied from the caller's task row. */
  taskStub: Omit<MyDayTask, 'myDay'>
}

export function useAddToMyDay(date: string): UseMutationResult<void, Error, AddVariables> {
  const queryClient = useQueryClient()
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  return useMutation<void, Error, AddVariables>({
    mutationFn: ({ taskId }) =>
      trpc.planner.personal.myDay.add.mutate({ actorId, tenantId, taskId, date }) as Promise<void>,

    onMutate: async ({ taskStub }) => {
      const qk = personalKeys.myDay(actorId, tenantId, date)
      await queryClient.cancelQueries({ queryKey: qk })

      const previous = queryClient.getQueryData<MyDayTask[]>(qk)

      const optimistic: MyDayTask = {
        ...taskStub,
        myDay: { addedAt: new Date().toISOString(), completedAt: null },
      }

      queryClient.setQueryData<MyDayTask[]>(qk, (old) => [optimistic, ...(old ?? [])])

      return { previous }
    },

    onError: (_e, _v, ctx) => {
      const context = ctx as { previous: MyDayTask[] | undefined } | undefined
      if (context?.previous !== undefined) {
        const qk = personalKeys.myDay(actorId, tenantId, date)
        queryClient.setQueryData<MyDayTask[]>(qk, context.previous)
      }
    },

    onSettled: () => {
      const qk = personalKeys.myDay(actorId, tenantId, date)
      queryClient.invalidateQueries({ queryKey: qk })
    },
  })
}
