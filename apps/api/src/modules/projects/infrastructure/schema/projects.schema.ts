import { pgSchema } from 'drizzle-orm/pg-core'

export const projectsSchema = pgSchema('projects')

// TODO: define tables for projects module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
