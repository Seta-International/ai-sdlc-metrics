import { createStore } from 'zustand/vanilla'
import type { SseEvent, DraftPayload, TurnEndReason } from './sse-event-schema'

export interface AgentTurnState {
  phase: 1 | 2 | null
  activeSubAgents: string[]
  shape: string | null
  drafts: DraftPayload[]
  isRefused: boolean
  refusalReason: string | null
  isEnded: boolean
  endReason: TurnEndReason | null
  dispatch: (event: SseEvent) => void
  reset: () => void
}

const initialState = {
  phase: null as 1 | 2 | null,
  activeSubAgents: [] as string[],
  shape: null as string | null,
  drafts: [] as DraftPayload[],
  isRefused: false,
  refusalReason: null as string | null,
  isEnded: false,
  endReason: null as TurnEndReason | null,
}

export function createAgentTurnStore() {
  return createStore<AgentTurnState>((set) => ({
    ...initialState,
    dispatch(event: SseEvent) {
      switch (event.type) {
        case 'phase.started':
          set({ phase: event.phase, activeSubAgents: event.subAgents })
          break
        case 'answer.shape_declared':
          set({ shape: event.shape })
          break
        case 'draft.proposed':
          set((s) => ({
            drafts: [
              ...s.drafts,
              { draftId: event.draftId, commandType: event.commandType, payload: event.payload },
            ],
          }))
          break
        case 'refusal':
          set({ isRefused: true, refusalReason: event.reason })
          break
        case 'turn.ended':
          set({ isEnded: true, endReason: event.reason })
          break
        // answer.delta and answer.complete are handled by the adapter's generator — no store mutation
      }
    },
    reset() {
      set({ ...initialState })
    },
  }))
}

export type AgentTurnStore = ReturnType<typeof createAgentTurnStore>
