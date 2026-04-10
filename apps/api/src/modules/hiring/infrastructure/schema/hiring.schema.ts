import { pgSchema } from 'drizzle-orm/pg-core'

export const hiringSchema = pgSchema('hiring')

// TODO: define tables for hiring module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
