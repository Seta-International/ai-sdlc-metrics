export class CustomFieldDefNotFoundException extends Error {
  constructor(id: string) {
    super(`Custom field definition ${id} not found`)
    this.name = 'CustomFieldDefNotFoundException'
  }
}
