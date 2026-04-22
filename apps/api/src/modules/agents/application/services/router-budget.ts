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
 *
 * Override via ROUTER_PROMPT_TOKEN_CEILING env var (must be a positive integer).
 * Invalid values (non-numeric, negative, zero) fall back to the default silently.
 */
function resolveCeiling(): number {
  const raw = process.env['ROUTER_PROMPT_TOKEN_CEILING']
  if (!raw) return 120_000
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 120_000
  return parsed
}

// Non-secret config sourcing: ROUTER_PROMPT_TOKEN_CEILING is tunable infrastructure
// config (not a secret) and may live in the ECS task-definition environment block
// or be overridden via a deployment config file. It is safe to commit a default
// value here. Follows the same env-override pattern as ROUTER_LLM_TIMEOUT_MS.
export const ROUTER_PROMPT_TOKEN_CEILING = resolveCeiling()

/**
 * Default LLM call timeout in milliseconds.
 *
 * If the OpenAI API (or any configured provider) does not respond within this
 * window, the RouterLlmClient aborts the request and returns
 * `{ kind: 'malformed', error }` so the orchestrator can fall back to the
 * retry / disambiguation path instead of blocking the request-scoped DB client
 * indefinitely.
 *
 * Override via ROUTER_LLM_TIMEOUT_MS env var (must be a positive integer, in ms).
 * Invalid values fall back to the default silently.
 * Default: 30 000 ms (30 seconds).
 */
function resolveTimeout(): number {
  const raw = process.env['ROUTER_LLM_TIMEOUT_MS']
  if (!raw) return 30_000
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 30_000
  return parsed
}

export const ROUTER_LLM_TIMEOUT_MS = resolveTimeout()
