import { pgSchema } from 'drizzle-orm/pg-core'

export const goalsSchema = pgSchema('goals')

// TODO: define tables for goals module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
