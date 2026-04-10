import type { Db } from '@future/db'

export function createRequestBoundDbProxy(baseDb: Db, getRequestDb: () => Db | null): Db {
  return new Proxy(baseDb, {
    get(target, prop, receiver) {
      const activeDb = getRequestDb() ?? target
      const value = Reflect.get(activeDb, prop, receiver)

      if (typeof value === 'function') {
        return value.bind(activeDb)
      }

      return value
    },
  }) as Db
}
