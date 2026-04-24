import { createStore } from 'zustand/vanilla'
import type { SseEvent, DraftPayload, TurnEndReason, RefusalReason } from './sse-event-schema'

export interface AgentTurnState {
  traceId: string | null
  topology: 'bounded' | 'iterative' | null
  phase: 1 | 2 | null
  activeSubAgents: string[]
  shape: string | null
  drafts: DraftPayload[]
  isRefused: boolean
  refusalReason: RefusalReason | null
  isEnded: boolean
  endReason: TurnEndReason | null
  dispatch: (event: SseEvent) => void
  reset: () => void
}

const initialState = {
  traceId: null as string | null,
  topology: null as 'bounded' | 'iterative' | null,
  phase: null as 1 | 2 | null,
  activeSubAgents: [] as string[],
  shape: null as string | null,
  drafts: [] as DraftPayload[],
  isRefused: false,
  refusalReason: null as RefusalReason | null,
  isEnded: false,
  endReason: null as TurnEndReason | null,
}

export function createAgentTurnStore() {
  return createStore<AgentTurnState>((set) => ({
    ...initialState,
    dispatch(event: SseEvent) {
      switch (event.type) {
        case 'turn.started':
          set({ traceId: event.payload.trace_id, topology: event.payload.topology })
          break
        case 'phase.started':
          set({
            phase: event.payload.phase,
            activeSubAgents: event.payload.sub_agents.map((a) => a.domain),
          })
          break
        case 'answer.shape_declared':
          set({ shape: event.payload.shape })
          break
        case 'draft.proposed':
          set((s) => ({
            drafts: [
              ...s.drafts,
              {
                action_id: event.payload.action_id,
                summary: event.payload.summary,
                tier: event.payload.tier,
                requires_approval: event.payload.requires_approval,
                provenance: event.payload.provenance,
              },
            ],
          }))
          break
        case 'refusal.started':
          set({ isRefused: true, refusalReason: event.payload.reason })
          break
        case 'turn.ended':
          set({ isEnded: true, endReason: event.payload.reason })
          break
        // iteration.*, progress, answer.token, answer.complete are
        // handled downstream (adapter/consumer) — no store mutation needed
      }
    },
    reset() {
      set({ ...initialState })
    },
  }))
}

export type AgentTurnStore = ReturnType<typeof createAgentTurnStore>
