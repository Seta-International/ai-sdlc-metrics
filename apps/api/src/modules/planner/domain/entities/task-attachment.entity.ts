import { AttachmentKindViolationException } from '../exceptions/attachment-kind-violation.exception'

export type AttachmentKind = 'file' | 'link'

interface FileAttachmentProps {
  id: string
  taskId: string
  tenantId: string
  createdBy: string
  kind: 'file'
  storageKey: string
  filename: string
  contentType: string
  sizeBytes: number
  url: undefined
  linkTitle: undefined
  previewType: string | undefined
  createdAt: Date
}

interface LinkAttachmentProps {
  id: string
  taskId: string
  tenantId: string
  createdBy: string
  kind: 'link'
  storageKey: undefined
  filename: undefined
  contentType: undefined
  sizeBytes: undefined
  url: string
  linkTitle: string | undefined
  previewType: string | undefined
  createdAt: Date
}

type AttachmentProps = FileAttachmentProps | LinkAttachmentProps

export class TaskAttachment {
  readonly id: string
  readonly taskId: string
  readonly tenantId: string
  readonly createdBy: string
  readonly kind: AttachmentKind
  readonly storageKey: string | undefined
  readonly filename: string | undefined
  readonly contentType: string | undefined
  readonly sizeBytes: number | undefined
  readonly url: string | undefined
  readonly linkTitle: string | undefined
  readonly previewType: string | undefined
  readonly createdAt: Date

  private constructor(props: AttachmentProps) {
    this.id = props.id
    this.taskId = props.taskId
    this.tenantId = props.tenantId
    this.createdBy = props.createdBy
    this.kind = props.kind
    this.storageKey = props.storageKey
    this.filename = props.filename
    this.contentType = props.contentType
    this.sizeBytes = props.sizeBytes
    this.url = props.url
    this.linkTitle = props.linkTitle
    this.previewType = props.previewType
    this.createdAt = props.createdAt
    Object.freeze(this)
  }

  static createFile(input: {
    id: string
    taskId: string
    tenantId: string
    createdBy: string
    storageKey: string
    filename: string
    contentType: string
    sizeBytes: number
    previewType?: string
  }): TaskAttachment {
    if (!input.storageKey) {
      throw new AttachmentKindViolationException('storageKey')
    }
    if (!input.filename) {
      throw new AttachmentKindViolationException('filename')
    }
    if (!input.contentType) {
      throw new AttachmentKindViolationException('contentType')
    }
    if (input.sizeBytes <= 0) {
      throw new AttachmentKindViolationException('sizeBytes')
    }

    return new TaskAttachment({
      id: input.id,
      taskId: input.taskId,
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      kind: 'file',
      storageKey: input.storageKey,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      url: undefined,
      linkTitle: undefined,
      previewType: input.previewType,
      createdAt: new Date(),
    })
  }

  static createLink(input: {
    id: string
    taskId: string
    tenantId: string
    createdBy: string
    url: string
    linkTitle?: string
    previewType?: string
  }): TaskAttachment {
    if (!input.url) {
      throw new AttachmentKindViolationException('url')
    }

    return new TaskAttachment({
      id: input.id,
      taskId: input.taskId,
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      kind: 'link',
      storageKey: undefined,
      filename: undefined,
      contentType: undefined,
      sizeBytes: undefined,
      url: input.url,
      linkTitle: input.linkTitle,
      previewType: input.previewType,
      createdAt: new Date(),
    })
  }

  static reconstitute(props: {
    id: string
    taskId: string
    tenantId: string
    createdBy: string
    kind: string
    storageKey: string | undefined | null
    filename: string | undefined | null
    contentType: string | undefined | null
    sizeBytes: number | undefined | null
    url: string | undefined | null
    linkTitle: string | undefined | null
    previewType: string | undefined | null
    createdAt: Date
  }): TaskAttachment {
    const kind = props.kind as AttachmentKind
    if (kind !== 'file' && kind !== 'link') {
      throw new AttachmentKindViolationException(String(props.kind))
    }
    if (kind === 'file') {
      return new TaskAttachment({
        id: props.id,
        taskId: props.taskId,
        tenantId: props.tenantId,
        createdBy: props.createdBy,
        kind: 'file',
        storageKey: (props.storageKey ?? '') as string,
        filename: (props.filename ?? '') as string,
        contentType: (props.contentType ?? '') as string,
        sizeBytes: (props.sizeBytes ?? 0) as number,
        url: undefined,
        linkTitle: undefined,
        previewType: props.previewType ?? undefined,
        createdAt: props.createdAt,
      })
    }

    return new TaskAttachment({
      id: props.id,
      taskId: props.taskId,
      tenantId: props.tenantId,
      createdBy: props.createdBy,
      kind: 'link',
      storageKey: undefined,
      filename: undefined,
      contentType: undefined,
      sizeBytes: undefined,
      url: (props.url ?? '') as string,
      linkTitle: props.linkTitle ?? undefined,
      previewType: props.previewType ?? undefined,
      createdAt: props.createdAt,
    })
  }
}
