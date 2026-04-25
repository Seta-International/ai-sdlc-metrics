/**
 * synthetic-modules.spec.ts — Plan 13 Task 7
 *
 * Verifies structural invariants of the synthetic 12-module fixture.
 */

import { describe, it, expect } from 'vitest'
import {
  SYNTHETIC_MODULE_KEYS,
  SYNTHETIC_SUB_AGENTS,
  SCALE_PROBE_CONFIG,
  TOOL_SUFFIXES,
} from './synthetic-modules'

describe('SYNTHETIC_MODULE_KEYS', () => {
  it('defines exactly 12 modules', () => {
    expect(SYNTHETIC_MODULE_KEYS).toHaveLength(12)
  })

  it('all keys are unique', () => {
    const unique = new Set(SYNTHETIC_MODULE_KEYS)
    expect(unique.size).toBe(SYNTHETIC_MODULE_KEYS.length)
  })
})

describe('TOOL_SUFFIXES', () => {
  it('defines exactly 20 suffixes', () => {
    expect(TOOL_SUFFIXES).toHaveLength(20)
  })
})

describe('SYNTHETIC_SUB_AGENTS', () => {
  it('produces exactly 12 sub-agents', () => {
    expect(SYNTHETIC_SUB_AGENTS).toHaveLength(12)
  })

  it('each sub-agent has exactly 20 tools', () => {
    for (const agent of SYNTHETIC_SUB_AGENTS) {
      expect(agent.tools).toHaveLength(20)
    }
  })

  it('no intentSlug is "unclassified"', () => {
    for (const agent of SYNTHETIC_SUB_AGENTS) {
      expect(agent.intentSlug).not.toBe('unclassified')
    }
  })

  it('all intentSlugs are non-empty', () => {
    for (const agent of SYNTHETIC_SUB_AGENTS) {
      expect(agent.intentSlug.length).toBeGreaterThan(0)
    }
  })

  it('all intentSlugs use synthetic-module prefix', () => {
    for (const agent of SYNTHETIC_SUB_AGENTS) {
      expect(agent.intentSlug).toMatch(/^synthetic-module\./)
    }
  })
})

describe('SCALE_PROBE_CONFIG', () => {
  it('syntheticModuleCount matches SYNTHETIC_MODULE_KEYS length', () => {
    expect(SCALE_PROBE_CONFIG.syntheticModuleCount).toBe(SYNTHETIC_MODULE_KEYS.length)
  })

  it('toolsPerSubAgent matches TOOL_SUFFIXES length', () => {
    expect(SCALE_PROBE_CONFIG.toolsPerSubAgent).toBe(TOOL_SUFFIXES.length)
  })

  it('totalTools equals syntheticModuleCount × toolsPerSubAgent', () => {
    expect(SCALE_PROBE_CONFIG.totalTools).toBe(
      SCALE_PROBE_CONFIG.syntheticModuleCount * SCALE_PROBE_CONFIG.toolsPerSubAgent,
    )
  })
})
