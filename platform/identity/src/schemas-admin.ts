import { z } from '@hono/zod-openapi'
import { GraphMailerConfig } from './mailer-config-schema'
import { EntraConfig } from './sso-config-schema'

export const SsoListItem = z
  .object({
    tenantId: z.uuid(),
    slug: z.string(),
    displayName: z.string(),
    provider: z.literal('entra').nullable(),
    enabled: z.boolean(),
    domainCount: z.number().int().min(0),
  })
  .openapi('SsoListItem')
export type SsoListItem = z.infer<typeof SsoListItem>

export const SsoListResponse = z.object({ items: z.array(SsoListItem) }).openapi('SsoListResponse')
export type SsoListResponse = z.infer<typeof SsoListResponse>

export const SsoConfigDetail = z
  .object({
    tenantId: z.uuid(),
    provider: z.literal('entra'),
    config: EntraConfig,
    enabled: z.boolean(),
    hasSecret: z.boolean(),
    domains: z.array(z.string()),
    lastTestedAt: z.string().nullable(),
    lastTestResult: z.string().nullable(),
  })
  .openapi('SsoConfigDetail')
export type SsoConfigDetail = z.infer<typeof SsoConfigDetail>

export const SsoUpsertBody = z
  .object({
    provider: z.literal('entra'),
    config: EntraConfig,
    domains: z.array(z.string().min(1)).default([]),
    clientSecret: z.string().min(1).optional(),
    enabled: z.boolean().default(true),
  })
  .openapi('SsoUpsertBody')
export type SsoUpsertBody = z.infer<typeof SsoUpsertBody>

export const SsoTestResponse = z
  .object({
    result: z.enum([
      'ok',
      'discovery_failed',
      'issuer_mismatch',
      'invalid_client',
      'unexpected_error',
    ]),
    message: z.string().optional(),
    testedAt: z.string(),
  })
  .openapi('SsoTestResponse')
export type SsoTestResponse = z.infer<typeof SsoTestResponse>

export const SsoRotateSecretBody = z
  .object({
    clientSecret: z.string().min(1),
  })
  .openapi('SsoRotateSecretBody')
export type SsoRotateSecretBody = z.infer<typeof SsoRotateSecretBody>

export const MailerDetail = z
  .object({
    tenantId: z.uuid(),
    provider: z.literal('graph'),
    config: GraphMailerConfig,
    enabled: z.boolean(),
  })
  .openapi('MailerDetail')
export type MailerDetail = z.infer<typeof MailerDetail>

export const MailerUpsertBody = z
  .object({
    provider: z.literal('graph'),
    config: GraphMailerConfig,
    enabled: z.boolean().default(true),
  })
  .openapi('MailerUpsertBody')
export type MailerUpsertBody = z.infer<typeof MailerUpsertBody>
