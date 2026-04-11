import { describe, expect, it } from 'vitest'
import type { Session } from './use-session'

// useSession is a React hook — full hook testing requires @testing-library/react
// Here we test that the Session interface has the required shape (compile-time check)

describe('useSession types', () => {
  it('Session interface has required fields', () => {
    const session: Session = {
      actorId: '01900000-0000-7000-8000-000000000001',
      tenantId: '01900000-0000-7000-8000-000000000002',
      roles: ['employee'],
      displayName: 'Alice',
      email: 'alice@seta.vn',
      provider: 'microsoft',
    }
    expect(session.actorId).toBeDefined()
    expect(session.tenantId).toBeDefined()
    expect(session.roles).toBeDefined()
    expect(session.displayName).toBeDefined()
    expect(session.email).toBeDefined()
    expect(session.provider).toBeDefined()
  })
})
