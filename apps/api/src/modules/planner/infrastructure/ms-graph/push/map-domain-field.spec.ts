import { describe, expect, it } from 'vitest'
import { mapDomainFieldToMsField } from './map-domain-field'

describe('mapDomainFieldToMsField', () => {
  it.each([
    ['startDate', 'startDateTime'],
    ['dueDate', 'dueDateTime'],
    ['completedDate', 'completedDateTime'],
    ['assignees', 'assignments'],
  ])('%s → %s (renamed)', (domain, ms) => {
    expect(mapDomainFieldToMsField(domain as any)).toBe(ms)
  })

  it.each([
    'title',
    'percentComplete',
    'priority',
    'bucketId',
    'orderHint',
    'assigneePriority',
    'appliedCategories',
    'description',
    'checklist',
    'references',
    'previewType',
  ])('%s → %s (passthrough)', (field) => {
    expect(mapDomainFieldToMsField(field as any)).toBe(field)
  })
})
