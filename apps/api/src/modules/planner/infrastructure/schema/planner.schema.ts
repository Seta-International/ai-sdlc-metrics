import { pgSchema } from 'drizzle-orm/pg-core'

export const plannerSchema = pgSchema('planner')

// TODO: define tables for planner module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
