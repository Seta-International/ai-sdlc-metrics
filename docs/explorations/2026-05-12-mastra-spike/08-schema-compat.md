# 08 — Zod compatibility layer (Mastra spike)

## What Mastra does

Mastra supports **Zod 3 and Zod 4 concurrently** via Zod's own `zod/v3` and `zod/v4` subpath exports — not two separate npm packages at runtime. The peer range is `"zod": "^3.25.0 || ^4.0.0"` (`/Users/canh/Projects/Seta/mastra/packages/schema-compat/package.json:88`), and dev deps install `zod` from the catalog plus `zod-v3: "npm:zod@^3.25.76"` (line 110) for cross-version snapshot tests.

A version-agnostic `ZodType` is exposed as `z4.ZodType<any,any> | z3.Schema<any, z3.ZodTypeDef, any>` (`/Users/canh/Projects/Seta/mastra/packages/schema-compat/src/schema.types.ts:9`). The runtime `isZodType` predicate sniffs `_def` (v3) or `_zod` (v4) (`/Users/canh/Projects/Seta/mastra/packages/schema-compat/src/utils.ts:62-71`).

Standard Schema v1 is the **unifying contract**, not Zod. `toStandardSchema` dispatches by shape — Zod v4 (has `_zod`), Zod v3 (has `~standard.vendor==='zod'` but no `~standard.jsonSchema`), Vercel AI SDK schema, then raw JSON Schema (`/Users/canh/Projects/Seta/mastra/packages/schema-compat/src/standard-schema/standard-schema.ts:130-171`). Two adapters bolt `~standard.jsonSchema.{input,output}` onto the schema: v3 uses `zod-to-json-schema` (`adapters/zod-v3.ts:45,102`); v4 calls native `toJSONSchema` from `zod/v4` (`adapters/zod-v4.ts:2,36`). Both wrap via `Object.create(zodSchema)` so the original prototype chain (and `.parse`, `.optional()`, etc.) survives (`adapters/zod-v3.ts:104`, `adapters/zod-v4.ts:76`).

`SchemaCompatLayer` is split into v3/v4 implementations (`schema-compatibility-v3.ts`, `schema-compatibility-v4.ts`) — they apply per-provider transforms (e.g. OpenAI `.optional()` → `.nullable().transform()`, `standard-schema-compat.ts:59-92`) without losing the underlying Zod identity.

## What setup.md plans

§2 row 33: *"@hono/zod-openapi 1.4.0 — Re-exports its own `z` (Zod 4 wrapped with `.openapi()` extension); see §15 import rule. **Verify Zod 4 internal compatibility before P1 close-out** — if it still pins Zod 3, OpenAPI routes use Zod 3 internally and we lose unified schema types."* (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:33`)

§15 footgun 2066: *"In any file using `@hono/zod-openapi`, **import `z` from `@hono/zod-openapi`** — not from `zod`. The package re-exports a wrapped Zod whose schemas have a `.openapi(...)` extension method; importing `z` from `zod` directly silently drops that method (TS will accept it, runtime breaks at `app.openapi(route, …)` doc generation). Biome rule + ADR 0005 enforce this."* (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:2066`)

## Delta

**Open question resolved.** `@hono/zod-openapi@1.4.0` declares `"peerDependencies": { "zod": "^4.0.0" }` (`/Users/canh/Projects/Seta/seta-os/node_modules/.pnpm/@hono+zod-openapi@1.4.0_hono@4.12.18_zod@4.4.3/node_modules/@hono/zod-openapi/package.json:45`); the installed pnpm path resolves against `zod@4.4.3`. Its compiled `dist/index.js:1,229` does `import { z } from "zod"; … extendZodWithOpenApi(z); … export { z }`. No Zod 3 anywhere. The §2 caveat can be retired.

**`.openapi()` mechanism.** `extendZodWithOpenApi` from `@asteasolutions/zod-to-openapi` mutates the shared `zod` module-scope `z` object once at load. So `import { z } from "zod"` works at runtime **iff there is exactly one resolved `zod` instance** — which pnpm guarantees as long as the workspace pins a single `zod@4.x` (which §2 does at 4.4.3). The §15 "always import from `@hono/zod-openapi`" rule is the right belt-and-suspenders: it doesn't depend on load-order, and it's enforceable by Biome.

**Fold in from Mastra.**
- Standard Schema v1 as the cross-package contract (already what Zod 4 ships natively via `~standard`). This decouples `@seta/agent-core` tool schemas from the Zod major.
- Shape-sniffing predicates (`_def` vs `_zod`) for any code that has to accept "whatever the caller passed."

**Deliberately avoid.**
- Mastra's dual-version support surface (`zodTypes.ts:99-163` — paired overloads per type-guard). seta-os is greenfield, single Zod major. Don't carry the v3 branch.
- Two `SchemaCompatLayer` subclasses. Provider compat is P2 — agent-core can call providers directly until a real second provider lands.

**Open questions.**
- Does `@asteasolutions/zod-to-openapi` v8 (the transitive dep) call `z.toJSONSchema` from Zod 4 natively, or still go through the legacy v3 registry? If the latter, route schemas using Zod-4-only types (e.g. `z.iso.datetime()`, `z.email()` as top-level) may serialize oddly. Worth a one-off spike with a route that uses Zod-4-native validators.

## Punch list

- setup.md §2: replace the row-33 warning sentence ("Verify Zod 4 internal compatibility…") with a resolved note: *"Confirmed: peer-deps `zod ^4.0.0`; mutates the shared `z` on import."* — keep the §15 import rule unchanged (it remains correct).
- setup.md §15 footgun 2066: append *"Mechanism: `extendZodWithOpenApi(z)` runs once at module load and mutates the shared `zod` module — relies on pnpm resolving a single `zod` instance across the workspace."* so future readers know why the rule exists, not just what it is.
- setup.md §2: add a one-line row pinning `zod@4.4.3` as the sole runtime instance (no `zod-v3`, no `npm:zod@^3.x` aliases — workspace policy).
- @seta/agent-core: leave a hook to accept `StandardSchemaV1` (not just `ZodType`) on tool input/output. Zod 4 schemas already implement it (`~standard`), so it's free today and unblocks Arktype/Valibot tool authors later without refactor.
- @seta/agent-core: tool schema → JSON Schema should go through `z.toJSONSchema()` (Zod 4 native), not `zod-to-json-schema` (the v3-era lib Mastra still uses on its v3 path).
- P2-defer: provider-specific compat layers (`OpenAISchemaCompatLayer`, etc.) — single-provider in P1 (Anthropic + OpenAI both consume JSON Schema cleanly; quirks are not yet a load-bearing problem).
- P2-defer: cross-version Zod support and Arktype/Valibot adapters — only revisit if a connector ships a non-Zod schema.
