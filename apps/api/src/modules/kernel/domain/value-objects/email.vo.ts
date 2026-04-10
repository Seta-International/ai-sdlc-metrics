export class Email {
  readonly value: string

  constructor(raw: string) {
    const normalized = raw.trim().toLowerCase()
    if (!normalized.includes('@')) {
      throw new Error(`Invalid email: ${raw}`)
    }
    this.value = normalized
  }

  toString(): string {
    return this.value
  }
}
