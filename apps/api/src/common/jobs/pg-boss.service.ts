import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import PgBoss from 'pg-boss'

export const JOB_DOCUMENTS_GENERATE = 'documents.generate'
export const JOB_NOTIFICATIONS_SEND_EMAIL = 'notifications.send-email'

@Injectable()
export class PgBossService implements OnApplicationBootstrap, OnApplicationShutdown {
  private boss: PgBoss

  constructor(private readonly databaseUrl: string) {
    this.boss = new PgBoss(databaseUrl)
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start()
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop()
  }

  async enqueue<T extends object>(
    jobName: string,
    data: T,
    opts: PgBoss.SendOptions = {},
  ): Promise<string> {
    const id = await this.boss.send(jobName, data, opts)
    return id ?? ''
  }

  registerWorker<T extends object>(
    jobName: string,
    handler: (job: PgBoss.Job<T>) => Promise<void>,
  ): void {
    void this.boss.work<T>(jobName, handler)
  }
}
