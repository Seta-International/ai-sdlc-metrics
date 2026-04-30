/**
 * IntentRegistry — aggregates, validates, and freezes intent-slug declarations
 * at module boot time.
 *
 * Descriptor aggregation convention:
 *   Each domain module owns a `agent/intents/` directory with a barrel
 *   `index.ts` that re-exports all `IntentDescriptor` constants. The
 *   `agents.module.ts` imports from every module barrel and concatenates the
 *   arrays into the `descriptors` list passed to `boot()`. Adding a new
 *   intent to an existing module requires only:
 *     1. Add a new file in `modules/<domain>/agent/intents/<name>.ts`.
 *     2. Re-export it from `modules/<domain>/agent/intents/index.ts`.
 *   Adding intents for a new domain module additionally requires a new
 *   import and descriptor entry in `agents.module.ts`.
 *
 * Lives in `infrastructure/` because it is NestJS-injectable; it has zero
 * domain logic — it is purely a lookup/validation container.
 *
 * Special case: the `'unclassified'` slug fallback bucket does not follow the
 * `domain.name` format — it is the explicit unclassified bucket and its format
 * exception is baked into the boot validation.
 */

import { Injectable, Logger } from '@nestjs/common'
import type { IntentDescriptor } from '../../../domain/value-objects/intent-descriptor'

export const INTENT_REGISTRY = Symbol('INTENT_REGISTRY')

/**
 * Valid intent slug pattern: `domain.name(.name)+`
 * Each segment: starts with a lowercase letter, followed by lowercase letters,
 * digits, or hyphens (but no trailing hyphen via the group structure).
 *
 * Examples:
 *   planner.list-my-tasks   ✓
 *   people.view-my-profile  ✓
 *   planner.x.y             ✓  (multi-segment)
 *   unclassified            ✗  (special-cased separately)
 *   invalid_slug            ✗  (underscore not allowed)
 *   .foo                    ✗  (no leading dot)
 */
export const INTENT_SLUG_REGEX =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/

/** The one slug that is exempt from the domain.name format rule. */
const UNCLASSIFIED_SLUG = 'unclassified'

/**
 * Thrown by `IntentRegistry.boot` when any invariant is violated. Boot must
 * fail loud — a misconfigured registry must never serve a production request.
 */
export class IntentRegistryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IntentRegistryValidationError'
  }
}

@Injectable()
export class IntentRegistry {
  private readonly logger = new Logger(IntentRegistry.name)
  private readonly _map = new Map<string, IntentDescriptor>()
  private _frozen = false

  /**
   * Aggregates, validates, and freezes the intent registry.
   *
   * Must be called exactly once at module init. Calling it a second time
   * throws immediately — double-boot is a bug.
   *
   * Invariants enforced (any violation throws `IntentRegistryValidationError`):
   *   Empty list      — at least one intent descriptor is required.
   *   Slug format     — each slug must match INTENT_SLUG_REGEX or be the
   *                     special `'unclassified'` fallback.
   *   Duplicate slugs — duplicate slugs across modules are not allowed.
   *   Domain mismatch — slug must start with `domain + '.'` (except for
   *                     `'unclassified'` which has domain `'agents'`).
   *
   * All violations from a single call are collected and thrown together
   * in one `IntentRegistryValidationError`.
   *
   * @throws {IntentRegistryValidationError} on any invariant violation.
   */
  boot(descriptors: ReadonlyArray<IntentDescriptor>): void {
    if (this._frozen) {
      throw new IntentRegistryValidationError(
        'IntentRegistry.boot called more than once. Double-boot is not allowed.',
      )
    }

    // Guard against an empty-deploy: at least one intent must be registered.
    if (descriptors.length === 0) {
      throw new IntentRegistryValidationError(
        'IntentRegistry.boot: no intent descriptors provided. ' +
          'At least one intent declaration is required to prevent an empty-deploy footgun.',
      )
    }

    const violations: string[] = []
    // Track slugs seen in this boot call to detect duplicates within the batch.
    const seenSlugs = new Set<string>()

    for (const descriptor of descriptors) {
      const { slug, domain } = descriptor

      const isUnclassified = slug === UNCLASSIFIED_SLUG
      if (!isUnclassified && !INTENT_SLUG_REGEX.test(slug)) {
        violations.push(
          `Invalid intent slug "${slug}": must match ${INTENT_SLUG_REGEX.toString()} ` +
            `or be the literal "${UNCLASSIFIED_SLUG}" fallback.`,
        )
        continue
      }

      // 'unclassified' must always declare domain 'agents' — it is owned by the
      // agents module. Any other domain is a misconfiguration.
      if (isUnclassified && domain !== 'agents') {
        violations.push(
          `The "unclassified" slug must declare domain "agents" (owned by the agents module); ` +
            `found domain "${domain}".`,
        )
        continue
      }

      if (seenSlugs.has(slug)) {
        violations.push(
          `Duplicate intent slug "${slug}": each intent slug must be unique across all modules.`,
        )
        continue
      }

      // 'unclassified' belongs to 'agents' domain — it never has a dot prefix.
      // All other slugs must start with their declared domain followed by a dot.
      if (!isUnclassified && !slug.startsWith(`${domain}.`)) {
        violations.push(
          `Domain mismatch for slug "${slug}": expected prefix "${domain}." ` +
            `but slug does not start with it. This is likely a copy-paste error.`,
        )
        continue
      }

      seenSlugs.add(slug)
      this._map.set(slug, descriptor)
    }

    if (violations.length > 0) {
      throw new IntentRegistryValidationError(
        `IntentRegistry boot validation failed (${violations.length} violation(s)):\n` +
          violations.join('\n'),
      )
    }

    Object.freeze(this._map)
    this._frozen = true

    this.logger.log(
      `IntentRegistry booted successfully. ${this._map.size} intent(s) registered: ` +
        [...this._map.keys()].join(', '),
    )
  }

  /**
   * Returns a frozen snapshot of all registered intent descriptors.
   * The returned array is new on each call but is itself frozen.
   */
  list(): ReadonlyArray<IntentDescriptor> {
    return Object.freeze([...this._map.values()])
  }

  /**
   * Looks up an intent by slug. Returns `undefined` if not found.
   */
  get(slug: string): IntentDescriptor | undefined {
    return this._map.get(slug)
  }

  /**
   * Returns true if an intent with the given slug is registered.
   */
  has(slug: string): boolean {
    return this._map.has(slug)
  }
}
