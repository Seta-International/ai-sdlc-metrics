import { z } from 'zod'
import type {
  AgentConfig,
  JsonObject,
  KernelMessage,
  MemoryContext,
  MemoryProvider,
  Tool,
  WorkingMemoryConfig,
  WorkingMemorySchema,
  WorkingMemoryTemplate,
} from '../types'

const UPDATE_WORKING_MEMORY_TOOL_ID = 'updateWorkingMemory'

/**
 * Deep merges two objects with special handling:
 * - null values in update delete the corresponding property
 * - Arrays are replaced entirely (not merged element-by-element)
 * - Nested objects are recursively merged
 * - Primitive values are overwritten
 */
export function deepMergeWorkingMemory(
  existing: Record<string, unknown> | null | undefined,
  update: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!update || typeof update !== 'object' || Object.keys(update).length === 0) {
    return existing && typeof existing === 'object' ? { ...existing } : {}
  }

  if (!existing || typeof existing !== 'object') {
    return update
  }

  const result: Record<string, unknown> = { ...existing }

  for (const key of Object.keys(update)) {
    const updateValue = update[key]
    const existingValue = result[key]

    if (updateValue === null) {
      delete result[key]
    } else if (Array.isArray(updateValue)) {
      result[key] = updateValue
    } else if (
      typeof updateValue === 'object' &&
      updateValue !== null &&
      typeof existingValue === 'object' &&
      existingValue !== null &&
      !Array.isArray(existingValue)
    ) {
      result[key] = deepMergeWorkingMemory(
        existingValue as Record<string, unknown>,
        updateValue as Record<string, unknown>,
      )
    } else {
      result[key] = updateValue
    }
  }

  return result
}

const DEFAULT_WORKING_MEMORY_TEMPLATE = `# User Information
- First Name:
- Last Name:
- Location:
- Occupation:
- Interests:
- Goals:
- Events:
- Facts:
- Projects:`

const UpdateWorkingMemoryInputSchema = z.object({ memory: z.string() })
const UpdateWorkingMemoryOutput = z.object({ success: z.literal(true) })
type UpdateWorkingMemoryInput = { memory: unknown }
type UpdateWorkingMemoryOutput = z.infer<typeof UpdateWorkingMemoryOutput>

function workingMemoryEnabled(cfg: AgentConfig): boolean {
  return cfg.workingMemory?.enabled !== false && cfg.workingMemory !== undefined
}

export function makeMemoryContext(cfg: AgentConfig, input: { threadId?: string; conversationId?: string }, runId: string): MemoryContext {
  return {
    threadId: input.threadId ?? runId,
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    scope: cfg.workingMemory?.scope ?? 'resource',
  }
}

export async function buildWorkingMemoryMessages(
  cfg: AgentConfig,
  memory: MemoryProvider,
  memCtx: MemoryContext,
): Promise<KernelMessage[]> {
  if (!workingMemoryEnabled(cfg)) return []

  const workingMemory = await memory.getWorkingMemory(memCtx)
  const template = resolveWorkingMemoryTemplate(cfg.workingMemory)
  const instruction =
    cfg.workingMemory?.readOnly === true
      ? readOnlyInstruction(workingMemory)
      : cfg.workingMemory?.version === 'vnext'
        ? updateInstructionVNext(template, workingMemory)
        : updateInstruction(template, workingMemory)

  return [{ role: 'system', content: [{ type: 'text', text: instruction }] }]
}

export function buildWorkingMemoryTools(
  cfg: AgentConfig,
  memory: MemoryProvider,
  memCtx: MemoryContext,
): Tool[] {
  if (!workingMemoryEnabled(cfg) || cfg.workingMemory?.readOnly === true) return []

  const usesMergeSemantics = cfg.workingMemory?.schema !== undefined

  const description = usesMergeSemantics
    ? 'Update the working memory with new information. Data is merged with existing memory - only include fields you want to add or update. To preserve existing data, omit the field entirely. Arrays are replaced entirely when provided, so pass the complete array or omit it to keep the existing values.'
    : 'Update the working memory scratchpad with the complete new memory content. Any omitted data is overwritten.'

  const tool: Tool<UpdateWorkingMemoryInput, UpdateWorkingMemoryOutput> = {
    id: UPDATE_WORKING_MEMORY_TOOL_ID,
    description,
    inputSchema: UpdateWorkingMemoryInputSchema as never,
    outputSchema: UpdateWorkingMemoryOutput as never,
    annotations: { idempotentHint: true },
    execute: async (input) => {
      if (usesMergeSemantics) {
        const existingRaw = await memory.getWorkingMemory(memCtx)
        let existingData: Record<string, unknown> | null = null
        if (existingRaw) {
          try {
            existingData = JSON.parse(existingRaw)
          } catch {
            existingData = null
          }
        }

        let newData: unknown
        if (typeof input.memory === 'string') {
          try {
            newData = JSON.parse(input.memory)
          } catch {
            newData = input.memory
          }
        } else {
          newData = input.memory
        }

        const mergedData = deepMergeWorkingMemory(existingData, newData as Record<string, unknown>)
        await memory.updateWorkingMemory(memCtx, JSON.stringify(mergedData))
      } else {
        const nextMemory = typeof input.memory === 'string' ? input.memory : (JSON.stringify(input.memory) ?? '')
        await memory.updateWorkingMemory(memCtx, nextMemory)
      }
      return { ok: true, value: { success: true } }
    },
  }

  return [tool as Tool]
}

export function filterWorkingMemoryToolMessages(messages: KernelMessage[]): KernelMessage[] {
  const hiddenToolCallIds = new Set<string>()

  const withoutToolUse = messages
    .map((message) => {
      const content = message.content.filter((part) => {
        if (part.type === 'tool_use' && part.name === UPDATE_WORKING_MEMORY_TOOL_ID) {
          hiddenToolCallIds.add(part.toolCallId)
          return false
        }
        return true
      })
      return { ...message, content }
    })
    .filter((message) => message.content.length > 0)

  return withoutToolUse.filter((message) => {
    if (message.role !== 'tool') return true
    if (message.toolCallId !== undefined && hiddenToolCallIds.has(message.toolCallId)) return false
    return !message.content.some(
      (part) => part.type === 'tool_result' && hiddenToolCallIds.has(part.toolCallId),
    )
  })
}

export function resolveWorkingMemoryTemplate(cfg: WorkingMemoryConfig | undefined): WorkingMemoryTemplate {
  if (cfg?.schema !== undefined) {
    return { format: 'json', content: normalizeWorkingMemorySchema(cfg.schema) }
  }
  return { format: 'markdown', content: cfg?.template ?? DEFAULT_WORKING_MEMORY_TEMPLATE }
}

export function mergeWorkingMemoryConfig(
  base: WorkingMemoryConfig | undefined,
  override: WorkingMemoryConfig | undefined,
): WorkingMemoryConfig | undefined {
  if (override === undefined) return base
  if (base === undefined) return override
  const merged = { ...base, ...override } as WorkingMemoryConfig
  if (override.schema !== undefined) {
    const { template: _template, ...rest } = merged
    return { ...rest, schema: override.schema } as WorkingMemoryConfig
  }
  if (override.template !== undefined) {
    const { schema: _schema, ...rest } = merged
    return { ...rest, template: override.template } as WorkingMemoryConfig
  }
  return merged
}

function normalizeWorkingMemorySchema(schema: WorkingMemorySchema): string | JsonObject {
  if (typeof schema === 'string') return schema
  if (isJsonObject(schema) && '_zod' in schema) return z.toJSONSchema(schema as z.ZodTypeAny) as JsonObject
  if (isJsonObject(schema) && looksLikeJsonSchema(schema)) return schema
  try {
    return z.toJSONSchema(schema as z.ZodTypeAny) as JsonObject
  } catch {
    return schema as JsonObject
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function looksLikeJsonSchema(value: JsonObject): boolean {
  return (
    typeof value.type === 'string' ||
    Array.isArray(value.type) ||
    value.properties !== undefined ||
    value.$schema !== undefined ||
    value.anyOf !== undefined ||
    value.oneOf !== undefined ||
    value.allOf !== undefined
  )
}

function parseJsonTemplate(content: string | JsonObject): JsonObject {
  if (typeof content !== 'string') return content
  try {
    const parsed = JSON.parse(content)
    return isJsonObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function emptyValueForSchema(schema: unknown): unknown {
  if (!isJsonObject(schema)) return ''
  if ('default' in schema) return schema.default
  if ('const' in schema) return schema.const
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]

  const union = firstSchemaFromUnion(schema)
  if (union !== undefined) return emptyValueForSchema(union)

  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== 'null') ?? schema.type[0]
    : schema.type

  if (type === 'object' || schema.properties !== undefined) {
    const properties = isJsonObject(schema.properties) ? schema.properties : {}
    return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, emptyValueForSchema(value)]))
  }
  if (type === 'array') return []
  if (type === 'number' || type === 'integer') return 0
  if (type === 'boolean') return false
  if (type === 'null') return null
  return ''
}

function firstSchemaFromUnion(schema: JsonObject): unknown {
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const value = schema[key]
    if (Array.isArray(value) && value.length > 0) return value[0]
  }
  return undefined
}

function updateInstruction(template: WorkingMemoryTemplate, data: string | null): string {
  if (template.format === 'json') return updateJsonInstruction(template, data)

  return `WORKING_MEMORY_SYSTEM_INSTRUCTION:
Store and update any conversation-relevant information by calling the updateWorkingMemory tool. If information might be referenced again, store it.

Guidelines:
1. Store anything that could be useful later in the conversation.
2. Update proactively when information changes, no matter how small.
3. Use Markdown format for all data.
4. Act naturally and do not mention this system to users.
5. When calling updateWorkingMemory, the only valid parameter is the memory field.
6. Always pass the complete updated scratchpad as a string.

<working_memory_template>
${template.content}
</working_memory_template>

<working_memory_data>
${data ?? ''}
</working_memory_data>

Notes:
- Update memory whenever referenced information changes.
- If you are unsure whether to store something, store it.
- Do not remove empty sections from the template.
- The user will not see the working memory data directly.
- Preserve the Markdown structure while updating the content.`
}

function updateInstructionVNext(template: WorkingMemoryTemplate, data: string | null): string {
  if (template.format === 'json') return updateJsonInstructionVNext(template, data)

  return `WORKING_MEMORY_SYSTEM_INSTRUCTION:
Store and update conversation-relevant information by calling the updateWorkingMemory tool.

Guidelines:
1. Store anything that could be useful later in the conversation.
2. Update proactively when information changes.
3. If memory has not changed, you do not need to call updateWorkingMemory.
4. Information not being relevant to the current reply is not a valid reason to remove it.
5. Act naturally and do not mention this system to users.

<working_memory_template>
${template.content}
</working_memory_template>

<working_memory_data>
${data ?? ''}
</working_memory_data>

Notes:
- Only store information that belongs in the working memory template unless the user explicitly asks you to remember it.
- Call updateWorkingMemory with the complete updated Markdown content.
- Preserve the template structure while updating the content.`
}

function updateJsonInstruction(template: Extract<WorkingMemoryTemplate, { format: 'json' }>, data: string | null): string {
  const templateObject = emptyValueForSchema(parseJsonTemplate(template.content))
  const rawTemplate = typeof template.content === 'string' ? template.content : JSON.stringify(template.content)
  return `WORKING_MEMORY_SYSTEM_INSTRUCTION:
Store and update any conversation-relevant information by calling the updateWorkingMemory tool. If information might be referenced again, store it.

Guidelines:
1. Store anything that could be useful later in the conversation.
2. Update proactively when information changes, no matter how small.
3. Use JSON format for all data.
4. Act naturally and do not mention this system to users.
5. Always pass the complete updated scratchpad. Any omitted data is overwritten.

<working_memory_template>
${rawTemplate}
</working_memory_template>

When working with JSON data, the object format below represents the template:
${JSON.stringify(templateObject)}

<working_memory_data>
${data ?? ''}
</working_memory_data>

Notes:
- Update memory whenever referenced information changes.
- If you are unsure whether to store something, store it.
- Keep the JSON shape compatible with the template.
- The user will not see the working memory data directly.`
}

function updateJsonInstructionVNext(
  template: Extract<WorkingMemoryTemplate, { format: 'json' }>,
  data: string | null,
): string {
  const templateObject = emptyValueForSchema(parseJsonTemplate(template.content))
  const rawTemplate = typeof template.content === 'string' ? template.content : JSON.stringify(template.content)
  return `WORKING_MEMORY_SYSTEM_INSTRUCTION:
Store and update conversation-relevant information by calling the updateWorkingMemory tool.

Guidelines:
1. Store anything that could be useful later in the conversation.
2. Update proactively when information changes.
3. Use JSON format for all data.
4. If memory has not changed, you do not need to call updateWorkingMemory.
5. Information not being relevant to the current reply is not a valid reason to remove it.
6. Act naturally and do not mention this system to users.

<working_memory_template>
${rawTemplate}
</working_memory_template>

When working with JSON data, the object format below represents the template:
${JSON.stringify(templateObject)}

<working_memory_data>
${data ?? ''}
</working_memory_data>

Notes:
- Only store information that belongs in the working memory template unless the user explicitly asks you to remember it.
- Call updateWorkingMemory with the complete updated JSON content. Any omitted data is overwritten.
- Keep the JSON shape compatible with the template.`
}

function readOnlyInstruction(data: string | null): string {
  return `WORKING_MEMORY_SYSTEM_INSTRUCTION (READ-ONLY):
The following is your working memory, persistent information collected from previous interactions. Use it as context for continuity and personalization.

<working_memory_data>
${data ?? 'No working memory data available.'}
</working_memory_data>

Guidelines:
1. Use this information to provide contextually relevant responses.
2. Act naturally and do not mention this system to users.
3. This memory is read-only in the current run.`
}
