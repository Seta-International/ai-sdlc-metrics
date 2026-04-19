import { describe, expect, it } from 'vitest'
import { TaskComment } from './task-comment.entity'
import { CommentBodyTooLongException } from '../exceptions/comment-body-too-long.exception'

const BASE_PROPS = {
  id: 'comment-1',
  taskId: 'task-1',
  tenantId: 'tenant-1',
  authorActorId: 'actor-1',
}

describe('TaskComment.create()', () => {
  it('creates a comment with valid body', () => {
    const comment = TaskComment.create({ ...BASE_PROPS, body: 'Hello world' })

    expect(comment.id).toBe('comment-1')
    expect(comment.taskId).toBe('task-1')
    expect(comment.tenantId).toBe('tenant-1')
    expect(comment.authorActorId).toBe('actor-1')
    expect(comment.body).toBe('Hello world')
    expect(comment.deletedAt).toBeNull()
    expect(comment.msThreadId).toBeNull()
    expect(comment.msPostId).toBeNull()
    expect(comment.msPostEtag).toBeNull()
    expect(comment.postedAt).toBeInstanceOf(Date)
  })

  it('allows body of exactly 4000 characters', () => {
    const body = 'x'.repeat(4000)
    expect(() => TaskComment.create({ ...BASE_PROPS, body })).not.toThrow()
  })

  it('throws CommentBodyTooLongException when body exceeds 4000 characters', () => {
    const body = 'x'.repeat(4001)
    expect(() => TaskComment.create({ ...BASE_PROPS, body })).toThrow(CommentBodyTooLongException)
  })

  it('allows empty body', () => {
    const comment = TaskComment.create({ ...BASE_PROPS, body: '' })
    expect(comment.body).toBe('')
  })

  it('is frozen (immutable)', () => {
    const comment = TaskComment.create({ ...BASE_PROPS, body: 'test' })
    expect(Object.isFrozen(comment)).toBe(true)
  })
})

describe('TaskComment.reconstitute()', () => {
  it('reconstitutes a comment with all fields', () => {
    const postedAt = new Date('2024-01-01T10:00:00Z')
    const deletedAt = new Date('2024-01-02T10:00:00Z')

    const comment = TaskComment.reconstitute({
      id: 'c1',
      taskId: 't1',
      tenantId: 'ten1',
      authorActorId: 'a1',
      body: 'Some text',
      postedAt,
      deletedAt,
      msThreadId: 'thread-x',
      msPostId: 'post-y',
      msPostEtag: 'etag-z',
    })

    expect(comment.id).toBe('c1')
    expect(comment.deletedAt).toBe(deletedAt)
    expect(comment.msThreadId).toBe('thread-x')
    expect(comment.msPostId).toBe('post-y')
    expect(comment.msPostEtag).toBe('etag-z')
    expect(comment.isDeleted).toBe(true)
  })

  it('reconstitutes a non-deleted comment', () => {
    const comment = TaskComment.reconstitute({
      id: 'c2',
      taskId: 't1',
      tenantId: 'ten1',
      authorActorId: 'a1',
      body: 'Active comment',
      postedAt: new Date(),
      deletedAt: null,
      msThreadId: null,
      msPostId: null,
      msPostEtag: null,
    })

    expect(comment.deletedAt).toBeNull()
    expect(comment.isDeleted).toBe(false)
  })
})

describe('TaskComment.isDeleted', () => {
  it('returns false when deletedAt is null', () => {
    const comment = TaskComment.create({ ...BASE_PROPS, body: 'active' })
    expect(comment.isDeleted).toBe(false)
  })

  it('returns true when deletedAt is set via reconstitute', () => {
    const comment = TaskComment.reconstitute({
      ...BASE_PROPS,
      body: 'deleted',
      postedAt: new Date(),
      deletedAt: new Date(),
      msThreadId: null,
      msPostId: null,
      msPostEtag: null,
    })
    expect(comment.isDeleted).toBe(true)
  })
})
