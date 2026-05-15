type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
type SqlWithArray = DbSql & { array(arr: unknown[]): unknown[] }

export interface AgentProfileSeed {
  slug: string
  name: string
  description: string | null
  instructions: string
  model: string
  toolIds: string[]
  workingMemoryTemplate: string | null
}

export async function seedAgentProfiles(
  sql: SqlWithArray,
  seeds: AgentProfileSeed[],
): Promise<void> {
  for (const p of seeds) {
    await sql`
      INSERT INTO agent.agent_profiles
        (slug, tenant_id, name, description, instructions, model, tool_ids,
         working_memory_template, status)
      VALUES
        (${p.slug}, NULL, ${p.name}, ${p.description ?? null}, ${p.instructions},
         ${p.model}, ${sql.array(p.toolIds)}, ${p.workingMemoryTemplate ?? null}, 'published')
      ON CONFLICT DO NOTHING
    `
  }
}
