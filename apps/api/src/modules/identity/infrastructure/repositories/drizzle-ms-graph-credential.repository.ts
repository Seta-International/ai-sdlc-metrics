import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { IMsGraphCredentialRepository } from '../../domain/repositories/ms-graph-credential.repository'
import { msGraphCredential } from '../schema'

@Injectable()
export class DrizzleMsGraphCredentialRepository implements IMsGraphCredentialRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async get(tenantId: string): Promise<MsGraphCredentialEntity | null> {
    const [row] = await this.db
      .select()
      .from(msGraphCredential)
      .where(eq(msGraphCredential.tenantId, tenantId))
      .limit(1)

    if (!row) return null

    return MsGraphCredentialEntity.create({
      tenantId: row.tenantId,
      clientId: row.clientId,
      clientSecretRef: row.clientSecretRef,
      tenantAdId: row.tenantAdId,
      scopes: row.scopes,
      status: row.status as 'active' | 'invalid' | 'paused',
      consentedAt: row.consentedAt,
      lastValidatedAt: row.lastValidatedAt,
      lastError: row.lastError,
    })
  }

  async insertIfAbsent(credential: MsGraphCredentialEntity): Promise<boolean> {
    const inserted = await this.db
      .insert(msGraphCredential)
      .values({
        tenantId: credential.tenantId,
        clientId: credential.clientId,
        clientSecretRef: credential.clientSecretRef,
        tenantAdId: credential.tenantAdId,
        scopes: [...credential.scopes],
        status: credential.status,
        consentedAt: credential.consentedAt,
        lastValidatedAt: credential.lastValidatedAt,
        lastError: credential.lastError,
      })
      .onConflictDoNothing()
      .returning({ tenantId: msGraphCredential.tenantId })

    return inserted.length === 1
  }

  async updateIfSecretRef(
    credential: MsGraphCredentialEntity,
    expectedClientSecretRef: string,
  ): Promise<boolean> {
    const updated = await this.db
      .update(msGraphCredential)
      .set({
        clientId: credential.clientId,
        clientSecretRef: credential.clientSecretRef,
        tenantAdId: credential.tenantAdId,
        scopes: [...credential.scopes],
        status: credential.status,
        lastValidatedAt: credential.lastValidatedAt,
        lastError: credential.lastError,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(msGraphCredential.tenantId, credential.tenantId),
          eq(msGraphCredential.clientSecretRef, expectedClientSecretRef),
        ),
      )
      .returning({ tenantId: msGraphCredential.tenantId })

    return updated.length === 1
  }

  async deleteIfSecretRef(tenantId: string, expectedClientSecretRef: string): Promise<boolean> {
    const deleted = await this.db
      .delete(msGraphCredential)
      .where(
        and(
          eq(msGraphCredential.tenantId, tenantId),
          eq(msGraphCredential.clientSecretRef, expectedClientSecretRef),
        ),
      )
      .returning({ tenantId: msGraphCredential.tenantId })

    return deleted.length === 1
  }
}
