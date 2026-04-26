// Synthetic tool-meta fixture for EI-10 lint runner acceptance test.
// Demonstrates content-based scope detection: files containing .meta({ agent: ... })
// are classified as 'tool-meta' even when they are not under a named sub-directory.
//
// lint-override: R-15.3 — synthetic fixture; negative-case example intentionally omitted for minimal fixture
export const syntheticToolMeta = {
  whenToUse:
    'Use when the lint runner needs to discover tool-meta scope via content-based detection. This verifies that files containing .meta({ agent: ... }) are correctly scoped and linted.',
  whenNotToUse:
    'Do not use for production routing. This is a test-only synthetic fixture with no real tRPC procedure.',
  examples: [
    {
      input: 'Verify lint runner tool-meta discovery',
      callArgs: { synthetic: true },
    },
    {
      input: 'Do not use this for real tasks or requests',
      callArgs: {},
    },
  ],
}

// The .meta({ agent: ... }) call pattern that triggers content-based scope detection.
// The lint runner looks for `.meta({ agent:` in the source to classify this file as 'tool-meta'.
export const __syntheticMetaBlock = `.meta({ agent: ${JSON.stringify(syntheticToolMeta)})`
