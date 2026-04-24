export class StartOAuthCommand {
  constructor(
    readonly tenantId: string,
    readonly providerId: string,
    /**
     * OAuth redirect_uri — must be a registered callback URL on the IdP app
     * (e.g. web-shell's `/auth/callback/microsoft`).
     */
    readonly callbackUri: string,
    /**
     * Where to send the user after a successful login.
     * Must be a Future zone URL.
     */
    readonly redirectTo: string,
  ) {}
}
