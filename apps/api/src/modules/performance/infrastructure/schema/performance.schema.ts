import { pgSchema } from 'drizzle-orm/pg-core'

export const performanceSchema = pgSchema('performance')

// TODO: define tables for performance module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
