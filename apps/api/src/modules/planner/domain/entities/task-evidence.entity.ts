import { CaptionRequiredException } from '../exceptions/caption-required.exception'
import { CaptionTooLongException } from '../exceptions/caption-too-long.exception'
import { EvidenceBodyRequiredException } from '../exceptions/evidence-body-required.exception'
import { EvidenceBodyTooLongException } from '../exceptions/evidence-body-too-long.exception'

export type EvidenceKind = 'file' | 'link' | 'note'

const MAX_CAPTION_LENGTH = 500
const MAX_BODY_LENGTH = 4000

function validateCaption(caption: string): void {
  if (!caption || caption.trim().length === 0) {
    throw new CaptionRequiredException()
  }
  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new CaptionTooLongException(MAX_CAPTION_LENGTH)
  }
}

function validateBody(body: string | null | undefined, kind: EvidenceKind): void {
  if (kind === 'note') {
    if (!body || body.trim().length === 0) {
      throw new EvidenceBodyRequiredException()
    }
    if (body.length > MAX_BODY_LENGTH) {
      throw new EvidenceBodyTooLongException(MAX_BODY_LENGTH)
    }
  }
}

interface FileEvidenceProps {
  id: string
  taskId: string
  tenantId: string
  submittedBy: string
  submittedAt: Date
  kind: 'file'
  caption: string
  storageKey: string
  filename: string
  contentType: string
  sizeBytes: number
  url: undefined
  linkTitle: undefined
  body: undefined
  verifiedBy: string | null
  verifiedAt: Date | null
  verificationNote: string | null
}

interface LinkEvidenceProps {
  id: string
  taskId: string
  tenantId: string
  submittedBy: string
  submittedAt: Date
  kind: 'link'
  caption: string
  storageKey: undefined
  filename: undefined
  contentType: undefined
  sizeBytes: undefined
  url: string
  linkTitle: string | undefined
  body: undefined
  verifiedBy: string | null
  verifiedAt: Date | null
  verificationNote: string | null
}

interface NoteEvidenceProps {
  id: string
  taskId: string
  tenantId: string
  submittedBy: string
  submittedAt: Date
  kind: 'note'
  caption: string
  storageKey: undefined
  filename: undefined
  contentType: undefined
  sizeBytes: undefined
  url: undefined
  linkTitle: undefined
  body: string
  verifiedBy: string | null
  verifiedAt: Date | null
  verificationNote: string | null
}

type EvidenceProps = FileEvidenceProps | LinkEvidenceProps | NoteEvidenceProps

export class TaskEvidence {
  readonly id: string
  readonly taskId: string
  readonly tenantId: string
  readonly submittedBy: string
  readonly submittedAt: Date
  readonly kind: EvidenceKind
  readonly caption: string
  readonly storageKey: string | undefined
  readonly filename: string | undefined
  readonly contentType: string | undefined
  readonly sizeBytes: number | undefined
  readonly url: string | undefined
  readonly linkTitle: string | undefined
  readonly body: string | undefined
  readonly verifiedBy: string | null
  readonly verifiedAt: Date | null
  readonly verificationNote: string | null

  private constructor(props: EvidenceProps) {
    this.id = props.id
    this.taskId = props.taskId
    this.tenantId = props.tenantId
    this.submittedBy = props.submittedBy
    this.submittedAt = props.submittedAt
    this.kind = props.kind
    this.caption = props.caption
    this.storageKey = props.storageKey
    this.filename = props.filename
    this.contentType = props.contentType
    this.sizeBytes = props.sizeBytes
    this.url = props.url
    this.linkTitle = props.linkTitle
    this.body = props.body
    this.verifiedBy = props.verifiedBy
    this.verifiedAt = props.verifiedAt
    this.verificationNote = props.verificationNote
    Object.freeze(this)
  }

  static createFile(input: {
    id: string
    taskId: string
    tenantId: string
    submittedBy: string
    caption: string
    storageKey: string
    filename: string
    contentType: string
    sizeBytes: number
  }): TaskEvidence {
    validateCaption(input.caption)
    return new TaskEvidence({
      id: input.id,
      taskId: input.taskId,
      tenantId: input.tenantId,
      submittedBy: input.submittedBy,
      submittedAt: new Date(),
      kind: 'file',
      caption: input.caption,
      storageKey: input.storageKey,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      url: undefined,
      linkTitle: undefined,
      body: undefined,
      verifiedBy: null,
      verifiedAt: null,
      verificationNote: null,
    })
  }

  static createLink(input: {
    id: string
    taskId: string
    tenantId: string
    submittedBy: string
    caption: string
    url: string
    linkTitle?: string
  }): TaskEvidence {
    validateCaption(input.caption)
    return new TaskEvidence({
      id: input.id,
      taskId: input.taskId,
      tenantId: input.tenantId,
      submittedBy: input.submittedBy,
      submittedAt: new Date(),
      kind: 'link',
      caption: input.caption,
      storageKey: undefined,
      filename: undefined,
      contentType: undefined,
      sizeBytes: undefined,
      url: input.url,
      linkTitle: input.linkTitle,
      body: undefined,
      verifiedBy: null,
      verifiedAt: null,
      verificationNote: null,
    })
  }

  static createNote(input: {
    id: string
    taskId: string
    tenantId: string
    submittedBy: string
    caption: string
    body: string
  }): TaskEvidence {
    validateCaption(input.caption)
    validateBody(input.body, 'note')
    return new TaskEvidence({
      id: input.id,
      taskId: input.taskId,
      tenantId: input.tenantId,
      submittedBy: input.submittedBy,
      submittedAt: new Date(),
      kind: 'note',
      caption: input.caption,
      storageKey: undefined,
      filename: undefined,
      contentType: undefined,
      sizeBytes: undefined,
      url: undefined,
      linkTitle: undefined,
      body: input.body,
      verifiedBy: null,
      verifiedAt: null,
      verificationNote: null,
    })
  }

  static reconstitute(props: {
    id: string
    taskId: string
    tenantId: string
    submittedBy: string
    submittedAt: Date
    kind: string
    caption: string
    storageKey: string | null | undefined
    filename: string | null | undefined
    contentType: string | null | undefined
    sizeBytes: number | null | undefined
    url: string | null | undefined
    linkTitle: string | null | undefined
    body: string | null | undefined
    verifiedBy: string | null | undefined
    verifiedAt: Date | null | undefined
    verificationNote: string | null | undefined
  }): TaskEvidence {
    const kind = props.kind as EvidenceKind
    if (kind === 'file') {
      return new TaskEvidence({
        id: props.id,
        taskId: props.taskId,
        tenantId: props.tenantId,
        submittedBy: props.submittedBy,
        submittedAt: props.submittedAt,
        kind: 'file',
        caption: props.caption,
        storageKey: props.storageKey ?? '',
        filename: props.filename ?? '',
        contentType: props.contentType ?? '',
        sizeBytes: props.sizeBytes ?? 0,
        url: undefined,
        linkTitle: undefined,
        body: undefined,
        verifiedBy: props.verifiedBy ?? null,
        verifiedAt: props.verifiedAt ?? null,
        verificationNote: props.verificationNote ?? null,
      })
    }
    if (kind === 'link') {
      return new TaskEvidence({
        id: props.id,
        taskId: props.taskId,
        tenantId: props.tenantId,
        submittedBy: props.submittedBy,
        submittedAt: props.submittedAt,
        kind: 'link',
        caption: props.caption,
        storageKey: undefined,
        filename: undefined,
        contentType: undefined,
        sizeBytes: undefined,
        url: props.url ?? '',
        linkTitle: props.linkTitle ?? undefined,
        body: undefined,
        verifiedBy: props.verifiedBy ?? null,
        verifiedAt: props.verifiedAt ?? null,
        verificationNote: props.verificationNote ?? null,
      })
    }
    // note
    return new TaskEvidence({
      id: props.id,
      taskId: props.taskId,
      tenantId: props.tenantId,
      submittedBy: props.submittedBy,
      submittedAt: props.submittedAt,
      kind: 'note',
      caption: props.caption,
      storageKey: undefined,
      filename: undefined,
      contentType: undefined,
      sizeBytes: undefined,
      url: undefined,
      linkTitle: undefined,
      body: props.body ?? '',
      verifiedBy: props.verifiedBy ?? null,
      verifiedAt: props.verifiedAt ?? null,
      verificationNote: props.verificationNote ?? null,
    })
  }
}
