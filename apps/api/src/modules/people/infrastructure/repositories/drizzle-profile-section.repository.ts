import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ProfileSection, SectionType } from '../../domain/entities/profile-section.entity'
import type { IProfileSectionRepository } from '../../domain/repositories/profile-section.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { profileSection } from '../schema/index'

@Injectable()
export class DrizzleProfileSectionRepository implements IProfileSectionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ProfileSection | null> {
    const rows = await this.db
      .select()
      .from(profileSection)
      .where(and(eq(profileSection.id, id), eq(profileSection.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ProfileSection | undefined) ?? null
  }

  async findByProfileId(profileId: string, tenantId: string): Promise<ProfileSection[]> {
    const rows = await this.db
      .select()
      .from(profileSection)
      .where(and(eq(profileSection.profileId, profileId), eq(profileSection.tenantId, tenantId)))
    return rows as ProfileSection[]
  }

  async findByProfileIdAndType(
    profileId: string,
    sectionType: SectionType,
    tenantId: string,
  ): Promise<ProfileSection[]> {
    const rows = await this.db
      .select()
      .from(profileSection)
      .where(
        and(
          eq(profileSection.profileId, profileId),
          eq(profileSection.sectionType, sectionType),
          eq(profileSection.tenantId, tenantId),
        ),
      )
    return rows as ProfileSection[]
  }

  async insert(data: Omit<ProfileSection, 'id'>): Promise<ProfileSection> {
    const rows = await this.db
      .insert(profileSection)
      .values({
        tenantId: data.tenantId,
        profileId: data.profileId,
        sectionType: data.sectionType,
        payload: data.payload,
        displayOrder: data.displayOrder,
      })
      .returning()
    return rows[0] as ProfileSection
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<ProfileSection, 'payload' | 'displayOrder'>>,
  ): Promise<ProfileSection> {
    const rows = await this.db
      .update(profileSection)
      .set(data as Record<string, unknown>)
      .where(and(eq(profileSection.id, id), eq(profileSection.tenantId, tenantId)))
      .returning()
    return rows[0] as ProfileSection
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(profileSection)
      .where(and(eq(profileSection.id, id), eq(profileSection.tenantId, tenantId)))
  }
}
