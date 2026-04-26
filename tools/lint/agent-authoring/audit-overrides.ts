// audit-overrides.ts — quarterly override audit script.
// Scans repo for lint-override: comments, aggregates per-rule counts,
// surfaces rules above the override threshold for tuning review.
//
// Usage:
//   bun run tools/lint/agent-authoring/audit-overrides.ts
//   bun run tools/lint/agent-authoring/audit-overrides.ts --json
//   bun run tools/lint/agent-authoring/audit-overrides.ts --threshold 5

import * as fs from 'fs'
import * as path from 'path'
import { globSync } from 'glob'
import { parseOverrideComments } from './file-parser'
import { lintConfig } from './config'
import type { OverrideComment } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditReportEntry {
  ruleId: string
  count: number
  files: number
  locations: string[]
}

export interface AuditReport {
  reportDate: string
  threshold: number
  totalOverrides: number
  aboveThreshold: AuditReportEntry[]
  belowThreshold: AuditReportEntry[]
}

// ---------------------------------------------------------------------------
// Core aggregation logic
// ---------------------------------------------------------------------------

/**
 * Aggregate override comments by rule-id.
 * Returns an AuditReport with entries grouped above/below threshold.
 */
export function aggregateOverrides(
  allOverrides: Array<{ filePath: string; comment: OverrideComment }>,
): AuditReport {
  // Group by rule-id, track count, unique files, and locations
  const byRuleId = new Map<
    string,
    { count: number; files: Set<string>; locations: Array<{ file: string; line: number }> }
  >()

  for (const { filePath, comment } of allOverrides) {
    if (!byRuleId.has(comment.ruleId)) {
      byRuleId.set(comment.ruleId, { count: 0, files: new Set(), locations: [] })
    }
    const entry = byRuleId.get(comment.ruleId)!
    entry.count++
    entry.files.add(filePath)
    entry.locations.push({ file: filePath, line: comment.line })
  }

  // Convert to AuditReportEntry[] and sort by count (descending)
  const entries: AuditReportEntry[] = Array.from(byRuleId.entries()).map(
    ([ruleId, { count, files, locations }]) => ({
      ruleId,
      count,
      files: files.size,
      // Format locations as "path:line", take first 5
      locations: locations
        .map((loc) => {
          const rel = path.relative(process.cwd(), loc.file)
          return `${rel}:${loc.line}`
        })
        .slice(0, 5),
    }),
  )

  // Split into above/below threshold
  const threshold = lintConfig.overrideAuditThreshold
  const aboveThreshold = entries
    .filter((e) => e.count >= threshold)
    .sort((a, b) => b.count - a.count)
  const belowThreshold = entries
    .filter((e) => e.count < threshold)
    .sort((a, b) => b.count - a.count)

  return {
    reportDate: new Date().toISOString().split('T')[0],
    threshold,
    totalOverrides: allOverrides.length,
    aboveThreshold,
    belowThreshold,
  }
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

/**
 * Scan all agent-authoring files under apps/api/src/modules/STAR/agent/STARSTAR
 * Parse override comments from each file.
 */
function scanAgentFiles(): Array<{ filePath: string; comment: OverrideComment }> {
  const results: Array<{ filePath: string; comment: OverrideComment }> = []

  // Glob pattern for agent files: apps/api/src/modules/*/agent/**/*.ts
  const pattern = 'apps/api/src/modules/*/agent/**/*.ts'
  const files = globSync(pattern, {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/*.spec.ts'],
  })

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf-8')
    const comments = parseOverrideComments(source)

    for (const comment of comments) {
      results.push({ filePath, comment })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format AuditReport as human-readable table.
 */
function formatHumanReport(report: AuditReport): string {
  const lines: string[] = []

  lines.push(`Override Audit Report — ${report.reportDate}`)
  lines.push(`Total overrides: ${report.totalOverrides}`)
  lines.push(`Threshold: ≥${report.threshold} overrides`)
  lines.push('')

  if (report.aboveThreshold.length === 0) {
    lines.push('Rules above threshold: none')
  } else {
    lines.push(`Rules above threshold (≥${report.threshold}):`)
    lines.push('')
    for (const entry of report.aboveThreshold) {
      lines.push(
        `  ${entry.ruleId}  ${entry.count} overrides across ${entry.files} file${entry.files === 1 ? '' : 's'}`,
      )
      for (let i = 0; i < Math.min(3, entry.locations.length); i++) {
        lines.push(`    ${entry.locations[i]}`)
      }
      const remaining = entry.locations.length - 3
      if (remaining > 0) {
        lines.push(`    ... (${remaining} more)`)
      }
    }
    lines.push('')
  }

  if (report.belowThreshold.length === 0) {
    lines.push('Rules at or below threshold: none')
  } else {
    lines.push('Rules at or below threshold:')
    for (const entry of report.belowThreshold) {
      lines.push(
        `  ${entry.ruleId}  ${entry.count} overrides across ${entry.files} file${entry.files === 1 ? '' : 's'}`,
      )
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  let outputJson = false
  let threshold = lintConfig.overrideAuditThreshold

  for (const arg of args) {
    if (arg === '--json') {
      outputJson = true
    } else if (arg.startsWith('--threshold')) {
      const parts = arg.split('=')
      if (parts.length === 2) {
        const parsed = parseInt(parts[1], 10)
        if (!isNaN(parsed)) {
          threshold = parsed
        }
      } else if (parts.length === 1) {
        // --threshold 5 format
        const nextIdx = args.indexOf(arg) + 1
        if (nextIdx < args.length) {
          const parsed = parseInt(args[nextIdx], 10)
          if (!isNaN(parsed)) {
            threshold = parsed
          }
        }
      }
    }
  }

  // Scan files
  const allOverrides = scanAgentFiles()

  // Aggregate
  const report = aggregateOverrides(allOverrides)
  // Override the threshold if it was specified via CLI
  if (threshold !== lintConfig.overrideAuditThreshold) {
    report.threshold = threshold
    const newAbove = report.aboveThreshold
      .concat(report.belowThreshold)
      .filter((e) => e.count >= threshold)
    const newBelow = report.aboveThreshold
      .concat(report.belowThreshold)
      .filter((e) => e.count < threshold)
    report.aboveThreshold = newAbove.sort((a, b) => b.count - a.count)
    report.belowThreshold = newBelow.sort((a, b) => b.count - a.count)
  }

  // Output
  if (outputJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatHumanReport(report))
  }
}

// Only run CLI if invoked directly (not during testing)
if (import.meta.main) {
  main().catch((err) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
