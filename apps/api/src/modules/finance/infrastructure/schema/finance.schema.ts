import { pgSchema } from 'drizzle-orm/pg-core'

export const financeSchema = pgSchema('finance')

// TODO: define tables for finance module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
