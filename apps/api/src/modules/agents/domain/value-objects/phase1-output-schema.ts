/**
 * Canonical phase-1 output schema.
 *
 * This is the contract between the router's phase-1 classification step and
 * every sub-agent's phase-2 input. Every sub-agent's `inputSchema` MUST
 * accept (at minimum) the fields named here as REQUIRED.
 *
 * MVP baseline: the original user utterance is always present.
 *
 * Additional phase-1-enriched fields (L3 preferences, taint tags, sanitizer
 * outputs) may be added in future plans; sub-agents consuming them must
 * declare them in their own inputSchema explicitly.
 *
 * Plan 02 §3 + R-02.5 + R-02.10 contract.
 */

import { z } from 'zod'

export const Phase1OutputSchema = z.object({
  utterance: z.string().min(1),
})

export type Phase1Output = z.infer<typeof Phase1OutputSchema>
