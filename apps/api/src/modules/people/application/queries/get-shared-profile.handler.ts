import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  PROFILE_SHARE_LINK_REPOSITORY,
  type IProfileShareLinkRepository,
} from '../../domain/repositories/profile-share-link.repository'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import { GetSharedProfileQuery } from './get-shared-profile.query'

@QueryHandler(GetSharedProfileQuery)
export class GetSharedProfileHandler implements IQueryHandler<
  GetSharedProfileQuery,
  DirectorySearchIndex | null
> {
  constructor(
    @Inject(PROFILE_SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: IProfileShareLinkRepository,
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchIndexRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(query: GetSharedProfileQuery): Promise<DirectorySearchIndex | null> {
    const link = await this.shareLinkRepo.findByToken(query.token)
    if (!link) return null
    if (link.status !== 'active') return null
    if (link.expiresAt < new Date()) return null
    if (link.maxViews !== null && link.viewCount >= link.maxViews) return null

    await this.shareLinkRepo.incrementViewCount(link.id)

    const { items } = await this.searchIndexRepo.list(
      link.tenantId,
      { employmentId: link.employmentId },
      1,
      0,
    )
    return items[0] ?? null
  }
}
