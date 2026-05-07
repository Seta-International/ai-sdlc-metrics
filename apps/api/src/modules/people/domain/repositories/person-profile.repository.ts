import type { PersonProfile } from '../entities/person-profile.entity'

export const PERSON_PROFILE_REPOSITORY = Symbol('IPersonProfileRepository')

export interface IPersonProfileRepository {
  findById(id: string, tenantId: string): Promise<PersonProfile | null>
  findByActorId(actorId: string, tenantId: string): Promise<PersonProfile | null>
  insert(data: Omit<PersonProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<PersonProfile>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<PersonProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>>,
  ): Promise<PersonProfile>

  findManyByIds(ids: string[], tenantId: string): Promise<PersonProfile[]>
}
