import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { CarryOverMyDayCommand } from './carry-over.command'
import { CarryOverMyDayHandler } from './carry-over.handler'
import type { IMyDayRepository } from '../../../domain/repositories/my-day.repository'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'

describe('CarryOverMyDayHandler', () => {
  let handler: CarryOverMyDayHandler
  let repo: {
    insertMany: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    findForDate: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    markTaskCompleted: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    repo = {
      insertMany: vi.fn().mockResolvedValue(0),
      add: vi.fn(),
      findForDate: vi.fn(),
      remove: vi.fn(),
      markTaskCompleted: vi.fn(),
    }
    handler = new CarryOverMyDayHandler(repo as unknown as IMyDayRepository)
  })

  it('returns carriedCount = 0 when taskIds is empty, skipping the repo call', async () => {
    const result = await handler.execute(
      new CarryOverMyDayCommand(ACTOR_ID, TENANT_ID, '2026-04-19', '2026-04-20', []),
    )
    expect(result).toEqual({ carriedCount: 0 })
    expect(repo.insertMany).not.toHaveBeenCalled()
  })

  it('forwards task ids to the repo and returns the inserted count', async () => {
    repo.insertMany.mockResolvedValue(2)

    const result = await handler.execute(
      new CarryOverMyDayCommand(ACTOR_ID, TENANT_ID, '2026-04-19', '2026-04-20', ['t1', 't2']),
    )

    expect(result).toEqual({ carriedCount: 2 })
    expect(repo.insertMany).toHaveBeenCalledOnce()
    const rows = repo.insertMany.mock.calls[0][0] as Array<{
      actorId: string
      tenantId: string
      taskId: string
      addedDate: string
    }>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
      taskId: 't1',
      addedDate: '2026-04-20',
    })
    expect(rows[1]!.taskId).toBe('t2')
  })

  it('rejects fromDate >= toDate', async () => {
    await expect(
      handler.execute(
        new CarryOverMyDayCommand(ACTOR_ID, TENANT_ID, '2026-04-20', '2026-04-20', ['t1']),
      ),
    ).rejects.toThrow(/fromDate must be before toDate/)
    expect(repo.insertMany).not.toHaveBeenCalled()
  })

  it('rejects invalid fromDate format', async () => {
    await expect(
      handler.execute(new CarryOverMyDayCommand(ACTOR_ID, TENANT_ID, 'bad', '2026-04-20', ['t1'])),
    ).rejects.toThrow(BadRequestException)
    expect(repo.insertMany).not.toHaveBeenCalled()
  })

  it('rejects invalid toDate format', async () => {
    await expect(
      handler.execute(new CarryOverMyDayCommand(ACTOR_ID, TENANT_ID, '2026-04-19', 'bad', ['t1'])),
    ).rejects.toThrow(BadRequestException)
    expect(repo.insertMany).not.toHaveBeenCalled()
  })
})
