import { Injectable } from '@nestjs/common'
import type {
  IOAuthTokenExchanger,
  OAuthTokenExchangeInput,
  OAuthTokenExchangeResult,
} from '../../domain/ports/oauth-token-exchanger.port'
import { MicrosoftOAuthTokenExchanger } from './microsoft-oauth-token-exchanger'
import { GoogleOAuthTokenExchanger } from './google-oauth-token-exchanger'

/**
 * Dispatches to the correct OAuth token exchanger based on the token endpoint URL.
 * Google's endpoint is https://oauth2.googleapis.com/token; everything else is Microsoft.
 *
 * Both underlying exchangers implement identical wire protocols (RFC 6749 authorization_code grant),
 * so the dispatch is purely for clarity and future extensibility.
 */
@Injectable()
export class ProviderOAuthTokenExchanger implements IOAuthTokenExchanger {
  private readonly microsoft = new MicrosoftOAuthTokenExchanger()
  private readonly google = new GoogleOAuthTokenExchanger()

  exchange(input: OAuthTokenExchangeInput): Promise<OAuthTokenExchangeResult> {
    if (input.tokenEndpoint.startsWith('https://oauth2.googleapis.com/')) {
      return this.google.exchange(input)
    }
    return this.microsoft.exchange(input)
  }
}
