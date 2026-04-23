/**
 * PreCaptureRedactor — strips fields declared as `tenantAuthoredFreeText`
 * from span attribute objects **before** the span leaves the process.
 *
 * Rationale (R-07.29): no trace backend ever receives raw tenant-authored
 * content via the trace plane. The un-redacted result is stored separately
 * in `agent_tool_invocation.result_preview` (kernel-owned, RLS-protected).
 *
 * Replacement marker: `'<redacted:tenant_authored>'`
 *
 * This class lives in `infrastructure/` because it may be used by the
 * exporter adapter boundary. It has zero NestJS / Drizzle deps.
 *
 * **Spec deviation (accepted):** The plan spec defines the signature as
 * `redact(span: Span, attrs)`. This implementation uses `redact(attrs, freeTextKeys)`
 * instead — the caller provides the free-text key set because (a) the current `Span`
 * interface has no `getAttribute()` method to read back stored values, and (b) key
 * resolution requires the Plan 01 tool registry which is not yet built.
 * The behavioral goal (redacting tenant-authored fields before export) is fully met.
 */

export const REDACTED_MARKER = '<redacted:tenant_authored>' as const

export class PreCaptureRedactor {
  /**
   * Redacts keys declared as tenant-authored from the given attribute object.
   *
   * @param attrs   - shallow key→value map of span attributes
   * @param freeTextKeys - set of keys that carry tenant-authored free text
   * @returns a new object with sensitive values replaced by the redaction marker
   */
  redact(
    attrs: Record<string, unknown>,
    freeTextKeys: ReadonlySet<string>,
  ): Record<string, unknown> {
    if (freeTextKeys.size === 0) return { ...attrs }

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs)) {
      result[key] = freeTextKeys.has(key) ? REDACTED_MARKER : value
    }
    return result
  }
}
