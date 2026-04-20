import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { PgBoss, type Job, type SendOptions, type WorkOptions } from 'pg-boss'

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
    opts: SendOptions = {},
  ): Promise<string> {
    const id = await this.boss.send(jobName, data, opts)
    return id ?? ''
  }

  registerWorker<T extends object>(
    jobName: string,
    handler: (jobs: Job<T>[]) => Promise<void>,
  ): void {
    void this.boss.createQueue(jobName).then(() => this.boss.work<T>(jobName, handler))
  }

  /**
   * Idempotently registers a pg-boss cron schedule for the given job name.
   * Always uses UTC timezone. Safe to call on every module init — pg-boss upserts by name.
   */
  async schedule(
    name: string,
    cron: string,
    opts: Parameters<PgBoss['schedule']>[3] = {},
  ): Promise<void> {
    await this.boss.createQueue(name)
    await this.boss.schedule(name, cron, null, { tz: 'UTC', ...opts })
  }

  /**
   * Registers a worker for a scheduled (or ad-hoc) job queue with optional work options
   * (e.g. teamSize, teamConcurrency). Use this in preference to registerWorker when you
   * need to pass WorkOptions. The existing registerWorker is kept for backward compatibility.
   */
  registerScheduledWorker<T extends object>(
    jobName: string,
    handler: (jobs: Job<T>[]) => Promise<void>,
    opts: WorkOptions = {},
  ): void {
    void this.boss.createQueue(jobName).then(() => this.boss.work<T>(jobName, opts, handler))
  }
}
