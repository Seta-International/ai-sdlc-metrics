export interface CiStatePort {
  /** Returns false when the CI backend is not yet deployed. Gate calls with this. */
  isEnabled(): boolean
  /** Returns true if the named CI check passed in the given window. null = unknown. */
  checkPassed(opts: {
    checkName: string
    window: { start: Date; end: Date }
  }): Promise<boolean | null>
}
export const CI_STATE_PORT = Symbol('CI_STATE_PORT')
