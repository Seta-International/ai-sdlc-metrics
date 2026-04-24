import { Injectable } from '@nestjs/common'
import type {
  IOAuthTokenExchanger,
  OAuthTokenExchangeInput,
  OAuthTokenExchangeResult,
} from '../../domain/ports/oauth-token-exchanger.port'

@Injectable()
export class GoogleOAuthTokenExchanger implements IOAuthTokenExchanger {
  async exchange(input: OAuthTokenExchangeInput): Promise<OAuthTokenExchangeResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      scope: input.scope,
    })

    const response = await fetch(input.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OAuth token exchange failed (${response.status}): ${text}`)
    }

    const json = (await response.json()) as {
      id_token: string
      access_token: string
      token_type: string
      expires_in: number
    }

    if (!json.id_token) {
      throw new Error('OAuth token response missing id_token — ensure openid scope is requested')
    }

    return {
      idToken: json.id_token,
      accessToken: json.access_token,
      tokenType: json.token_type,
      expiresIn: json.expires_in,
    }
  }
}
