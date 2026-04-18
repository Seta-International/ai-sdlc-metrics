import { TitleRequiredException } from '../exceptions/title-required.exception'
import { TitleTooLongException } from '../exceptions/title-too-long.exception'

const MAX_TITLE_LENGTH = 255

function validateTitle(title: string): void {
  if (!title || title.length === 0) {
    throw new TitleRequiredException()
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new TitleTooLongException(MAX_TITLE_LENGTH)
  }
}

export class ChecklistItem {
  readonly id: string
  readonly title: string
  readonly isChecked: boolean
  readonly orderHint: string

  private constructor(props: { id: string; title: string; isChecked: boolean; orderHint: string }) {
    this.id = props.id
    this.title = props.title
    this.isChecked = props.isChecked
    this.orderHint = props.orderHint
    Object.freeze(this)
  }

  static create(props: { id: string; title: string; orderHint: string }): ChecklistItem {
    validateTitle(props.title)
    return new ChecklistItem({ ...props, isChecked: false })
  }

  static reconstitute(props: {
    id: string
    title: string
    isChecked: boolean
    orderHint: string
  }): ChecklistItem {
    return new ChecklistItem(props)
  }

  withChecked(isChecked: boolean): ChecklistItem {
    return new ChecklistItem({
      id: this.id,
      title: this.title,
      isChecked,
      orderHint: this.orderHint,
    })
  }

  withTitle(title: string): ChecklistItem {
    validateTitle(title)
    return new ChecklistItem({
      id: this.id,
      title,
      isChecked: this.isChecked,
      orderHint: this.orderHint,
    })
  }

  withOrderHint(hint: string): ChecklistItem {
    return new ChecklistItem({
      id: this.id,
      title: this.title,
      isChecked: this.isChecked,
      orderHint: hint,
    })
  }

  equals(other: ChecklistItem): boolean {
    return (
      this.id === other.id &&
      this.title === other.title &&
      this.isChecked === other.isChecked &&
      this.orderHint === other.orderHint
    )
  }
}
