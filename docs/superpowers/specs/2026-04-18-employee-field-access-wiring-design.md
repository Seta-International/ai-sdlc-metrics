# Employee Field Access Control — Wiring Fix

**Date:** 2026-04-18
**Status:** Draft — awaiting user approval
**Scope:** `apps/api/src/modules/people` query handlers; no schema change, no API change.
**Ships independently** from the broader employee-module completion effort (see `2026-04-18-employee-module-completion-design.md`).

## 1. Problem

`FieldVisibilityFilterService` lives at `apps/api/src/modules/people/application/services/field-visibility-filter.service.ts` with passing unit tests. It is registered in the module. It is **not injected into any query handler**, which means every profile and directory response returns all fields regardless of the viewer's tier.

Concretely, the following handlers return unfiltered payloads today:

- `GetPersonProfileHandler`
- `SearchDirectoryHandler`
- `ListDirectoryHandler`
- `GetSharedProfileHandler`
- `ExportDirectoryHandler`

The `field_visibility_config` table is seeded, the service works in isolation, but nothing calls it in the request path. This is a data-exposure defect, not a missing feature.

## 2. Goals & non-goals

### Goals

- Inject `FieldVisibilityFilterService` into all five query handlers listed above.
- Apply filtering to the returned payload immediately before each handler returns.
- Integration test per handler asserting: a viewer in a lower tier does NOT see fields restricted to higher tiers; a viewer in the matching or higher tier does see them.
- Ship as a single PR, reviewable in under 30 minutes.

### Non-goals

- Changing the tier model, adding tiers, or renaming the `visibility_tier` value object.
- Exposing configuration UI for `field_visibility_config`.
- Modifying `FieldVisibilityFilterService` internals.
- Touching tRPC router shapes. The router contract stays the same; only the returned payload changes.

## 3. Architecture

### 3.1 Injection points

Each of the five handlers gains a constructor-injected `FieldVisibilityFilterService`. The service is already provided at module scope; no new DI wiring is required beyond adding it to the handler constructors.

### 3.2 Filter application

Directly before `return`, each handler passes the payload through `filterService.apply(payload, viewerTier)`. The viewer's tier is derived from the existing auth context already available to every handler (the `RlsMiddleware` attaches the tenant and actor; tier resolution goes through the existing `ActorContext` path).

For list/search/export handlers, the filter is applied row-wise. Payload shape does not change — restricted fields are replaced with `null` or removed, according to the service's existing contract.

### 3.3 DDD boundaries respected

- No cross-module imports. The service, the value object, and all handlers live inside `modules/people`.
- No new ports or repositories — the service is pure application-layer logic.
- No module `exports` change. `PeopleQueryFacade` surface is unchanged.

## 4. Testing

Per CLAUDE.md TDD rule:

- **Unit test per handler** — mock `FieldVisibilityFilterService`, assert it is called with the correct payload and viewer tier, assert the returned payload is the filtered one.
- **Integration test per handler** against real DB (RLS + seed): two actors, one in a restricted tier, one unrestricted. Hit the handler, compare fields. Restricted-tier actor must not see higher-tier fields.
- Run existing unit tests for `FieldVisibilityFilterService` unchanged — the service itself is not modified.

## 5. Deployment risk

The `field_visibility_config` default seed is already in production. If the seed is more restrictive than users experience today, this fix will cause fields to disappear from responses for some viewers. Mitigation:

1. Before merging, run the new integration tests against a staging tenant snapshot.
2. Diff the filtered payload from each of the five handlers against the current unfiltered payload for a sample of real viewers.
3. Surface the delta in the PR description. If the delta includes fields that should stay visible, update the seed in the same PR.

## 6. Out-of-scope follow-ups

- Audit-log emission when a field is filtered (useful for compliance but not required to close the defect).
- Caller-side UI signal ("some fields hidden") — not required until product asks for it.
- Extending filtering to mutation responses. This spec is read-side only.

## 7. PROGRESS.md update

On merge, flip `employee/010-field-access-control` from `pending` to `done` in `docs/clones/ems/PROGRESS.md`, with a link to the PR.
