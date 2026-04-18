export class ConcurrentModificationException extends Error {
  constructor() {
    super('Concurrent modification detected')
    this.name = 'ConcurrentModificationException'
  }
}
