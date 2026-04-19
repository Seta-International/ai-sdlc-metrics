import { CommentBodyTooLongException } from '../exceptions/comment-body-too-long.exception'

const MAX_BODY_LENGTH = 4000

function validateBody(body: string): void {
  if (body.length > MAX_BODY_LENGTH) {
    throw new CommentBodyTooLongException(MAX_BODY_LENGTH)
  }
}

export class TaskComment {
  readonly id: string
  readonly taskId: string
  readonly tenantId: string
  readonly authorActorId: string
  readonly body: string
  readonly postedAt: Date
  readonly deletedAt: Date | null
  readonly msThreadId: string | null
  readonly msPostId: string | null
  readonly msPostEtag: string | null

  private constructor(props: {
    id: string
    taskId: string
    tenantId: string
    authorActorId: string
    body: string
    postedAt: Date
    deletedAt: Date | null
    msThreadId: string | null
    msPostId: string | null
    msPostEtag: string | null
  }) {
    this.id = props.id
    this.taskId = props.taskId
    this.tenantId = props.tenantId
    this.authorActorId = props.authorActorId
    this.body = props.body
    this.postedAt = props.postedAt
    this.deletedAt = props.deletedAt
    this.msThreadId = props.msThreadId
    this.msPostId = props.msPostId
    this.msPostEtag = props.msPostEtag
    Object.freeze(this)
  }

  static create(props: {
    id: string
    taskId: string
    tenantId: string
    authorActorId: string
    body: string
  }): TaskComment {
    validateBody(props.body)
    return new TaskComment({
      ...props,
      postedAt: new Date(),
      deletedAt: null,
      msThreadId: null,
      msPostId: null,
      msPostEtag: null,
    })
  }

  static reconstitute(props: {
    id: string
    taskId: string
    tenantId: string
    authorActorId: string
    body: string
    postedAt: Date
    deletedAt: Date | null
    msThreadId: string | null
    msPostId: string | null
    msPostEtag: string | null
  }): TaskComment {
    return new TaskComment(props)
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null
  }
}
