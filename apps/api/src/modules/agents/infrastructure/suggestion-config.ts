import type { Suggestion, SuggestionResult } from '../domain/value-objects/suggestion'

interface SurfaceConfig {
  welcomeSubtext: string
  suggestions: Array<{
    slug: string
    template: string
  }>
}

const SURFACE_MAP: Record<string, SurfaceConfig> = {
  planner: {
    welcomeSubtext:
      'I can triage buckets, draft tasks from meeting notes, find blockers, roll up status, and assign work. Writes always land as approvable drafts.',
    suggestions: [
      { slug: 'planner.triage_bucket', template: "What's slipping this week in {entity}?" },
      { slug: 'planner.create_from_notes', template: 'Turn the latest standup notes into tasks' },
      { slug: 'planner.find_blocker', template: "Who's blocked on {entity}?" },
      {
        slug: 'planner.rollup_status',
        template: "Summarise my team's progress for the PMO digest",
      },
    ],
  },
  people: {
    welcomeSubtext:
      'I can draft offboarding checklists, find skill gaps, summarise tenure, and propose org changes. Writes land as approvable drafts.',
    suggestions: [
      { slug: 'people.find_blocker', template: "Who's blocked on {entity}?" },
      {
        slug: 'people.offboarding_checklist',
        template: 'Draft an offboarding checklist for {entity}',
      },
      { slug: 'people.skill_gaps', template: 'Where are the skill gaps in {entity}?' },
      { slug: 'people.tenure_rollup', template: 'Summarise tenure across my reports' },
    ],
  },
  hiring: {
    welcomeSubtext:
      'I can score candidates against a JD, draft outreach, summarise interview loops, and propose offers.',
    suggestions: [
      { slug: 'hiring.score_candidate', template: 'Score the latest candidate against {entity}' },
      { slug: 'hiring.draft_outreach', template: 'Draft outreach for {entity}' },
      { slug: 'hiring.summarise_loop', template: 'Summarise the interview loop for {entity}' },
      { slug: 'hiring.propose_offer', template: 'Propose an offer for {entity}' },
    ],
  },
  finance: {
    welcomeSubtext:
      'I can find budget overruns, draft invoices, reconcile expenses, and forecast spend.',
    suggestions: [
      { slug: 'finance.find_overrun', template: 'Where are we over budget this quarter?' },
      { slug: 'finance.draft_invoice', template: 'Draft an invoice for {entity}' },
      { slug: 'finance.reconcile', template: "Reconcile last month's expenses" },
      { slug: 'finance.forecast', template: 'Forecast spend for {entity}' },
    ],
  },
  goals: {
    welcomeSubtext:
      'I can roll up OKR progress, find at-risk objectives, and draft check-in updates.',
    suggestions: [
      { slug: 'goals.rollup', template: 'Roll up OKR progress for {entity}' },
      { slug: 'goals.at_risk', template: 'Which objectives are at risk?' },
      { slug: 'goals.checkin_draft', template: 'Draft my check-in update for {entity}' },
      {
        slug: 'goals.alignment_check',
        template: 'Check alignment between {entity} and parent OKRs',
      },
    ],
  },
  performance: {
    welcomeSubtext:
      'I can summarise feedback, draft reviews, find patterns across cycles, and propose calibrations.',
    suggestions: [
      { slug: 'performance.summarise_feedback', template: 'Summarise feedback for {entity}' },
      { slug: 'performance.draft_review', template: 'Draft a review for {entity}' },
      { slug: 'performance.cycle_pattern', template: 'What patterns are emerging this cycle?' },
      { slug: 'performance.calibration', template: 'Propose calibration for my team' },
    ],
  },
}

export const KNOWN_SURFACES = Object.keys(SURFACE_MAP)

export function resolveSuggestions(input: {
  surface: string
  contextEntity?: string
}): SuggestionResult {
  const config = SURFACE_MAP[input.surface]

  if (!config) {
    return {
      suggestions: [],
      welcomeSubtext: 'Ask me about anything in this workspace.',
    }
  }

  const entity = input.contextEntity?.trim() || 'this'
  const suggestions: Suggestion[] = config.suggestions.map((suggestion) => ({
    slug: suggestion.slug,
    text: suggestion.template.replaceAll('{entity}', entity),
  }))

  return {
    suggestions,
    welcomeSubtext: config.welcomeSubtext,
  }
}
