import { pgSchema } from 'drizzle-orm/pg-core'

export const insightsSchema = pgSchema('insights')

// No tables — insights is a proxy-only module that delegates all queries to Cube.js.
// See CLAUDE.md: "insights | Analytics proxy to Cube.js — no persistent tables"
