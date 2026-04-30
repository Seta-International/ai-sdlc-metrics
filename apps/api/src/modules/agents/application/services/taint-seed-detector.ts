import { Injectable } from '@nestjs/common'
import type { Schedule } from '../../domain/entities/schedule.entity'

/**
 * Substrings in an event type that indicate user-authored content is carried
 * in the event payload. Checked via `.includes()` against the event type string.
 */
const USER_AUTHORED_EVENT_SUBSTRINGS = [
  '.comment',
  '.note',
  '.message',
  '.description',
  '.content',
] as const

/**
 * Object field names that indicate a payload contains user-authored content.
 * Conservative: matching any of these keys on the top-level payload object
 * causes the detector to return true.
 */
const USER_AUTHORED_PAYLOAD_FIELDS = new Set([
  'content',
  'body',
  'message',
  'note',
  'description',
  'comment',
])

/**
 * Heuristic classifier that decides whether a scheduled agent run should have
 * its taint flag seeded at spawn time.
 *
 * Conservative by design: when in doubt, return true. The cost of a false
 * positive (over-restricting the agent) is much lower than a false negative
 * (passing user-authored content through without taint marking).
 *
 * Pure logic — no DB, no external dependencies.
 */
@Injectable()
export class TaintSeedDetector {
  shouldSeedTaint(opts: { eventType: string; eventPayload: unknown; schedule: Schedule }): boolean {
    const { eventType, eventPayload, schedule } = opts

    // Cron-triggered schedules have no event payload → no taint
    if (schedule.triggerKind === 'cron') {
      return false
    }

    // System events are not user-authored
    if (eventType.startsWith('system.')) {
      return false
    }

    // Event type contains a known user-authored content segment
    for (const substring of USER_AUTHORED_EVENT_SUBSTRINGS) {
      if (eventType.includes(substring)) {
        return true
      }
    }

    // Payload is an object — inspect top-level keys for user-authored fields
    if (eventPayload !== null && typeof eventPayload === 'object' && !Array.isArray(eventPayload)) {
      for (const key of Object.keys(eventPayload as Record<string, unknown>)) {
        if (USER_AUTHORED_PAYLOAD_FIELDS.has(key)) {
          return true
        }
      }
    }

    // Conservative default: seed taint on any event-triggered schedule
    return true
  }
}
