import type { AgentClient } from '@seta/agent-sdk'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SetaProvider } from './SetaProvider'
import { useAgentClient } from './useAgentClient'

const stubClient = {} as AgentClient

describe('SetaProvider', () => {
  it('exposes the injected AgentClient via useAgentClient', () => {
    const { result } = renderHook(() => useAgentClient(), {
      wrapper: ({ children }) => <SetaProvider client={stubClient}>{children}</SetaProvider>,
    })
    expect(result.current).toBe(stubClient)
  })

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useAgentClient()).result.current).toThrowError(/SetaProvider/)
  })
})
