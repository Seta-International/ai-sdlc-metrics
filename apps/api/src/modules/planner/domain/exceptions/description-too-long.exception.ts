export class DescriptionTooLongException extends Error {
  constructor(maxLength = 32000) {
    super(`Description exceeds maximum length of ${maxLength} characters`)
    this.name = 'DescriptionTooLongException'
  }
}
