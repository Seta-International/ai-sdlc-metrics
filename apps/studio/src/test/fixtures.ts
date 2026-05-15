import type { Me } from '@seta/agent-sdk'

export const meFixture: Me = {
  user: {
    id: 'user_01',
    email: 'sam@acme.test',
    name: 'Sam Example',
    pictureUrl: null,
  },
  tenants: [
    { id: 'tnt_01', name: 'Acme Inc', role: 'admin' },
    { id: 'tnt_02', name: 'Beta Co', role: 'member' },
  ],
  csrfToken: 'csrf-test',
}
