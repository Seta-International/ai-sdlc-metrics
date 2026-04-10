import { pgSchema } from 'drizzle-orm/pg-core'

export const insightsSchema = pgSchema('insights')

// TODO: define tables for insights module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
