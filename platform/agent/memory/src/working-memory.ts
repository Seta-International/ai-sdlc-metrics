import { WorkingMemoryTooLargeError } from './errors'

export const WORKING_MEMORY_BYTE_CAP = 8192

export function validateWorkingMemoryText(text: string): void {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > WORKING_MEMORY_BYTE_CAP) {
    throw new WorkingMemoryTooLargeError(bytes)
  }
}
