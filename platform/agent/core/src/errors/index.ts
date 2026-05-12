export class KernelError extends Error {
  readonly code = 'PLACEHOLDER'
  readonly domain = 'KERNEL' as const
  readonly category = 'SYSTEM' as const
}
