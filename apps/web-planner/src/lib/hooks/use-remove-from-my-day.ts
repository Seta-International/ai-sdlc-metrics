'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import type { UseMutationResult } from '@tanstack/react-query'
import type { MyDayTask } from '@future/api-client/planner'
import { trpc } from '../trpc'
import { myDayQueryKey } from './use-my-day'

export interface RemoveVariables {
  taskId: string
}

export function useRemoveFromMyDay(date: string): UseMutationResult<void, Error, RemoveVariables> {
  const queryClient = useQueryClient()
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  return useMutation<void, Error, RemoveVariables>({
    mutationFn: ({ taskId }) =>
      trpc.planner.personal.myDay.remove.mutate({
        actorId,
        tenantId,
        taskId,
        date,
      }) as Promise<void>,

    onMutate: async ({ taskId }) => {
      const qk = myDayQueryKey(actorId, tenantId, date)
      await queryClient.cancelQueries({ queryKey: qk })

      const previous = queryClient.getQueryData<MyDayTask[]>(qk)

      queryClient.setQueryData<MyDayTask[]>(qk, (old) => (old ?? []).filter((r) => r.id !== taskId))

      return { previous }
    },

    onError: (_e, _v, ctx) => {
      const context = ctx as { previous: MyDayTask[] | undefined } | undefined
      if (context?.previous !== undefined) {
        const qk = myDayQueryKey(actorId, tenantId, date)
        queryClient.setQueryData<MyDayTask[]>(qk, context.previous)
      }
    },

    onSettled: () => {
      const qk = myDayQueryKey(actorId, tenantId, date)
      queryClient.invalidateQueries({ queryKey: qk })
    },
  })
}
