export const OAUTH_TOKEN_EXCHANGER = Symbol('IOAuthTokenExchanger')

export interface OAuthTokenExchangeInput {
  tokenEndpoint: string
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  scope: string
}

export interface OAuthTokenExchangeResult {
  idToken: string
  accessToken: string
  tokenType: string
  expiresIn: number
}

export interface IOAuthTokenExchanger {
  exchange(input: OAuthTokenExchangeInput): Promise<OAuthTokenExchangeResult>
}
