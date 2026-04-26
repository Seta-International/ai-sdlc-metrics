// file-parser.ts — regex-based static parser for agent-authoring source files.
//
// Design constraints:
//   - No TS compiler API, no dynamic import — regex + string scanning only.
//   - No imports from apps/ or packages/ — this tool is standalone.
//   - Must complete in < 200ms per file.

import type {
  OverrideComment,
  ParsedToolMeta,
  ParsedSubAgent,
  ParsedIntent,
  ParsedFlowPolicy,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split source into lines once; used for line-number lookups. */
function lines(source: string): string[] {
  return source.split('\n')
}

/** Return 1-based line number corresponding to a character offset in source. */
function lineAtOffset(source: string, offset: number): number {
  const slice = source.slice(0, offset)
  return slice.split('\n').length
}

/**
 * Extract the value of a string literal from an object literal fragment.
 * Handles single-quotes, double-quotes, and template literals.
 * Handles backslash-escaped characters inside the string (e.g. `don\'t`).
 *
 * E.g., given source starting at a .meta({...}) block, extract key "whenToUse".
 */
function extractStringField(fragment: string, key: string): string | undefined {
  // Match: key: 'value'  /  key: "value"  /  key: `value`
  // Also handles multi-line: key:\n    'value'
  // (?:\\.|[^'\\])* — match either an escape sequence (\X) or any non-quote non-backslash char
  const pattern = new RegExp(
    `\\b${key}\\s*:\\s*(?:'((?:\\\\.|[^'\\\\])*)'|"((?:\\\\.|[^"\\\\])*)"|` +
      '`((?:\\\\.|[^`\\\\])*)`)',
    's',
  )
  const m = pattern.exec(fragment)
  if (!m) return undefined
  return (m[1] ?? m[2] ?? m[3] ?? '').trim()
}

/**
 * Balanced-brace extractor: given source and the offset of an opening `{` (or `[`),
 * return the contents up to (not including) the matching closing delimiter.
 * Returns null if the braces are unbalanced.
 *
 * String literals (single-quote, double-quote, backtick) are skipped so that
 * brace characters inside strings (e.g. `'Use when { tenant } needs help'`) do
 * not affect the depth counter.
 */
function extractBalanced(
  source: string,
  openOffset: number,
  open = '{',
  close = '}',
): string | null {
  let depth = 0
  let i = openOffset
  const start = openOffset + 1
  while (i < source.length) {
    const ch = source[i]
    // Skip over string literals to avoid counting braces inside them
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2 // skip escaped character
          continue
        }
        if (source[i] === quote) break
        i++
      }
      // i now points at the closing quote; fall through to i++ below
    } else if (ch === open) {
      depth++
    } else if (ch === close) {
      depth--
      if (depth === 0) return source.slice(start, i)
    }
    i++
  }
  return null
}

/** Negative-signal words that mark an example as a negative use-case. */
const NEGATIVE_WORDS = ['not', "don't", 'never', 'outside', 'instead', 'avoid', 'without']

function isNegativeExample(input: string, callArgsRaw: string): boolean {
  const lc = input.toLowerCase()
  if (NEGATIVE_WORDS.some((w) => lc.includes(w))) return true
  // callArgs is empty {} — extractBalanced returns the content between braces,
  // so an empty object returns an empty/whitespace-only string
  if (callArgsRaw.trim() === '') return true
  return false
}

// ---------------------------------------------------------------------------
// parseOverrideComments
// ---------------------------------------------------------------------------

/**
 * Parse override comments from source text.
 * Pattern: `// lint-override: <rule-id> — <justification>` (em-dash or regular dash)
 * Justification must not be empty.
 */
export function parseOverrideComments(source: string): OverrideComment[] {
  const results: OverrideComment[] = []
  // Match: // lint-override: R-15.N — justification
  // Rule id pattern: word chars, digits, dots, dashes
  // Rule-id must contain at least one digit (e.g. R-15.1, R-15.10).
  // Separator is an em-dash (—), en-dash (–), or a regular dash preceded by a space.
  // We use ` - ` (space-dash-space) or `—` / `–` without spaces to avoid matching
  // the dash inside rule IDs like "R-15.1".
  const pattern = /^[ \t]*\/\/\s*lint-override:\s*([\w.\-]+\d)\s*(?:[—–]| - )\s*(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = pattern.exec(source)) !== null) {
    const ruleId = m[1].trim()
    const justification = m[2].trim()
    if (!ruleId || !justification) continue
    if (!/^[A-Za-z]/.test(ruleId)) continue
    const line = lineAtOffset(source, m.index)
    results.push({ ruleId, justification, line })
  }
  return results
}

// ---------------------------------------------------------------------------
// detectProcedureType
// ---------------------------------------------------------------------------

/**
 * Detect the procedure type (.query / .mutation) that follows a .meta() block.
 * Looks forward from metaLine in the source.
 *
 * Returns 'query' | 'mutation' | 'unknown'.
 */
export function detectProcedureType(
  source: string,
  metaLine: number,
): 'query' | 'mutation' | 'unknown' {
  const ls = lines(source)
  // Look at lines after metaLine (up to 20 lines lookahead)
  const lookahead = ls.slice(metaLine).join('\n')
  if (/\.query\s*\(/.test(lookahead)) return 'query'
  if (/\.mutation\s*\(/.test(lookahead)) return 'mutation'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// parseToolMetas
// ---------------------------------------------------------------------------

/**
 * Extract all .meta({ agent: {...} }) blocks from a TypeScript source file.
 *
 * Strategy:
 *   1. Find all occurrences of `.meta({` in source.
 *   2. For each, extract the balanced `{...}` content.
 *   3. Look for an `agent:` sub-object inside.
 *   4. Extract whenToUse, whenNotToUse, examples.
 *   5. Detect procedure name by looking backwards for `<name>: publicProcedure`.
 *   6. Detect procedure type by looking forwards for .query/.mutation.
 */
export function parseToolMetas(filePath: string, source: string): ParsedToolMeta[] {
  const results: ParsedToolMeta[] = []
  // Find .meta({ occurrences
  const metaPattern = /\.meta\s*\(\s*\{/g
  let m: RegExpExecArray | null

  while ((m = metaPattern.exec(source)) !== null) {
    const openBraceOffset = source.indexOf('{', m.index + m[0].indexOf('{'))
    const metaContent = extractBalanced(source, openBraceOffset)
    if (!metaContent) continue

    // Check that there's an `agent:` key in the meta content
    const agentKeyIdx = metaContent.search(/\bagent\s*:/)
    if (agentKeyIdx === -1) continue

    // Find the agent object's opening brace
    const agentObjectStart = metaContent.indexOf('{', agentKeyIdx)
    if (agentObjectStart === -1) continue
    const agentContent = extractBalanced(metaContent, agentObjectStart)
    if (!agentContent) continue

    const whenToUse = extractStringField(agentContent, 'whenToUse') ?? ''
    const whenNotToUse = extractStringField(agentContent, 'whenNotToUse') ?? ''

    // Extract examples array
    const examples = extractExamples(agentContent)

    // Detect procedure name: look backwards from m.index for `<identifier>: publicProcedure`
    const before = source.slice(0, m.index)
    const procMatch = /(\w+)\s*:\s*publicProcedure\s*$/m.exec(before)
    const procedureName = procMatch ? procMatch[1] : 'unknown'

    // Detect procedure type: look forward from the end of the meta block
    const metaLine = lineAtOffset(source, m.index)
    const procedureType = detectProcedureType(source, metaLine)

    results.push({
      procedureName,
      procedureType,
      whenToUse,
      whenNotToUse,
      examples,
      filePath,
      line: metaLine,
    })
  }

  return results
}

/**
 * Extract examples from the agent content fragment.
 * Looks for the `examples:` array and parses each `{ input: '...', callArgs: {...} }` entry.
 */
function extractExamples(agentContent: string): Array<{ input: string; isNegative?: boolean }> {
  const results: Array<{ input: string; isNegative?: boolean }> = []

  const examplesIdx = agentContent.search(/\bexamples\s*:/)
  if (examplesIdx === -1) return results

  // Find the opening `[` of the array
  const arrayStart = agentContent.indexOf('[', examplesIdx)
  if (arrayStart === -1) return results

  // Extract balanced array content
  const arrayContent = extractBalanced(agentContent, arrayStart, '[', ']')
  if (!arrayContent) return results

  // Parse each object entry in the array
  // Strategy: scan for `{` and extract each balanced object
  let pos = 0
  while (pos < arrayContent.length) {
    const objStart = arrayContent.indexOf('{', pos)
    if (objStart === -1) break
    const objContent = extractBalanced(arrayContent, objStart)
    if (!objContent) {
      pos = objStart + 1
      continue
    }
    // End position: objStart + opening '{' (1) + content + closing '}' (1)
    const objEnd = objStart + objContent.length + 2

    const inputVal = extractStringField(objContent, 'input') ?? ''
    if (!inputVal) {
      pos = objEnd
      continue
    }

    // Extract callArgs raw text for empty-object detection
    const callArgsIdx = objContent.search(/\bcallArgs\s*:/)
    let callArgsRaw = ''
    if (callArgsIdx !== -1) {
      const callArgsOpen = objContent.indexOf('{', callArgsIdx)
      if (callArgsOpen !== -1) {
        callArgsRaw = extractBalanced(objContent, callArgsOpen) ?? ''
      }
    }

    const negative = isNegativeExample(inputVal, callArgsRaw)
    results.push({ input: inputVal, ...(negative ? { isNegative: true } : {}) })

    // Advance past this entire object (braces included)
    pos = objEnd
  }

  return results
}

// ---------------------------------------------------------------------------
// parseSubAgents
// ---------------------------------------------------------------------------

/**
 * Extract defineSubAgent({...}) calls from a TypeScript source file.
 * Usually 0 or 1 per file.
 */
export function parseSubAgents(filePath: string, source: string): ParsedSubAgent[] {
  const results: ParsedSubAgent[] = []
  const pattern = /defineSubAgent\s*\(\s*\{/g
  let m: RegExpExecArray | null

  while ((m = pattern.exec(source)) !== null) {
    const openBrace = source.indexOf('{', m.index + m[0].indexOf('{'))
    const content = extractBalanced(source, openBrace)
    if (!content) continue

    const key = extractStringField(content, 'key') ?? ''
    const description = extractStringField(content, 'description') ?? ''
    const whenToUse = extractStringField(content, 'whenToUse') ?? ''

    // Extract promptTemplate variable names from z.object({...}) inside promptTemplate.variables
    const promptTemplateVariables = extractPromptTemplateVariables(content)

    const line = lineAtOffset(source, m.index)
    results.push({ key, description, whenToUse, promptTemplateVariables, filePath, line })
  }

  return results
}

/**
 * Extract variable names from the `variables: z.object({ name: z.string()... })` block
 * inside a promptTemplate definition.
 */
function extractPromptTemplateVariables(subAgentContent: string): string[] {
  const vars: string[] = []

  // Find promptTemplate object
  const ptIdx = subAgentContent.search(/\bpromptTemplate\s*:/)
  if (ptIdx === -1) return vars

  const ptBrace = subAgentContent.indexOf('{', ptIdx)
  if (ptBrace === -1) return vars

  const ptContent = extractBalanced(subAgentContent, ptBrace)
  if (!ptContent) return vars

  // Find variables: z.object({...})
  const varIdx = ptContent.search(/\bvariables\s*:/)
  if (varIdx === -1) return vars

  const zObjIdx = ptContent.indexOf('{', varIdx)
  if (zObjIdx === -1) return vars

  const objContent = extractBalanced(ptContent, zObjIdx)
  if (!objContent) return vars

  // Extract property keys from z.object({ key: z.type() })
  const keyPattern = /^\s*(\w+)\s*:/gm
  let km: RegExpExecArray | null
  while ((km = keyPattern.exec(objContent)) !== null) {
    vars.push(km[1])
  }

  return vars
}

// ---------------------------------------------------------------------------
// parseIntents
// ---------------------------------------------------------------------------

/**
 * Extract IntentDescriptor exports from a TypeScript source file.
 * Looks for `slug: '...'` and `domain: '...'` patterns.
 *
 * An IntentDescriptor object contains both `slug` and `domain` fields.
 */
export function parseIntents(filePath: string, source: string): ParsedIntent[] {
  const results: ParsedIntent[] = []

  // Strategy: find all object literals that contain both `slug:` and `domain:` fields.
  // We scan for `slug:` occurrences and then check if the enclosing object also has `domain:`.

  // Find all IntentDescriptor type annotations to anchor the search
  // Pattern: `= {` after `IntentDescriptor`
  const intentPattern = /:\s*IntentDescriptor\s*=\s*\{/g
  let m: RegExpExecArray | null

  while ((m = intentPattern.exec(source)) !== null) {
    const openBrace = source.indexOf('{', m.index + m[0].lastIndexOf('{'))
    const content = extractBalanced(source, openBrace)
    if (!content) continue

    const slug = extractStringField(content, 'slug') ?? ''
    const domain = extractStringField(content, 'domain') ?? ''
    if (!slug || !domain) continue

    const line = lineAtOffset(source, m.index)
    results.push({ slug, domain, filePath, line })
  }

  return results
}

// ---------------------------------------------------------------------------
// parseFlowPolicies
// ---------------------------------------------------------------------------

/**
 * Extract FlowPolicyEntry exports from a TypeScript source file.
 * Looks for `intent_slug: '...'` fields.
 */
export function parseFlowPolicies(filePath: string, source: string): ParsedFlowPolicy[] {
  const results: ParsedFlowPolicy[] = []

  // Pattern: intent_slug: 'value'
  const pattern = /\bintent_slug\s*:\s*(?:'([^']*)'|"([^"]*)")/g
  let m: RegExpExecArray | null

  while ((m = pattern.exec(source)) !== null) {
    const intentSlug = (m[1] ?? m[2] ?? '').trim()
    if (!intentSlug) continue
    const line = lineAtOffset(source, m.index)
    results.push({ intentSlug, filePath, line })
  }

  return results
}
