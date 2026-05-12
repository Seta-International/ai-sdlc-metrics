// Loaded via `node --import ./instrumentation.ts` (dev: `tsx watch --import ./src/instrumentation.ts`).
// Reserved for OTel SDK init. Kept as a separate file so the boot pattern is correct
// from day one — anything imported before sdk.start() would be invisible to traces.
export {}
