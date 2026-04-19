import { describe, expect, it } from 'vitest'
import { TaskAttachment } from './task-attachment.entity'
import { AttachmentKindViolationException } from '../exceptions/attachment-kind-violation.exception'

const TASK_ID = 'task-id-1'
const TENANT_ID = 'tenant-id-1'
const CREATED_BY = 'user-id-1'

describe('TaskAttachment entity', () => {
  describe('createFile()', () => {
    it('creates a file attachment with all required fields', () => {
      const attachment = TaskAttachment.createFile({
        id: 'attach-1',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        storageKey: 'uploads/file.pdf',
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 12345,
      })

      expect(attachment.id).toBe('attach-1')
      expect(attachment.taskId).toBe(TASK_ID)
      expect(attachment.tenantId).toBe(TENANT_ID)
      expect(attachment.createdBy).toBe(CREATED_BY)
      expect(attachment.kind).toBe('file')
      expect(attachment.storageKey).toBe('uploads/file.pdf')
      expect(attachment.filename).toBe('file.pdf')
      expect(attachment.contentType).toBe('application/pdf')
      expect(attachment.sizeBytes).toBe(12345)
      expect(attachment.url).toBeUndefined()
    })

    it('throws AttachmentKindViolationException when storageKey is missing', () => {
      expect(() =>
        TaskAttachment.createFile({
          id: 'attach-1',
          taskId: TASK_ID,
          tenantId: TENANT_ID,
          createdBy: CREATED_BY,
          storageKey: '',
          filename: 'file.pdf',
          contentType: 'application/pdf',
          sizeBytes: 12345,
        }),
      ).toThrow(AttachmentKindViolationException)
    })

    it('throws AttachmentKindViolationException when filename is missing', () => {
      expect(() =>
        TaskAttachment.createFile({
          id: 'attach-1',
          taskId: TASK_ID,
          tenantId: TENANT_ID,
          createdBy: CREATED_BY,
          storageKey: 'uploads/file.pdf',
          filename: '',
          contentType: 'application/pdf',
          sizeBytes: 12345,
        }),
      ).toThrow(AttachmentKindViolationException)
    })

    it('throws AttachmentKindViolationException when contentType is missing', () => {
      expect(() =>
        TaskAttachment.createFile({
          id: 'attach-1',
          taskId: TASK_ID,
          tenantId: TENANT_ID,
          createdBy: CREATED_BY,
          storageKey: 'uploads/file.pdf',
          filename: 'file.pdf',
          contentType: '',
          sizeBytes: 12345,
        }),
      ).toThrow(AttachmentKindViolationException)
    })

    it('throws AttachmentKindViolationException when sizeBytes is not positive', () => {
      expect(() =>
        TaskAttachment.createFile({
          id: 'attach-1',
          taskId: TASK_ID,
          tenantId: TENANT_ID,
          createdBy: CREATED_BY,
          storageKey: 'uploads/file.pdf',
          filename: 'file.pdf',
          contentType: 'application/pdf',
          sizeBytes: 0,
        }),
      ).toThrow(AttachmentKindViolationException)
    })
  })

  describe('createLink()', () => {
    it('creates a link attachment with required fields', () => {
      const attachment = TaskAttachment.createLink({
        id: 'attach-2',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        url: 'https://example.com',
        linkTitle: 'Example',
      })

      expect(attachment.id).toBe('attach-2')
      expect(attachment.kind).toBe('link')
      expect(attachment.url).toBe('https://example.com')
      expect(attachment.linkTitle).toBe('Example')
      expect(attachment.storageKey).toBeUndefined()
      expect(attachment.filename).toBeUndefined()
      expect(attachment.contentType).toBeUndefined()
      expect(attachment.sizeBytes).toBeUndefined()
    })

    it('creates a link attachment without optional linkTitle', () => {
      const attachment = TaskAttachment.createLink({
        id: 'attach-3',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        url: 'https://example.com',
      })
      expect(attachment.linkTitle).toBeUndefined()
    })

    it('throws AttachmentKindViolationException when url is missing', () => {
      expect(() =>
        TaskAttachment.createLink({
          id: 'attach-2',
          taskId: TASK_ID,
          tenantId: TENANT_ID,
          createdBy: CREATED_BY,
          url: '',
        }),
      ).toThrow(AttachmentKindViolationException)
    })
  })

  describe('reconstitute()', () => {
    it('reconstitutes a file attachment without validation', () => {
      const createdAt = new Date('2024-01-01')
      const attachment = TaskAttachment.reconstitute({
        id: 'attach-1',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        kind: 'file',
        storageKey: 'uploads/file.pdf',
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 12345,
        url: undefined,
        linkTitle: undefined,
        previewType: undefined,
        createdAt,
      })

      expect(attachment.kind).toBe('file')
      expect(attachment.storageKey).toBe('uploads/file.pdf')
      expect(attachment.createdAt).toBe(createdAt)
    })

    it('reconstitutes a link attachment without validation', () => {
      const createdAt = new Date('2024-01-01')
      const attachment = TaskAttachment.reconstitute({
        id: 'attach-2',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        kind: 'link',
        url: 'https://example.com',
        linkTitle: 'Example',
        storageKey: undefined,
        filename: undefined,
        contentType: undefined,
        sizeBytes: undefined,
        previewType: undefined,
        createdAt,
      })

      expect(attachment.kind).toBe('link')
      expect(attachment.url).toBe('https://example.com')
    })
  })

  describe('immutability', () => {
    it('properties are frozen (Object.freeze)', () => {
      const attachment = TaskAttachment.createFile({
        id: 'attach-1',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        storageKey: 'uploads/file.pdf',
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 12345,
      })

      expect(() => {
        ;(attachment as Record<string, unknown>)['id'] = 'hacked'
      }).toThrow()
    })
  })

  describe('XOR invariant enforcement', () => {
    it('file attachment has no url field (undefined)', () => {
      const attachment = TaskAttachment.createFile({
        id: 'attach-1',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        storageKey: 'uploads/file.pdf',
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 100,
      })
      expect(attachment.url).toBeUndefined()
    })

    it('link attachment has no storageKey, filename, contentType, sizeBytes (all undefined)', () => {
      const attachment = TaskAttachment.createLink({
        id: 'attach-2',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        createdBy: CREATED_BY,
        url: 'https://example.com',
      })
      expect(attachment.storageKey).toBeUndefined()
      expect(attachment.filename).toBeUndefined()
      expect(attachment.contentType).toBeUndefined()
      expect(attachment.sizeBytes).toBeUndefined()
    })
  })
})
