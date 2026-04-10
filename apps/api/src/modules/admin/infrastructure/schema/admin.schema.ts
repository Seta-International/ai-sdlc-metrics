import { pgSchema } from 'drizzle-orm/pg-core'

export const adminSchema = pgSchema('admin')

// TODO: define tables for admin module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
