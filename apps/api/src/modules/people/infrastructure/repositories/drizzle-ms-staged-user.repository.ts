import { Inject, Injectable } from '@nestjs/common'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { MsStagedUser, MsStagedUserStatus } from '../../domain/entities/ms-staged-user.entity'
import type { IMsStagedUserRepository } from '../../domain/repositories/ms-staged-user.repository'
import { msStagedUser } from '../schema/people.schema'

@Injectable()
export class DrizzleMsStagedUserRepository implements IMsStagedUserRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<MsStagedUser | null> {
    const rows = await this.db
      .select()
      .from(msStagedUser)
      .where(and(eq(msStagedUser.id, id), eq(msStagedUser.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as MsStagedUser | undefined) ?? null
  }

  async findByMsExternalId(msExternalId: string, tenantId: string): Promise<MsStagedUser | null> {
    const rows = await this.db
      .select()
      .from(msStagedUser)
      .where(and(eq(msStagedUser.msExternalId, msExternalId), eq(msStagedUser.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as MsStagedUser | undefined) ?? null
  }

  async findLatestImportedByEmail(email: string, tenantId: string): Promise<MsStagedUser | null> {
    const rows = await this.db
      .select()
      .from(msStagedUser)
      .where(
        and(
          eq(msStagedUser.tenantId, tenantId),
          eq(msStagedUser.status, 'imported'),
          sql`lower(${msStagedUser.email}) = lower(${email})`,
        ),
      )
      .orderBy(desc(msStagedUser.lastSeenAt))
      .limit(1)

    return (rows[0] as MsStagedUser | undefined) ?? null
  }

  async upsertFromSync(
    tenantId: string,
    data: {
      msExternalId: string
      displayName: string
      email: string | null
      jobTitle: string | null
      department: string | null
      officeLocation: string | null
      mobilePhone: string | null
      workPhone: string | null
      managerMsId: string | null
      photoDocumentId: string | null
    },
  ): Promise<MsStagedUser> {
    const now = new Date()

    const existing = await this.findByMsExternalId(data.msExternalId, tenantId)

    let newStatus: MsStagedUserStatus = 'pending'
    if (existing) {
      const hasChanged =
        existing.displayName !== data.displayName ||
        existing.email !== data.email ||
        existing.jobTitle !== data.jobTitle ||
        existing.department !== data.department ||
        existing.officeLocation !== data.officeLocation ||
        existing.mobilePhone !== data.mobilePhone ||
        existing.workPhone !== data.workPhone ||
        existing.managerMsId !== data.managerMsId

      if (existing.status === 'pending' || hasChanged) {
        newStatus = 'pending'
      } else {
        newStatus = existing.status
      }
    }

    const rows = await this.db
      .insert(msStagedUser)
      .values({
        tenantId,
        ...data,
        status: newStatus,
        importedEmploymentId: null,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [msStagedUser.tenantId, msStagedUser.msExternalId],
        set: {
          displayName: data.displayName,
          email: data.email,
          jobTitle: data.jobTitle,
          department: data.department,
          officeLocation: data.officeLocation,
          mobilePhone: data.mobilePhone,
          workPhone: data.workPhone,
          managerMsId: data.managerMsId,
          photoDocumentId: data.photoDocumentId,
          status: newStatus,
          lastSeenAt: now,
        },
      })
      .returning()

    if (!rows[0]) throw new Error(`Upsert failed for msExternalId=${data.msExternalId}`)
    return rows[0] as MsStagedUser
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: MsStagedUserStatus,
    importedEmploymentId?: string,
  ): Promise<void> {
    await this.db
      .update(msStagedUser)
      .set({ status, importedEmploymentId: importedEmploymentId ?? null })
      .where(and(eq(msStagedUser.id, id), eq(msStagedUser.tenantId, tenantId)))
  }

  async listByStatus(
    tenantId: string,
    status: MsStagedUserStatus,
    limit: number,
    offset: number,
  ): Promise<MsStagedUser[]> {
    return (await this.db
      .select()
      .from(msStagedUser)
      .where(and(eq(msStagedUser.tenantId, tenantId), eq(msStagedUser.status, status)))
      .limit(limit)
      .offset(offset)
      .orderBy(msStagedUser.lastSeenAt)) as MsStagedUser[]
  }

  async countByStatus(tenantId: string, status: MsStagedUserStatus): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(msStagedUser)
      .where(and(eq(msStagedUser.tenantId, tenantId), eq(msStagedUser.status, status)))
    return rows[0]?.count ?? 0
  }

  async findByImportedEmploymentId(
    employmentId: string,
    tenantId: string,
  ): Promise<MsStagedUser | null> {
    const rows = await this.db
      .select()
      .from(msStagedUser)
      .where(
        and(
          eq(msStagedUser.importedEmploymentId, employmentId),
          eq(msStagedUser.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as MsStagedUser | undefined) ?? null
  }
}
