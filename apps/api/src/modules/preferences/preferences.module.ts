import { Module } from '@nestjs/common'
import { SAVED_VIEW_REPOSITORY } from './domain/repositories/saved-view.repository'
import { DrizzleSavedViewRepository } from './infrastructure/repositories/drizzle-saved-view.repository'
import { PreferencesQueryFacade } from './application/facades/preferences-query.facade'

@Module({
  providers: [
    { provide: SAVED_VIEW_REPOSITORY, useClass: DrizzleSavedViewRepository },
    PreferencesQueryFacade,
  ],
  exports: [PreferencesQueryFacade, SAVED_VIEW_REPOSITORY],
})
export class PreferencesModule {}
