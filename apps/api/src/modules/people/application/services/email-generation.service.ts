import { Inject, Injectable } from '@nestjs/common'
import {
  EMAIL_GENERATION_CONFIG_REPOSITORY,
  type IEmailGenerationConfigRepository,
} from '../../domain/repositories/email-generation-config.repository'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import { computeFullNameUnaccented } from '../../domain/value-objects/name-display-order'

@Injectable()
export class EmailGenerationService {
  constructor(
    @Inject(EMAIL_GENERATION_CONFIG_REPOSITORY)
    private readonly configRepo: IEmailGenerationConfigRepository,
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchIndexRepo: IDirectorySearchIndexRepository,
  ) {}

  async generateCandidates(
    tenantId: string,
    familyName: string,
    givenName: string,
    middleName: string | null,
  ): Promise<string[]> {
    const config = await this.configRepo.findByTenantId(tenantId)
    if (!config) return []

    const given = this.transliterate(givenName).toLowerCase()
    const family = this.transliterate(familyName).toLowerCase()
    const middle = middleName ? this.transliterate(middleName).toLowerCase() : null

    const candidates: string[] = []

    // Primary: {given}.{family}
    candidates.push(`${given}.${family}@${config.domain}`)

    // Fallback 1: {given}.{family}{middle}
    if (middle) {
      candidates.push(`${given}.${family}${middle}@${config.domain}`)
    }

    // Fallback 2: {given}{middle}.{family}
    if (middle) {
      candidates.push(`${given}${middle}.${family}@${config.domain}`)
    }

    // Fallback 3-10: {given}.{family}{N}
    for (let i = 2; i <= 9; i++) {
      candidates.push(`${given}.${family}${i}@${config.domain}`)
    }

    // Check uniqueness against directory search index (targeted query, not full table scan)
    const existingEmails = await this.searchIndexRepo.listCompanyEmails(tenantId)
    const existingSet = new Set(existingEmails.map((e) => e.toLowerCase()))

    return candidates.filter((c) => !existingSet.has(c))
  }

  private transliterate(name: string): string {
    return computeFullNameUnaccented(name).replace(/\s+/g, '')
  }
}
