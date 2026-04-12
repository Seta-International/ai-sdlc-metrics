import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectsRouterService } from './projects-router.service'

describe('ProjectsRouterService', () => {
  let commandBus: { execute: ReturnType<typeof vi.fn> }
  let queryBus: { execute: ReturnType<typeof vi.fn> }
  let service: ProjectsRouterService

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    queryBus = { execute: vi.fn() }
    service = new ProjectsRouterService(commandBus as never, queryBus as never)
  })

  describe('getInstance()', () => {
    it('throws if called before onModuleInit', () => {
      // Do NOT call onModuleInit — instance may be set from a prior test run,
      // but because vitest isolates modules per file we rely on a fresh module.
      // We reset by creating a new service without calling onModuleInit and
      // testing the static throws behaviour by verifying the contract exists.
      // The cleanest approach: access the private singleton via module re-import.
      // Instead, we verify the guard by calling getInstance on a module that
      // has never had onModuleInit called.
      //
      // Because the singleton is module-level state we need to work around it.
      // We test it as the FIRST case in this describe block before any
      // onModuleInit call can set it.
      //
      // Since beforeEach creates a new service but does NOT call onModuleInit,
      // if no prior test called onModuleInit we expect a throw.
      // We guarantee this by ordering this test first and checking the throw.
      //
      // NOTE: this test is order-dependent; it must run before any
      // 'sets the singleton' test. Vitest runs tests in definition order.
      expect(() => ProjectsRouterService.getInstance()).toThrow(
        'ProjectsRouterService not initialized',
      )
    })

    it('returns the singleton after onModuleInit', () => {
      service.onModuleInit()
      const got = ProjectsRouterService.getInstance()
      expect(got).toBe(service)
    })

    it('returns the most recently initialized singleton', () => {
      const service2 = new ProjectsRouterService(commandBus as never, queryBus as never)
      service.onModuleInit()
      service2.onModuleInit()
      expect(ProjectsRouterService.getInstance()).toBe(service2)
    })
  })

  describe('onModuleInit()', () => {
    it('sets the module-level singleton to the current instance', () => {
      service.onModuleInit()
      expect(ProjectsRouterService.getInstance()).toBe(service)
    })
  })

  describe('command()', () => {
    it('delegates to CommandBus.execute and returns the result', async () => {
      service.onModuleInit()
      const fakeCommand = { type: 'DoSomething' }
      commandBus.execute.mockResolvedValue('command-result')

      const result = await service.command(fakeCommand)

      expect(commandBus.execute).toHaveBeenCalledOnce()
      expect(commandBus.execute).toHaveBeenCalledWith(fakeCommand)
      expect(result).toBe('command-result')
    })
  })

  describe('query()', () => {
    it('delegates to QueryBus.execute and returns the result', async () => {
      service.onModuleInit()
      const fakeQuery = { type: 'GetSomething' }
      queryBus.execute.mockResolvedValue('query-result')

      const result = await service.query(fakeQuery)

      expect(queryBus.execute).toHaveBeenCalledOnce()
      expect(queryBus.execute).toHaveBeenCalledWith(fakeQuery)
      expect(result).toBe('query-result')
    })
  })
})
