import { Injectable } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import type { Db } from '@future/db'

const REQUEST_DB_KEY = 'requestDb'

@Injectable()
export class RequestDbContextService {
  constructor(private readonly cls: ClsService) {}

  getDb(): Db | null {
    return this.cls.get<Db>(REQUEST_DB_KEY) ?? null
  }

  setDb(db: Db): void {
    this.cls.set(REQUEST_DB_KEY, db)
  }

  clearDb(): void {
    this.cls.set(REQUEST_DB_KEY, null)
  }
}
