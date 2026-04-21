/**
 * Router budget constants — Plan 02 Task 8.
 *
 * Single canonical location for the token-ceiling threshold used by the
 * orchestrator (T10) to decide whether to invoke SubAgentRetriever.
 *
 * The threshold is deliberately conservative:
 *   - GPT-5.4 context window: 1 M tokens.
 *   - Response budget (router plan JSON): ~500 tokens.
 *   - Safety headroom for dynamic developer-message content: ~880 K tokens.
 *   - Default threshold: 120 K tokens — easily within the context window even
 *     if multiple sub-agent descriptions grow verbose.
 *
 * Tune by setting the ROUTER_PROMPT_TOKEN_CEILING env var in production. The
 * orchestrator reads this constant; override it there rather than changing the
 * default here.
 */

/**
 * Default token ceiling for the rendered router prompt.
 *
 * If the estimated prompt size exceeds this value, the orchestrator must call
 * `SubAgentRetriever.retrieve(...)` to narrow the sub-agent set before
 * rendering the prompt.
 *
 * Estimated via character-based heuristic: ceil(totalChars / 4).
 * See SubAgentRetriever.estimateTokens for the full computation.
 */
export const ROUTER_PROMPT_TOKEN_CEILING = 120_000
