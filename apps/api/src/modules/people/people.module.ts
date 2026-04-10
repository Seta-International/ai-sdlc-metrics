import { Module } from '@nestjs/common'
import { PeopleQueryFacade } from './application/facades/people-query.facade'

@Module({
  providers: [PeopleQueryFacade],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}
