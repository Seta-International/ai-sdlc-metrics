import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import type { Db } from '@future/db'
import { sql } from 'drizzle-orm'
import { BASE_DB_TOKEN } from '../db/db.module'

@Controller('health')
export class HealthController {
  constructor(@Inject(BASE_DB_TOKEN) private readonly db: Db) {}

  @Get()
  async check() {
    try {
      await this.db.execute(sql`SELECT 1`)
    } catch {
      throw new ServiceUnavailableException('Database unreachable')
    }
    return { status: 'ok' }
  }
}
