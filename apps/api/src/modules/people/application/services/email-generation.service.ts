import { Inject, Injectable } from '@nestjs/common'
import {
  EMAIL_GENERATION_CONFIG_REPOSITORY,
  type IEmailGenerationConfigRepository,
} from '../../domain/repositories/email-generation-config.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { computeFullNameUnaccented } from '../../domain/value-objects/name-display-order'

@Injectable()
export class EmailGenerationService {
  constructor(
    @Inject(EMAIL_GENERATION_CONFIG_REPOSITORY)
    private readonly configRepo: IEmailGenerationConfigRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
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

    // Check uniqueness against active employments
    const existingEmails = await this.getExistingEmails(tenantId)
    const existingSet = new Set(existingEmails.map((e) => e.toLowerCase()))

    return candidates.filter((c) => !existingSet.has(c))
  }

  private transliterate(name: string): string {
    return computeFullNameUnaccented(name).replace(/\s+/g, '')
  }

  private async getExistingEmails(tenantId: string): Promise<string[]> {
    const employments = await this.employmentRepo.listByTenant(tenantId, {
      limit: 100000,
      offset: 0,
    })
    return employments.map((e) => e.companyEmail).filter((email): email is string => email !== null)
  }
}
