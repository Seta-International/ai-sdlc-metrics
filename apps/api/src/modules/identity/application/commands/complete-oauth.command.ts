export class CompleteOAuthCommand {
  constructor(
    readonly code: string,
    readonly state: string,
    /**
     * OAuth redirect_uri — must match exactly what was sent in startOAuth.
     */
    readonly callbackUri: string,
  ) {}
}
