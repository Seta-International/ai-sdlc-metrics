import { BadRequest, ConflictError, NotFound } from '@seta/middleware'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import type { Sql } from 'postgres'
import type { AuditWriter } from './admin-audit'
import { recordSsoAudit } from './admin-audit'
import type { SsoVariables } from './middleware'
import {
  SsoConfigDetail,
  SsoListResponse,
  SsoRotateSecretBody,
  SsoTestResponse,
  SsoUpsertBody,
} from './schemas-admin'
import {
  deleteSsoConfig,
  deleteSsoEmailDomain,
  getSsoConfigDetail,
  listSsoConfigsWithCounts,
  setSsoLastTestResult,
  upsertSsoConfig,
  upsertSsoEmailDomain,
} from './sso-config-repo'
import { runSsoConnectionTest } from './sso-connection-test'
import { isDeniedSsoEmailDomain, normalizeEmailDomain } from './sso-domain-denylist'

const SECRET_PROVIDER_ID = 'sso-entra' as const
const SECRET_ACCOUNT_KEY = 'sso' as const
const SECRET_VAULT_ID = `${SECRET_PROVIDER_ID}:${SECRET_ACCOUNT_KEY}`

export type SsoAdminRoutesDeps = {
  sql: Sql
  audit: AuditWriter
  vault: {
    put(
      tenantId: string,
      providerId: string,
      accountKey: string,
      bundle: { accessToken: string },
    ): Promise<void>
    get(
      tenantId: string,
      providerId: string,
      accountKey: string,
    ): Promise<{ accessToken: string } | null>
    delete(tenantId: string, providerId: string, accountKey: string): Promise<void>
  }
  fetchImpl?: typeof fetch
}

export function createSsoAdminRoutes(deps: SsoAdminRoutesDeps): Hono<{ Variables: SsoVariables }> {
  const app = new Hono<{ Variables: SsoVariables }>()

  app.get('/admin/sso/tenants', async (c) => {
    const items = await listSsoConfigsWithCounts(deps.sql)
    return c.json(SsoListResponse.parse({ items }))
  })

  app.get('/admin/sso/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId')
    const detail = await getSsoConfigDetail(deps.sql, tenantId)
    if (!detail) throw new NotFound('sso config not found for tenant')
    return c.json(SsoConfigDetail.parse(detail))
  })

  app.put('/admin/sso/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId')
    const body = SsoUpsertBody.parse(await c.req.json().catch(() => ({})))

    const normalized: string[] = []
    for (const raw of body.domains) {
      const d = normalizeEmailDomain(raw)
      if (!d) throw new BadRequest(`invalid domain: ${raw}`)
      if (isDeniedSsoEmailDomain(d)) {
        throw new BadRequest(`domain '${d}' is on the public-mail denylist`)
      }
      normalized.push(d)
    }

    if (normalized.length > 0) {
      const conflicts = (await deps.sql`
        SELECT domain, tenant_id FROM auth.sso_email_domains
        WHERE domain = ANY(${normalized}::text[]) AND tenant_id <> ${tenantId}
      `) as Array<{ domain: string; tenant_id: string }>
      if (conflicts.length > 0) {
        throw new ConflictError(
          `domain(s) already owned by another tenant: ${conflicts
            .map((row) => row.domain)
            .join(', ')}`,
        )
      }
    }

    const actorUserId = c.get('userId')
    const existing = await getSsoConfigDetail(deps.sql, tenantId)
    const isCreate = existing === null

    if (body.clientSecret) {
      await deps.vault.put(tenantId, SECRET_PROVIDER_ID, SECRET_ACCOUNT_KEY, {
        accessToken: body.clientSecret,
      })
    } else if (isCreate) {
      throw new BadRequest('clientSecret is required when creating a new sso config')
    }

    await upsertSsoConfig(deps.sql, {
      tenantId,
      provider: 'entra',
      config: body.config,
      secretVaultId: SECRET_VAULT_ID,
      createdByUserId: actorUserId,
    })

    if (body.enabled !== existing?.enabled) {
      await deps.sql`UPDATE auth.sso_configs SET enabled = ${body.enabled} WHERE tenant_id = ${tenantId}`
    }

    const existingDomains = new Set(existing?.domains ?? [])
    const incoming = new Set(normalized)
    for (const d of existingDomains) {
      if (!incoming.has(d)) {
        await deleteSsoEmailDomain(deps.sql, d)
        await recordSsoAudit(deps.audit, {
          event: 'sso.domain_removed',
          actorUserId,
          tenantId,
          metadata: { domain: d },
        })
      }
    }
    for (const d of incoming) {
      if (!existingDomains.has(d)) {
        await upsertSsoEmailDomain(deps.sql, { domain: d, tenantId })
        await recordSsoAudit(deps.audit, {
          event: 'sso.domain_added',
          actorUserId,
          tenantId,
          metadata: { domain: d },
        })
      }
    }

    await recordSsoAudit(deps.audit, {
      event: isCreate ? 'sso.config_created' : 'sso.config_updated',
      actorUserId,
      tenantId,
      metadata: {
        provider: 'entra',
        enabled: body.enabled,
        secretRotated: Boolean(body.clientSecret) && !isCreate,
      },
    })

    const detail = await getSsoConfigDetail(deps.sql, tenantId)
    return c.json(SsoConfigDetail.parse(detail))
  })

  app.delete('/admin/sso/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId')
    const actorUserId = c.get('userId')
    const existing = await getSsoConfigDetail(deps.sql, tenantId)
    if (!existing) throw new NotFound('sso config not found for tenant')
    await deleteSsoConfig(deps.sql, tenantId)
    try {
      await deps.vault.delete(tenantId, SECRET_PROVIDER_ID, SECRET_ACCOUNT_KEY)
    } catch (err) {
      logger.warn(
        { event: 'sso.vault_delete_failed', tenant_id: tenantId, err: (err as Error).message },
        '[sso] vault delete after config delete failed',
      )
    }
    await recordSsoAudit(deps.audit, {
      event: 'sso.config_deleted',
      actorUserId,
      tenantId,
    })
    return c.json({ ok: true })
  })

  app.post('/admin/sso/tenants/:tenantId/test', async (c) => {
    const tenantId = c.req.param('tenantId')
    const actorUserId = c.get('userId')
    const detail = await getSsoConfigDetail(deps.sql, tenantId)
    if (!detail) throw new NotFound('sso config not found for tenant')
    const secret = await deps.vault.get(tenantId, SECRET_PROVIDER_ID, SECRET_ACCOUNT_KEY)
    if (!secret) throw new BadRequest('client secret missing in vault')
    const probe = await runSsoConnectionTest({
      entraTenantId: detail.config.entra_tenant_id,
      clientId: detail.config.client_id,
      clientSecret: secret.accessToken,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    })
    await setSsoLastTestResult(deps.sql, { tenantId, result: probe.result })
    await recordSsoAudit(deps.audit, {
      event: 'sso.test_run',
      actorUserId,
      tenantId,
      metadata: { result: probe.result, message: probe.message },
      result: probe.result === 'ok' ? 'ok' : 'failure',
    })
    logger.info(
      { event: 'sso.admin_test_run', tenant_id: tenantId, result: probe.result },
      '[sso] admin test run',
    )
    return c.json(
      SsoTestResponse.parse({
        result: probe.result,
        ...(probe.message ? { message: probe.message } : {}),
        testedAt: new Date().toISOString(),
      }),
    )
  })

  app.post('/admin/sso/tenants/:tenantId/rotate-secret', async (c) => {
    const tenantId = c.req.param('tenantId')
    const actorUserId = c.get('userId')
    const body = SsoRotateSecretBody.parse(await c.req.json().catch(() => ({})))
    const existing = await getSsoConfigDetail(deps.sql, tenantId)
    if (!existing) throw new NotFound('sso config not found for tenant')
    await deps.vault.put(tenantId, SECRET_PROVIDER_ID, SECRET_ACCOUNT_KEY, {
      accessToken: body.clientSecret,
    })
    await recordSsoAudit(deps.audit, {
      event: 'sso.secret_rotated',
      actorUserId,
      tenantId,
    })
    return c.json({ ok: true })
  })

  return app
}
