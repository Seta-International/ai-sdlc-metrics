import { describe, expect, it } from 'vitest'
import { buildPreviewCard } from './_card'

describe('buildPreviewCard', () => {
  it('returns an AdaptiveCard v1.5 object', () => {
    const card = buildPreviewCard({
      title: 'Update Tasks',
      summary: 'Update 2 task(s)',
      facts: [
        { title: 'Task', value: 'Do laundry' },
        { title: 'Priority', value: '5' },
      ],
      verb: 'planner.update_tasks.commit',
      token: 'tok123',
      ttlMinutes: 15,
    })

    expect(card['type']).toBe('AdaptiveCard')
    expect(card['version']).toBe('1.5')
  })

  it('body contains title TextBlock, summary TextBlock, FactSet, expiry TextBlock', () => {
    const card = buildPreviewCard({
      title: 'Update Tasks',
      summary: 'Update 2 task(s)',
      facts: [{ title: 'Task', value: 'Fix bug' }],
      verb: 'planner.update_tasks.commit',
      token: 'abc',
      ttlMinutes: 10,
    })

    const body = card['body'] as unknown[]
    expect(body).toHaveLength(4)

    const titleBlock = body[0] as Record<string, unknown>
    expect(titleBlock['type']).toBe('TextBlock')
    expect(titleBlock['text']).toBe('Update Tasks')
    expect(titleBlock['size']).toBe('Large')
    expect(titleBlock['weight']).toBe('Bolder')

    const summaryBlock = body[1] as Record<string, unknown>
    expect(summaryBlock['type']).toBe('TextBlock')
    expect(summaryBlock['text']).toBe('Update 2 task(s)')
    expect(summaryBlock['wrap']).toBe(true)

    const factSet = body[2] as Record<string, unknown>
    expect(factSet['type']).toBe('FactSet')
    const facts = factSet['facts'] as Array<Record<string, unknown>>
    expect(facts).toHaveLength(1)
    expect(facts[0]?.['title']).toBe('Task')
    expect(facts[0]?.['value']).toBe('Fix bug')

    const expiryBlock = body[3] as Record<string, unknown>
    expect(expiryBlock['type']).toBe('TextBlock')
    expect(String(expiryBlock['text'])).toContain('10 minutes')
    expect(expiryBlock['size']).toBe('Small')
    expect(expiryBlock['isSubtle']).toBe(true)
  })

  it('actions contain Confirm and Cancel Action.Execute with correct verb and token', () => {
    const card = buildPreviewCard({
      title: 'T',
      summary: 'S',
      facts: [],
      verb: 'planner.update_tasks.commit',
      token: 'mytoken',
      ttlMinutes: 5,
    })

    const actions = card['actions'] as Array<Record<string, unknown>>
    expect(actions).toHaveLength(2)

    const confirm = actions[0] as Record<string, unknown>
    expect(confirm['type']).toBe('Action.Execute')
    expect(confirm['title']).toBe('Confirm')
    expect(confirm['style']).toBe('positive')
    expect(confirm['verb']).toBe('planner.update_tasks.commit')
    expect((confirm['data'] as Record<string, unknown>)['token']).toBe('mytoken')

    const cancel = actions[1] as Record<string, unknown>
    expect(cancel['type']).toBe('Action.Execute')
    expect(cancel['title']).toBe('Cancel')
    expect(cancel['verb']).toBe('planner.update_tasks.cancel')
    expect((cancel['data'] as Record<string, unknown>)['token']).toBe('mytoken')
  })

  it('cancel verb replaces .commit with .cancel', () => {
    const card = buildPreviewCard({
      title: 'T',
      summary: 'S',
      facts: [],
      verb: 'planner.delete_task.commit',
      token: 't',
      ttlMinutes: 1,
    })

    const actions = card['actions'] as Array<Record<string, unknown>>
    const cancel = actions[1] as Record<string, unknown>
    expect(cancel['verb']).toBe('planner.delete_task.cancel')
  })
})
