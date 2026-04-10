import { Module } from '@nestjs/common'
import { PeopleQueryFacade } from './application/facades/people-query.facade.js'

@Module({
  providers: [PeopleQueryFacade],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}
