import { describe, expect, it } from 'vitest'
import { TaskEvidence } from './task-evidence.entity'
import { CaptionRequiredException } from '../exceptions/caption-required.exception'
import { CaptionTooLongException } from '../exceptions/caption-too-long.exception'
import { EvidenceBodyRequiredException } from '../exceptions/evidence-body-required.exception'
import { EvidenceBodyTooLongException } from '../exceptions/evidence-body-too-long.exception'

const BASE = {
  id: 'evidence-1',
  taskId: 'task-1',
  tenantId: 'tenant-1',
  submittedBy: 'actor-1',
}

describe('TaskEvidence.createFile', () => {
  it('creates a file evidence with valid inputs', () => {
    const ev = TaskEvidence.createFile({
      ...BASE,
      caption: 'My file evidence',
      storageKey: 'tenant-1/documents/planner-evidence/task-1/uuid.pdf',
      filename: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
    })
    expect(ev.kind).toBe('file')
    expect(ev.caption).toBe('My file evidence')
    expect(ev.storageKey).toBeDefined()
    expect(ev.url).toBeUndefined()
    expect(ev.body).toBeUndefined()
    expect(ev.verifiedBy).toBeNull()
  })

  it('throws CaptionRequiredException when caption is empty', () => {
    expect(() =>
      TaskEvidence.createFile({
        ...BASE,
        caption: '',
        storageKey: 'key',
        filename: 'f.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
      }),
    ).toThrow(CaptionRequiredException)
  })

  it('throws CaptionRequiredException when caption is only whitespace', () => {
    expect(() =>
      TaskEvidence.createFile({
        ...BASE,
        caption: '   ',
        storageKey: 'key',
        filename: 'f.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
      }),
    ).toThrow(CaptionRequiredException)
  })

  it('throws CaptionTooLongException when caption exceeds 500 chars', () => {
    expect(() =>
      TaskEvidence.createFile({
        ...BASE,
        caption: 'x'.repeat(501),
        storageKey: 'key',
        filename: 'f.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
      }),
    ).toThrow(CaptionTooLongException)
  })
})

describe('TaskEvidence.createLink', () => {
  it('creates a link evidence with valid inputs', () => {
    const ev = TaskEvidence.createLink({
      ...BASE,
      caption: 'Reference link',
      url: 'https://example.com',
      linkTitle: 'Example',
    })
    expect(ev.kind).toBe('link')
    expect(ev.url).toBe('https://example.com')
    expect(ev.linkTitle).toBe('Example')
    expect(ev.storageKey).toBeUndefined()
    expect(ev.body).toBeUndefined()
  })

  it('creates a link evidence without optional linkTitle', () => {
    const ev = TaskEvidence.createLink({
      ...BASE,
      caption: 'Reference link',
      url: 'https://example.com',
    })
    expect(ev.linkTitle).toBeUndefined()
  })

  it('throws CaptionRequiredException when caption is empty', () => {
    expect(() =>
      TaskEvidence.createLink({ ...BASE, caption: '', url: 'https://example.com' }),
    ).toThrow(CaptionRequiredException)
  })

  it('throws CaptionTooLongException when caption is too long', () => {
    expect(() =>
      TaskEvidence.createLink({
        ...BASE,
        caption: 'x'.repeat(501),
        url: 'https://example.com',
      }),
    ).toThrow(CaptionTooLongException)
  })
})

describe('TaskEvidence.createNote', () => {
  it('creates a note evidence with valid inputs', () => {
    const ev = TaskEvidence.createNote({
      ...BASE,
      caption: 'My note',
      body: 'This is the note body',
    })
    expect(ev.kind).toBe('note')
    expect(ev.body).toBe('This is the note body')
    expect(ev.storageKey).toBeUndefined()
    expect(ev.url).toBeUndefined()
  })

  it('throws EvidenceBodyRequiredException when body is empty', () => {
    expect(() => TaskEvidence.createNote({ ...BASE, caption: 'My note', body: '' })).toThrow(
      EvidenceBodyRequiredException,
    )
  })

  it('throws EvidenceBodyRequiredException when body is whitespace only', () => {
    expect(() => TaskEvidence.createNote({ ...BASE, caption: 'My note', body: '   ' })).toThrow(
      EvidenceBodyRequiredException,
    )
  })

  it('throws EvidenceBodyTooLongException when body exceeds 4000 chars', () => {
    expect(() =>
      TaskEvidence.createNote({ ...BASE, caption: 'My note', body: 'x'.repeat(4001) }),
    ).toThrow(EvidenceBodyTooLongException)
  })

  it('throws CaptionRequiredException when caption is empty', () => {
    expect(() => TaskEvidence.createNote({ ...BASE, caption: '', body: 'Some body' })).toThrow(
      CaptionRequiredException,
    )
  })
})

describe('TaskEvidence.reconstitute', () => {
  it('reconstitutes a file evidence from DB row', () => {
    const ev = TaskEvidence.reconstitute({
      id: 'ev-1',
      taskId: 'task-1',
      tenantId: 'tenant-1',
      submittedBy: 'actor-1',
      submittedAt: new Date('2024-01-01'),
      kind: 'file',
      caption: 'Proof',
      storageKey: 'tenant-1/documents/planner-evidence/task-1/file.pdf',
      filename: 'file.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      url: null,
      linkTitle: null,
      body: null,
      verifiedBy: null,
      verifiedAt: null,
      verificationNote: null,
    })
    expect(ev.kind).toBe('file')
    expect(ev.caption).toBe('Proof')
    expect(ev.storageKey).toBe('tenant-1/documents/planner-evidence/task-1/file.pdf')
  })

  it('reconstitutes a link evidence from DB row', () => {
    const ev = TaskEvidence.reconstitute({
      id: 'ev-2',
      taskId: 'task-1',
      tenantId: 'tenant-1',
      submittedBy: 'actor-1',
      submittedAt: new Date('2024-01-01'),
      kind: 'link',
      caption: 'Reference',
      storageKey: null,
      filename: null,
      contentType: null,
      sizeBytes: null,
      url: 'https://example.com',
      linkTitle: 'Example',
      body: null,
      verifiedBy: null,
      verifiedAt: null,
      verificationNote: null,
    })
    expect(ev.kind).toBe('link')
    expect(ev.url).toBe('https://example.com')
  })

  it('reconstitutes a note evidence from DB row', () => {
    const ev = TaskEvidence.reconstitute({
      id: 'ev-3',
      taskId: 'task-1',
      tenantId: 'tenant-1',
      submittedBy: 'actor-1',
      submittedAt: new Date('2024-01-01'),
      kind: 'note',
      caption: 'Note caption',
      storageKey: null,
      filename: null,
      contentType: null,
      sizeBytes: null,
      url: null,
      linkTitle: null,
      body: 'Note body text',
      verifiedBy: null,
      verifiedAt: null,
      verificationNote: null,
    })
    expect(ev.kind).toBe('note')
    expect(ev.body).toBe('Note body text')
  })
})
