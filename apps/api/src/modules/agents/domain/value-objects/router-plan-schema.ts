/**
 * RouterPlan JSON Schema — placeholder for Task 7.
 *
 * Task 9 (RouterPlan Zod schema + validator) will derive the canonical JSON
 * Schema from a Zod definition and export it here, replacing this constant.
 *
 * The RouterPromptBuilder imports ROUTER_PLAN_JSON_SCHEMA from this file so
 * that the import path remains stable across the T7 → T9 handover.
 *
 * Shape mirrors Plan 02 §4:
 *   - topology: execution topology ("sequential" | "parallel" | "single")
 *   - intent_slug: the classified intent slug (or "unclassified")
 *   - flow_id: UUID stamped on this plan for tracing
 *   - phase1: first-pass sub-agent invocations
 *   - phase2?: optional second-pass (parallel or follow-up agents)
 *   - disambiguation?: when registry cannot cover the utterance
 */

/** Canonical JSON Schema for a RouterPlan. T9 replaces this with a Zod-derived schema. */
export const ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'RouterPlan',
  description:
    'The structured plan emitted by the router LLM. ' +
    'Emit exactly one RouterPlan JSON object per turn. Do not wrap in markdown fences.',
  type: 'object',
  required: ['topology', 'intent_slug', 'flow_id', 'phase1'],
  additionalProperties: false,
  properties: {
    topology: {
      type: 'string',
      enum: ['sequential', 'parallel', 'single'],
      description: 'Execution topology of this plan.',
    },
    intent_slug: {
      type: 'string',
      description:
        'The classified intent slug from the intent registry (e.g. "planner.list-my-tasks") ' +
        'or the literal "unclassified" when no intent covers the utterance.',
    },
    flow_id: {
      type: 'string',
      format: 'uuid',
      description: 'UUID stamped on every plan for distributed tracing and replay.',
    },
    phase1: {
      type: 'array',
      description: 'First-pass sub-agent invocations.',
      items: {
        type: 'object',
        required: ['sub_agent_key', 'input'],
        additionalProperties: false,
        properties: {
          sub_agent_key: {
            type: 'string',
            description: 'The sub-agent key (e.g. "planner.read-only").',
          },
          input: {
            type: 'object',
            description: 'Input payload matching the sub-agent inputSchema.',
          },
        },
      },
    },
    phase2: {
      type: 'array',
      description: 'Optional second-pass sub-agent invocations (parallel or follow-up).',
      items: {
        type: 'object',
        required: ['sub_agent_key', 'input'],
        additionalProperties: false,
        properties: {
          sub_agent_key: { type: 'string' },
          input: { type: 'object' },
        },
      },
    },
    disambiguation: {
      type: 'object',
      description:
        'Present only when the registry cannot cover the utterance and disambiguation is needed.',
      required: ['question'],
      additionalProperties: false,
      properties: {
        question: {
          type: 'string',
          description: 'A clarifying question to ask the user.',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of suggested responses.',
        },
      },
    },
  },
}
