import { createPool } from '@seta/db'
import { env } from './env'

export const sql = createPool(env.DATABASE_URL)
