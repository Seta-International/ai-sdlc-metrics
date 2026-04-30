/**
 * IntentDescriptor — value object for a single intent-slug declaration.
 *
 * Imported by:
 *   • Module-local intent files (e.g. modules/planner/agent/intents/*.ts)
 *     via the public re-export in modules/agents/declare.ts.
 *   • IntentRegistry (infrastructure) — validates and stores descriptors.
 *   • Task 9 RouterPlan validator — uses the slug to stamp child spans.
 *
 * Lives in domain/value-objects/ because it is a pure type — zero NestJS,
 * zero Drizzle, zero external dependencies. Downstream modules import it
 * only via the `declare.ts` re-export, keeping DDD cross-module boundaries
 * clean.
 */

export type IntentDescriptor = {
  /**
   * Globally unique slug identifying this intent.
   *
   * Format: `domain.name(.name)+` — one or more dot-separated segments.
   * Regex: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/
   *
   * Exception: the literal slug `'unclassified'` is allowed without a
   * domain prefix (fallback bucket, owned by the agents module).
   */
  slug: string

  /**
   * Module/domain that owns this intent (e.g. `'planner'`, `'people'`).
   * Used by IntentRegistry to enforce domain-prefix consistency at boot.
   */
  domain: string

  /**
   * One-liner description seeded into the router prompt.
   * Audience: the LLM classifier — write for the model, not for humans.
   */
  description: string
}
