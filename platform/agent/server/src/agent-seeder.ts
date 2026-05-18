import type { DbSql } from '@seta/db'
import { drizzle } from 'drizzle-orm/postgres-js'
import { agentProfiles } from './schema'

export interface AgentProfileSeed {
  slug: string
  name: string
  description: string | null
  instructions: string
  model: string
  toolIds: string[]
  workingMemoryTemplate: string | null
}

export async function seedAgentProfiles(sql: DbSql, seeds: AgentProfileSeed[]): Promise<void> {
  const db = drizzle(sql)
  for (const p of seeds) {
    await db
      .insert(agentProfiles)
      .values({
        slug: p.slug,
        tenantId: null,
        name: p.name,
        description: p.description,
        instructions: p.instructions,
        model: p.model,
        toolIds: p.toolIds,
        workingMemoryTemplate: p.workingMemoryTemplate,
        status: 'published',
      })
      .onConflictDoNothing()
  }
}
